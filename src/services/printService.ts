import jsPDF from "jspdf";

const API_BASE = import.meta.env?.VITE_API_URL ?? "";

export const SALE_BUSINESS = Object.freeze({
  name: "Boutique C'EST DIEU QUI PARTAGE",
  address: "Av du 1er Janvier N°13, C. Makiso, Kisangani",
  registration: "RCCM/KIS : 22-A-267",
});

export type ReceiptDocumentType = "sale" | "reservation";

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

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stringValue = (value: unknown): string => String(value ?? "").trim();
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

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
    exchangeRate: overrides.exchangeRate || snapshotRate || undefined,
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

export function buildSaleReceiptHtml(receipt: SaleReceiptData): string {
  const isReservation = receipt.type === "reservation";
  const documentTitle = isReservation ? "REÇU DE RÉSERVATION" : "REÇU DE VENTE";
  const stubTitle = isReservation ? "SOUCHE RÉSERVATION" : "SOUCHE VENTE";
  const customerName = receipt.isWalkIn && receipt.customerName === "Walk-in Customer"
    ? "Client de passage"
    : receipt.customerName;
  const schedule = isReservation && (receipt.reservationDate || receipt.reservationTime)
    ? `<div><strong>Retrait:</strong> ${escapeHtml([receipt.reservationDate, receipt.reservationTime].filter(Boolean).join(" à "))}</div>`
    : "";
  const fcTotal = receipt.exchangeRate
    ? `<div class="total-row secondary"><span>Total FC</span><strong>${formatFc(receipt.total * receipt.exchangeRate)}</strong></div>
       <div class="rate">Taux enregistré: 1 USD = ${formatFc(receipt.exchangeRate)}</div>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${documentTitle} ${escapeHtml(receipt.reference)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    body { width: 80mm; margin: 0; padding: 2.5mm; color: #000; background: #fff; font: 11px/1.25 "Courier New", monospace; }
    .document { width: 75mm; margin: 0 auto; }
    .center { text-align: center; }
    .business { font-size: 14px; font-weight: 800; line-height: 1.15; }
    .business-meta { margin-top: 1mm; font-size: 9.5px; }
    .rule { border-top: 1px dashed #000; margin: 2mm 0; }
    .double-rule { border-top: 2px double #000; margin: 2mm 0; }
    .title { margin: 1.5mm 0; text-align: center; font-size: 12px; font-weight: 800; }
    .meta, .customer, .reservation { display: grid; gap: .6mm; }
    .items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 1mm; }
    .items th { border-bottom: 1px solid #000; padding: 1mm 0; font-size: 9.5px; text-align: left; }
    .items td { padding: 1mm 0; vertical-align: top; }
    .items .description { width: 47%; overflow-wrap: anywhere; }
    .items .quantity { width: 25%; text-align: center; }
    .items .amount { width: 28%; text-align: right; }
    .region { font-size: 9px; }
    .totals { margin-left: auto; width: 100%; }
    .total-row { display: flex; justify-content: space-between; gap: 3mm; margin: .7mm 0; }
    .grand-total { padding-top: 1mm; border-top: 1px solid #000; font-size: 13px; }
    .secondary, .rate { font-size: 9.5px; }
    .rate { text-align: right; }
    .footer { margin-top: 2mm; text-align: center; font-size: 9.5px; }
    .cut { margin: 3mm 0 2mm; text-align: center; border-top: 1px dashed #000; padding-top: 1mm; font-size: 9px; }
    .stub { border: 1px solid #000; padding: 2mm; break-inside: avoid; }
    .stub .business { font-size: 11px; }
    .stub-grid { display: grid; gap: .8mm; margin-top: 1.5mm; }
    .stub-total { display: flex; justify-content: space-between; border-top: 1px solid #000; margin-top: 1mm; padding-top: 1mm; font-size: 12px; }
    @media screen { body { margin: 8px auto; box-shadow: 0 0 12px #bbb; } }
    @media print { body { padding: 2mm; } .document { width: 75mm; } }
  </style>
</head>
<body>
  <main class="document">
    <header class="center">
      <div class="business">${SALE_BUSINESS.name}</div>
      <div class="business-meta">${SALE_BUSINESS.address}</div>
      <div class="business-meta">${SALE_BUSINESS.registration}</div>
    </header>
    <div class="double-rule"></div>
    <div class="title">${documentTitle}${isReservation ? ` — ${escapeHtml(receipt.status.toUpperCase())}` : ""}</div>
    <section class="meta">
      <div><strong>Référence:</strong> ${escapeHtml(receipt.reference)}</div>
      <div><strong>Date:</strong> ${escapeHtml(receipt.date)}</div>
      ${schedule}
    </section>
    <div class="rule"></div>
    <section class="customer">
      <div><strong>Client:</strong> ${escapeHtml(customerName)}</div>
      ${receipt.customerPhone ? `<div><strong>Tél:</strong> ${escapeHtml(receipt.customerPhone)}</div>` : ""}
      ${receipt.customerEmail ? `<div><strong>Email:</strong> ${escapeHtml(receipt.customerEmail)}</div>` : ""}
    </section>
    <table class="items">
      <thead><tr><th class="description">Article</th><th class="quantity">Qté × PU</th><th class="amount">Montant</th></tr></thead>
      <tbody>${receipt.items.map((item) => `<tr>
        <td class="description">${escapeHtml(item.name)}${item.regionCode ? `<div class="region">${escapeHtml(item.regionCode)}</div>` : ""}</td>
        <td class="quantity">${item.quantity} × ${formatUsd(item.unitPrice)}</td>
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
    <div><strong>Paiement:</strong> ${escapeHtml(receipt.paymentMethod.toUpperCase())}</div>
    <div><strong>Agent:</strong> ${escapeHtml(receipt.salesPerson)}</div>
    ${isReservation && receipt.notes ? `<div class="reservation"><strong>Notes:</strong> ${escapeHtml(receipt.notes)}</div>` : ""}
    <footer class="footer">Merci pour votre confiance.<br>Marchandises vendues non reprises, non échangées.</footer>

    <div class="cut">✂ — — — — — — — — — — — — — — — ✂</div>

    <section class="stub">
      <div class="center business">${SALE_BUSINESS.name}</div>
      <div class="title">${stubTitle}</div>
      <div class="stub-grid">
        <div><strong>Réf:</strong> ${escapeHtml(receipt.reference)}</div>
        <div><strong>Date:</strong> ${escapeHtml(receipt.date)}</div>
        ${schedule}
        <div><strong>Client:</strong> ${escapeHtml(customerName)}</div>
        <div><strong>Paiement:</strong> ${escapeHtml(receipt.paymentMethod.toUpperCase())}</div>
        <div><strong>Agent:</strong> ${escapeHtml(receipt.salesPerson)}</div>
      </div>
      <div class="stub-total"><span>TOTAL</span><strong>${formatUsd(receipt.total)}</strong></div>
    </section>
  </main>
  <script>
    window.addEventListener("load", function () {
      window.print();
      window.setTimeout(function () { window.close(); }, 1000);
    });
  </script>
</body>
</html>`;
}

export function printSaleReceiptInBrowser(receipt: SaleReceiptData): boolean {
  const printWindow = window.open("", "_blank", "width=380,height=720");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildSaleReceiptHtml(receipt));
  printWindow.document.close();
  return true;
}

async function printSaleReceiptOnUsb(receipt: SaleReceiptData): Promise<void> {
  const response = await fetch(`${API_BASE}/print/sale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    },
    body: JSON.stringify({ receiptData: receipt, type: receipt.type }),
  });
  if (!response.ok) throw new Error(`Impression thermique indisponible (${response.status})`);
}

/** One call always outputs the detailed receipt and its compact stub. */
export async function printSaleReceiptAndStub(receipt: SaleReceiptData): Promise<"usb" | "browser"> {
  try {
    await printSaleReceiptOnUsb(receipt);
    return "usb";
  } catch (error) {
    console.warn("Imprimante USB indisponible, utilisation de l'impression navigateur.", error);
    if (!printSaleReceiptInBrowser(receipt)) {
      throw new Error("La fenêtre d'impression a été bloquée par le navigateur.");
    }
    return "browser";
  }
}

const pdfMoney = (amount: number): string => `${amount.toFixed(2)} USD`;

/** PDF export uses the same normalized saved transaction and includes its stub. */
export function downloadSaleReceiptAndStubPdf(receipt: SaleReceiptData): void {
  const adjustmentCount = [receipt.discount, receipt.tax, receipt.transportCost, receipt.otherCharges]
    .filter((amount) => amount > 0).length;
  const pageHeight = Math.max(175, 128 + receipt.items.length * 11 + adjustmentCount * 5);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, pageHeight] });
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
  text(`Client: ${receipt.customerName}`);
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
  y += 2;
  doc.setLineDashPattern([1, 1], 0);
  line();
  centered(receipt.type === "reservation" ? "SOUCHE RESERVATION" : "SOUCHE VENTE", 9, true);
  text(SALE_BUSINESS.name, 8, true);
  text(`Ref: ${receipt.reference}`);
  text(`Date: ${receipt.date}`);
  text(`Client: ${receipt.customerName}`);
  text(`Paiement: ${receipt.paymentMethod.toUpperCase()}`);
  row("TOTAL", pdfMoney(receipt.total), true);
  text(`Agent: ${receipt.salesPerson}`);

  doc.save(`recu-${receipt.reference}.pdf`);
}
