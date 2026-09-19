import test from "node:test";
import assert from "node:assert/strict";
import { beginConnectivityCheck, probeBackendHealth } from "./connectivityService.ts";

test("health state transitions distinguish ONLINE, DEGRADED, and OFFLINE", async () => {
  const online = await probeBackendHealth("/health", async () => new Response(JSON.stringify({ ok: true, database: "ready" }), { status: 200, headers: { "Content-Type": "application/json" } }), 100);
  const degraded = await probeBackendHealth("/health", async () => new Response(JSON.stringify({ ok: false, database: "unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }), 100);
  const offline = await probeBackendHealth("/health", async () => { throw new TypeError("network down"); }, 100);
  assert.equal(online, "online");
  assert.equal(degraded, "degraded");
  assert.equal(offline, "offline");
});

test("a responding API with malformed health data is DEGRADED, never falsely ONLINE", async () => {
  const state = await probeBackendHealth("/health", async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }), 100);
  assert.equal(state, "degraded");
});

test("OFFLINE and DEGRADED enter RECONNECTING while healthy ONLINE remains usable during a background check", () => {
  assert.equal(beginConnectivityCheck("offline"), "reconnecting");
  assert.equal(beginConnectivityCheck("degraded"), "reconnecting");
  assert.equal(beginConnectivityCheck("online"), "online");
  assert.equal(beginConnectivityCheck("checking"), "checking");
});
