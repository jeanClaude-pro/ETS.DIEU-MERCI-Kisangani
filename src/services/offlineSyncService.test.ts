import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { offlineDb, commitOfflineSale, cleanupSyncedHistory, type OfflineSale } from "../lib/offlineDb.ts";
import { getSyncProgress, runOfflineSyncPass, syncOfflineSale } from "./offlineSyncService.ts";
import { snapshotProducts } from "./offlineProductSnapshot.ts";

const storage = new Map<string, string>([["token", "test-token"]]);
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}, configurable: true });

function sale(id = "client-1", state: OfflineSale["syncState"] = "PENDING_CONFIRMATION"): OfflineSale {
  const occurredAt = "2026-09-19T10:00:00.000Z";
  return {
    clientSaleId: id,
    barcodeToken: "ABCDEFGHJKMN",
    receiptNumber: "ABCD-EFGH-JKMN",
    occurredAt,
    payload: {
      customer: { name: "Walk-in Customer", phone: "WALK-IN", email: "", isWalkIn: true },
      items: [{ productId: "prod-1", name: "Chemise", quantity: 2, price: 10, region: "Butembo", regionCode: "Bbbb" }],
      subtotal: 20,
      total: 20,
      paymentMethod: "cash",
      salesPerson: "Jean",
      exchangeRateSnapshot: { rateId: null, rate: 2800, effectiveFrom: null },
      clientSaleId: id,
      barcodeToken: "ABCDEFGHJKMN",
      receiptNumber: "ABCD-EFGH-JKMN",
      clientOccurredAt: occurredAt,
      origin: "online",
    },
    receiptSnapshot: {}, syncState: state, attempts: 0, lastError: null,
    lastAttemptAt: null, syncedSaleId: null, syncedAt: null, createdAt: occurredAt,
  };
}

beforeEach(async () => {
  await Promise.all([
    offlineDb.products.clear(), offlineDb.offlineSales.clear(),
    offlineDb.stockMovements.clear(), offlineDb.syncMeta.clear(),
  ]);
  await offlineDb.products.put({ productId: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo", regionCode: "Bbbb", stock: 20, minStock: 1, unit: "pcs", unitCost: 0, status: "active" });
});

test("lost response remains durable and retrying uses the same permanent identity", async () => {
  const pending = sale();
  await commitOfflineSale(pending, [{ productId: "prod-1", quantityDelta: -2 }]);
  const bodies: unknown[] = [];
  let request = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    request += 1;
    if (request === 1) throw new TypeError("response lost");
    if (request === 2) return new Response(JSON.stringify({ _id: "server-1" }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ products: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  assert.equal(await syncOfflineSale(pending), "retry-later");
  assert.equal((await offlineDb.offlineSales.get(pending.clientSaleId))?.syncState, "FAILED_RETRYABLE");
  assert.equal(await syncOfflineSale((await offlineDb.offlineSales.get(pending.clientSaleId))!), "synced");
  const saved = await offlineDb.offlineSales.get(pending.clientSaleId);
  assert.equal(saved?.syncedSaleId, "server-1");
  assert.equal(saved?.barcodeToken, pending.barcodeToken);
  assert.equal(saved?.receiptNumber, pending.receiptNumber);
  assert.equal(saved?.occurredAt, pending.occurredAt);
  assert.equal((bodies[0] as { clientSaleId: string }).clientSaleId, (bodies[1] as { clientSaleId: string }).clientSaleId);
  assert.equal((await offlineDb.products.get("prod-1"))?.stock, 18, "sync must not decrement projected stock again");
});

test("server rejection becomes a persisted conflict, never a second offline sale", async () => {
  const pending = sale();
  await offlineDb.offlineSales.put(pending);
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Stock changed" }), { status: 409, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  assert.equal(await syncOfflineSale(pending), "conflict");
  assert.equal((await offlineDb.offlineSales.get(pending.clientSaleId))?.syncState, "CONFLICT");
  assert.equal(await offlineDb.offlineSales.count(), 1);
});

test("401 pauses the same row instead of converting it into a duplicate", async () => {
  const pending = sale();
  await offlineDb.offlineSales.put(pending);
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "expired" }), { status: 401, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  assert.equal(await syncOfflineSale(pending), "paused");
  assert.equal((await offlineDb.offlineSales.get(pending.clientSaleId))?.syncState, "PENDING");
  assert.equal(await offlineDb.offlineSales.count(), 1);
});

test("401 sets pausedForAuth (AUTH_REQUIRED, never read as offline) and a later successful pass clears it", async () => {
  await offlineDb.offlineSales.put(sale("client-auth", "PENDING"));
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "expired" }), { status: 401, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  await runOfflineSyncPass();
  assert.equal(getSyncProgress().pausedForAuth, true);

  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes("/sales/sync")) return new Response(JSON.stringify({ _id: "server-auth" }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ products: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  await runOfflineSyncPass();
  assert.equal(getSyncProgress().pausedForAuth, false);
});

test("manual and automatic triggers share one single-flight queue drain", async () => {
  await offlineDb.offlineSales.put(sale("client-single", "PENDING"));
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let salePosts = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes("/sales/sync")) { salePosts += 1; await wait; return new Response(JSON.stringify({ _id: "server-single" }), { status: 200, headers: { "Content-Type": "application/json" } }); }
    return new Response(JSON.stringify({ products: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const automatic = runOfflineSyncPass();
  const manual = runOfflineSyncPass();
  assert.equal(automatic, manual);
  release();
  await automatic;
  assert.equal(salePosts, 1);
});

test("retention removes only old synchronized history", async () => {
  const old = "2026-01-01T00:00:00.000Z";
  await offlineDb.offlineSales.bulkPut([
    sale("old-synced", "SYNCED"),
    { ...sale("old-pending", "PENDING"), createdAt: old },
    { ...sale("old-conflict", "CONFLICT"), createdAt: old },
  ]);
  await offlineDb.offlineSales.update("old-synced", { createdAt: old, syncedAt: old });
  assert.equal(await cleanupSyncedHistory(new Date("2026-09-19T00:00:00Z").getTime()), 1);
  assert.ok(await offlineDb.offlineSales.get("old-pending"));
  assert.ok(await offlineDb.offlineSales.get("old-conflict"));
});

test("authoritative snapshots preserve unresolved projected stock and reconcile it after sync", async () => {
  const pending = sale("projection", "PENDING");
  await commitOfflineSale(pending, [{ productId: "prod-1", quantityDelta: -2 }]);
  await snapshotProducts([{ _id: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo", regionCode: "Bbbb", stock: 20, status: "active" }]);
  assert.equal((await offlineDb.products.get("prod-1"))?.stock, 18);
  await offlineDb.offlineSales.update("projection", { syncState: "SYNCED", syncedAt: new Date().toISOString() });
  await snapshotProducts([{ _id: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo", regionCode: "Bbbb", stock: 18, status: "active" }]);
  assert.equal((await offlineDb.products.get("prod-1"))?.stock, 18);
});
