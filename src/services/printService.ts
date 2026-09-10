import jsPDF from "jspdf";

const API_BASE = import.meta.env?.VITE_API_URL ?? "";

export const SALE_BUSINESS = Object.freeze({
  name: "Boutique C'EST DIEU QUI PARTAGE",
  address: "Av du 1er Janvier N°13, C. Makiso, Kisangani",
  registration: "RCCM/KIS : 22-A-267",
});

export type ReceiptDocumentType = "sale" | "reservation";
export type PrintDocumentKind = "receipt" | "stub";

export interface SaleReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  regionCode?: string;
}

export interface SaleReceiptData {
  type: ReceiptDocumentType;
  status: string;
  reference: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  isWalkIn: boolean;
  items: SaleReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  transportCost: number;
  otherCharges: number;
  total: number;
  paymentMethod: string;
  salesPerson: string;
  exchangeRate?: number;
  reservationDate?: string;
  reservationTime?: string;
  notes?: string;
}

interface PrintableItemSource {
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
  unitPrice?: unknown;
  total?: unknown;
  subtotal?: unknown;
  regionCode?: unknown;
}

interface PrintableSaleSource {
  _id?: unknown;
  saleId?: unknown;
  createdAt?: unknown;
  date?: unknown;
  customer?: {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    isWalkIn?: unknown;
  };
  items?: PrintableItemSource[];
  subtotal?: unknown;
  discount?: unknown;
  tax?: unknown;
  transportCost?: unknown;
  otherCharges?: unknown;
  total?: unknown;
  paymentMethod?: unknown;
  salesPerson?: unknown;
  status?: unknown;
  type?: unknown;
  reservationDate?: unknown;
  reservationTime?: unknown;
  notes?: unknown;
  exchangeRateSnapshot?: { rate?: unknown };
}

type ReceiptOverrides = Partial<Pick<SaleReceiptData, "type" | "exchangeRate">>;

interface UsbPrintResult {
  success: boolean;
  printedDocuments: PrintDocumentKind[];
  message?: string;
}

interface PrintRuntime {
  printUsb?: (receipt: SaleReceiptData) => Promise<UsbPrintResult>;
  printBrowser?: (
    receipt: SaleReceiptData,
    documents: readonly PrintDocumentKind[],
  ) => Promise<void>;
}

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stringValue = (value: unknown): string => String(value ?? "").trim();
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export function validateSaleReceipt(receipt: SaleReceiptData): void {
  if (!receipt || !receipt.reference || receipt.reference === "N/A") {
    throw new Error("Impossible d'imprimer : la vente enregistrée est introuvable.");
  }
  if (!Array.isArray(receipt.items) || receipt.items.length === 0) {
    throw new Error("Impossible d'imprimer un reçu sans articles.");
  }
  const invalidItem = receipt.items.some((item) =>
    !item.name || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
    !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
    !Number.isFinite(item.lineTotal) || item.lineTotal < 0);
  if (invalidItem || !Number.isFinite(receipt.total) || receipt.total < 0) {
    throw new Error("Impossible d'imprimer : les données de la vente sont invalides.");
  }
}

const formatSaleDate = (value: unknown): string => {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return stringValue(value);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lubumbashi",
  });
};

/** Converts a committed Sale snapshot into the one authoritative printable shape. */
export function normalizeSaleReceipt(
  sale: PrintableSaleSource,
  overrides: ReceiptOverrides = {},
): SaleReceiptData {
  const items = (sale.items ?? []).map((item): SaleReceiptItem => {
    const quantity = numberValue(item.quantity);
    const unitPrice = numberValue(item.price ?? item.unitPrice);
    const storedTotal = numberValue(item.total ?? item.subtotal);
    return {
      name: stringValue(item.name) || "Article",
      quantity,
      unitPrice: roundMoney(unitPrice),
      lineTotal: roundMoney(storedTotal || quantity * unitPrice),
      regionCode: stringValue(item.regionCode) || undefined,
    };
  });

  const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const snapshotRate = numberValue(sale.exchangeRateSnapshot?.rate);
  const requestedType = overrides.type ?? stringValue(sale.type);
  const type: ReceiptDocumentType = requestedType === "reservation" ? "reservation" : "sale";

  return {
    type,
    status: stringValue(sale.status) || (type === "reservation" ? "pending" : "completed"),
    reference: stringValue(sale.saleId ?? sale._id) || "N/A",
    date: formatSaleDate(sale.createdAt ?? sale.date),
    customerName: stringValue(sale.customer?.name) || "Walk-in Customer",
    customerPhone: stringValue(sale.customer?.phone),
    customerEmail: stringValue(sale.customer?.email),
    isWalkIn: sale.customer?.isWalkIn === true,
    items,
    subtotal: roundMoney(numberValue(sale.subtotal) || itemsSubtotal),
    discount: roundMoney(numberValue(sale.discount)),
    tax: roundMoney(numberValue(sale.tax)),
    transportCost: roundMoney(numberValue(sale.transportCost)),
    otherCharges: roundMoney(numberValue(sale.otherCharges)),
    total: roundMoney(numberValue(sale.total)),
    paymentMethod: stringValue(sale.paymentMethod) || "cash",
    salesPerson: stringValue(sale.salesPerson) || "Agent",
    // A stored historical rate always wins over a caller's current-rate fallback.
    exchangeRate: snapshotRate || overrides.exchangeRate || undefined,
    reservationDate: stringValue(sale.reservationDate) || undefined,
    reservationTime: stringValue(sale.reservationTime) || undefined,
    notes: stringValue(sale.notes) || undefined,
  };
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);

const formatUsd = (amount: number): string =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} USD`;

const formatFc = (amount: number): string =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} FC`;

const adjustmentRow = (label: string, amount: number, negative = false): string =>
  amount > 0
    ? `<div class="total-row"><span>${label}</span><strong>${negative ? "− " : "+ "}${formatUsd(amount)}</strong></div>`
    : "";

const customerLabel = (receipt: SaleReceiptData): string =>
  receipt.isWalkIn && receipt.customerName === "Walk-in Customer"
    ? "Client de passage"
    : receipt.customerName;

const reservationSchedule = (receipt: SaleReceiptData): string =>
  receipt.type === "reservation" && (receipt.reservationDate || receipt.reservationTime)
    ? `<div><strong>Retrait :</strong> ${escapeHtml([receipt.reservationDate, receipt.reservationTime].filter(Boolean).join(" à "))}</div>`
    : "";

const thermalStyles = `
  * { box-sizing: border-box; }
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; width: 80mm; height: auto; min-height: 0; }
  body {
    padding: 2mm 3mm 1.5mm;
    color: #000;
    background: #fff;
    font-family: "Courier New", Courier, "Liberation Mono", monospace;
    font-size: 12px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .document { width: 74mm; max-width: 100%; height: auto; min-height: 0; margin: 0; }
  .center { text-align: center; }
  .business { font-size: 16px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
  .business-meta { margin-top: .8mm; font-size: 11px; line-height: 1.3; }
  .rule { border-top: 1px dashed #000; margin: 1.8mm 0; }
  .double-rule { border-top: 2px double #000; margin: 1.8mm 0; }
  .title { margin: 1.5mm 0; text-align: center; font-size: 14px; font-weight: 700; }
  .meta, .customer, .reservation { display: grid; gap: .7mm; overflow-wrap: anywhere; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 1.2mm; }
  .items th { border-bottom: 1px solid #000; padding: 1mm .3mm; font-size: 11px; text-align: left; }
  .items td { padding: 1.2mm .3mm; vertical-align: top; font-size: 11.5px; }
  .items tr { break-inside: avoid; page-break-inside: avoid; }
  .items .description { width: 43%; overflow-wrap: anywhere; word-break: break-word; padding-right: 1mm; }
  .items .quantity { width: 9%; text-align: right; white-space: nowrap; }
  .items .unit-price { width: 24%; text-align: right; white-space: nowrap; }
  .items .amount { width: 24%; text-align: right; white-space: nowrap; }
  .items .unit-price, .items .amount { font-size: 9.5px; letter-spacing: -.2px; }
  .region { margin-top: .4mm; font-size: 10.5px; }
  .totals { width: 100%; }
  .total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; margin: .8mm 0; }
  .total-row strong { text-align: right; white-space: nowrap; }
  .grand-total { padding-top: 1.2mm; border-top: 1px solid #000; font-size: 15px; font-weight: 700; }
  .secondary { font-size: 12px; }
  .rate { text-align: right; font-size: 11px; }
  .footer { margin-top: 2mm; text-align: center; font-size: 10.5px; line-height: 1.35; }
  .stub { border: 1px solid #000; padding: 2mm; height: auto; min-height: 0; break-inside: avoid; }
  .stub .business { font-size: 13px; }
  .stub-grid { display: grid; gap: .8mm; margin-top: 1.5mm; overflow-wrap: anywhere; }
  .stub-items { margin-top: 1.4mm; padding-top: 1.2mm; border-top: 1px dashed #000; }
  .stub-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; margin: .7mm 0; }
  .stub-item span:first-child { overflow-wrap: anywhere; word-break: break-word; }
  .stub-item strong { white-space: nowrap; }
  .stub-total { display: flex; justify-content: space-between; gap: 2mm; border-top: 1px solid #000; margin-top: 1.2mm; padding-top: 1.2mm; font-size: 14px; font-weight: 700; }
  .stub-total strong { text-align: right; white-space: nowrap; }
  @media screen { body { margin: 8px auto; box-shadow: 0 0 12px #bbb; } }
  @media print {
    html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }
    body { margin: 0 !important; padding: 2mm 3mm 1.5mm !important; }
    .document { width: 74mm; height: auto !important; min-height: 0 !important; }
  }
`;

function buildThermalDocument(title: string, kind: PrintDocumentKind, content: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${thermalStyles}</style>
</head>
<body data-document-kind="${kind}">
  <main class="document">${content}</main>
</body>
</html>`;
}

/** Builds only the detailed document. The stub is deliberately a separate page/job. */
export function buildSaleReceiptHtml(receipt: SaleReceiptData): string {
  const isReservation = receipt.type === "reservation";
  const documentTitle = isReservation ? "REÇU DE RÉSERVATION" : "REÇU DE VENTE";
  const fcTotal = receipt.exchangeRate
    ? `<div class="total-row secondary"><span>Total FC</span><strong>${formatFc(receipt.total * receipt.exchangeRate)}</strong></div>
       <div class="rate">Taux enregistré : 1 USD = ${formatFc(receipt.exchangeRate)}</div>`
    : "";
  const content = `
    <header class="center">
      <div class="business">${SALE_BUSINESS.name}</div>
      <div class="business-meta">${SALE_BUSINESS.address}</div>
      <div class="business-meta">${SALE_BUSINESS.registration}</div>
    </header>
    <div class="double-rule"></div>
    <div class="title">${documentTitle}${isReservation ? ` — ${escapeHtml(receipt.status.toUpperCase())}` : ""}</div>
    <section class="meta">
      <div><strong>Référence :</strong> ${escapeHtml(receipt.reference)}</div>
      <div><strong>Date :</strong> ${escapeHtml(receipt.date)}</div>
      <div><strong>Statut :</strong> ${escapeHtml(receipt.status.toUpperCase())}</div>
      ${reservationSchedule(receipt)}
    </section>
    <div class="rule"></div>
    <section class="customer">
      <div><strong>Client :</strong> ${escapeHtml(customerLabel(receipt))}</div>
      ${receipt.customerPhone ? `<div><strong>Tél. :</strong> ${escapeHtml(receipt.customerPhone)}</div>` : ""}
      ${receipt.customerEmail ? `<div><strong>Email :</strong> ${escapeHtml(receipt.customerEmail)}</div>` : ""}
    </section>
    <table class="items">
      <colgroup><col class="description"><col class="quantity"><col class="unit-price"><col class="amount"></colgroup>
      <thead><tr><th>Article</th><th class="quantity">Qté</th><th class="unit-price">PU</th><th class="amount">Total</th></tr></thead>
      <tbody>${receipt.items.map((item) => `<tr>
        <td class="description">${escapeHtml(item.name)}${item.regionCode ? `<div class="region">${escapeHtml(item.regionCode)}</div>` : ""}</td>
        <td class="quantity">${item.quantity}</td>
        <td class="unit-price">${formatUsd(item.unitPrice)}</td>
        <td class="amount">${formatUsd(item.lineTotal)}</td>
      </tr>`).join("")}</tbody>
    </table>
    <div class="rule"></div>
    <section class="totals">
      <div class="total-row"><span>Sous-total</span><strong>${formatUsd(receipt.subtotal)}</strong></div>
      ${adjustmentRow("Remise", receipt.discount, true)}
      ${adjustmentRow("Transport", receipt.transportCost)}
      ${adjustmentRow("Taxes", receipt.tax)}
      ${adjustmentRow("Autres frais", receipt.otherCharges)}
      <div class="total-row grand-total"><span>TOTAL</span><strong>${formatUsd(receipt.total)}</strong></div>
      ${fcTotal}
    </section>
    <div class="rule"></div>
    <div><strong>Paiement :</strong> ${escapeHtml(receipt.paymentMethod.toUpperCase())}</div>
    <div><strong>Agent :</strong> ${escapeHtml(receipt.salesPerson)}</div>
    ${isReservation && receipt.notes ? `<div class="reservation"><strong>Notes :</strong> ${escapeHtml(receipt.notes)}</div>` : ""}
    <footer class="footer">Merci pour votre confiance.<br>Marchandises vendues non reprises, non échangées.</footer>`;

  return buildThermalDocument(`${documentTitle} ${receipt.reference}`, "receipt", content);
}

/** Builds only the intentionally compact stub. */
export function buildSaleStubHtml(receipt: SaleReceiptData): string {
  const isReservation = receipt.type === "reservation";
  const stubTitle = isReservation ? "SOUCHE DE RÉSERVATION" : "SOUCHE DE VENTE";
  const content = `<section class="stub">
    <div class="center business">${SALE_BUSINESS.name}</div>
    <div class="title">${stubTitle}</div>
    <div class="stub-grid">
      <div><strong>Réf. :</strong> ${escapeHtml(receipt.reference)}</div>
      <div><strong>Date :</strong> ${escapeHtml(receipt.date)}</div>
      ${reservationSchedule(receipt)}
      <div><strong>Client :</strong> ${escapeHtml(customerLabel(receipt))}</div>
      <div><strong>Paiement :</strong> ${escapeHtml(receipt.paymentMethod.toUpperCase())}</div>
      <div><strong>Statut :</strong> ${escapeHtml(receipt.status.toUpperCase())}</div>
      <div><strong>Agent :</strong> ${escapeHtml(receipt.salesPerson)}</div>
    </div>
    <div class="stub-items">
      ${receipt.items.map((item) => `<div class="stub-item"><span>${escapeHtml(item.name)}</span><strong>x ${item.quantity}</strong></div>`).join("")}
    </div>
    <div class="stub-total"><span>TOTAL</span><strong>${formatUsd(receipt.total)}</strong></div>
  </section>`;
  return buildThermalDocument(`${stubTitle} ${receipt.reference}`, "stub", content);
}

/** Pure sequencing helper used by browser printing and unit tests. */
export async function runPrintSequence(
  printReceipt: () => Promise<void>,
  printStub: () => Promise<void>,
): Promise<void> {
  await printReceipt();
  await printStub();
}

function waitForDocumentReady(printWindow: Window): Promise<void> {
  const loaded = printWindow.document.readyState === "complete"
    ? Promise.resolve()
    : new Promise<void>((resolve) => printWindow.addEventListener("load", () => resolve(), { once: true }));

  return loaded.then(async () => {
    if (printWindow.document.fonts) await printWindow.document.fonts.ready;
    const pendingImages = Array.from(printWindow.document.images).filter((image) => !image.complete);
    await Promise.all(pendingImages.map((image) => new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
    // Two animation frames ensure the written DOM and print CSS have both painted.
    await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => resolve()));
  });
}

function fitThermalPageToContent(printWindow: Window): void {
  const { document: printDocument } = printWindow;
  if (!printDocument.body?.dataset.documentKind) return;

  // Measure using the same margins as print media. A concrete page length is
  // more consistently honoured by Chromium/printer drivers than `80mm auto`.
  printDocument.documentElement.dataset.printMeasuring = "true";
  const measurementStyle = printDocument.createElement("style");
  measurementStyle.textContent = `html[data-print-measuring="true"] body { margin: 0 !important; box-shadow: none !important; }`;
  printDocument.head.appendChild(measurementStyle);
  const contentPixels = Math.max(
    printDocument.body.getBoundingClientRect().height,
    printDocument.body.scrollHeight,
  );
  const pageHeightMm = Math.max(20, Math.ceil((contentPixels * 25.4 / 96 + 0.5) * 10) / 10);
  const pageStyle = printDocument.createElement("style");
  pageStyle.dataset.thermalPageSize = "true";
  pageStyle.textContent = `@page { size: 80mm ${pageHeightMm}mm; margin: 0; }`;
  printDocument.head.appendChild(pageStyle);
}

function waitForPrintDialog(printWindow: Window): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      printWindow.removeEventListener("afterprint", finish);
      resolve();
    };
    const supportsAfterPrint = "onafterprint" in printWindow;
    if (supportsAfterPrint) printWindow.addEventListener("afterprint", finish, { once: true });

    try {
      printWindow.focus();
      printWindow.print();
      // print() blocks until the dialog closes in browsers without afterprint.
      if (!supportsAfterPrint) finish();
    } catch (error) {
      printWindow.removeEventListener("afterprint", finish);
      reject(error);
    }
  });
}

async function renderAndPrint(printWindow: Window, html: string): Promise<void> {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  await waitForDocumentReady(printWindow);
  fitThermalPageToContent(printWindow);
  await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => resolve()));
  await waitForPrintDialog(printWindow);
}

function createPrintFrame(): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.title = "Document d'impression";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "80mm";
  frame.style.height = "1px";
  frame.style.border = "0";
  document.body.appendChild(frame);
  return frame;
}

/** Reuses one same-origin frame so dialogs are sequential and never popup-blocked. */
export async function printHtmlDocumentsSequentially(documents: readonly string[]): Promise<void> {
  if (!documents.length) return;
  const frame = createPrintFrame();
  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    throw new Error("Le navigateur n'a pas pu préparer la zone d'impression.");
  }

  let completedDialogs = 0;
  try {
    for (const html of documents) {
      await renderAndPrint(printWindow, html);
      completedDialogs += 1;
    }
  } catch (error) {
    const message = completedDialogs > 0
      ? "Le premier document est terminé, mais le second dialogue d'impression a échoué. La vente reste enregistrée et peut être réimprimée."
      : "Le dialogue d'impression n'a pas pu démarrer. La vente reste enregistrée et peut être réimprimée.";
    throw new Error(message, { cause: error });
  } finally {
    frame.remove();
  }
}

export async function printSaleReceiptInBrowser(
  receipt: SaleReceiptData,
  documents: readonly PrintDocumentKind[] = ["receipt", "stub"],
): Promise<void> {
  validateSaleReceipt(receipt);
  const htmlDocuments = documents.map((document) =>
    document === "receipt" ? buildSaleReceiptHtml(receipt) : buildSaleStubHtml(receipt));
  await printHtmlDocumentsSequentially(htmlDocuments);
}

let activeSalePrint: { key: string; promise: Promise<"usb" | "browser"> } | null = null;

async function printSaleReceiptOnUsb(receipt: SaleReceiptData): Promise<UsbPrintResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/print/sale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
      },
      body: JSON.stringify({ receiptData: receipt, type: receipt.type }),
    });
  } catch (error) {
    // The request may have reached the printer; automatic fallback could duplicate it.
    throw new Error(
      "État de l'impression USB inconnu. Vérifiez l'imprimante puis utilisez la réimpression; la vente est déjà enregistrée.",
      { cause: error },
    );
  }

  const payload = await response.json().catch(() => ({})) as {
    message?: string;
    error?: string;
    printedDocuments?: unknown;
    documents?: unknown;
  };
  const reportedDocuments = Array.isArray(payload.printedDocuments)
    ? payload.printedDocuments
    : Array.isArray(payload.documents) ? payload.documents : [];
  const printedDocuments = reportedDocuments.filter(
    (value): value is PrintDocumentKind => value === "receipt" || value === "stub",
  );

  return {
    success: response.ok,
    printedDocuments,
    message: payload.error || payload.message || `Impression thermique indisponible (${response.status})`,
  };
}

/** Receipt is always completed before stub; fallback prints only missing documents. */
export async function printSaleReceiptAndStub(
  receipt: SaleReceiptData,
  runtime: PrintRuntime = {},
): Promise<"usb" | "browser"> {
  validateSaleReceipt(receipt);
  const key = `${receipt.type}:${receipt.reference}:${receipt.date}`;
  if (activeSalePrint?.key === key) return activeSalePrint.promise;
  if (activeSalePrint) throw new Error("Une autre impression de vente est déjà en cours.");

  const operation = (async (): Promise<"usb" | "browser"> => {
    const printUsb = runtime.printUsb ?? printSaleReceiptOnUsb;
    const printBrowser = runtime.printBrowser ?? printSaleReceiptInBrowser;
    const usbResult = await printUsb(receipt);
    const printed = new Set(usbResult.printedDocuments);
    const missing = (["receipt", "stub"] as const).filter((document) => !printed.has(document));

    if (missing.length === 0) return "usb";

    console.warn(
      "Impression USB incomplète, utilisation du navigateur pour les documents manquants.",
      usbResult.message,
    );
    await printBrowser(receipt, missing);
    return "browser";
  })();
  const guarded = operation.finally(() => {
    if (activeSalePrint?.promise === guarded) activeSalePrint = null;
  });
  activeSalePrint = { key, promise: guarded };
  return guarded;
}

const pdfMoney = (amount: number): string => `${amount.toFixed(2)} USD`;

/** PDF export uses the same normalized saved transaction and includes its stub. */
export function downloadSaleReceiptAndStubPdf(receipt: SaleReceiptData): void {
  validateSaleReceipt(receipt);
  const adjustmentCount = [receipt.discount, receipt.tax, receipt.transportCost, receipt.otherCharges]
    .filter((amount) => amount > 0).length;
  const itemNameLines = receipt.items.reduce((sum, item) =>
    sum + Math.max(1, Math.ceil(`${item.name}${item.regionCode ? ` (${item.regionCode})` : ""}`.length / 40)), 0);
  const optionalHeight = (receipt.customerPhone ? 4 : 0) + (receipt.exchangeRate ? 4 : 0) +
    (receipt.type === "reservation" ? 8 : 0);
  const receiptPageHeight = 73 + itemNameLines * 4 + receipt.items.length * 4 + adjustmentCount * 4 + optionalHeight;
  const stubNameLines = receipt.items.reduce((sum, item) => sum + Math.max(1, Math.ceil(item.name.length / 44)), 0);
  const stubPageHeight = 47 + stubNameLines * 4 + receipt.items.length * 4 +
    (receipt.type === "reservation" ? 5 : 0);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, receiptPageHeight] });
  const left = 5;
  const right = 75;
  let y = 7;
  const line = () => { doc.line(left, y, right, y); y += 4; };
  const text = (value: string, size = 8, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(value, left, y);
    y += size <= 8 ? 4 : 5;
  };
  const centered = (value: string, size = 9, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(value, 40, y, { align: "center" });
    y += size <= 9 ? 4.5 : 6;
  };
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 9 : 8);
    doc.text(label, left, y);
    doc.text(value, right, y, { align: "right" });
    y += bold ? 5 : 4;
  };

  centered(SALE_BUSINESS.name, 10, true);
  centered(SALE_BUSINESS.address, 7);
  centered(SALE_BUSINESS.registration, 7);
  line();
  centered(receipt.type === "reservation" ? "RECU DE RESERVATION" : "RECU DE VENTE", 9, true);
  text(`Reference: ${receipt.reference}`);
  text(`Date: ${receipt.date}`);
  text(`Statut: ${receipt.status.toUpperCase()}`);
  if (receipt.type === "reservation") {
    if (receipt.reservationDate || receipt.reservationTime) {
      text(`Retrait: ${[receipt.reservationDate, receipt.reservationTime].filter(Boolean).join(" a ")}`);
    }
  }
  text(`Client: ${customerLabel(receipt)}`);
  if (receipt.customerPhone) text(`Tel: ${receipt.customerPhone}`);
  line();

  for (const item of receipt.items) {
    const names = doc.splitTextToSize(`${item.name}${item.regionCode ? ` (${item.regionCode})` : ""}`, 68) as string[];
    names.forEach((name) => text(name, 8, true));
    row(`${item.quantity} x ${pdfMoney(item.unitPrice)}`, pdfMoney(item.lineTotal));
  }
  line();
  row("Sous-total", pdfMoney(receipt.subtotal));
  if (receipt.discount > 0) row("Remise", `- ${pdfMoney(receipt.discount)}`);
  if (receipt.transportCost > 0) row("Transport", pdfMoney(receipt.transportCost));
  if (receipt.tax > 0) row("Taxes", pdfMoney(receipt.tax));
  if (receipt.otherCharges > 0) row("Autres frais", pdfMoney(receipt.otherCharges));
  row("TOTAL", pdfMoney(receipt.total), true);
  if (receipt.exchangeRate) row("TOTAL FC", formatFc(receipt.total * receipt.exchangeRate));
  text(`Paiement: ${receipt.paymentMethod.toUpperCase()}`);
  text(`Agent: ${receipt.salesPerson}`);
  centered("Merci pour votre confiance.", 7);
  doc.addPage([80, stubPageHeight], "portrait");
  y = 7;
  centered(receipt.type === "reservation" ? "SOUCHE DE RESERVATION" : "SOUCHE DE VENTE", 9, true);
  text(SALE_BUSINESS.name, 8, true);
  text(`Ref: ${receipt.reference}`);
  text(`Date: ${receipt.date}`);
  text(`Client: ${customerLabel(receipt)}`);
  text(`Paiement: ${receipt.paymentMethod.toUpperCase()}`);
  text(`Statut: ${receipt.status.toUpperCase()}`);
  receipt.items.forEach((item) => {
    const names = doc.splitTextToSize(item.name, 58) as string[];
    names.forEach((name) => text(name, 7));
    row("Quantite", String(item.quantity));
  });
  row("TOTAL", pdfMoney(receipt.total), true);
  text(`Agent: ${receipt.salesPerson}`);

  doc.save(`recu-${receipt.reference}.pdf`);
}
