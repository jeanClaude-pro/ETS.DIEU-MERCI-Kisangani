import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_DOCUMENT_DELAY_MS,
  POST_SAVE_PRINT_DELAY_MS,
  SALE_BUSINESS,
  SALE_SYSTEM_PROMO,
  THERMAL_PAGE_ALLOWANCE_MM,
  THERMAL_PRINT_WIDTH_MM,
  buildCashEntryReceiptHtml,
  buildCashEntryStubHtml,
  buildCashExpenseReceiptHtml,
  buildSaleReceiptHtml,
  buildSaleStubHtml,
  calculateThermalPageHeightMm,
  normalizeSaleReceipt,
  paymentLabel,
  printSaleReceiptAndStub,
  reconstructOfflineSaleReceipt,
  runPrintSequence,
  statusLabel,
  thermalPageCss,
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

test("a legacy sale with no barcodeToken normalizes with no barcode and the saleId as reference", () => {
  const receipt = normalizeSaleReceipt(savedSale);
  assert.equal(receipt.barcodeToken, undefined);
  assert.equal(receipt.reference, "SALE-100");
});

test("a barcode-era sale prefers receiptNumber over saleId and carries the token through", () => {
  const receipt = normalizeSaleReceipt({
    ...savedSale,
    receiptNumber: "ABCD-EFGH-JKMN",
    barcodeToken: "ABCDEFGHJKMN",
  });
  assert.equal(receipt.reference, "ABCD-EFGH-JKMN");
  assert.equal(receipt.barcodeToken, "ABCDEFGHJKMN");
});

test("a malformed barcodeToken from the server is not trusted", () => {
  const receipt = normalizeSaleReceipt({ ...savedSale, barcodeToken: "not valid!!" });
  assert.equal(receipt.barcodeToken, undefined);
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
  assert.doesNotMatch(receiptHtml, /SOUCHE CAISSE/);
  assert.match(stubHtml, /data-document-kind="stub"/);
  assert.match(stubHtml, /SOUCHE CAISSE · VENTE/);
  assert.doesNotMatch(stubHtml, /REÇU DE VENTE/);
  const escapedName = SALE_BUSINESS.name.replace("'", "&#039;");
  assert.equal(receiptHtml.split(escapedName).length - 1, 1);
  assert.equal(stubHtml.split(escapedName).length - 1, 1);
  assert.match(receiptHtml, /gestion \?<br>Contactez-moi par WhatsApp/);

  for (const html of [receiptHtml, stubHtml]) {
    assert.match(html, /@page \{ margin: 0; \}/);
    assert.match(html, /html, body \{[\s\S]*?margin: 0 !important;[\s\S]*?padding: 0 !important;/);
    assert.match(html, /\.document \{[^}]*width: 72mm;[^}]*margin: 0 auto;/);
    assert.match(html, /<title><\/title>/);
    assert.match(html, /height: auto/);
    assert.match(html, /min-height: 0/);
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
  assert.match(html, /Détail des articles/);
  assert.match(html, /25 × 12,50<\/span><strong>312,50<\/strong>/);
  assert.match(html, /white-space: nowrap/);
});

test("receipts no longer print a barcode", () => {
  const receipt = normalizeSaleReceipt({ ...savedSale, receiptNumber: "ABCD-EFGH-JKMN", barcodeToken: "ABCDEFGHJKMN" });
  for (const html of [buildSaleReceiptHtml(receipt), buildSaleStubHtml(receipt)]) {
    assert.doesNotMatch(html, /<img|barcode|data:image/i);
  }
  assert.doesNotMatch(buildSaleReceiptHtml(receipt), /Bbbb|Cnnn/);
});

test("thermal page measurement rejects invalid values and clamps extreme lengths", () => {
  assert.equal(THERMAL_PAGE_ALLOWANCE_MM, 0.6);
  assert.equal(calculateThermalPageHeightMm(Number.NaN), 180);
  assert.equal(calculateThermalPageHeightMm(0), 180);
  assert.equal(calculateThermalPageHeightMm(-10), 180);
  assert.equal(calculateThermalPageHeightMm(1), 20);
  assert.equal(calculateThermalPageHeightMm(Number.MAX_VALUE), 3000);
  const normal = calculateThermalPageHeightMm(500);
  assert.equal(normal, 132.9);
  assert.ok(Number.isFinite(normal));
  assert.ok(normal > 20 && normal < 3000);
});

test("walk-in sales keep readable French labels", () => {
  const walkIn = normalizeSaleReceipt({
    ...savedSale,
    customer: { name: "Walk-in Customer", phone: "WALK-IN", isWalkIn: true },
  });
  assert.match(buildSaleReceiptHtml(walkIn), /Client de passage/);
  assert.doesNotMatch(buildSaleReceiptHtml(walkIn), /Ã/);
  // A historical reservation record is reprinted as a sale.
  const historical = normalizeSaleReceipt({ ...savedSale, type: "reservation", status: "pending" });
  assert.equal(historical.type, "sale");
  assert.match(buildSaleReceiptHtml(historical), /REÇU DE VENTE/);
  assert.doesNotMatch(buildSaleReceiptHtml(historical), /RÉSERVATION|Retrait/);
});

test("blank or malformed saved transactions are rejected before printing", async () => {
  const blank = normalizeSaleReceipt({});
  assert.throws(() => validateSaleReceipt(blank), /introuvable/);

  const noItems = normalizeSaleReceipt({ ...savedSale, items: [] });
  await assert.rejects(() => printSaleReceiptAndStub(noItems, {
    printBrowser: async () => {
      assert.fail("Nothing must be printed for an empty receipt");
    },
  }), /sans articles/);
});

test("duplicate concurrent requests for the same transaction share one print operation", async () => {
  let calls = 0;
  let finish: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const receipt = normalizeSaleReceipt(savedSale);
  const runtime = {
    printBrowser: async () => {
      calls += 1;
      await finished;
    },
  };

  const first = printSaleReceiptAndStub(receipt, runtime);
  const duplicate = printSaleReceiptAndStub(receipt, runtime);
  finish?.();
  assert.equal(await first, "browser");
  assert.equal(await duplicate, "browser");
  assert.equal(calls, 1);
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

test("every sale print goes to the browser: receipt first, then stub", async () => {
  const documents: string[] = [];
  const destination = await printSaleReceiptAndStub(normalizeSaleReceipt(savedSale), {
    printBrowser: async (_receipt, requested) => { documents.push(...requested); },
  });
  assert.equal(destination, "browser");
  assert.deepEqual(documents, ["receipt", "stub"]);
});

test("offline reprint preserves the IndexedDB receipt identity and snapshot", () => {
  const stored = normalizeSaleReceipt({
    ...savedSale,
    _id: "offline-client-id",
    receiptNumber: "ABCD-EFGH-JKMN",
    barcodeToken: "ABCDEFGHJKMN",
  });
  const receipt = reconstructOfflineSaleReceipt({
    clientSaleId: "offline-client-id",
    receiptNumber: "ABCD-EFGH-JKMN",
    barcodeToken: "ABCDEFGHJKMN",
    occurredAt: "2026-09-09T08:30:00.000Z",
    payload: {
      customer: savedSale.customer,
      items: savedSale.items.map((item, index) => ({
        productId: `product-${index}`,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        region: (index === 0 ? "Butembo" : "China") as "Butembo" | "China",
        regionCode: (index === 0 ? "Bbbb" : "Cnnn") as "Bbbb" | "Cnnn",
      })),
      subtotal: savedSale.subtotal,
      total: savedSale.total,
      paymentMethod: savedSale.paymentMethod,
      salesPerson: savedSale.salesPerson,
      exchangeRateSnapshot: { rateId: "rate-1", rate: 2800, effectiveFrom: null },
      clientSaleId: "offline-client-id",
      receiptNumber: "ABCD-EFGH-JKMN",
      barcodeToken: "ABCDEFGHJKMN",
      clientOccurredAt: "2026-09-09T08:30:00.000Z",
      origin: "offline",
    },
    receiptSnapshot: stored,
    syncState: "PENDING",
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    syncedSaleId: null,
    syncedAt: null,
    createdAt: "2026-09-09T08:30:00.000Z",
  });
  assert.equal(receipt.savedSaleId, "offline-client-id");
  assert.equal(receipt.reference, "ABCD-EFGH-JKMN");
  assert.equal(receipt.barcodeToken, "ABCDEFGHJKMN");
  assert.deepEqual(receipt.items, stored.items);
  assert.equal(receipt.total, stored.total);
  assert.equal(receipt.date, stored.date);
});

test("the receipt carries every required detail in a logical order", () => {
  // French number formatting uses narrow no-break spaces between thousands.
  const html = buildSaleReceiptHtml(normalizeSaleReceipt({
    ...savedSale, saleCode: "V-260909-ABCDE", receiptNumber: "ABCD-EFGH-JKMN", barcodeToken: "ABCDEFGHJKMN",
  })).replace(/ /g, " ");
  const ordered = [
    SALE_BUSINESS.name.replace("'", "&#039;"), SALE_BUSINESS.address, SALE_BUSINESS.phone, SALE_BUSINESS.registration,
    "REÇU DE VENTE", "N° de reçu", "V-260909-ABCDE",
    "Date", "Client", "Amina", "Téléphone", "+243000000", "Servi par", "Jean", "Paiement", "ESPÈCES",
    "Détail des articles", "Montant (USD)", "1.</span>Article historique A", "2.</span>Article historique B",
    "2 articles", "3 unités",
    "Sous-total", "Remise", "Transport", "Taxes", "Autres frais",
    "NET À PAYER", "142 800 FC", "Équivalent en $", "51,00 USD", "Taux appliqué : 1 USD = 2 800 FC",
    SALE_BUSINESS.thankYou, "Conservez ce reçu comme preuve d'achat", SALE_BUSINESS.salesNotice,
    "Avez-vous besoin d&#039;un système de gestion ?", "Contactez-moi par WhatsApp au +243 844 311 550", 'class="cut-line"',
  ];
  let position = -1;
  for (const fragment of ordered) {
    const next = html.indexOf(fragment, position + 1);
    assert.ok(next > position, `"${fragment}" must appear after the previous section`);
    position = next;
  }
  assert.doesNotMatch(html, /Statut|Arrêté|UN SYSTÈME/);
});

test("without a recorded rate, the net to pay stays in USD", () => {
  const html = buildSaleReceiptHtml(normalizeSaleReceipt({ ...savedSale, exchangeRateSnapshot: undefined }));
  assert.match(html, /NET À PAYER<\/span><strong>51,00 USD/);
  assert.doesNotMatch(html, /Équivalent en \$/);
});

test("the WhatsApp message is printed on every document", () => {
  const receipt = normalizeSaleReceipt(savedSale);
  const entry = { entryId: "E1", date: "d", source: "s", category: "c", paymentMethod: "cash", receivedFrom: { name: "P", phone: "1" }, agent: "a", amount: 1 };
  const docs = [
    buildSaleReceiptHtml(receipt), buildSaleStubHtml(receipt), buildCashEntryReceiptHtml(entry), buildCashEntryStubHtml(entry),
    buildCashExpenseReceiptHtml({ expenseId: "X", date: "d", validatedDate: "d", reason: "r", recipientName: "n", recipientPhone: "1", amount: 1, paymentMethod: "cash", validatedBy: "v" }),
  ];
  for (const html of docs) assert.match(html, /Contactez-moi par WhatsApp au \+243 844 311 550/);
  assert.equal(SALE_SYSTEM_PROMO, "Avez-vous besoin d'un système de gestion ?\nContactez-moi par WhatsApp au +243 844 311 550");
});

test("the short sale code is the printed reference; legacy sales keep theirs", () => {
  assert.equal(normalizeSaleReceipt({ ...savedSale, saleCode: "V-260909-ABCDE", receiptNumber: "ABCD-EFGH-JKMN" }).reference, "V-260909-ABCDE");
  assert.equal(normalizeSaleReceipt({ ...savedSale, receiptNumber: "ABCD-EFGH-JKMN" }).reference, "ABCD-EFGH-JKMN");
  assert.equal(normalizeSaleReceipt(savedSale).reference, "SALE-100");
});

test("the cut line is the last printed element so the paper ends on it", () => {
  const receipt = normalizeSaleReceipt(savedSale);
  for (const html of [buildSaleReceiptHtml(receipt), buildSaleStubHtml(receipt)]) {
    const body = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    assert.ok(body.trimEnd().endsWith('<div class="cut-line" aria-hidden="true">✂</div>'));
    assert.equal((html.match(/class="cut-line"/g) || []).length, 1);
  }
  const css = thermalPageCss(120.4);
  assert.match(css, /@page \{ size: 80mm 120\.4mm; margin: 0 !important; \}/);
  // Fixed height + hidden overflow: a rounding difference can never feed a
  // second (blank) page after the cut line.
  assert.match(css, /height: 120\.4mm !important; max-height: 120\.4mm !important; overflow: hidden !important;/);
  assert.equal(THERMAL_PRINT_WIDTH_MM, 72);
});

test("payment labels are printed in French and no status row is shown", () => {
  assert.equal(paymentLabel("cash"), "ESPÈCES");
  assert.equal(paymentLabel("transfer"), "VIREMENT");
  assert.equal(paymentLabel("mpesa"), "M-PESA");
  assert.equal(paymentLabel("crypto"), "CRYPTO");
  assert.equal(statusLabel("voided"), "ANNULÉE");
  const receipt = normalizeSaleReceipt(savedSale);
  for (const html of [buildSaleReceiptHtml(receipt), buildSaleStubHtml(receipt)]) {
    assert.doesNotMatch(html, /Statut/);
  }
});

test("a voided sale is clearly marked on reprint", () => {
  const voided = normalizeSaleReceipt({ ...savedSale, status: "voided" });
  assert.match(buildSaleReceiptHtml(voided), /class="banner">VENTE ANNULÉE/);
  assert.match(buildSaleStubHtml(voided), /class="banner">ANNULÉE/);
  assert.doesNotMatch(buildSaleReceiptHtml(normalizeSaleReceipt(savedSale)), /class="banner"/);
});

test("walk-in placeholder phone numbers are not printed", () => {
  const walkIn = normalizeSaleReceipt({ ...savedSale, customer: { name: "Walk-in Customer", phone: "WALK-IN", isWalkIn: true } });
  assert.doesNotMatch(buildSaleReceiptHtml(walkIn), /WALK-IN/);
  assert.doesNotMatch(buildSaleStubHtml(walkIn), /WALK-IN/);
});

test("printed text is escaped on every document", () => {
  const hostile = normalizeSaleReceipt({ ...savedSale, customer: { name: "<img src=x onerror=alert(1)>", phone: "1" } });
  assert.doesNotMatch(buildSaleReceiptHtml(hostile), /<img src=x/);
  const entry = buildCashEntryReceiptHtml({
    entryId: "ENT-1", date: "01/10/2026 10:00", source: "<b>x</b>", category: "Vente", paymentMethod: "cash",
    receivedFrom: { name: "Paul", phone: "0990" }, agent: "Jean", amount: 25,
  });
  assert.doesNotMatch(entry, /<b>x<\/b>/);
});

test("cash entry receipt and stub share the thermal layout and complete details", () => {
  const data = {
    entryId: "ENT-42", date: "01/10/2026 10:00", source: "Apport", category: "Capital", paymentMethod: "transfer",
    description: "Apport du gérant", receivedFrom: { name: "Paul", phone: "0990000000", email: "p@x.cd" },
    agent: "jean", amount: 125, exchangeRate: 2800, region: "Butembo",
  };
  const receipt = buildCashEntryReceiptHtml(data).replace(/ /g, " ");
  const stub = buildCashEntryStubHtml(data);
  for (const fragment of ["REÇU D'ENTRÉE DE CAISSE", "ENT-42", "PAUL", "0990000000", "p@x.cd", "Apport", "Capital", "Butembo", "VIREMENT", "Apport du gérant", "125,00 USD", "350 000 FC", "JEAN", "Le déposant", "La caisse"]) {
    assert.ok(receipt.includes(fragment), fragment);
  }
  assert.match(stub, /SOUCHE CAISSE · ENTRÉE/);
  assert.match(stub, /data-document-kind="stub"/);
  // No rate supplied (a reprint) → no FC figure is invented.
  assert.doesNotMatch(buildCashEntryReceiptHtml({ ...data, exchangeRate: undefined }), /FC/);
});

test("validated expense voucher lists requester, validator and amount", () => {
  const html = buildCashExpenseReceiptHtml({
    expenseId: "EXP-7", date: "01/10/2026 09:00", validatedDate: "01/10/2026 11:00", reason: "Transport",
    recipientName: "Moto Express", recipientPhone: "0812", amount: 40, paymentMethod: "mpesa",
    validatedBy: "Admin", recordedBy: "Caissier 1", notes: "Livraison Beni", region: "China",
  });
  for (const fragment of ["BON DE SORTIE DE CAISSE", "EXP-7", "Transport", "MOTO EXPRESS", "0812", "Livraison Beni", "M-PESA", "40,00 USD", "Caissier 1", "Admin", "01/10/2026 11:00", "Le bénéficiaire"]) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.ok(html.trimEnd().includes('<div class="cut-line" aria-hidden="true">✂</div></main>'));
});

