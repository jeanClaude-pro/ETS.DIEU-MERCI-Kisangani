import test from "node:test";
import assert from "node:assert/strict";
import {
  ConnectivityController,
  OFFLINE_BACKOFF_MS,
  ONLINE_RECHECK_MS,
  beginConnectivityCheck,
  probeBackendHealth,
  type StableConnectivity,
} from "./connectivityService.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeClock() {
  let now = 1_000;
  let nextId = 1;
  const tasks = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimer(callback: () => void, delay: number) {
      const id = nextId++;
      tasks.set(id, { at: now + delay, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer(timer: ReturnType<typeof setTimeout>) {
      tasks.delete(timer as unknown as number);
    },
    advance(milliseconds: number) {
      now += milliseconds;
      const due = [...tasks.entries()].filter(([, task]) => task.at <= now).sort((a, b) => a[1].at - b[1].at);
      for (const [id, task] of due) {
        tasks.delete(id);
        task.callback();
      }
    },
    delays: () => [...tasks.values()].map((task) => task.at - now),
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

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

test("multiple consumers and repeated startup calls create only one health request", async () => {
  const pending = deferred<StableConnectivity>();
  let requests = 0;
  const clock = fakeClock();
  const controller = new ConnectivityController("/health", {
    probe: () => { requests += 1; return pending.promise; },
    ...clock,
  });
  const unsubscribeA = controller.subscribe(() => undefined);
  const unsubscribeB = controller.subscribe(() => undefined);

  controller.start();
  controller.start();
  const first = controller.checkNow();
  const second = controller.checkNow();
  assert.equal(first, second, "concurrent callers must receive the same promise");
  assert.equal(requests, 1);

  pending.resolve("online");
  await first;
  assert.deepEqual(clock.delays(), [ONLINE_RECHECK_MS]);
  unsubscribeA();
  unsubscribeB();
  controller.stop();
});

test("offline event changes state without a request and online event makes one immediate probe", async () => {
  let requests = 0;
  const clock = fakeClock();
  const controller = new ConnectivityController("/health", {
    probe: async () => { requests += 1; return "online"; },
    ...clock,
  });

  controller.browserOffline();
  assert.equal(controller.getSnapshot().status, "offline");
  assert.equal(requests, 0);

  const first = controller.browserOnline();
  const second = controller.browserOnline();
  assert.equal(first, second);
  await first;
  assert.equal(requests, 1);
  assert.equal(controller.getSnapshot().status, "online");
});

test("failed probes use one capped backoff timer and success resets failures", async () => {
  const clock = fakeClock();
  const outcomes: StableConnectivity[] = ["offline", "offline", "online"];
  let requests = 0;
  const controller = new ConnectivityController("/health", {
    probe: async () => { requests += 1; return outcomes.shift() || "online"; },
    ...clock,
  });

  controller.start();
  await settle();
  assert.equal(requests, 1);
  assert.deepEqual(clock.delays(), [OFFLINE_BACKOFF_MS[0]]);

  clock.advance(OFFLINE_BACKOFF_MS[0]);
  await settle();
  assert.equal(requests, 2);
  assert.deepEqual(clock.delays(), [OFFLINE_BACKOFF_MS[1]]);

  clock.advance(OFFLINE_BACKOFF_MS[1]);
  await settle();
  assert.equal(requests, 3);
  assert.equal(controller.getSnapshot().status, "online");
  assert.equal(controller.getSnapshot().consecutiveFailures, 0);
  assert.deepEqual(clock.delays(), [ONLINE_RECHECK_MS]);
  controller.stop();
});

test("focus/visibility-style activity hints are throttled and rerenders cannot add probes", async () => {
  const clock = fakeClock();
  let requests = 0;
  const controller = new ConnectivityController("/health", {
    probe: async () => { requests += 1; return "online"; },
    ...clock,
  });

  controller.start();
  await settle();
  controller.getSnapshot();
  controller.getSnapshot();
  await Promise.all([controller.activityHint(), controller.activityHint(), controller.checkNow()]);
  assert.equal(requests, 1);
  assert.deepEqual(clock.delays(), [ONLINE_RECHECK_MS]);
  controller.stop();
});
