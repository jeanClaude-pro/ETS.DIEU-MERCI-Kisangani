import test from "node:test";
import assert from "node:assert/strict";
import { authenticationStatus, userFromOfflineSession } from "./authStateMachine.ts";
import type { OfflineSession, User } from "../types/auth.ts";

const user: User = { id: "u1", username: "Jean", email: "j@example.com", role: "manager" };
const offline: OfflineSession = {
  userId: "u1", username: "Jean", role: "manager", modules: ["pos", "sync"],
  issuedAt: "2026-09-20T00:00:00.000Z", expiresAt: "2026-09-21T00:00:00.000Z",
};

test("authentication lifecycle remains coherent through repeated login/logout/login", () => {
  const status = (token: string | null, currentUser: User | null) => authenticationStatus({
    loading: false, authRequired: false, token, user: currentUser,
  }, null);
  assert.equal(status("token-1", user), "ONLINE_AUTHENTICATED");
  assert.equal(status(null, null), "UNAUTHENTICATED");
  assert.equal(status("token-2", user), "ONLINE_AUTHENTICATED");
  assert.equal(status(null, null), "UNAUTHENTICATED");
  assert.equal(status("token-3", user), "ONLINE_AUTHENTICATED");
});

test("offline PIN is a separate authenticated principal, never an online token", () => {
  assert.equal(authenticationStatus({ loading: false, authRequired: false, token: null, user: null }, offline), "OFFLINE_AUTHENTICATED");
  assert.deepEqual(userFromOfflineSession(offline)?.modulePermissions, ["pos", "sync"]);
});

test("a rejected online session enters AUTH_REQUIRED without a stale principal", () => {
  assert.equal(authenticationStatus({ loading: false, authRequired: true, token: null, user: null }, null), "AUTH_REQUIRED");
});
