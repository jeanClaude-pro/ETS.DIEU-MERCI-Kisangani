import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { offlineDb } from "../lib/offlineDb.ts";
import { readLocal, refreshFromServer, subscribeLocal } from "./offlineProductSnapshot.ts";

beforeEach(async () => {
  await Promise.all([
    offlineDb.products.clear(),
    offlineDb.exchangeRateCache.clear(),
    offlineDb.offlineSales.clear(),
    offlineDb.syncMeta.clear(),
  ]);
});

async function seedOperationalData(stock = 12) {
  await offlineDb.products.put({
    productId: "product-1", name: "Chemise", region: "Butembo", regionCode: "Bbbb",
    stock, minStock: 1, unit: "pcs", unitCost: 0, status: "active",
  });
  await offlineDb.exchangeRateCache.put({
    id: "current", rateId: "rate-1", rate: 2350,
    effectiveFrom: "2026-09-20T00:00:00.000Z", cachedAt: "2026-09-20T01:00:00.000Z",
  });
  await offlineDb.syncMeta.bulkPut([
    { key: "walkInCustomer", value: JSON.stringify({ _id: "walk-in", name: "Walk-in Customer", phone: "WALK-IN" }) },
    { key: "lastSnapshotAt", value: "2026-09-20T01:00:00.000Z" },
  ]);
}

test("readLocal reconstructs the same complete POS state on every mount", async () => {
  await seedOperationalData();
  const firstMount = await readLocal();
  const secondMount = await readLocal();
  const thirdMount = await readLocal();

  assert.deepEqual(secondMount, firstMount);
  assert.deepEqual(thirdMount, firstMount);
  assert.equal(firstMount.products[0].stock, 12);
  assert.equal(firstMount.exchangeRate?.rate, 2350);
  assert.equal(firstMount.walkInCustomer?._id, "walk-in");
});

test("subscription publishes IndexedDB stock changes to a mounted POS", async () => {
  await seedOperationalData();
  const observed: number[] = [];
  const unsubscribe = subscribeLocal(
    (snapshot) => { if (snapshot.products[0]) observed.push(snapshot.products[0].stock); },
    (error) => { throw error; },
  );
  for (let attempt = 0; attempt < 20 && !observed.includes(12); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await offlineDb.products.update("product-1", { stock: 9 });
  for (let attempt = 0; attempt < 20 && !observed.includes(9); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  unsubscribe();
  assert.ok(observed.includes(12));
  assert.ok(observed.includes(9));
});

test("failed server refresh preserves the last trusted operational snapshot", async () => {
  await seedOperationalData();
  globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;

  await assert.rejects(() => refreshFromServer("token"));
  const preserved = await readLocal();
  assert.equal(preserved.products[0].stock, 12);
  assert.equal(preserved.exchangeRate?.rate, 2350);
  assert.equal(preserved.walkInCustomer?._id, "walk-in");
});

test("successful server refresh commits products, rate, customer, and timestamp together", async () => {
  await seedOperationalData();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("offline-snapshot")) return Response.json({ products: [{
      _id: "product-1", name: "Chemise", region: "Butembo", regionCode: "Bbbb",
      stock: 20, minStock: 2, unit: "pcs", status: "active", updatedAt: "2026-09-20T02:00:00.000Z",
    }] });
    if (url.includes("exchange-rates")) return Response.json({ _id: "rate-2", rate: 2400, effectiveFrom: "2026-09-20T02:00:00.000Z" });
    return Response.json({ _id: "walk-in-2", name: "Walk-in Customer", phone: "WALK-IN" });
  }) as typeof fetch;

  await refreshFromServer("token");
  const refreshed = await readLocal();
  assert.equal(refreshed.products[0].stock, 20);
  assert.equal(refreshed.exchangeRate?.rate, 2400);
  assert.equal(refreshed.walkInCustomer?._id, "walk-in-2");
  assert.ok(refreshed.lastUpdated);
});
