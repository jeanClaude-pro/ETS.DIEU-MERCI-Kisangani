import type { RegionCode, RegionCodeFilter } from "../types";

export type ItemRegionCode = RegionCode | "Unknown";

export interface RegionalSaleItem {
  productId?: string;
  name?: string;
  region?: string;
  regionCode?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
  subtotal?: number;
  total?: number;
  unitCost?: number;
  cost?: number;
  profit?: number;
  discount?: number;
  tax?: number;
  transportCost?: number;
  otherCharges?: number;
  netTotal?: number;
}

export interface RegionalSaleLike {
  items?: RegionalSaleItem[];
  subtotal?: number;
  total: number;
  discount?: number;
  tax?: number;
  transportCost?: number;
  otherCharges?: number;
  cost?: number;
  profit?: number;
  status?: string;
  type?: string;
}

const VALID_CODES: RegionCode[] = ["Bbbb", "Cnnn"];
const CENTS = 100;

export const roundCurrency = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * CENTS) / CENTS;

export const getItemSubtotal = (item: RegionalSaleItem): number => {
  if (Number.isFinite(item.subtotal)) return roundCurrency(Number(item.subtotal));
  if (Number.isFinite(item.total)) return roundCurrency(Number(item.total));
  const price = Number(item.price ?? item.unitPrice ?? 0);
  const quantity = Number(item.quantity ?? 0);
  return roundCurrency(price * quantity);
};

export const getItemRegionCode = (item: RegionalSaleItem): ItemRegionCode =>
  VALID_CODES.includes(item.regionCode as RegionCode)
    ? item.regionCode as RegionCode
    : item.region === "Butembo"
      ? "Bbbb"
      : item.region === "China"
        ? "Cnnn"
        : "Unknown";

function allocateCurrencyByRegion(
  amount: number,
  items: readonly RegionalSaleItem[],
): Record<ItemRegionCode, number> {
  const weights: Record<ItemRegionCode, number> = { Bbbb: 0, Cnnn: 0, Unknown: 0 };
  for (const item of items) weights[getItemRegionCode(item)] += getItemSubtotal(item);
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return { Bbbb: 0, Cnnn: 0, Unknown: 0 };

  const amountCents = Math.round(amount * CENTS);
  const codes: ItemRegionCode[] = ["Bbbb", "Cnnn", "Unknown"];
  const exact = codes.map((code) => ({ code, value: amountCents * weights[code] / totalWeight }));
  const cents: Record<ItemRegionCode, number> = { Bbbb: 0, Cnnn: 0, Unknown: 0 };
  for (const entry of exact) cents[entry.code] = Math.trunc(entry.value);
  let remaining = amountCents - Object.values(cents).reduce((sum, value) => sum + value, 0);
  exact
    .sort((a, b) => (b.value - Math.trunc(b.value)) - (a.value - Math.trunc(a.value)))
    .forEach(({ code }) => {
      if (remaining > 0) { cents[code] += 1; remaining -= 1; }
      if (remaining < 0) { cents[code] -= 1; remaining += 1; }
    });
  return { Bbbb: cents.Bbbb / CENTS, Cnnn: cents.Cnnn / CENTS, Unknown: cents.Unknown / CENTS };
}

function allocateCurrencyByItem(amount: number, items: readonly RegionalSaleItem[]): number[] {
  const weights = items.map(getItemSubtotal);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  const amountCents = Math.round(amount * CENTS);
  const exact = weights.map((weight, index) => ({ index, value: amountCents * weight / totalWeight }));
  const cents = exact.map(({ value }) => Math.trunc(value));
  let remaining = amountCents - cents.reduce((sum, value) => sum + value, 0);
  for (const { index } of exact.sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (remaining > 0) { cents[index] += 1; remaining -= 1; }
    if (remaining < 0) { cents[index] -= 1; remaining += 1; }
  }
  return cents.map((value) => value / CENTS);
}

const allocated = (sale: RegionalSaleLike, field: keyof RegionalSaleLike, code: RegionCode): number =>
  allocateCurrencyByRegion(Number(sale[field] ?? 0), sale.items ?? [])[code];

/** Returns a new logical sale portion. The input sale and its items are never mutated. */
export function projectSaleToRegion<T extends RegionalSaleLike>(
  sale: T,
  region: RegionCodeFilter,
): T | null {
  if (!region) return sale;
  const sourceItems = sale.items ?? [];
  const discounts = allocateCurrencyByItem(Number(sale.discount || 0), sourceItems);
  const taxes = allocateCurrencyByItem(Number(sale.tax || 0), sourceItems);
  const transports = allocateCurrencyByItem(Number(sale.transportCost || 0), sourceItems);
  const others = allocateCurrencyByItem(Number(sale.otherCharges || 0), sourceItems);
  const allItems = sourceItems.map((item, index) => {
    const subtotal = getItemSubtotal(item);
    const cost = Number.isFinite(item.cost) ? Number(item.cost) : Number(item.unitCost ?? 0) * Number(item.quantity ?? 0);
    const netTotal = roundCurrency(subtotal - discounts[index] + taxes[index] + transports[index] + others[index]);
    return {
      ...item,
      subtotal,
      discount: discounts[index],
      tax: taxes[index],
      transportCost: transports[index],
      otherCharges: others[index],
      netTotal,
      cost: roundCurrency(cost),
      profit: roundCurrency(netTotal - cost),
    };
  });
  const items = allItems.filter((item) => getItemRegionCode(item) === region);
  if (items.length === 0) return null;

  const subtotal = roundCurrency(items.reduce((sum, item) => sum + getItemSubtotal(item), 0));
  const cost = roundCurrency(items.reduce((sum, item) =>
    sum + (Number.isFinite(item.cost) ? Number(item.cost) : Number(item.unitCost ?? 0) * Number(item.quantity ?? 0)), 0));
  const total = allocated(sale, "total", region);
  return {
    ...sale,
    items,
    subtotal,
    total,
    discount: allocated(sale, "discount", region),
    tax: allocated(sale, "tax", region),
    transportCost: allocated(sale, "transportCost", region),
    otherCharges: allocated(sale, "otherCharges", region),
    cost,
    profit: roundCurrency(total - cost),
  };
}

export function projectSalesToRegion<T extends RegionalSaleLike>(
  sales: readonly T[],
  region: RegionCodeFilter,
): T[] {
  if (!region) return [...sales];
  return sales.map((sale) => projectSaleToRegion(sale, region)).filter((sale): sale is T => sale !== null);
}

export const getSaleUnits = (sale: RegionalSaleLike): number =>
  (sale.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);

export const isReportableSale = (sale: RegionalSaleLike): boolean => {
  const status = String(sale.status || "completed").toLowerCase();
  return sale.type !== "expense" && ![
    "voided", "cancelled", "refunded", "corrected", "deleted", "expense", "depense",
  ].includes(status);
};
