import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

// readCachedSession()/readOfflineSession() gate on `typeof window`, matching
// the rest of this codebase's browser-storage guards — give the test runner
// a `window` so those guards don't short-circuit.
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}, configurable: true });

const sessionStore = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { value: {
  getItem: (key: string) => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStore.set(key, value),
  removeItem: (key: string) => sessionStore.delete(key),
}, configurable: true });

const { canSellOffline, isOfflineSessionExpired, OFFLINE_SESSION_DURATION_MS } = await import("./authorizationService.ts");

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

const posUser = { id: "u1", username: "jean", email: "j@x.com", role: "staff" as const, isActive: true, status: "active" as const, modulePermissions: ["pos"] };

beforeEach(() => {
  storage.clear();
  sessionStore.clear();
});

test("canSellOffline: no cached session and no offline session at all -> not allowed, generic reason", () => {
  const result = canSellOffline();
  assert.equal(result.allowed, false);
  assert.match(result.reason!, /Aucune session locale/);
  assert.equal(result.identity, null);
});

test("canSellOffline: a valid, unexpired cached JWT session is allowed and used as identity", () => {
  const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(posUser));

  const result = canSellOffline();
  assert.equal(result.allowed, true);
  assert.equal(result.identity?.username, "jean");
  assert.ok(result.session);
});

test("canSellOffline: an expired cached JWT with no offline session falls back to the JWT-specific reason", () => {
  const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(posUser));

  const result = canSellOffline();
  assert.equal(result.allowed, false);
  assert.match(result.reason!, /expiré/);
});

test("canSellOffline: an expired JWT but a valid offline PIN session still succeeds via the PIN path", () => {
  const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(posUser));

  const now = Date.now();
  sessionStorage.setItem("offlineSession", JSON.stringify({
    userId: "u1", username: "jean-offline", role: "staff", modules: ["pos"],
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + OFFLINE_SESSION_DURATION_MS).toISOString(),
  }));

  const result = canSellOffline();
  assert.equal(result.allowed, true);
  assert.equal(result.identity?.username, "jean-offline");
  assert.equal(result.session, null, "an offline-PIN authorization is never reported as a JWT session");
});

test("canSellOffline: an offline session without pos in its capped modules is rejected", () => {
  const now = Date.now();
  sessionStorage.setItem("offlineSession", JSON.stringify({
    userId: "u1", username: "amina", role: "staff", modules: ["sync"],
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + OFFLINE_SESSION_DURATION_MS).toISOString(),
  }));

  const result = canSellOffline();
  assert.equal(result.allowed, false);
  assert.match(result.reason!, /accès au module Vente/);
});

test("isOfflineSessionExpired: true once past expiresAt, false before", () => {
  const now = 1_000_000_000_000;
  const session = { userId: "u1", username: "x", role: "staff" as const, modules: ["pos"], issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(isOfflineSessionExpired(session, now), false);
  assert.equal(isOfflineSessionExpired(session, now + 1000), true);
  assert.equal(isOfflineSessionExpired(session, now + 2000), true);
});
