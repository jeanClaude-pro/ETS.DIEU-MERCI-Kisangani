import jsPDF from "jspdf";
import type { OfflineSale } from "../lib/offlineDb.ts";
import { isValidBarcodeToken } from "../utils/barcodeId.ts";
import { saleCodeFor } from "../utils/saleCode.ts";

export const SALE_BUSINESS = Object.freeze({
  name: "Boutique C'EST DIEU QUI PARTAGE",
  address: "Av du 1er Janvier N°13, C. Makiso, Kisangani",
  phone: "+243 839 336 794",
  registration: "RCCM/KIS : 22-A-267",
  thankYou: "Merci pour votre confiance.",
  salesNotice: "Marchandises vendues non reprises, non échangées.",
});

// Printed at the bottom of every document (receipts, stubs, vouchers).
export const SALE_SYSTEM_PROMO =
  "Avez-vous besoin d'un système de gestion ?\nContactez-moi par WhatsApp au +243 844 311 550";

// The POST /sales response is the committed MongoDB snapshot. Waiting for the
// database to "settle" after that response only delays printing.
export const POST_SAVE_PRINT_DELAY_MS = 0;
export const BROWSER_DOCUMENT_DELAY_MS = 2000;
export const THERMAL_PAGE_MIN_MM = 20;
export const THERMAL_PAGE_MAX_MM = 3000;
export const THERMAL_PAGE_FALLBACK_MM = 180;
// Rounding margin added below the cut line so the last dashes are never
// clipped; the paper still ends on the cut line, not several mm below it.
export const THERMAL_PAGE_ALLOWANCE_MM = 0.6;
export const THERMAL_PAPER_WIDTH_MM = 80;
// 80 mm thermal heads print about 72 mm; content stays inside it.
export const THERMAL_PRINT_WIDTH_MM = 72;

export type ReceiptDocumentType = "sale";
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
  saleCode?: unknown;
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
  exchangeRateSnapshot?: { rate?: unknown };
}

type ReceiptOverrides = Partial<Pick<SaleReceiptData, "type" | "exchangeRate">>;

interface PrintRuntime {
  /** Injected in tests; defaults to the browser print dialog. */
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

/** Business-time (UTC+2) date used on every printed document. */
export const formatReceiptDate = (value: unknown): string => {
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
  const type: ReceiptDocumentType = "sale";

  return {
    savedSaleId: stringValue(sale._id),
    type,
    status: stringValue(sale.status) || "completed",
    // A receiptNumber (barcode-era sales) always wins over the legacy saleId
    // so the printed reference matches what's encoded in the barcode.
    // The short sale code (V-261020-K7QM3) when the sale has one; older
    // sales keep the reference already printed on their paper receipt.
    reference: stringValue(sale.saleCode ?? sale.receiptNumber ?? sale.saleId ?? sale._id) || "N/A",
    barcodeToken: isValidBarcodeToken(sale.barcodeToken) ? sale.barcodeToken : undefined,
    date: formatReceiptDate(sale.createdAt ?? sale.date),
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
  };
}

/** Rebuilds a printable receipt solely from the durable IndexedDB row. */
export function reconstructOfflineSaleReceipt(sale: OfflineSale): SaleReceiptData {
  if (sale.receiptSnapshot && typeof sale.receiptSnapshot === "object") {
    const snapshot = {
      ...(sale.receiptSnapshot as SaleReceiptData),
      savedSaleId: sale.clientSaleId,
      reference: (sale.receiptSnapshot as SaleReceiptData).reference || sale.receiptNumber,
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
    saleCode: saleCodeFor({ type: "sale", occurredAt: sale.occurredAt, barcodeToken: sale.barcodeToken }) ?? undefined,
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

const amountNumber = (amount: number): string =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

const formatUsd = (amount: number): string => `${amountNumber(amount)} USD`;

const formatFc = (amount: number): string =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} FC`;

const formatQuantity = (value: number): string =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value);

const PAYMENT_LABELS: Record<string, string> = {
  cash: "ESPÈCES",
  card: "CARTE",
  transfer: "VIREMENT",
  mpesa: "M-PESA",
  bank: "BANQUE",
  other: "AUTRE",
};

/** Printed payment label: French wording for known methods, upper-case otherwise. */
export const paymentLabel = (method: string): string =>
  PAYMENT_LABELS[method.trim().toLowerCase()] ?? method.trim().toUpperCase();

const STATUS_LABELS: Record<string, string> = {
  completed: "TERMINÉE",
  pending: "EN ATTENTE",
  voided: "ANNULÉE",
  refunded: "REMBOURSÉE",
  corrected: "CORRIGÉE",
};

/** Printed status label of a sale (used for cancelled sales). */
export const statusLabel = (status: string): string =>
  STATUS_LABELS[status.trim().toLowerCase()] ?? status.trim().toUpperCase();

const customerLabel = (receipt: SaleReceiptData): string =>
  receipt.isWalkIn && receipt.customerName === "Walk-in Customer"
    ? "Client de passage"
    : receipt.customerName;

const totalQuantity = (receipt: SaleReceiptData): number =>
  Math.round(receipt.items.reduce((sum, item) => sum + item.quantity, 0) * 1000) / 1000;

const isCancelled = (receipt: SaleReceiptData): boolean =>
  ["voided", "refunded"].includes(receipt.status.trim().toLowerCase());

export const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export async function printCommittedSaleAfterDelay(
  receipt: SaleReceiptData,
  runtime: PrintRuntime = {},
): Promise<"browser"> {
  if (POST_SAVE_PRINT_DELAY_MS > 0) await wait(POST_SAVE_PRINT_DELAY_MS);
  return printSaleReceiptAndStub(receipt, runtime);
}

// One stylesheet for every thermal document (sale, stub, cash
// entry, cash expense). The page is 80 mm wide; content stays inside the
// 72 mm that 80 mm thermal heads actually print, so nothing is clipped at
// the edges. The cut line is always the last element: the page height is
// measured to its bottom edge, so the paper ends exactly at the cut line.
const thermalStyles = `
  * { box-sizing: border-box; }
  @page { margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${THERMAL_PAPER_WIDTH_MM}mm;
    height: auto;
    min-height: 0;
    background: #fff !important;
    color: #000 !important;
  }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif;
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .document { position: relative; width: ${THERMAL_PRINT_WIDTH_MM}mm; max-width: ${THERMAL_PRINT_WIDTH_MM}mm; height: auto; min-height: 0; margin: 0 auto; padding: 1.5mm 0 0; }
  .center { text-align: center; }
  strong, b { font-weight: 800; }

  /* Shop identity */
  .shop { text-align: center; }
  .shop-name { font-size: 16px; font-weight: 900; line-height: 1.15; letter-spacing: .2px; text-transform: uppercase; overflow-wrap: anywhere; }
  .shop-line { margin-top: .5mm; font-size: 10.5px; line-height: 1.25; overflow-wrap: anywhere; }

  /* Title band and receipt code */
  .band { margin: 2mm 0 1.4mm; padding: 1.1mm 1mm; background: #000; color: #fff; text-align: center; font-size: 13px; font-weight: 900; letter-spacing: 1px; }
  .code-box { margin: 0 0 1.6mm; padding: 1.2mm 1mm; border: 2px solid #000; border-radius: 1.5mm; text-align: center; }
  .code-label { font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
  .code-value { margin-top: .3mm; font-family: "Courier New", Courier, monospace; font-size: 18px; font-weight: 900; letter-spacing: 1px; overflow-wrap: anywhere; }
  .banner { margin: 0 0 1.6mm; padding: .9mm; border: 2px dashed #000; text-align: center; font-size: 13px; font-weight: 900; letter-spacing: .5px; }

  /* Label / value rows */
  .info { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .45mm 2.5mm; align-items: baseline; }
  .info dt { font-size: 10.5px; font-weight: 600; white-space: nowrap; }
  .info dd { margin: 0; text-align: right; font-weight: 800; overflow-wrap: anywhere; }
  .rule { border-top: 1px dashed #000; margin: 1.6mm 0; }
  .rule-solid { border-top: 1px solid #000; margin: 1.6mm 0; }
  .section-title { margin: 1.6mm 0 .8mm; font-size: 10.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }

  /* Items */
  .items-head { display: flex; justify-content: space-between; gap: 2mm; padding: .6mm 0; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 9.5px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; }
  .item { padding: .9mm 0; border-bottom: 1px dotted #000; break-inside: avoid; page-break-inside: avoid; }
  .item:last-child { border-bottom: 0; }
  .item-name { font-weight: 800; overflow-wrap: anywhere; word-break: break-word; }
  .item-name .index { display: inline-block; min-width: 4.5mm; font-weight: 700; }
  .item-line { display: flex; justify-content: space-between; gap: 2mm; margin-top: .3mm; padding-left: 4.5mm; }
  .item-line span { font-size: 11px; }
  .item-line strong { white-space: nowrap; }
  .items-summary { display: flex; justify-content: space-between; gap: 2mm; margin-top: .8mm; padding-top: .8mm; border-top: 1px solid #000; font-size: 10.5px; font-weight: 700; }

  /* Totals */
  .totals { display: grid; gap: .4mm; }
  .total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; }
  .total-row strong { text-align: right; white-space: nowrap; }
  .net { margin-top: 1mm; padding: 1.2mm 1.2mm; border: 2px solid #000; display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
  .net span { font-size: 11.5px; font-weight: 900; letter-spacing: .5px; }
  .net strong { font-size: 17px; font-weight: 900; white-space: nowrap; }
  .fc { display: flex; justify-content: space-between; gap: 2mm; margin-top: .8mm; font-size: 12px; font-weight: 800; }
  .rate { margin-top: .3mm; text-align: right; font-size: 9.5px; }
  .words { margin-top: 1.4mm; font-size: 10.5px; line-height: 1.3; overflow-wrap: anywhere; }
  .words em { font-style: normal; font-weight: 800; }
  .notes { margin-top: 1.4mm; padding: .9mm 1.2mm; border: 1px dashed #000; overflow-wrap: anywhere; }

  /* Signatures and footer */
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 3mm; text-align: center; font-size: 9.5px; font-weight: 700; }
  .signatures i { display: block; height: 8mm; border-bottom: 1px solid #000; }
  .signatures span { display: block; margin-top: .8mm; }
  .footer { margin-top: 2mm; text-align: center; font-size: 10.5px; line-height: 1.35; }
  .footer strong { font-size: 12px; text-transform: uppercase; letter-spacing: .3px; }
  .system-promo { margin-top: 1.6mm; padding-top: 1mm; border-top: 1px solid #000; text-align: center; font-size: 9px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }

  /* Cashier stub */
  .stub .band { margin-top: 1mm; }
  .stub-item { display: flex; justify-content: space-between; gap: 2mm; padding: .5mm 0; border-bottom: 1px dotted #000; }
  .stub-item span { overflow-wrap: anywhere; }
  .stub-item strong { white-space: nowrap; }

  .cut-line { display: flex; align-items: center; gap: 1.5mm; margin: 2.4mm 0 0; padding: 0; height: 3.4mm; font-size: 11px; line-height: 1; }
  .cut-line::before, .cut-line::after { content: ""; flex: 1; border-top: 1px dashed #000; }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; color: #000 !important; background: #fff !important; }
    .document { width: ${THERMAL_PRINT_WIDTH_MM}mm; max-width: ${THERMAL_PRINT_WIDTH_MM}mm; height: auto !important; min-height: 0 !important; margin: 0 auto; }
  }
`;

const shopHeader = (): string => `<header class="shop">
      <div class="shop-name">${escapeHtml(SALE_BUSINESS.name)}</div>
      <div class="shop-line">${escapeHtml(SALE_BUSINESS.address)}</div>
      <div class="shop-line">Tél. ${escapeHtml(SALE_BUSINESS.phone)} · ${escapeHtml(SALE_BUSINESS.registration)}</div>
    </header>`;

const codeBox = (label: string, value: string): string =>
  `<div class="code-box"><div class="code-label">${escapeHtml(label)}</div><div class="code-value">${escapeHtml(value)}</div></div>`;

const infoRows = (rows: [string, string | undefined | null][]): string =>
  `<dl class="info">${rows.filter(([, value]) => value).map(([label, value]) =>
    `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`).join("")}</dl>`;

const totalRow = (label: string, amount: number, sign = ""): string =>
  `<div class="total-row"><span>${label}</span><strong>${sign}${amountNumber(amount)}</strong></div>`;

// Sales are announced in francs: the net to pay in FC, then its USD
// equivalent and the rate used. Without a recorded rate, USD is shown.
const netToPayBlock = (label: string, totalUsd: number, rate: number | undefined): string => rate
  ? `<div class="net"><span>${label}</span><strong>${formatFc(totalUsd * rate)}</strong></div>
     <div class="fc"><span>Équivalent en $</span><span>${formatUsd(totalUsd)}</span></div>
     <div class="rate">Taux appliqué : 1 USD = ${formatFc(rate)}</div>`
  : `<div class="net"><span>${label}</span><strong>${formatUsd(totalUsd)}</strong></div>`;

const fcEquivalent = (amount: number, rate: number | undefined, rateLabel: string): string => rate
  ? `<div class="fc"><span>Équivalent en FC</span><span>${formatFc(amount * rate)}</span></div>
     <div class="rate">${rateLabel} : 1 USD = ${formatFc(rate)}</div>`
  : "";

const promo = (): string => `<aside class="system-promo">${escapeHtmlWithBreaks(SALE_SYSTEM_PROMO)}</aside>`;

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
  <main class="document">${content}<div class="cut-line" aria-hidden="true">✂</div></main>
</body>
</html>`;
}

/** The customer's receipt. The cashier stub is a separate page/job. */
export function buildSaleReceiptHtml(receipt: SaleReceiptData): string {
  const quantity = totalQuantity(receipt);
  const hasAdjustments = receipt.discount + receipt.transportCost + receipt.tax + receipt.otherCharges > 0;
  const content = `<section class="receipt">
    ${shopHeader()}
    <div class="band">REÇU DE VENTE</div>
    ${isCancelled(receipt) ? `<div class="banner">VENTE ${statusLabel(receipt.status)}</div>` : ""}
    ${codeBox("N° de reçu", receipt.reference)}
    ${infoRows([
      ["Date", receipt.date],
      ["Client", customerLabel(receipt)],
      ["Téléphone", !receipt.isWalkIn ? receipt.customerPhone : undefined],
      ["Servi par", receipt.salesPerson],
      ["Paiement", paymentLabel(receipt.paymentMethod)],
    ])}
    <div class="section-title">Détail des articles</div>
    <div class="items-head"><span>Désignation · Qté × P.U.</span><span>Montant (USD)</span></div>
    <section class="items">${receipt.items.map((item, index) => `<article class="item">
      <div class="item-name"><span class="index">${index + 1}.</span>${escapeHtml(item.name)}</div>
      <div class="item-line"><span>${formatQuantity(item.quantity)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""} × ${amountNumber(item.unitPrice)}</span><strong>${amountNumber(item.lineTotal)}</strong></div>
    </article>`).join("")}</section>
    <div class="items-summary"><span>${receipt.items.length} article${receipt.items.length > 1 ? "s" : ""}</span><span>${formatQuantity(quantity)} unité${quantity > 1 ? "s" : ""}</span></div>
    <div class="rule"></div>
    <section class="totals">
      ${hasAdjustments ? totalRow("Sous-total", receipt.subtotal) : ""}
      ${receipt.discount > 0 ? totalRow("Remise", receipt.discount, "− ") : ""}
      ${receipt.transportCost > 0 ? totalRow("Transport", receipt.transportCost, "+ ") : ""}
      ${receipt.tax > 0 ? totalRow("Taxes", receipt.tax, "+ ") : ""}
      ${receipt.otherCharges > 0 ? totalRow("Autres frais", receipt.otherCharges, "+ ") : ""}
      ${netToPayBlock("NET À PAYER", receipt.total, receipt.exchangeRate)}
    </section>
    <footer class="footer">
      <strong>${escapeHtml(SALE_BUSINESS.thankYou)}</strong><br>
      Conservez ce reçu comme preuve d'achat.<br>
      ${escapeHtml(SALE_BUSINESS.salesNotice)}
    </footer>
    ${promo()}
  </section>`;

  return buildThermalDocument("receipt", content);
}

/** The compact copy kept by the cash desk. */
export function buildSaleStubHtml(receipt: SaleReceiptData): string {
  const content = `<section class="stub">
    <div class="shop-line center"><strong>${escapeHtml(SALE_BUSINESS.name)}</strong></div>
    <div class="band">SOUCHE CAISSE · VENTE</div>
    ${isCancelled(receipt) ? `<div class="banner">${statusLabel(receipt.status)}</div>` : ""}
    ${codeBox("N° de reçu", receipt.reference)}
    ${infoRows([
      ["Date", receipt.date],
      ["Client", customerLabel(receipt)],
      ["Téléphone", !receipt.isWalkIn ? receipt.customerPhone : undefined],
      ["Servi par", receipt.salesPerson],
      ["Paiement", paymentLabel(receipt.paymentMethod)],
    ])}
    <div class="section-title">Articles (${receipt.items.length} · ${formatQuantity(totalQuantity(receipt))} unités)</div>
    <div>${receipt.items.map((item) => `<div class="stub-item"><span>${formatQuantity(item.quantity)} × ${escapeHtml(item.name)}</span><strong>${amountNumber(item.lineTotal)}</strong></div>`).join("")}</div>
    <section class="totals" style="margin-top:1.2mm">
      ${receipt.discount > 0 ? totalRow("Remise", receipt.discount, "− ") : ""}
      ${receipt.tax + receipt.transportCost + receipt.otherCharges > 0 ? totalRow("Frais et taxes", receipt.tax + receipt.transportCost + receipt.otherCharges, "+ ") : ""}
      ${netToPayBlock("NET À PAYER", receipt.total, receipt.exchangeRate)}
    </section>
    <footer class="footer"><strong>Souche de caisse</strong><br>À conserver par la caisse</footer>
    ${promo()}
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
  /** Only when printed at creation time; entries store no historical rate. */
  exchangeRate?: number;
  region?: string;
}

const entryRows = (entry: CashEntryReceiptData): [string, string | undefined][] => [
  ["Date", entry.date],
  ["Reçu de", entry.receivedFrom.name.toUpperCase()],
  ["Téléphone", entry.receivedFrom.phone],
  ["Email", entry.receivedFrom.email],
  ["Source", entry.source],
  ["Catégorie", entry.category],
  ["Région", entry.region],
  ["Paiement", paymentLabel(entry.paymentMethod)],
  ["Enregistré par", entry.agent.toUpperCase()],
];

/** The depositor's receipt for money entering the till. */
export function buildCashEntryReceiptHtml(entry: CashEntryReceiptData): string {
  const content = `<section class="receipt">
    ${shopHeader()}
    <div class="band">REÇU D'ENTRÉE DE CAISSE</div>
    ${codeBox("N° de reçu", entry.entryId)}
    ${infoRows(entryRows(entry))}
    ${entry.description ? `<div class="notes"><strong>Motif :</strong> ${escapeHtml(entry.description)}</div>` : ""}
    <div class="rule"></div>
    <section class="totals">
      <div class="net"><span>MONTANT REÇU</span><strong>${formatUsd(entry.amount)}</strong></div>
      ${fcEquivalent(entry.amount, entry.exchangeRate, "Taux du jour")}
    </section>
    <div class="signatures"><div><i></i><span>Le déposant</span></div><div><i></i><span>La caisse</span></div></div>
    <footer class="footer"><strong>Entrée enregistrée</strong><br>Conservez ce reçu comme preuve de versement.<br>${escapeHtml(SALE_BUSINESS.thankYou)}</footer>
    ${promo()}
  </section>`;
  return buildThermalDocument("receipt", content);
}

/** The cash desk's copy of a money entry. */
export function buildCashEntryStubHtml(entry: CashEntryReceiptData): string {
  const content = `<section class="stub">
    <div class="shop-line center"><strong>${escapeHtml(SALE_BUSINESS.name)}</strong></div>
    <div class="band">SOUCHE CAISSE · ENTRÉE</div>
    ${codeBox("N° de reçu", entry.entryId)}
    ${infoRows(entryRows(entry))}
    ${entry.description ? `<div class="notes"><strong>Motif :</strong> ${escapeHtml(entry.description)}</div>` : ""}
    <section class="totals" style="margin-top:1.2mm">
      <div class="net"><span>MONTANT REÇU</span><strong>${formatUsd(entry.amount)}</strong></div>
    </section>
    <footer class="footer"><strong>Souche de caisse</strong><br>À conserver par la caisse</footer>
    ${promo()}
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
  recordedBy?: string;
  notes?: string;
  region?: string;
}

/** Voucher for a validated cash-out, signed by the person receiving the money. */
export function buildCashExpenseReceiptHtml(expense: CashExpenseReceiptData): string {
  const content = `<section class="receipt">
    ${shopHeader()}
    <div class="band">BON DE SORTIE DE CAISSE</div>
    ${codeBox("N° du bon", expense.expenseId)}
    ${infoRows([
      ["Date", expense.date],
      ["Bénéficiaire", expense.recipientName.toUpperCase()],
      ["Téléphone", expense.recipientPhone],
      ["Région", expense.region],
      ["Paiement", paymentLabel(expense.paymentMethod)],
      ["Demandé par", expense.recordedBy],
      ["Validé par", expense.validatedBy],
      ["Validé le", expense.validatedDate],
    ])}
    <div class="notes"><strong>Motif :</strong> ${escapeHtml(expense.reason)}${expense.notes ? `<br><strong>Notes :</strong> ${escapeHtml(expense.notes)}` : ""}</div>
    <div class="rule"></div>
    <section class="totals">
      <div class="net"><span>MONTANT VERSÉ</span><strong>${formatUsd(expense.amount)}</strong></div>
    </section>
    <div class="signatures"><div><i></i><span>Le bénéficiaire</span></div><div><i></i><span>La caisse</span></div></div>
    <footer class="footer"><strong>Sortie validée</strong><br>Bon à conserver par la caisse.</footer>
    ${promo()}
  </section>`;
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

/** Page length in mm for content measured from the page top to the cut line. */
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

/** CSS that sizes the printed page to end at the cut line and never spill. */
export function thermalPageCss(pageHeightMm: number): string {
  return `@page { size: ${THERMAL_PAPER_WIDTH_MM}mm ${pageHeightMm}mm; margin: 0 !important; }
  @media print {
    html, body { height: ${pageHeightMm}mm !important; max-height: ${pageHeightMm}mm !important; overflow: hidden !important; }
  }`;
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

function fitThermalPageToContent(printWindow: Window): number {
  const { document: printDocument } = printWindow;
  const printable = assertPrintableBrowserDocument(printWindow);

  // The cut line is the last element; its bottom edge is where the paper
  // must end. Measured from the top of the page (body has no margin).
  const cutLine = printable.querySelector<HTMLElement>(".cut-line");
  const bottom = cutLine
    ? cutLine.getBoundingClientRect().bottom + printWindow.scrollY
    : Math.max(printable.getBoundingClientRect().bottom, printable.scrollHeight);
  const pageHeightMm = calculateThermalPageHeightMm(bottom);
  const pageStyle = printDocument.createElement("style");
  pageStyle.dataset.thermalPageSize = "true";
  pageStyle.textContent = thermalPageCss(pageHeightMm);
  printDocument.head.appendChild(pageStyle);
  return pageHeightMm;
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

let activeSalePrint: { key: string; promise: Promise<"browser"> } | null = null;

/** Browser printing only: receipt first, then the stub, never twice at once. */
export async function printSaleReceiptAndStub(
  receipt: SaleReceiptData,
  runtime: PrintRuntime = {},
): Promise<"browser"> {
  validateSaleReceipt(receipt);
  const key = `${receipt.type}:${receipt.reference}:${receipt.date}`;
  if (activeSalePrint?.key === key) return activeSalePrint.promise;
  if (activeSalePrint) throw new Error("Une autre impression de vente est déjà en cours.");

  const printBrowser = runtime.printBrowser ?? printSaleReceiptInBrowser;
  const operation = printBrowser(receipt, ["receipt", "stub"]).then(() => "browser" as const);
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

  // jsPDF's built-in fonts have no narrow no-break space: use plain spaces.
  const pdfFc = (amount: number): string => formatFc(amount).replace(/[\u202f\u00a0]/g, " ");
  const netRows = () => {
    if (receipt.exchangeRate) {
      row("NET A PAYER", pdfFc(receipt.total * receipt.exchangeRate), true);
      row("Equivalent en $", pdfMoney(receipt.total));
      text(`Taux applique : 1 USD = ${pdfFc(receipt.exchangeRate)}`, 7);
    } else {
      row("NET A PAYER", pdfMoney(receipt.total), true);
    }
  };
  const promoLines = () => {
    const lines = doc.splitTextToSize(SALE_SYSTEM_PROMO.replace("\n", " "), 68) as string[];
    lines.forEach((promotionLine) => centered(promotionLine, 7, true));
  };

  const renderReceiptPage = (): number => {
    y = pdfTopAllowanceMm;
    centered(SALE_BUSINESS.name, 10, true);
    centered(SALE_BUSINESS.address, 7);
    centered(SALE_BUSINESS.registration, 7);
    line();
    centered("RECU DE VENTE", 9, true);
    text(`N° de recu: ${receipt.reference}`);
    text(`Date: ${receipt.date}`);
    text(`Client: ${customerLabel(receipt)}`);
    if (receipt.customerPhone && !receipt.isWalkIn) text(`Tel: ${receipt.customerPhone}`);
    text(`Servi par: ${receipt.salesPerson}`);
    text(`Paiement: ${paymentLabel(receipt.paymentMethod)}`);
    line();
    centered("DETAIL DES ARTICLES (USD)", 8, true);

    receipt.items.forEach((item, index) => {
      const names = doc.splitTextToSize(`${index + 1}. ${item.name}`, 68) as string[];
      names.forEach((name) => text(name, 8, true));
      row(`${item.quantity}${item.unit ? ` ${item.unit}` : ""} x ${pdfMoney(item.unitPrice)}`, pdfMoney(item.lineTotal));
    });
    line();
    if (receipt.discount + receipt.transportCost + receipt.tax + receipt.otherCharges > 0) row("Sous-total", pdfMoney(receipt.subtotal));
    if (receipt.discount > 0) row("Remise", `- ${pdfMoney(receipt.discount)}`);
    if (receipt.transportCost > 0) row("Transport", pdfMoney(receipt.transportCost));
    if (receipt.tax > 0) row("Taxes", pdfMoney(receipt.tax));
    if (receipt.otherCharges > 0) row("Autres frais", pdfMoney(receipt.otherCharges));
    netRows();
    line();
    centered(SALE_BUSINESS.thankYou, 7, true);
    centered(SALE_BUSINESS.salesNotice, 6);
    promoLines();
    return y;
  };

  const renderStubPage = (): number => {
    y = pdfTopAllowanceMm;
    centered("SOUCHE CAISSE - VENTE", 9, true);
    text(SALE_BUSINESS.name, 8, true);
    text(`N° de recu: ${receipt.reference}`);
    text(`Date: ${receipt.date}`);
    text(`Client: ${customerLabel(receipt)}`);
    text(`Servi par: ${receipt.salesPerson}`);
    text(`Paiement: ${paymentLabel(receipt.paymentMethod)}`);
    centered("ARTICLES (USD)", 8, true);
    receipt.items.forEach((item) => {
      const names = doc.splitTextToSize(`${item.quantity} x ${item.name}`, 58) as string[];
      names.forEach((name) => text(name, 7));
      row("", pdfMoney(item.lineTotal));
    });
    netRows();
    centered("SOUCHE DE CAISSE", 8, true);
    centered("A conserver", 7);
    promoLines();
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
