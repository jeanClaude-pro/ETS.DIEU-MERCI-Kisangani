import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalAnalytics, businessDate, localReportRange, parseBusinessDate } from "./localReportService.ts";
import type { BusinessSale } from "./localBusinessReadModel.ts";

function sale(overrides: Partial<BusinessSale> = {}): BusinessSale {
  return {
    _id: "sale-1", saleId: "SALE-1", clientSaleId: "client-1",
    customer: { name: "Amina", phone: "+2431", email: "", isWalkIn: false },
    items: [
      { productId: "p1", name: "A", quantity: 3, price: 0.1, total: 0.3, subtotal: 0.3, unitCost: 0.03, cost: 0.09, netTotal: 0.3, profit: 0.21, region: "Butembo", regionCode: "Bbbb" },
      { productId: "p2", name: "B", quantity: 2, price: 10, total: 20, subtotal: 20, unitCost: 4, cost: 8, netTotal: 20, profit: 12, region: "China", regionCode: "Cnnn" },
    ],
    subtotal: 20.3, discount: 0, tax: 0, transportCost: 0, otherCharges: 0,
    total: 20.3, cost: 8.09, profit: 12.21, paymentMethod: "cash", salesPerson: "Jean",
    status: "completed", type: "sale", createdAt: "2026-09-19T22:00:00.000Z", updatedAt: "2026-09-19T22:00:00.000Z",
    exchangeRateSnapshot: { rate: 2800 }, ...overrides,
  };
}

test("UTC+2 day boundaries classify 22:00Z as local midnight and retain 23:59:59.999", () => {
  assert.equal(businessDate(new Date("2026-09-19T21:59:59.999Z")), "2026-09-19");
  assert.equal(businessDate(new Date("2026-09-19T22:00:00.000Z")), "2026-09-20");
  const range = localReportRange({ date: "2026-09-20" });
  assert.equal(range.start.toISOString(), "2026-09-19T22:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-20T21:59:59.999Z");
  assert.throws(() => parseBusinessDate("2026-02-30"), /Invalid date/);
});

test("financial aggregation uses cent rounding, item quantities, regions, payments and walk-in exclusion", () => {
  const customerSale = sale();
  const walkIn = sale({
    _id: "sale-2", clientSaleId: "client-2", saleId: "SALE-2", total: 10.005,
    customer: { name: "Walk-in Customer", phone: "WALK-IN", email: "", isWalkIn: true },
    paymentMethod: "transfer",
    items: [{ productId: "p1", name: "A", quantity: 1, price: 10.005, total: 10.005, subtotal: 10.005, unitCost: 2, cost: 2, netTotal: 10.005, profit: 8.005, region: "Butembo", regionCode: "Bbbb" }],
  });
  const report = buildLocalAnalytics([customerSale, walkIn], localReportRange({ date: "2026-09-20" })).data;
  assert.equal(report.totalSales, 2);
  assert.equal(report.totalRevenue, 30.31);
  assert.equal(report.totalCustomers, 1);
  assert.equal(report.totalProducts, 2);
  assert.equal(report.topProducts.find((item) => item.name === "A")?.quantity, 4);
  const butembo = buildLocalAnalytics([customerSale], localReportRange({ date: "2026-09-20" }), "Bbbb").data;
  assert.equal(butembo.totalRevenue, 0.3);
});

test("transaction exchange-rate snapshots remain attached and are never replaced by a current rate", () => {
  const original = sale();
  const report = buildLocalAnalytics([original], localReportRange({ date: "2026-09-20" })).data;
  assert.equal(original.exchangeRateSnapshot?.rate, 2800);
  assert.equal(report.totalRevenue, 20.3);
  assert.equal(Math.round(report.totalRevenue * Number(original.exchangeRateSnapshot?.rate)), 56840);
});

test("cached validated expenses keep their report count, amount and reason offline", () => {
  const validatedExpenses = [{
    _id: "expense-1",
    expenseId: "EXP-1",
    reason: "Transport de la marchandise",
    amount: 12.5,
    createdAt: "2026-09-20T08:00:00.000Z",
    validatedAt: "2026-09-20T09:00:00.000Z",
  }];
  const report = buildLocalAnalytics(
    [sale()],
    localReportRange({ date: "2026-09-20" }),
    "",
    { totalValidatedExpenses: 12.5, totalValidatedExpenseCount: 1, validatedExpenses },
  ).data;

  assert.equal(report.totalValidatedExpenseCount, 1);
  assert.equal(report.totalValidatedExpenses, 12.5);
  assert.equal(report.validatedExpenses[0]?.reason, "Transport de la marchandise");
  assert.equal(report.netRevenue, 7.8);
});
