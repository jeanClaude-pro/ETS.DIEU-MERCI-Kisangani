import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { commitOfflineSale, offlineDb, type OfflineSale } from "../lib/offlineDb.ts";
import { cacheServerSales, getMergedBusinessSales, type BusinessSale } from "./localBusinessReadModel.ts";
import { buildLocalAnalytics, localReportRange } from "./localReportService.ts";

const occurredAt = "2026-09-20T10:00:00.000Z";

function serverSale(id: string, total: number, clientSaleId?: string): BusinessSale {
  return {
    _id: id, saleId: `SALE-${id}`, clientSaleId,
    customer: { name: `Customer ${id}`, phone: `+243${id}`, email: "", isWalkIn: false },
    items: [{ productId: "product-1", name: "Chemise", quantity: 1, price: total, total, subtotal: total, unitCost: 10, cost: 10, profit: total - 10, netTotal: total, region: "Butembo", regionCode: "Bbbb" }],
    subtotal: total, total, cost: 10, profit: total - 10, paymentMethod: "cash",
    salesPerson: "Jean", status: "completed", type: "sale", createdAt: occurredAt, updatedAt: occurredAt,
  };
}

function localSale(id: string, total: number, syncState: OfflineSale["syncState"] = "PENDING"): OfflineSale {
  return {
    clientSaleId: id, barcodeToken: "ABCDEFGHJKMN", receiptNumber: `LOCAL-${id}`,
    occurredAt,
    payload: {
      customer: { name: `Customer ${id}`, phone: `+243${id}`, email: "", isWalkIn: false },
      items: [{ productId: "product-1", name: "Chemise", quantity: 1, price: total, unitCost: 10, region: "Butembo", regionCode: "Bbbb" }],
      subtotal: total, total, paymentMethod: "cash", salesPerson: "Jean",
      exchangeRateSnapshot: { rateId: "rate", rate: 2800, effectiveFrom: occurredAt },
      clientSaleId: id, barcodeToken: "ABCDEFGHJKMN", receiptNumber: `LOCAL-${id}`,
      clientOccurredAt: occurredAt, origin: "offline",
    },
    receiptSnapshot: {}, syncState, attempts: 0, lastError: null, lastAttemptAt: null,
    syncedSaleId: syncState === "SYNCED" ? `server-${id}` : null,
    syncedAt: syncState === "SYNCED" ? occurredAt : null, createdAt: occurredAt,
  };
}

beforeEach(async () => {
  await Promise.all([
    offlineDb.cachedSales.clear(), offlineDb.cachedReports.clear(), offlineDb.cachedCustomers.clear(),
    offlineDb.offlineSales.clear(), offlineDb.syncMeta.clear(),
    offlineDb.products.clear(), offlineDb.stockMovements.clear(),
  ]);
});

test("snapshot plus local deltas remains $250 throughout partial and complete synchronization", async () => {
  await cacheServerSales([serverSale("A", 100), serverSale("B", 50)]);
  await offlineDb.offlineSales.bulkPut([localSale("C", 25), localSale("D", 75)]);
  let merged = await getMergedBusinessSales();
  let report = buildLocalAnalytics(merged, localReportRange({ date: "2026-09-20" })).data;
  assert.equal(merged.length, 4);
  assert.equal(report.totalRevenue, 250);

  await cacheServerSales([serverSale("server-C", 25, "C")]);
  await offlineDb.offlineSales.update("C", { syncState: "SYNCED", syncedSaleId: "server-C", syncedAt: occurredAt });
  merged = await getMergedBusinessSales();
  report = buildLocalAnalytics(merged, localReportRange({ date: "2026-09-20" })).data;
  assert.equal(merged.length, 4);
  assert.equal(report.totalRevenue, 250);

  await cacheServerSales([serverSale("server-D", 75, "D")]);
  await offlineDb.offlineSales.update("D", { syncState: "SYNCED", syncedSaleId: "server-D", syncedAt: occurredAt });
  merged = await getMergedBusinessSales();
  report = buildLocalAnalytics(merged, localReportRange({ date: "2026-09-20" })).data;
  assert.equal(merged.length, 4);
  assert.equal(report.totalRevenue, 250);
});

test("a full offline day survives database close/reopen and continues from 10 to 15 sales", async () => {
  await offlineDb.offlineSales.bulkPut(Array.from({ length: 10 }, (_, index) => localSale(`restart-${index}`, 1.25)));
  offlineDb.close();
  await offlineDb.open();
  assert.equal((await getMergedBusinessSales()).length, 10);
  await offlineDb.offlineSales.bulkPut(Array.from({ length: 5 }, (_, index) => localSale(`after-${index}`, 2.5)));
  const merged = await getMergedBusinessSales();
  const report = buildLocalAnalytics(merged, localReportRange({ date: "2026-09-20" })).data;
  assert.equal(merged.length, 15);
  assert.equal(report.totalRevenue, 25);
  assert.equal((await offlineDb.offlineSales.where("syncState").equals("PENDING").count()), 15);
});

test("24-sale full-day simulation keeps history, report, stock and queue consistent", async () => {
  await offlineDb.products.put({
    productId: "product-1", name: "Chemise", price: 5, stock: 50, minStock: 2,
    unit: "pcs", unitCost: 2, status: "active", region: "Butembo", regionCode: "Bbbb",
  });
  for (let index = 0; index < 24; index += 1) {
    const row = localSale(`day-${index}`, 5);
    row.payload.paymentMethod = index % 2 ? "cash" : "transfer";
    row.payload.items[0].price = 5;
    row.payload.items[0].unitCost = 2;
    await commitOfflineSale(row, [{ productId: "product-1", quantityDelta: -1 }]);
  }
  const merged = await getMergedBusinessSales();
  const report = buildLocalAnalytics(merged, localReportRange({ date: "2026-09-20" })).data;
  assert.equal(merged.length, 24);
  assert.equal(report.totalSales, 24);
  assert.equal(report.totalRevenue, 120);
  assert.equal(report.topProducts[0].quantity, 24);
  assert.equal((await offlineDb.products.get("product-1"))?.stock, 26);
  assert.equal(await offlineDb.offlineSales.where("syncState").equals("PENDING").count(), 24);
  offlineDb.close();
  await offlineDb.open();
  assert.equal((await getMergedBusinessSales()).length, 24);
});
