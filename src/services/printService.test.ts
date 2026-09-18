import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_DOCUMENT_DELAY_MS,
  POST_SAVE_PRINT_DELAY_MS,
  SALE_BUSINESS,
  SALE_SYSTEM_PROMO,
  THERMAL_PAGE_ALLOWANCE_MM,
  buildSaleReceiptHtml,
  buildSaleStubHtml,
  calculateThermalPageHeightMm,
  normalizeSaleReceipt,
  printSaleReceiptAndStub,
  runPrintSequence,
  validateSaleReceipt,
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

test("saved sale snapshots normalize without consulting current product data or rates", () => {
  const receipt = normalizeSaleReceipt(savedSale, { exchangeRate: 3000 });
  assert.equal(receipt.reference, "SALE-100");
  assert.equal(receipt.savedSaleId, "database-id");
  assert.equal(receipt.items[0].name, "Article historique A");
  assert.equal(receipt.items[1].regionCode, "Cnnn");
  assert.equal(receipt.discount, 5);
  assert.equal(receipt.transportCost, 3);
  assert.equal(receipt.total, 51);
  assert.equal(receipt.exchangeRate, 2800);
});

test("committed sales print immediately and browser documents retain deliberate spacing", () => {
  assert.equal(POST_SAVE_PRINT_DELAY_MS, 0);
  assert.equal(BROWSER_DOCUMENT_DELAY_MS, 2000);
});

test("browser receipt and stub are distinct auto-height thermal documents", () => {
  const receipt = normalizeSaleReceipt(savedSale);
  const receiptHtml = buildSaleReceiptHtml(receipt);
  const stubHtml = buildSaleStubHtml(receipt);

  assert.match(receiptHtml, /data-document-kind="receipt"/);
  assert.match(receiptHtml, /REÇU DE VENTE/);
  assert.doesNotMatch(receiptHtml, /SOUCHE DE VENTE/);
  assert.match(stubHtml, /data-document-kind="stub"/);
  assert.match(stubHtml, /SOUCHE DE VENTE/);
  assert.doesNotMatch(stubHtml, /REÇU DE VENTE/);
  assert.equal(receiptHtml.split(SALE_BUSINESS.name).length - 1, 1);
  assert.equal(stubHtml.split(SALE_BUSINESS.name).length - 1, 1);
  for (const promotionLine of SALE_SYSTEM_PROMO.split("\n")) {
    assert.ok(receiptHtml.includes(promotionLine.replace("&", "&amp;")));
  }
  assert.match(receiptHtml, /ENTREPRISE \?<br>Gestion, ventes, stock &amp; bien plus<br>WhatsApp/);
  assert.doesNotMatch(stubHtml, /UN SYSTÈME POUR VOTRE BOUTIQUE/);
  assert.ok(receiptHtml.indexOf("Agent de vente") < receiptHtml.indexOf("UN SYSTÈME POUR VOTRE BOUTIQUE"));

  for (const html of [receiptHtml, stubHtml]) {
    assert.match(html, /@page \{ margin: 0 !important; \}/);
    assert.match(html, /html, body \{[\s\S]*?margin: 0 !important;[\s\S]*?padding: 0 !important;/);
    assert.match(html, /\.document \{[^}]*width: 78mm;[^}]*margin: 0 1mm;[^}]*padding: \.8mm 0;/);
    assert.match(html, /<title><\/title>/);
    assert.match(html, /height: auto/);
    assert.match(html, /min-height: 0/);
    assert.match(html, /color: #000/);
    assert.doesNotMatch(html, /#d4d4d4|#555|dotted/);
    assert.doesNotMatch(html, /100vh|297mm|80mm auto|window\.print|setTimeout/);
  }
});

test("long product names remain present and use wrapping-friendly columns", () => {
  const longName = "Chemise longue femme avec une description exceptionnellement détaillée";
  const receipt = normalizeSaleReceipt({
    ...savedSale,
    items: [{ name: longName, quantity: 25, price: 12.5, total: 312.5, regionCode: "Cnnn" }],
  });
  const html = buildSaleReceiptHtml(receipt);

  assert.match(html, new RegExp(longName));
  assert.match(html, /overflow-wrap: anywhere/);
  assert.match(html, /ARTICLES ACHETÉS/);
  assert.match(html, /class="item-calc"/);
  // Compact single-row article line; FC remains in the final total and saved rate.
  assert.equal((html.match(/FC/g) || []).length >= 2, true);
  assert.match(html, /312,50 USD/);
  assert.match(html, /white-space: nowrap/);
});

test("customer receipt uses the compact 80mm layout without changing the cashier stub", () => {
  const receipt = normalizeSaleReceipt(savedSale);
  const receiptHtml = buildSaleReceiptHtml(receipt);
  const stubHtml = buildSaleStubHtml(receipt);
  assert.match(receiptHtml, /class="receipt"/);
  assert.match(receiptHtml, /receipt \.item \{ padding: \.65mm/);
  assert.doesNotMatch(receiptHtml, /Bbbb|Cnnn|watermark|pwa-512x512/);
  assert.match(stubHtml, /class="stub"/);
  assert.match(stubHtml, /SOUCHE DE CAISSE/);
});

test("thermal page measurement rejects invalid values and clamps extreme lengths", () => {
  assert.equal(THERMAL_PAGE_ALLOWANCE_MM, 2.2);
  assert.equal(calculateThermalPageHeightMm(Number.NaN), 180);
  assert.equal(calculateThermalPageHeightMm(0), 180);
  assert.equal(calculateThermalPageHeightMm(-10), 180);
  assert.equal(calculateThermalPageHeightMm(1), 20);
  assert.equal(calculateThermalPageHeightMm(Number.MAX_VALUE), 3000);
  const normal = calculateThermalPageHeightMm(500);
  assert.equal(normal, 134.5);
  assert.ok(Number.isFinite(normal));
  assert.ok(normal > 20 && normal < 3000);
});

test("walk-in sales and reservations keep readable French labels", () => {
  const walkIn = normalizeSaleReceipt({
    ...savedSale,
    customer: { name: "Walk-in Customer", phone: "WALK-IN", isWalkIn: true },
  });
  assert.match(buildSaleReceiptHtml(walkIn), /Client de passage/);

  const reservation = normalizeSaleReceipt({
    ...savedSale,
    type: "reservation",
    status: "pending",
    reservationDate: "09\/09\/2026",
    reservationTime: "10:30",
  });
  assert.match(buildSaleReceiptHtml(reservation), /REÇU DE RÉSERVATION/);
  assert.match(buildSaleStubHtml(reservation), /SOUCHE DE RÉSERVATION/);
  assert.match(buildSaleStubHtml(reservation), /Article historique A/);
  assert.match(buildSaleStubHtml(reservation), /2 x/);
  assert.match(buildSaleStubHtml(reservation), /ARTICLES VENDUS/);
  assert.match(buildSaleStubHtml(reservation), /SOUCHE DE CAISSE/);
  assert.match(buildSaleStubHtml(reservation), /Statut/);
  assert.match(buildSaleReceiptHtml(reservation), /Référence/);
  assert.doesNotMatch(buildSaleReceiptHtml(reservation), /Ã/);
});

test("blank or malformed saved transactions are rejected before printing", async () => {
  const blank = normalizeSaleReceipt({});
  assert.throws(() => validateSaleReceipt(blank), /introuvable/);

  const noItems = normalizeSaleReceipt({ ...savedSale, items: [] });
  await assert.rejects(() => printSaleReceiptAndStub(noItems, {
    printUsb: async () => {
      assert.fail("USB must not be called for an empty receipt");
    },
  }), /sans articles/);
});

test("duplicate concurrent requests for the same transaction share one print operation", async () => {
  let usbCalls = 0;
  let finishUsb: (() => void) | undefined;
  const usbFinished = new Promise<void>((resolve) => { finishUsb = resolve; });
  const receipt = normalizeSaleReceipt(savedSale);
  const runtime = {
    printUsb: async () => {
      usbCalls += 1;
      await usbFinished;
      return { success: true, printedDocuments: ["receipt", "stub"] as const };
    },
  };

  const first = printSaleReceiptAndStub(receipt, runtime);
  const duplicate = printSaleReceiptAndStub(receipt, runtime);
  finishUsb?.();
  assert.equal(await first, "usb");
  assert.equal(await duplicate, "usb");
  assert.equal(usbCalls, 1);
});

test("receipt completes before stub starts", async () => {
  const events: string[] = [];
  let finishReceipt: (() => void) | undefined;
  const receiptFinished = new Promise<void>((resolve) => { finishReceipt = resolve; });

  const sequence = runPrintSequence(
    async () => {
      events.push("receipt:start");
      await receiptFinished;
      events.push("receipt:end");
    },
    async () => { events.push("stub:start"); },
  );

  await Promise.resolve();
  assert.deepEqual(events, ["receipt:start"]);
  finishReceipt?.();
  await sequence;
  assert.deepEqual(events, ["receipt:start", "receipt:end", "stub:start"]);
});

test("the inter-document delay elapses after receipt completion and before the stub", async () => {
  const events: string[] = [];
  const sequence = runPrintSequence(
    async () => { events.push("receipt"); },
    async () => { events.push("stub"); },
    15,
  );

  await Promise.resolve();
  assert.deepEqual(events, ["receipt"]);
  await sequence;
  assert.deepEqual(events, ["receipt", "stub"]);
});

test("a receipt failure prevents the stub from starting", async () => {
  let stubStarted = false;
  await assert.rejects(() => runPrintSequence(
    async () => { throw new Error("receipt failed"); },
    async () => { stubStarted = true; },
  ), /receipt failed/);
  assert.equal(stubStarted, false);
});

test("USB success never triggers duplicate browser printing", async () => {
  let browserCalls = 0;
  const destination = await printSaleReceiptAndStub(normalizeSaleReceipt(savedSale), {
    printUsb: async () => ({ success: true, printedDocuments: ["receipt", "stub"] }),
    printBrowser: async () => { browserCalls += 1; },
  });
  assert.equal(destination, "usb");
  assert.equal(browserCalls, 0);
});

test("USB unavailability falls back in receipt then stub order", async () => {
  const documents: string[] = [];
  const destination = await printSaleReceiptAndStub(normalizeSaleReceipt(savedSale), {
    printUsb: async () => ({ success: false, printedDocuments: [], message: "offline" }),
    printBrowser: async (_receipt, missing) => { documents.push(...missing); },
  });
  assert.equal(destination, "browser");
  assert.deepEqual(documents, ["receipt", "stub"]);
});

test("partial USB success falls back only for the missing stub", async () => {
  const documents: string[] = [];
  await printSaleReceiptAndStub(normalizeSaleReceipt(savedSale), {
    printUsb: async () => ({ success: false, printedDocuments: ["receipt"], message: "stub failed" }),
    printBrowser: async (_receipt, missing) => { documents.push(...missing); },
  });
  assert.deepEqual(documents, ["stub"]);
});

test("ambiguous USB errors do not trigger a duplicate browser print", async () => {
  let browserCalls = 0;
  await assert.rejects(() => printSaleReceiptAndStub(normalizeSaleReceipt(savedSale), {
    printUsb: async () => { throw new Error("network timeout"); },
    printBrowser: async () => { browserCalls += 1; },
  }), /network timeout/);
  assert.equal(browserCalls, 0);
});
