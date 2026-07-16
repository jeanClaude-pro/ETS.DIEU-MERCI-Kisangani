import test from "node:test";
import assert from "node:assert/strict";
import { isReportableSale, projectSaleToRegion, projectSalesToRegion } from "./regionalSales.ts";

const item = (regionCode: "Bbbb" | "Cnnn" | undefined, quantity: number, price: number) => ({
  productId: `${regionCode || "deleted"}-${quantity}`,
  name: "Product",
  regionCode,
  quantity,
  price,
  total: quantity * price,
  unitCost: 2,
  cost: quantity * 2,
});

test("Butembo-only and China-only sales project to only their own region", () => {
  const butembo = { items: [item("Bbbb", 2, 5)], subtotal: 10, total: 10 };
  const china = { items: [item("Cnnn", 3, 4)], subtotal: 12, total: 12 };
  assert.equal(projectSaleToRegion(butembo, "Bbbb")?.total, 10);
  assert.equal(projectSaleToRegion(butembo, "Cnnn"), null);
  assert.equal(projectSaleToRegion(china, "Cnnn")?.items?.length, 1);
});

test("a mixed sale is split without mutating its original items", () => {
  const sale = { items: [item("Bbbb", 2, 10), item("Cnnn", 3, 10)], subtotal: 50, total: 50 };
  const butembo = projectSaleToRegion(sale, "Bbbb")!;
  const china = projectSaleToRegion(sale, "Cnnn")!;
  assert.equal(butembo.items?.length, 1);
  assert.equal(china.items?.length, 1);
  assert.equal(butembo.total + china.total, sale.total);
  assert.equal(sale.items.length, 2);
});

test("discounts, taxes, transport, and other charges allocate proportionally", () => {
  const sale = {
    items: [item("Bbbb", 1, 40), item("Cnnn", 1, 60)], subtotal: 100,
    discount: 10, tax: 5, transportCost: 3, otherCharges: 2, total: 100,
  };
  const b = projectSaleToRegion(sale, "Bbbb")!;
  const c = projectSaleToRegion(sale, "Cnnn")!;
  assert.equal(b.discount, 4);
  assert.equal(c.discount, 6);
  assert.equal(b.tax! + c.tax!, 5);
  assert.equal(b.transportCost! + c.transportCost!, 3);
  assert.equal(b.otherCharges! + c.otherCharges!, 2);
  assert.equal(b.total + c.total, sale.total);
});

test("status metadata and edited item financial snapshots are preserved", () => {
  const sale = { status: "voided", items: [{ ...item("Bbbb", 4, 7), profit: 20 }], subtotal: 28, total: 28 };
  const projected = projectSaleToRegion(sale, "Bbbb")!;
  assert.equal(projected.status, "voided");
  assert.equal(projected.items?.[0].quantity, 4);
  assert.equal(projected.items?.[0].price, 7);
  assert.equal(projected.items?.[0].profit, 20);
  assert.equal(isReportableSale(projected), false);
  assert.equal(isReportableSale({ status: "deleted", items: [], total: 0 }), false);
});

test("legacy region names resolve safely while deleted products remain unknown", () => {
  const legacy = { items: [{ ...item(undefined, 1, 5), region: "Butembo" }], subtotal: 5, total: 5 };
  const deleted = { items: [item(undefined, 1, 5)], subtotal: 5, total: 5 };
  assert.equal(projectSaleToRegion(legacy, "Bbbb")?.items?.length, 1);
  assert.equal(projectSaleToRegion(deleted, "Bbbb"), null);
  assert.equal(projectSaleToRegion(deleted, "Cnnn"), null);
});

test("regional projection composes with date filtering and pagination", () => {
  const sales = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    createdAt: index < 8 ? "2026-07-01" : "2026-08-01",
    items: [item(index % 2 ? "Bbbb" : "Cnnn", 1, 10)],
    subtotal: 10,
    total: 10,
  }));
  const dated = sales.filter((sale) => sale.createdAt === "2026-07-01");
  const page = projectSalesToRegion(dated, "Bbbb").slice(0, 2);
  assert.deepEqual(page.map((sale) => sale.id), [1, 3]);
});
