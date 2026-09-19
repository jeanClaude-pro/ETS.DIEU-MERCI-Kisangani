import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { offlineDb } from "../lib/offlineDb.ts";
import {
  OfflinePinError,
  hasOfflinePinConfigured,
  listOfflineAuthorizedUsers,
  setupOfflinePin,
  verifyOfflinePin,
} from "./offlinePinService.ts";

const user = { id: "user-1", username: "jean", role: "staff", modulePermissions: ["pos"] };

beforeEach(async () => {
  await offlineDb.offlineUsers.clear();
  await offlineDb.offlineAuthState.clear();
});

test("setupOfflinePin: rejects a PIN outside the 4-12 digit range", async () => {
  await assert.rejects(() => setupOfflinePin(user, "123"), OfflinePinError);
  await assert.rejects(() => setupOfflinePin(user, "1234567890123"), OfflinePinError);
  await assert.rejects(() => setupOfflinePin(user, "12a4"), OfflinePinError);
});

test("setupOfflinePin: never stores the PIN itself, only a salt and verifier", async () => {
  await setupOfflinePin(user, "246810");
  const row = await offlineDb.offlineUsers.get("user-1");
  assert.ok(row);
  assert.equal(row!.username, "jean");
  assert.ok(row!.salt.length > 0);
  assert.ok(row!.verifier.length > 0);
  assert.doesNotMatch(JSON.stringify(row), /246810/);
});

test("setupOfflinePin: caps offlineModules to the safe allowlist, never full admin access", async () => {
  const admin = { id: "admin-1", username: "boss", role: "admin", modulePermissions: undefined };
  await setupOfflinePin(admin, "135790");
  const row = await offlineDb.offlineUsers.get("admin-1");
  assert.deepEqual([...row!.offlineModules].sort(), ["pos", "scanner", "sync"]);
  assert.ok(!row!.offlineModules.includes("management"));
});

test("hasOfflinePinConfigured / listOfflineAuthorizedUsers: reflect what setup wrote, exposing no secrets", async () => {
  assert.equal(await hasOfflinePinConfigured("user-1"), false);
  await setupOfflinePin(user, "112233");
  assert.equal(await hasOfflinePinConfigured("user-1"), true);
  const candidates = await listOfflineAuthorizedUsers();
  assert.deepEqual(candidates, [{ userId: "user-1", username: "jean", role: "staff" }]);
});

test("verifyOfflinePin: correct PIN succeeds and returns a 12h session capped to the safe allowlist", async () => {
  await setupOfflinePin(user, "556677");
  const result = await verifyOfflinePin("user-1", "556677");
  assert.equal(result.ok, true);
  assert.equal(result.session?.username, "jean");
  // "staff" with explicit ["pos"] permissions also gets the "sync" safety
  // companion per effectiveModulesForUser — both are within the allowlist.
  assert.deepEqual([...result.session!.modules].sort(), ["pos", "sync"]);
  const issuedAt = new Date(result.session!.issuedAt).getTime();
  const expiresAt = new Date(result.session!.expiresAt).getTime();
  assert.equal(expiresAt - issuedAt, 12 * 60 * 60 * 1000);
});

test("verifyOfflinePin: wrong PIN fails without leaking whether the account exists further", async () => {
  await setupOfflinePin(user, "998877");
  const result = await verifyOfflinePin("user-1", "000000");
  assert.equal(result.ok, false);
  assert.equal(result.session, undefined);
});

test("verifyOfflinePin: unknown user (no PIN ever configured on this device) fails", async () => {
  const result = await verifyOfflinePin("nobody", "123456");
  assert.equal(result.ok, false);
  assert.match(result.reason!, /Aucune autorisation/);
});

test("verifyOfflinePin: 5 failed attempts locks for 5 minutes, and locked attempts don't consume more tries", async () => {
  await setupOfflinePin(user, "445566");
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await verifyOfflinePin("user-1", "000000");
    assert.equal(result.ok, false);
  }
  const state = await offlineDb.offlineAuthState.get("user-1");
  assert.equal(state?.failedAttempts, 5);
  assert.ok(state?.lockedUntil);

  const lockedResult = await verifyOfflinePin("user-1", "445566"); // even the correct PIN is rejected while locked
  assert.equal(lockedResult.ok, false);
  assert.match(lockedResult.reason!, /Trop de tentatives/);
  const stateAfter = await offlineDb.offlineAuthState.get("user-1");
  assert.equal(stateAfter?.failedAttempts, 5, "a locked-out attempt must not increment the counter further");
});

test("verifyOfflinePin: 10+ failed attempts locks for 30 minutes", async () => {
  await offlineDb.offlineUsers.put({
    userId: "user-2", deviceId: "device-1", username: "amina", role: "staff",
    offlineModules: ["pos"], salt: "irrelevant", verifier: "irrelevant",
    authorizedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await offlineDb.offlineAuthState.put({ userId: "user-2", failedAttempts: 9, lockedUntil: null });
  const before = Date.now();
  const result = await verifyOfflinePin("user-2", "000000");
  assert.equal(result.ok, false);
  const state = await offlineDb.offlineAuthState.get("user-2");
  assert.equal(state?.failedAttempts, 10);
  const lockMs = new Date(state!.lockedUntil!).getTime() - before;
  assert.ok(lockMs > 29 * 60 * 1000 && lockMs <= 30 * 60 * 1000 + 1000, `expected ~30min lock, got ${lockMs}ms`);
});

test("verifyOfflinePin: a correct PIN after a failed attempt resets the counter", async () => {
  await setupOfflinePin(user, "778899");
  await verifyOfflinePin("user-1", "000000");
  let state = await offlineDb.offlineAuthState.get("user-1");
  assert.equal(state?.failedAttempts, 1);

  const result = await verifyOfflinePin("user-1", "778899");
  assert.equal(result.ok, true);
  state = await offlineDb.offlineAuthState.get("user-1");
  assert.equal(state?.failedAttempts, 0);
  assert.equal(state?.lockedUntil, null);
});
