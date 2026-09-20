import jsPDF from "jspdf";
import type { OfflineSale } from "../lib/offlineDb.ts";
import { isValidBarcodeToken } from "../utils/barcodeId.ts";
import { renderBarcodeDataUrl } from "../utils/barcode.ts";

const API_BASE = import.meta.env?.VITE_API_URL ?? "";

export const SALE_BUSINESS = Object.freeze({
  name: "Boutique C'EST DIEU QUI PARTAGE",
  address: "Av du 1er Janvier N°13, C. Makiso, Kisangani",
  phone: "+243 839 336 794",
  registration: "RCCM/KIS : 22-A-267",
  thankYou: "Merci pour votre confiance.",
  salesNotice: "Marchandises vendues non reprises, non échangées.",
});

export const SALE_SYSTEM_PROMO =
  "UN SYSTÈME POUR VOTRE BOUTIQUE OU ENTREPRISE ?\nGestion, ventes, stock & bien plus\nWhatsApp : +243 844 311 550";

// The POST /sales response is the committed MongoDB snapshot. Waiting for the
// database to "settle" after that response only delays printing and does not
// make either the browser or USB printer more ready.
export const POST_SAVE_PRINT_DELAY_MS = 0;
export const BROWSER_DOCUMENT_DELAY_MS = 2000;
export const THERMAL_PAGE_MIN_MM = 20;
export const THERMAL_PAGE_MAX_MM = 3000;
export const THERMAL_PAGE_FALLBACK_MM = 180;
// 0.8 mm above and below the document, plus 0.6 mm of cutter clearance.
// This is deliberately applied to the printable wrapper measurement instead
// of measuring the browser body/viewport.
export const THERMAL_PAGE_ALLOWANCE_MM = 2.2;

export type ReceiptDocumentType = "sale" | "reservation";
export type PrintDocumentKind = "receipt" | "stub";

export interface SaleReceiptItem {
  name: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  regionCode?: string;
}

export interface SaleReceiptData {
  savedSaleId: string;
  type: ReceiptDocumentType;
  status: string;
  reference: string;
  // Present only for sales created with barcode support (Part R); absent on
  // legacy sales, which simply render no barcode image.
  barcodeToken?: string;
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
  unit?: unknown;
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
  receiptNumber?: unknown;
  barcodeToken?: unknown;
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
  /** Skip the remote Express/escpos-usb endpoint when it is known offline. */
  directPrintMode?: "remote" | "none";
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
      unit: stringValue(item.unit) || undefined,
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
    savedSaleId: stringValue(sale._id),
    type,
    status: stringValue(sale.status) || (type === "reservation" ? "pending" : "completed"),
    // A receiptNumber (barcode-era sales) always wins over the legacy saleId
    // so the printed reference matches what's encoded in the barcode.
    reference: stringValue(sale.receiptNumber ?? sale.saleId ?? sale._id) || "N/A",
    barcodeToken: isValidBarcodeToken(sale.barcodeToken) ? sale.barcodeToken : undefined,
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

/** Rebuilds a printable receipt solely from the durable IndexedDB row. */
export function reconstructOfflineSaleReceipt(sale: OfflineSale): SaleReceiptData {
  if (sale.receiptSnapshot && typeof sale.receiptSnapshot === "object") {
    const snapshot = {
      ...(sale.receiptSnapshot as SaleReceiptData),
      savedSaleId: sale.clientSaleId,
      reference: sale.receiptNumber,
      barcodeToken: sale.barcodeToken,
    };
    try {
      validateSaleReceipt(snapshot);
      return snapshot;
    } catch {
      // Older/corrupt snapshots can still be reconstructed from the immutable payload.
    }
  }

  return normalizeSaleReceipt({
    _id: sale.clientSaleId,
    receiptNumber: sale.receiptNumber,
    barcodeToken: sale.barcodeToken,
    createdAt: sale.occurredAt,
    customer: sale.payload.customer,
    items: sale.payload.items,
    subtotal: sale.payload.subtotal,
    total: sale.payload.total,
    paymentMethod: sale.payload.paymentMethod,
    salesPerson: sale.payload.salesPerson,
    status: "completed",
    type: "sale",
    exchangeRateSnapshot: sale.payload.exchangeRateSnapshot ?? undefined,
  }, { type: "sale", exchangeRate: sale.payload.exchangeRateSnapshot?.rate });
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);

const escapeHtmlWithBreaks = (value: string): string =>
  escapeHtml(value).replace(/\n/g, "<br>");

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

const itemUnit = (item: SaleReceiptItem): string => item.unit ? ` ${escapeHtml(item.unit)}` : "";
const itemFc = (amount: number, receipt: SaleReceiptData): string =>
  receipt.exchangeRate ? formatFc(amount * receipt.exchangeRate) : "FC indisponible";

export const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export async function printCommittedSaleAfterDelay(
  receipt: SaleReceiptData,
  runtime: PrintRuntime = {},
): Promise<"usb" | "browser"> {
  if (POST_SAVE_PRINT_DELAY_MS > 0) await wait(POST_SAVE_PRINT_DELAY_MS);
  return printSaleReceiptAndStub(receipt, runtime);
}

const thermalStyles = `
  * { box-sizing: border-box; }
  @page { margin: 0 !important; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 80mm;
    height: auto;
    min-height: 0;
    background: #fff !important;
    color: #000 !important;
  }
  body {
    color: #000;
    background: #fff;
    font-family: "Courier New", Courier, "Liberation Mono", monospace;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.3;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .document { position: relative; width: 78mm; max-width: 78mm; height: auto; min-height: 0; margin: 0 1mm; padding: .8mm 0; }
  .document > * { position: relative; }
  .center { text-align: center; }
  .business { font-size: 16px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
  .business-meta { margin-top: .4mm; font-size: 10.5px; line-height: 1.2; }
  .rule { border-top: 1px dashed #000; margin: 1.8mm 0; }
  .double-rule { border-top: 2px double #000; margin: 1.8mm 0; }
  .title { margin: 1.5mm 0; text-align: center; font-size: 14px; font-weight: 800; }
  .section-label { margin: 1.6mm 0 1mm; padding: 1mm; color: #000; background: #fff; border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: center; font-weight: 800; letter-spacing: .2px; }
  .meta, .customer, .reservation { display: grid; gap: .7mm; overflow-wrap: anywhere; }
  .customer, .totals { padding: 1.2mm; border: 1px solid #000; border-radius: 1.5mm; background: #fff; }
  .item { padding: 1.2mm .4mm; border-bottom: 1px solid #000; break-inside: avoid; page-break-inside: avoid; }
  .item:last-child { border-bottom: 0; }
  .item-name { font-weight: 800; overflow-wrap: anywhere; word-break: break-word; }
  .item-calc { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5mm 2mm; margin-top: .5mm; overflow-wrap: anywhere; font-weight: 800; }
  .region { margin-top: .4mm; font-size: 10.5px; }
  .totals { width: 100%; }
  .total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; margin: .8mm 0; }
  .total-row strong { text-align: right; white-space: nowrap; }
  .grand-total { padding-top: 1.2mm; border-top: 1px solid #000; font-size: 15px; font-weight: 700; }
  .secondary { font-size: 12px; }
  .rate { text-align: right; font-size: 11px; }
  .system-promo { margin-top: 1.2mm; padding-top: .9mm; border-top: 1px solid #000; text-align: center; font-size: 10px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
  .footer { margin-top: 2mm; text-align: center; font-size: 10.5px; line-height: 1.35; }
  .footer strong { font-size: 12px; text-transform: uppercase; }
  .receipt .double-rule { margin: 1mm 0; }
  .receipt .title { margin: .8mm 0; }
  .receipt .meta { grid-template-columns: 1fr 1fr; gap: .4mm 2mm; }
  .receipt .customer { padding: .7mm 1mm; }
  .receipt .section-label { margin: .9mm 0 .4mm; padding: .6mm; }
  .receipt .item { padding: .65mm .25mm; }
  .receipt .item-calc { margin-top: .2mm; }
  .receipt .rule { margin: .9mm 0; }
  .receipt .totals { padding: .7mm 1mm; }
  .receipt .total-row { margin: .35mm 0; }
  .receipt .grand-total { padding-top: .7mm; }
  .receipt .footer { margin-top: 1mm; line-height: 1.2; }
  .barcode-block { margin-top: 1.6mm; padding-top: 1mm; border-top: 1px solid #000; text-align: center; }
  .barcode-block img { display: inline-block; width: 62mm; max-width: 100%; height: 11mm; image-rendering: pixelated; }
  .barcode-number { margin-top: .4mm; font-size: 10px; letter-spacing: .5px; font-weight: 700; }
  .cut-indicator { margin-top: 1.4mm; text-align: center; font-size: 9px; font-weight: 600; white-space: nowrap; }
  .stub { border: 1px solid #000; padding: 2mm; height: auto; min-height: 0; break-inside: avoid; }
  .stub .business { font-size: 13px; }
  .stub-grid { display: grid; gap: .8mm; margin-top: 1.5mm; overflow-wrap: anywhere; }
  .stub-items { margin-top: 1.2mm; }
  .stub-item { padding: .8mm .2mm; border-bottom: 1px solid #000; }
  .stub-item span:first-child { overflow-wrap: anywhere; word-break: break-word; }
  .stub-item-detail { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5mm 2mm; margin-top: .3mm; font-size: 10.5px; overflow-wrap: anywhere; }
  .stub-total { display: flex; justify-content: space-between; gap: 2mm; border-top: 1px solid #000; margin-top: 1.2mm; padding-top: 1.2mm; font-size: 14px; font-weight: 700; }
  .stub-total strong { text-align: right; white-space: nowrap; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      color: #000 !important;
      background: #fff !important;
    }
    .document { width: 78mm; max-width: 78mm; height: auto !important; min-height: 0 !important; margin: 0 1mm; padding: .8mm 0; }
  }
`;

// Absent entirely on legacy sales (Part R) — the layout simply has no
// barcode block rather than a broken/empty image.
function barcodeSection(receipt: SaleReceiptData): string {
  if (!receipt.barcodeToken) return "";
  const dataUrl = renderBarcodeDataUrl(receipt.barcodeToken);
  return `<div class="barcode-block">
    <img src="${dataUrl}" alt="Code-barres du reçu ${escapeHtml(receipt.reference)}">
    <div class="barcode-number">${escapeHtml(receipt.reference)}</div>
  </div>`;
}

function buildThermalDocument(kind: PrintDocumentKind, content: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title></title>
  <style>${thermalStyles}</style>
</head>
<body data-document-kind="${kind}">
  <main class="document">${content}<div class="cut-indicator">- - - - - - - ✂ - - - - - - -</div></main>
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
  const content = `<section class="receipt">
    <header class="center">
      <div class="business">${SALE_BUSINESS.name}</div>
      <div class="business-meta">${SALE_BUSINESS.address}</div>
      <div class="business-meta">Tél. ${SALE_BUSINESS.phone} · ${SALE_BUSINESS.registration}</div>
    </header>
    <div class="double-rule"></div>
    <div class="title">${documentTitle}${isReservation ? ` — ${escapeHtml(receipt.status.toUpperCase())}` : ""}</div>
    <section class="meta">
      <div><strong>Référence :</strong> ${escapeHtml(receipt.reference)}</div>
      <div><strong>Date :</strong> ${escapeHtml(receipt.date)}</div>
      ${isReservation ? `<div><strong>Statut :</strong> ${escapeHtml(receipt.status.toUpperCase())}</div>` : ""}
      ${reservationSchedule(receipt)}
    </section>
    <div class="rule"></div>
    <section class="customer">
      <div><strong>Client :</strong> ${escapeHtml(customerLabel(receipt))}</div>
      ${receipt.customerPhone ? `<div><strong>Tél. :</strong> ${escapeHtml(receipt.customerPhone)}</div>` : ""}
    </section>
    <div class="section-label">ARTICLES ACHETÉS</div>
    <section class="items">${receipt.items.map((item) => `<article class="item">
      <div class="item-name">${escapeHtml(item.name)}</div>
      <div class="item-calc"><span>${item.quantity}${itemUnit(item)} x ${formatUsd(item.unitPrice)}</span><strong>${formatUsd(item.lineTotal)}</strong></div>
    </article>`).join("")}</section>
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
    <div><strong>Agent de vente :</strong> ${escapeHtml(receipt.salesPerson)}</div>
    <aside class="system-promo">${escapeHtmlWithBreaks(SALE_SYSTEM_PROMO)}</aside>
    ${isReservation && receipt.notes ? `<div class="reservation"><strong>Notes :</strong> ${escapeHtml(receipt.notes)}</div>` : ""}
    ${barcodeSection(receipt)}
    <footer class="footer"><strong>${SALE_BUSINESS.thankYou}</strong><br>${SALE_BUSINESS.salesNotice}</footer></section>`;

  return buildThermalDocument("receipt", content);
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
      <div><strong>Agent de vente :</strong> ${escapeHtml(receipt.salesPerson)}</div>
    </div>
    <div class="section-label">ARTICLES VENDUS</div>
    <div class="stub-items">
      ${receipt.items.map((item) => `<div class="stub-item"><div><strong>${escapeHtml(item.name)}</strong></div><div class="stub-item-detail"><span>${item.quantity}${itemUnit(item)} x ${formatUsd(item.unitPrice)}</span><strong>${formatUsd(item.lineTotal)} / ${itemFc(item.lineTotal, receipt)}</strong></div></div>`).join("")}
    </div>
    <div class="stub-total"><span>TOTAL</span><strong>${formatUsd(receipt.total)}</strong></div>
    ${receipt.exchangeRate ? `<div class="total-row"><span>Total FC</span><strong>${formatFc(receipt.total * receipt.exchangeRate)}</strong></div>` : ""}
    ${barcodeSection(receipt)}
    <footer class="footer"><strong>SOUCHE DE CAISSE</strong><br>À conserver</footer>
  </section>`;
  return buildThermalDocument("stub", content);
}

export interface CashEntryReceiptData {
  entryId: string;
  date: string;
  source: string;
  category: string;
  paymentMethod: string;
  description?: string;
  receivedFrom: { name: string; phone: string; email?: string };
  agent: string;
  amount: number;
  exchangeRate?: number;
}

/** Builds the customer-facing document for a recorded cash entry. */
export function buildCashEntryReceiptHtml(entry: CashEntryReceiptData): string {
  const content = `<section class="receipt">
    <header class="center">
      <div class="business">${SALE_BUSINESS.name}</div>
      <div class="business-meta">${SALE_BUSINESS.address}</div>
      <div class="business-meta">Tél. ${SALE_BUSINESS.phone} · ${SALE_BUSINESS.registration}</div>
    </header>
    <div class="double-rule"></div>
    <div class="title">REÇU D'ENTRÉE D'ARGENT</div>
    <section class="meta">
      <div><strong>Reçu # :</strong> ${escapeHtml(entry.entryId)}</div>
      <div><strong>Date :</strong> ${escapeHtml(entry.date)}</div>
    </section>
    <div class="rule"></div>
    <section class="customer">
      <div><strong>Reçu de :</strong> ${escapeHtml(entry.receivedFrom.name.toUpperCase())}</div>
      <div><strong>Tél. :</strong> ${escapeHtml(entry.receivedFrom.phone)}</div>
      ${entry.receivedFrom.email ? `<div><strong>Email :</strong> ${escapeHtml(entry.receivedFrom.email)}</div>` : ""}
    </section>
    ${entry.description ? `<div class="rule"></div><section class="customer"><div><strong>Description :</strong> ${escapeHtml(entry.description)}</div></section>` : ""}
    <div class="section-label">DÉTAILS DE L'ENTRÉE</div>
    <section class="meta">
      <div><strong>Source :</strong> ${escapeHtml(entry.source)}</div>
      <div><strong>Catégorie :</strong> ${escapeHtml(entry.category)}</div>
    </section>
    <div class="rule"></div>
    <section class="totals">
      <div class="total-row grand-total"><span>MONTANT REÇU</span><strong>${formatUsd(entry.amount)}</strong></div>
      ${entry.exchangeRate ? `<div class="total-row secondary"><span>Équivalent FC</span><strong>${formatFc(entry.amount * entry.exchangeRate)}</strong></div>` : ""}
    </section>
    <div class="rule"></div>
    <div><strong>Méthode de paiement :</strong> ${escapeHtml(entry.paymentMethod.toUpperCase())}</div>
    <div><strong>Enregistré par :</strong> ${escapeHtml(entry.agent.toUpperCase())}</div>
    <footer class="footer"><strong>ENTRÉE ENREGISTRÉE AVEC SUCCÈS</strong><br>Conserver ce reçu comme preuve · Merci pour votre confiance</footer></section>`;
  return buildThermalDocument("receipt", content);
}

/** Builds the compact cashier stub for a recorded cash entry. */
export function buildCashEntryStubHtml(entry: CashEntryReceiptData): string {
  const content = `<section class="stub">
    <div class="center business">${SALE_BUSINESS.name}</div>
    <div class="title">SOUCHE D'ENTRÉE D'ARGENT</div>
    <div class="stub-grid">
      <div><strong>Reçu # :</strong> ${escapeHtml(entry.entryId)}</div>
      <div><strong>Date :</strong> ${escapeHtml(entry.date)}</div>
      <div><strong>Reçu de :</strong> ${escapeHtml(entry.receivedFrom.name.toUpperCase())}</div>
      <div><strong>Tél. :</strong> ${escapeHtml(entry.receivedFrom.phone)}</div>
      ${entry.description ? `<div><strong>Description :</strong> ${escapeHtml(entry.description)}</div>` : ""}
      <div><strong>Source :</strong> ${escapeHtml(entry.source)}</div>
      <div><strong>Catégorie :</strong> ${escapeHtml(entry.category)}</div>
      <div><strong>Méthode de paiement :</strong> ${escapeHtml(entry.paymentMethod.toUpperCase())}</div>
      <div><strong>Enregistré par :</strong> ${escapeHtml(entry.agent.toUpperCase())}</div>
    </div>
    <div class="stub-total"><span>MONTANT REÇU</span><strong>${formatUsd(entry.amount)}</strong></div>
    <footer class="footer"><strong>SOUCHE D'ENTRÉE</strong><br>À conserver</footer>
  </section>`;
  return buildThermalDocument("stub", content);
}

export interface CashExpenseReceiptData {
  expenseId: string;
  date: string;
  validatedDate: string;
  reason: string;
  recipientName: string;
  recipientPhone: string;
  amount: number;
  paymentMethod: string;
  validatedBy: string;
}

/** Builds the single receipt/stub document for a validated cash-out expense. */
export function buildCashExpenseReceiptHtml(expense: CashExpenseReceiptData): string {
  const content = `<section class="receipt">
    <header class="center">
      <div class="business">${SALE_BUSINESS.name}</div>
      <div class="business-meta">${SALE_BUSINESS.address}</div>
      <div class="business-meta">Tél. ${SALE_BUSINESS.phone} · ${SALE_BUSINESS.registration}</div>
    </header>
    <div class="double-rule"></div>
    <div class="title">REÇU DE SORTIE DE CAISSE</div>
    <section class="meta">
      <div><strong>Reçu # :</strong> ${escapeHtml(expense.expenseId)}</div>
      <div><strong>Date :</strong> ${escapeHtml(expense.date)}</div>
    </section>
    <div class="rule"></div>
    <section class="customer">
      <div><strong>Raison :</strong> ${escapeHtml(expense.reason.toUpperCase())}</div>
      <div><strong>Bénéficiaire :</strong> ${escapeHtml(expense.recipientName.toUpperCase())}</div>
      <div><strong>Tél. :</strong> ${escapeHtml(expense.recipientPhone)}</div>
    </section>
    <div class="rule"></div>
    <section class="totals">
      <div class="total-row"><span>Paiement</span><strong>${escapeHtml(expense.paymentMethod.toUpperCase())}</strong></div>
      <div class="total-row grand-total"><span>MONTANT TOTAL</span><strong>${formatUsd(expense.amount)}</strong></div>
    </section>
    <div class="rule"></div>
    <div><strong>Validé par :</strong> ${escapeHtml(expense.validatedBy)}</div>
    <div><strong>Le :</strong> ${escapeHtml(expense.validatedDate)}</div>
    <footer class="footer"><strong>SOUCHE DE SORTIE DE CAISSE</strong><br>Conserver cette souche</footer></section>`;
  return buildThermalDocument("receipt", content);
}

/** Pure sequencing helper used by browser printing and unit tests. */
export async function runPrintSequence(
  printReceipt: () => Promise<void>,
  printStub: () => Promise<void>,
  interDocumentDelayMs = 0,
): Promise<void> {
  await printReceipt();
  if (interDocumentDelayMs > 0) await wait(interDocumentDelayMs);
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

export function calculateThermalPageHeightMm(contentPixels: number): number {
  if (!Number.isFinite(contentPixels) || contentPixels <= 0) return THERMAL_PAGE_FALLBACK_MM;
  const measuredMm = Math.ceil((contentPixels * 25.4 / 96 + THERMAL_PAGE_ALLOWANCE_MM) * 10) / 10;
  if (!Number.isFinite(measuredMm)) return THERMAL_PAGE_MAX_MM;
  if (measuredMm < THERMAL_PAGE_MIN_MM) {
    return THERMAL_PAGE_MIN_MM;
  }
  if (measuredMm > THERMAL_PAGE_MAX_MM) return THERMAL_PAGE_MAX_MM;
  return measuredMm;
}

function assertPrintableBrowserDocument(printWindow: Window): HTMLElement {
  const { document: printDocument } = printWindow;
  const printable = printDocument.querySelector<HTMLElement>("main.document");
  const documentKind = printDocument.body?.dataset.documentKind;
  const printableText = printable?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!printable || (documentKind !== "receipt" && documentKind !== "stub") || printableText.length < 20) {
    throw new Error("Document d'impression vide ou incomplet; aucune page n'a été envoyée.");
  }

  const style = printWindow.getComputedStyle(printable);
  const rect = printable.getBoundingClientRect();
  const height = Math.max(rect.height, printable.scrollHeight);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 ||
      !Number.isFinite(rect.width) || rect.width <= 1 || !Number.isFinite(height) || height <= 1) {
    throw new Error("Mise en page d'impression invisible ou invalide; aucune page n'a été envoyée.");
  }
  return printable;
}

function fitThermalPageToContent(printWindow: Window): void {
  const { document: printDocument } = printWindow;
  const printable = assertPrintableBrowserDocument(printWindow);

  // Only the rendered receipt/stub wrapper is authoritative. Body and viewport
  // heights may include popup chrome or screen-preview spacing.
  const contentPixels = Math.max(
    printable.getBoundingClientRect().height,
    printable.scrollHeight,
  );
  const pageHeightMm = calculateThermalPageHeightMm(contentPixels);
  console.info("Browser print layout ready", {
    documentKind: printDocument.body.dataset.documentKind,
    contentPixels: Math.round(contentPixels),
    pageHeightMm,
  });
  const pageStyle = printDocument.createElement("style");
  pageStyle.dataset.thermalPageSize = "true";
  pageStyle.textContent = `@page { size: 80mm ${pageHeightMm}mm; margin: 0 !important; }`;
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
  // Re-check after applying the dynamic @page rule. A browser/driver must never
  // receive a document that collapsed during the final layout pass.
  assertPrintableBrowserDocument(printWindow);
  console.info("Browser print dialog starting", {
    documentKind: printWindow.document.body.dataset.documentKind,
  });
  await waitForPrintDialog(printWindow);
}

function openPrintWindow(): Window {
  const printWindow = window.open("", "_blank", "popup=yes,width=420,height=720");
  if (!printWindow) {
    throw new Error(
      "Fenêtre d'impression bloquée. Autorisez les popups pour ce site puis réimprimez la vente enregistrée.",
    );
  }
  return printWindow;
}

/** Uses one independently closed window per document, in strict receipt/stub order. */
export async function printHtmlDocumentsSequentially(documents: readonly string[]): Promise<void> {
  if (!documents.length) return;
  let completedDialogs = 0;
  for (const [index, html] of documents.entries()) {
    if (index > 0) await wait(BROWSER_DOCUMENT_DELAY_MS);
    let printWindow: Window | null = null;
    try {
      printWindow = openPrintWindow();
      await renderAndPrint(printWindow, html);
      completedDialogs += 1;
    } catch (error) {
      const popupBlocked = error instanceof Error && error.message.includes("bloquée");
      const message = popupBlocked && completedDialogs > 0
        ? "Le reçu est terminé, mais la fenêtre de la souche a été bloquée. Autorisez les popups puis réimprimez la vente enregistrée."
        : completedDialogs > 0
          ? "Le reçu est terminé, mais l'impression de la souche a échoué. La vente reste enregistrée et peut être réimprimée."
          : popupBlocked
            ? error.message
            : "Le dialogue d'impression n'a pas pu démarrer. La vente reste enregistrée et peut être réimprimée.";
      throw new Error(message, { cause: error });
    } finally {
      if (printWindow && !printWindow.closed) printWindow.close();
    }
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
        Authorization: `Bearer ${localStorage.getItem("authToken") || localStorage.getItem("token") || ""}`,
      },
      body: JSON.stringify({ savedSaleId: receipt.savedSaleId, receiptData: receipt, type: receipt.type }),
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
    fallbackSafe?: unknown;
  };
  const reportedDocuments = Array.isArray(payload.printedDocuments)
    ? payload.printedDocuments
    : Array.isArray(payload.documents) ? payload.documents : [];
  const printedDocuments = reportedDocuments.filter(
    (value): value is PrintDocumentKind => value === "receipt" || value === "stub",
  );

  if (!response.ok && payload.fallbackSafe !== true) {
    throw new Error(
      "État de l'impression USB inconnu. Vérifiez l'imprimante puis utilisez la réimpression; la vente est déjà enregistrée.",
    );
  }

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
    if (runtime.directPrintMode === "none") {
      await printBrowser(receipt, ["receipt", "stub"]);
      return "browser";
    }
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
  const pdfTopAllowanceMm = 2;
  const pdfBottomAllowanceMm = 2.5;
  const draftPageHeightMm = THERMAL_PAGE_MAX_MM;
  let doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, draftPageHeightMm] });
  const left = 5;
  const right = 75;
  let y = pdfTopAllowanceMm;
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

  const renderReceiptPage = (): number => {
    y = pdfTopAllowanceMm;
    centered(SALE_BUSINESS.name, 10, true);
    centered(SALE_BUSINESS.address, 7);
    centered(SALE_BUSINESS.registration, 7);
    line();
    centered(receipt.type === "reservation" ? "RECU DE RESERVATION" : "RECU DE VENTE", 9, true);
    text(`Reference: ${receipt.reference}`);
    text(`Date: ${receipt.date}`);
    text(`Statut: ${receipt.status.toUpperCase()}`);
    if (receipt.type === "reservation" && (receipt.reservationDate || receipt.reservationTime)) {
      text(`Retrait: ${[receipt.reservationDate, receipt.reservationTime].filter(Boolean).join(" a ")}`);
    }
    text(`Client: ${customerLabel(receipt)}`);
    if (receipt.customerPhone) text(`Tel: ${receipt.customerPhone}`);
    line();
    centered("ARTICLES ACHETES", 8, true);

    for (const item of receipt.items) {
      const names = doc.splitTextToSize(item.name, 68) as string[];
      names.forEach((name) => text(name, 8, true));
      row(`${item.quantity}${item.unit ? ` ${item.unit}` : ""} x ${pdfMoney(item.unitPrice)}`, pdfMoney(item.lineTotal));
      if (receipt.exchangeRate) row("Equivalent FC", formatFc(item.lineTotal * receipt.exchangeRate));
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
    text(`Agent de vente: ${receipt.salesPerson}`);
    const promotionLines = doc.splitTextToSize(SALE_SYSTEM_PROMO, 68) as string[];
    promotionLines.forEach((promotionLine) => text(promotionLine, 7, true));
    centered(SALE_BUSINESS.thankYou, 7, true);
    centered(SALE_BUSINESS.salesNotice, 6);
    return y;
  };

  const renderStubPage = (): number => {
    y = pdfTopAllowanceMm;
    centered(receipt.type === "reservation" ? "SOUCHE DE RESERVATION" : "SOUCHE DE VENTE", 9, true);
    text(SALE_BUSINESS.name, 8, true);
    text(`Ref: ${receipt.reference}`);
    text(`Date: ${receipt.date}`);
    text(`Client: ${customerLabel(receipt)}`);
    text(`Paiement: ${receipt.paymentMethod.toUpperCase()}`);
    text(`Statut: ${receipt.status.toUpperCase()}`);
    centered("ARTICLES VENDUS", 8, true);
    receipt.items.forEach((item) => {
      const names = doc.splitTextToSize(item.name, 58) as string[];
      names.forEach((name) => text(name, 7));
      row(`${item.quantity}${item.unit ? ` ${item.unit}` : ""} x ${pdfMoney(item.unitPrice)}`, pdfMoney(item.lineTotal));
      if (receipt.exchangeRate) row("Total FC", formatFc(item.lineTotal * receipt.exchangeRate));
    });
    row("TOTAL", pdfMoney(receipt.total), true);
    if (receipt.exchangeRate) row("TOTAL FC", formatFc(receipt.total * receipt.exchangeRate));
    text(`Agent de vente: ${receipt.salesPerson}`);
    centered("SOUCHE DE CAISSE", 8, true);
    centered("A conserver", 7);
    return y;
  };

  // Measure with jsPDF's real wrapping before creating the final pages. This
  // keeps every variable-length receipt close to its actual rendered content.
  const receiptPageHeight = Math.ceil((renderReceiptPage() + pdfBottomAllowanceMm) * 10) / 10;
  const stubPageHeight = Math.ceil((renderStubPage() + pdfBottomAllowanceMm) * 10) / 10;
  doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, receiptPageHeight] });
  renderReceiptPage();
  doc.addPage([80, stubPageHeight], "portrait");
  renderStubPage();

  doc.save(`recu-${receipt.reference}.pdf`);
}
