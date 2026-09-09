import test from "node:test";
import assert from "node:assert/strict";
import {
  SALE_BUSINESS,
  buildSaleReceiptHtml,
  normalizeSaleReceipt,
} from "./printService.ts";

const savedSale = {
  _id: "database-id",
  saleId: "SALE-100",
  createdAt: "2026-09-09T08:30:00.000Z",
  customer: {
    name: "Amina",
    phone: "+243000000",
    email: "amina@example.com",
    isWalkIn: false,
  },
  items: [
    { name: "Article historique A", quantity: 2, price: 10, total: 20, regionCode: "Bbbb" },
    { name: "Article historique B", quantity: 1, price: 30, total: 30, regionCode: "Cnnn" },
  ],
  subtotal: 50,
  discount: 5,
  tax: 2,
  transportCost: 3,
  otherCharges: 1,
  total: 51,
  paymentMethod: "cash",
  salesPerson: "Jean",
  status: "completed",
  type: "sale",
  exchangeRateSnapshot: { rate: 2800 },
};

test("saved sale snapshots normalize without consulting current product data", () => {
  const receipt = normalizeSaleReceipt(savedSale);
  assert.equal(receipt.reference, "SALE-100");
  assert.equal(receipt.items[0].name, "Article historique A");
  assert.equal(receipt.items[1].regionCode, "Cnnn");
  assert.equal(receipt.discount, 5);
  assert.equal(receipt.transportCost, 3);
  assert.equal(receipt.total, 51);
  assert.equal(receipt.exchangeRate, 2800);
});

test("sale browser document always contains one detailed receipt and one compact stub", () => {
  const html = buildSaleReceiptHtml(normalizeSaleReceipt(savedSale));
  assert.match(html, /REÇU DE VENTE/);
  assert.match(html, /SOUCHE VENTE/);
  assert.match(html, /Remise/);
  assert.match(html, /Transport/);
  assert.match(html, /Bbbb/);
  assert.match(html, /Cnnn/);
  assert.equal(html.split(SALE_BUSINESS.name).length - 1, 2);
  assert.equal(html.split("window.print()").length - 1, 1);
});

test("walk-in sales and reservations keep sensible, distinct document labels", () => {
  const walkIn = normalizeSaleReceipt({
    ...savedSale,
    customer: { name: "Walk-in Customer", phone: "WALK-IN", isWalkIn: true },
  });
  assert.match(buildSaleReceiptHtml(walkIn), /Client de passage/);

  const reservation = normalizeSaleReceipt({
    ...savedSale,
    type: "reservation",
    status: "pending",
    reservationDate: "09/09/2026",
    reservationTime: "10:30",
  });
  const html = buildSaleReceiptHtml(reservation);
  assert.match(html, /REÇU DE RÉSERVATION/);
  assert.match(html, /SOUCHE RÉSERVATION/);
  assert.match(html, /PENDING/);
});
