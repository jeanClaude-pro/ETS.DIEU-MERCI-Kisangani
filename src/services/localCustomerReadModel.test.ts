import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { offlineDb, type OfflineSale } from "../lib/offlineDb.ts";
import { cacheCustomers, getLocalCustomers } from "./localCustomerReadModel.ts";

const pending: OfflineSale = {
  clientSaleId: "customer-sale", barcodeToken: "ABCDEFGHJKMN", receiptNumber: "ABCD-EFGH-JKMN",
  occurredAt: "2026-09-20T10:00:00.000Z",
  payload: {
    customer: { name: "Amina", phone: "+2431", email: "a@example.com", isWalkIn: false },
    items: [{ productId: "p1", name: "A", quantity: 1, price: 25, region: "Butembo", regionCode: "Bbbb" }],
    subtotal: 25, total: 25, paymentMethod: "cash", salesPerson: "Jean", exchangeRateSnapshot: null,
    clientSaleId: "customer-sale", barcodeToken: "ABCDEFGHJKMN", receiptNumber: "ABCD-EFGH-JKMN",
    clientOccurredAt: "2026-09-20T10:00:00.000Z", origin: "offline",
  },
  receiptSnapshot: {}, syncState: "PENDING", attempts: 0, lastError: null, lastAttemptAt: null,
  syncedSaleId: null, syncedAt: null, createdAt: "2026-09-20T10:00:00.000Z",
};

beforeEach(async () => {
  await Promise.all([offlineDb.cachedCustomers.clear(), offlineDb.offlineSales.clear()]);
});

test("customer totals apply a pending delta once and stay stable after server reconciliation", async () => {
  const base = {
    _id: "customer-1", name: "Amina", phone: "+2431", email: "a@example.com",
    totalPurchases: 2, totalSpent: 100, firstPurchaseDate: "2026-09-01T10:00:00.000Z",
    lastPurchaseDate: "2026-09-10T10:00:00.000Z", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z",
  };
  await cacheCustomers([base]);
  await offlineDb.offlineSales.put(pending);
  let customer = (await getLocalCustomers())[0];
  assert.equal(customer.totalPurchases, 3);
  assert.equal(customer.totalSpent, 125);

  await offlineDb.offlineSales.update(pending.clientSaleId, {
    syncState: "SYNCED", syncedSaleId: "server-sale", syncedAt: new Date(Date.now() - 1000).toISOString(),
  });
  await cacheCustomers([{ ...base, totalPurchases: 3, totalSpent: 125 }]);
  customer = (await getLocalCustomers())[0];
  assert.equal(customer.totalPurchases, 3);
  assert.equal(customer.totalSpent, 125);
});

test("walk-in sales never create customer portfolio rows", async () => {
  await offlineDb.offlineSales.put({
    ...pending,
    clientSaleId: "walk-in",
    payload: { ...pending.payload, clientSaleId: "walk-in", customer: { name: "Walk-in Customer", phone: "WALK-IN", email: "", isWalkIn: true } },
  });
  assert.equal((await getLocalCustomers()).length, 0);
});
