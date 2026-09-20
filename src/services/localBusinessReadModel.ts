import { liveQuery, type Subscription } from "dexie";
import {
  offlineDb,
  type CachedServerSale,
  type OfflineSale,
  type SyncState,
} from "../lib/offlineDb.ts";
import { serverUrl } from "../utils/constants/index.ts";

export interface BusinessSaleItem {
  _id?: string;
  productId: string;
  name: string;
  unit?: string;
  quantity: number;
  price: number;
  total: number;
  subtotal?: number;
  unitCost?: number;
  cost?: number;
  profit?: number;
  discount?: number;
  tax?: number;
  transportCost?: number;
  otherCharges?: number;
  netTotal?: number;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
}

export interface BusinessSale {
  _id: string;
  saleId: string;
  clientSaleId?: string;
  receiptNumber?: string;
  barcodeToken?: string;
  customer: { name: string; phone: string; email: string; isWalkIn?: boolean };
  items: BusinessSaleItem[];
  subtotal: number;
  discount?: number;
  tax?: number;
  transportCost?: number;
  otherCharges?: number;
  total: number;
  cost?: number;
  profit?: number;
  paymentMethod: string;
  salesPerson?: string;
  status: string;
  type?: string;
  createdAt: string;
  updatedAt: string;
  exchangeRateSnapshot?: { rateId?: string | null; rate?: number; effectiveFrom?: string | null } | null;
  localSyncState?: SyncState;
  isLocalOnly?: boolean;
  [key: string]: unknown;
}

export interface SalesCoverage {
  start: string | null;
  end: string | null;
  updatedAt: string | null;
}

const cents = (value: unknown): number => Math.round((Number(value) || 0) * 100);
const money = (value: unknown): number => cents(value) / 100;
const text = (value: unknown): string => String(value ?? "");
const SERVER_SALE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function saleIdentity(sale: Pick<BusinessSale, "_id" | "clientSaleId">): string {
  return sale.clientSaleId ? `client:${sale.clientSaleId}` : `server:${sale._id}`;
}

function cachedRow(sale: BusinessSale, cachedAt: string): CachedServerSale {
  return {
    cacheKey: saleIdentity(sale),
    serverId: text(sale._id),
    clientSaleId: sale.clientSaleId || null,
    createdAt: new Date(sale.createdAt).toISOString(),
    type: text(sale.type || "sale"),
    status: text(sale.status || "completed"),
    cachedAt,
    sale: sale as unknown as Record<string, unknown>,
  };
}

export async function cacheServerSales(
  sales: readonly BusinessSale[],
  coverage?: { start: string; end: string },
): Promise<void> {
  const cachedAt = new Date().toISOString();
  await offlineDb.transaction("rw", offlineDb.cachedSales, offlineDb.syncMeta, async () => {
    if (coverage) {
      await offlineDb.cachedSales.where("createdAt").between(coverage.start, coverage.end, true, true).delete();
    }
    if (sales.length) await offlineDb.cachedSales.bulkPut(sales.map((sale) => cachedRow(sale, cachedAt)));
    // Bound offline history deliberately; unresolved/local financial rows live
    // in offlineSales and are never removed by this cache retention policy.
    const retentionCutoff = new Date(Date.now() - SERVER_SALE_RETENTION_MS).toISOString();
    await offlineDb.cachedSales.where("createdAt").below(retentionCutoff).delete();
    if (coverage) {
      await offlineDb.syncMeta.bulkPut([
        { key: "salesCoverageStart", value: coverage.start },
        { key: "salesCoverageEnd", value: coverage.end },
        { key: "salesSnapshotAt", value: cachedAt },
      ]);
    }
  });
}

export async function getSalesCoverage(): Promise<SalesCoverage> {
  const [start, end, updatedAt] = await Promise.all([
    offlineDb.syncMeta.get("salesCoverageStart"),
    offlineDb.syncMeta.get("salesCoverageEnd"),
    offlineDb.syncMeta.get("salesSnapshotAt"),
  ]);
  return { start: start?.value ?? null, end: end?.value ?? null, updatedAt: updatedAt?.value ?? null };
}

export async function refreshBusinessSalesSnapshot(token: string): Promise<SalesCoverage> {
  const response = await fetch(`${serverUrl}/sales/offline-snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Sales snapshot failed (${response.status})`);
  const body = await response.json() as {
    sales?: BusinessSale[];
    coverage?: { start?: string; end?: string; complete?: boolean };
  };
  const start = text(body.coverage?.start);
  const end = text(body.coverage?.end);
  if (!start || !end || body.coverage?.complete !== true || !Array.isArray(body.sales)) {
    throw new Error("Incomplete sales snapshot was not cached");
  }
  await cacheServerSales(body.sales, { start, end });
  return getSalesCoverage();
}

export function offlineSaleToBusinessSale(row: OfflineSale): BusinessSale {
  const items = row.payload.items.map((item, index) => {
    const subtotal = money(cents(item.price) * Number(item.quantity) / 100);
    const cost = money(cents(item.unitCost) * Number(item.quantity) / 100);
    return {
      _id: `${row.clientSaleId}:${index}`,
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      quantity: Number(item.quantity),
      price: money(item.price),
      total: subtotal,
      subtotal,
      unitCost: money(item.unitCost),
      cost,
      netTotal: subtotal,
      profit: money(subtotal - cost),
      region: item.region,
      regionCode: item.regionCode,
    } satisfies BusinessSaleItem;
  });
  const totalCost = money(items.reduce((sum, item) => sum + cents(item.cost), 0) / 100);
  return {
    _id: row.syncedSaleId || row.clientSaleId,
    saleId: row.receiptNumber,
    clientSaleId: row.clientSaleId,
    receiptNumber: row.receiptNumber,
    barcodeToken: row.barcodeToken,
    customer: row.payload.customer,
    items,
    subtotal: money(row.payload.subtotal),
    discount: 0,
    tax: 0,
    transportCost: 0,
    otherCharges: 0,
    total: money(row.payload.total),
    cost: totalCost,
    profit: money(Number(row.payload.total) - totalCost),
    paymentMethod: row.payload.paymentMethod,
    salesPerson: row.payload.salesPerson,
    status: "completed",
    type: "sale",
    createdAt: row.occurredAt,
    updatedAt: row.syncedAt || row.createdAt,
    exchangeRateSnapshot: row.payload.exchangeRateSnapshot,
    localSyncState: row.syncState,
    isLocalOnly: row.syncState !== "SYNCED",
  };
}

/** Base snapshot + stable-identity local deltas. A clientSaleId can appear once only. */
export async function getMergedBusinessSales(range?: { start: Date; end: Date }): Promise<BusinessSale[]> {
  const cachedQuery = range
    ? offlineDb.cachedSales.where("createdAt").between(range.start.toISOString(), range.end.toISOString(), true, true).toArray()
    : offlineDb.cachedSales.toArray();
  const localQuery = range
    ? offlineDb.offlineSales.where("occurredAt").between(range.start.toISOString(), range.end.toISOString(), true, true).toArray()
    : offlineDb.offlineSales.toArray();
  const [cached, local] = await Promise.all([
    cachedQuery,
    localQuery,
  ]);
  const merged = new Map<string, BusinessSale>();
  for (const row of cached) {
    const sale = row.sale as unknown as BusinessSale;
    merged.set(row.cacheKey, sale);
  }
  for (const row of local) {
    const localSale = offlineSaleToBusinessSale(row);
    const key = `client:${row.clientSaleId}`;
    const serverSale = merged.get(key);
    merged.set(key, serverSale
      ? { ...serverSale, localSyncState: row.syncState, isLocalOnly: false }
      : localSale);
  }
  return [...merged.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || b._id.localeCompare(a._id));
}

export function subscribeMergedBusinessSales(
  next: (sales: BusinessSale[]) => void,
  error?: (error: unknown) => void,
  range?: { start: Date; end: Date },
): Subscription {
  return liveQuery(() => getMergedBusinessSales(range)).subscribe({ next, error });
}

export async function cacheReport(key: string, payload: Record<string, unknown>, start: string, end: string): Promise<void> {
  await offlineDb.cachedReports.put({ key, payload, start, end, cachedAt: new Date().toISOString() });
}

export async function getCachedReport(key: string) {
  return offlineDb.cachedReports.get(key);
}
