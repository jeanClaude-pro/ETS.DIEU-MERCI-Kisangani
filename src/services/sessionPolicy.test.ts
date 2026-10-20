import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyRefreshResponse,
  isRenewableApiRequest,
  mustRenewBeforeSending,
  parseExpiry,
  shouldRenewInBackground,
} from "./sessionPolicy.ts";

const BASE = "https://api.example.com/api";

test("only authenticated API calls are renewable, never the auth endpoints themselves", () => {
  assert.equal(isRenewableApiRequest(`${BASE}/sales?page=1`, BASE), true);
  assert.equal(isRenewableApiRequest(`${BASE}/users/me`, `${BASE}/`), true);
  assert.equal(isRenewableApiRequest(`${BASE}/auth/login`, BASE), false);
  assert.equal(isRenewableApiRequest(`${BASE}/auth/refresh`, BASE), false);
  assert.equal(isRenewableApiRequest(`${BASE}/auth/logout`, BASE), false);
  assert.equal(isRenewableApiRequest("https://cdn.example.com/x.js", BASE), false);
  assert.equal(isRenewableApiRequest("https://api.example.com/apix/sales", BASE), false);
  assert.equal(isRenewableApiRequest("/api/sales", ""), true);
});

test("background renewal happens near expiry, and only for an active user", () => {
  const now = 1_000_000;
  const idle = 4 * 60_000;
  assert.equal(shouldRenewInBackground({ expiresAt: now + 10 * 60_000, now, lastActivityAt: now, idleTimeoutMs: idle }), false);
  assert.equal(shouldRenewInBackground({ expiresAt: now + 60_000, now, lastActivityAt: now - 30_000, idleTimeoutMs: idle }), true);
  assert.equal(shouldRenewInBackground({ expiresAt: now + 60_000, now, lastActivityAt: now - idle, idleTimeoutMs: idle }), false);
  assert.equal(shouldRenewInBackground({ expiresAt: null, now, lastActivityAt: now, idleTimeoutMs: idle }), false);
});

test("a request waits for renewal when its token is about to die", () => {
  assert.equal(mustRenewBeforeSending(10_000, 0), true);
  assert.equal(mustRenewBeforeSending(60_000, 0), false);
  assert.equal(mustRenewBeforeSending(null, 0), false);
  assert.equal(parseExpiry("2026-10-20T08:15:00.000Z"), Date.UTC(2026, 9, 20, 8, 15));
  assert.equal(parseExpiry("garbage"), null);
});

test("a failed renewal only signs out when the server says the session is over", () => {
  assert.equal(classifyRefreshResponse(200), "renewed");
  assert.equal(classifyRefreshResponse(409), "superseded");
  assert.equal(classifyRefreshResponse(401), "rejected");
  assert.equal(classifyRefreshResponse(null), "unavailable");
  assert.equal(classifyRefreshResponse(503), "unavailable");
  assert.equal(classifyRefreshResponse(429), "unavailable");
});
