import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { liveQuery } from "dexie";
import {
  offlineDb,
  commitOfflineSale,
  getPendingOfflineSales,
  countOfflineSalesByState,
  markSyncState,
  incrementAttempts,
  getOrCreateDeviceId,
  type OfflineSale,
} from "./offlineDb.ts";

beforeEach(async () => {
  await offlineDb.transaction(
    "rw",
    offlineDb.products,
    offlineDb.offlineSales,
    offlineDb.stockMovements,
    offlineDb.syncMeta,
    async () => {
      await Promise.all([
        offlineDb.products.clear(),
        offlineDb.offlineSales.clear(),
        offlineDb.stockMovements.clear(),
        offlineDb.syncMeta.clear(),
      ]);
    }
  );
});

function makeSale(clientSaleId: string, overrides: Partial<OfflineSale> = {}): OfflineSale {
  return {
    clientSaleId,
    barcodeToken: "ABCDEFGHJKMN",
    receiptNumber: "ABCD-EFGH-JKMN",
    occurredAt: "2026-09-19T10:00:00.000Z",
    payload: {
      customer: { name: "Walk-in Customer", phone: "WALK-IN", email: "", isWalkIn: true },
      items: [{ productId: "prod-1", name: "Chemise", quantity: 2, price: 10, region: "Butembo", regionCode: "Bbbb" }],
      subtotal: 20,
      total: 20,
      paymentMethod: "cash",
      salesPerson: "Jean",
      exchangeRateSnapshot: null,
      clientSaleId,
      barcodeToken: "ABCDEFGHJKMN",
      receiptNumber: "ABCD-EFGH-JKMN",
      clientOccurredAt: "2026-09-19T10:00:00.000Z",
      origin: "offline",
    },
    receiptSnapshot: { reference: "ABCD-EFGH-JKMN" },
    syncState: "PENDING",
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    syncedSaleId: null,
    syncedAt: null,
    createdAt: "2026-09-19T10:00:00.100Z",
    ...overrides,
  };
}

test("commitOfflineSale: atomically writes the sale, decrements local stock, and logs a movement", async () => {
  await offlineDb.products.add({
    productId: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo",
    regionCode: "Bbbb", stock: 20, minStock: 2, unit: "pcs", unitCost: 4, status: "active",
  });

  await commitOfflineSale(makeSale("sale-1"), [{ productId: "prod-1", quantityDelta: -2 }]);

  const product = await offlineDb.products.get("prod-1");
  assert.equal(product?.stock, 18);

  const sale = await offlineDb.offlineSales.get("sale-1");
  assert.equal(sale?.syncState, "PENDING");

  const movements = await offlineDb.stockMovements.where("clientSaleId").equals("sale-1").toArray();
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantityDelta, -2);
});

test("commitOfflineSale: a second sale against the same product further projects stock, never reverting to server truth", async () => {
  await offlineDb.products.add({
    productId: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo",
    regionCode: "Bbbb", stock: 20, minStock: 2, unit: "pcs", unitCost: 4, status: "active",
  });
  await commitOfflineSale(makeSale("sale-1"), [{ productId: "prod-1", quantityDelta: -2 }]);
  await commitOfflineSale(makeSale("sale-2"), [{ productId: "prod-1", quantityDelta: -5 }]);

  const product = await offlineDb.products.get("prod-1");
  assert.equal(product?.stock, 13);
  assert.equal(await offlineDb.offlineSales.count(), 2);
});

test("getPendingOfflineSales: recovers confirmation and interrupted syncing rows after restart", async () => {
  await offlineDb.offlineSales.bulkAdd([
    makeSale("pending-1", { syncState: "PENDING" }),
    makeSale("confirmation-1", { syncState: "PENDING_CONFIRMATION" }),
    makeSale("retryable-1", { syncState: "FAILED_RETRYABLE" }),
    makeSale("synced-1", { syncState: "SYNCED" }),
    makeSale("conflict-1", { syncState: "CONFLICT" }),
    makeSale("syncing-1", { syncState: "SYNCING" }),
  ]);

  const pending = await getPendingOfflineSales();
  const ids = pending.map((sale) => sale.clientSaleId).sort();
  assert.deepEqual(ids, ["confirmation-1", "pending-1", "retryable-1", "syncing-1"]);
});

test("countOfflineSalesByState: tallies every state, including zero counts", async () => {
  await offlineDb.offlineSales.bulkAdd([
    makeSale("a", { syncState: "PENDING" }),
    makeSale("b", { syncState: "PENDING" }),
    makeSale("c", { syncState: "CONFLICT" }),
  ]);
  const counts = await countOfflineSalesByState();
  assert.equal(counts.PENDING, 2);
  assert.equal(counts.CONFLICT, 1);
  assert.equal(counts.SYNCED, 0);
  assert.equal(counts.FAILED_PERMANENT, 0);
});

test("markSyncState: transitions state and records the reason without deleting the record (Part I)", async () => {
  await offlineDb.offlineSales.add(makeSale("sale-1"));
  await markSyncState("sale-1", "CONFLICT", { lastError: "Stock changed for an item." });

  const sale = await offlineDb.offlineSales.get("sale-1");
  assert.equal(sale?.syncState, "CONFLICT");
  assert.equal(sale?.lastError, "Stock changed for an item.");
  assert.equal(await offlineDb.offlineSales.count(), 1); // never deleted
});

test("incrementAttempts: counts retries so backoff/telemetry can use it", async () => {
  await offlineDb.offlineSales.add(makeSale("sale-1"));
  assert.equal(await incrementAttempts("sale-1"), 1);
  assert.equal(await incrementAttempts("sale-1"), 2);
  const sale = await offlineDb.offlineSales.get("sale-1");
  assert.equal(sale?.attempts, 2);
});

test("getOrCreateDeviceId: generates once and persists across calls", async () => {
  const first = await getOrCreateDeviceId();
  const second = await getOrCreateDeviceId();
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f-]{36}$/i);
});

test("pending counter updates reactively when a durable sale is added", async () => {
  const observed: number[] = [];
  const subscription = liveQuery(countOfflineSalesByState).subscribe((counts) => observed.push(counts.PENDING));
  for (let attempt = 0; attempt < 20 && observed.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await offlineDb.offlineSales.add(makeSale("reactive-sale"));
  for (let attempt = 0; attempt < 20 && !observed.includes(1); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  subscription.unsubscribe();
  assert.ok(observed.includes(0));
  assert.ok(observed.includes(1));
});
