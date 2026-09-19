// Maintains the operational snapshot offline sales need (Part E): active
// products (with the stock that becomes the local projection), the current
// exchange rate, and the permanent Walk-in Customer through a local-first
// read, atomic authenticated refresh, and Dexie subscription.
import { serverUrl } from "../utils/constants/index.ts";
import { liveQuery } from "dexie";
import { offlineDb, type OfflineProduct } from "../lib/offlineDb.ts";

interface RawProduct {
  _id: string;
  name: string;
  category?: string;
  sku?: string;
  price?: number;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
  stock: number;
  minStock?: number;
  unit?: string;
  unitCost?: number;
  status?: "active" | "inactive";
  updatedAt?: string;
}

interface RawExchangeRate {
  _id: string;
  rate: number;
  effectiveFrom: string;
}

interface RawWalkInCustomer {
  _id: string;
  name: string;
  phone: string;
}

export interface PosOperationalSnapshot {
  products: OfflineProduct[];
  exchangeRate: {
    _id: string;
    rate: number;
    effectiveFrom: string;
    lastUpdated: string;
  } | null;
  walkInCustomer: RawWalkInCustomer | null;
  lastUpdated: string | null;
}

function validateProducts(value: unknown): RawProduct[] {
  if (!Array.isArray(value)) throw new Error("Invalid operational product snapshot");
  const products = value as RawProduct[];
  if (products.some((product) => !product?._id || !product.name || !Number.isFinite(product.stock))) {
    throw new Error("Invalid product in operational snapshot");
  }
  return products;
}

function toOfflineProducts(products: RawProduct[], synchronizedAt: string): OfflineProduct[] {
  return products
    .filter((product) => product.region && product.regionCode)
    .map((product) => ({
      productId: product._id,
      name: product.name,
      category: product.category,
      sku: product.sku,
      price: product.price,
      region: product.region as "Butembo" | "China",
      regionCode: product.regionCode as "Bbbb" | "Cnnn",
      stock: product.stock,
      minStock: product.minStock ?? 0,
      unit: product.unit || "pcs",
      unitCost: product.unitCost ?? 0,
      status: product.status ?? "active",
      serverUpdatedAt: product.updatedAt,
      synchronizedAt,
    }));
}

async function reconcileProjectedStock(rows: OfflineProduct[]): Promise<OfflineProduct[]> {
  const unresolved = await offlineDb.offlineSales
    .where("syncState")
    .anyOf(["PENDING", "PENDING_CONFIRMATION", "SYNCING", "FAILED_RETRYABLE", "CONFLICT", "FAILED_PERMANENT"])
    .toArray();
  const protectedIds = new Set(unresolved.flatMap((sale) => sale.payload.items.map((item) => item.productId)));
  const existing = new Map((await offlineDb.products.toArray()).map((product) => [product.productId, product]));
  return rows.map((row) => protectedIds.has(row.productId) && existing.has(row.productId)
    ? { ...row, stock: existing.get(row.productId)!.stock }
    : row);
}

export async function snapshotProducts(products: RawProduct[]): Promise<void> {
  const rows = toOfflineProducts(validateProducts(products), new Date().toISOString());
  // Preserve the already-projected stock for products that still participate
  // in an unresolved local transaction. Once those rows synchronize, the
  // authoritative server quantity replaces the projection.
  await offlineDb.transaction("rw", offlineDb.products, offlineDb.offlineSales, async () => {
    const reconciled = await reconcileProjectedStock(rows);
    await offlineDb.products.clear();
    await offlineDb.products.bulkPut(reconciled);
  });
}

export async function snapshotExchangeRate(rate: RawExchangeRate): Promise<void> {
  await offlineDb.exchangeRateCache.put({
    id: "current",
    rateId: rate._id,
    rate: rate.rate,
    effectiveFrom: rate.effectiveFrom,
    cachedAt: new Date().toISOString(),
  });
}

export async function snapshotWalkInCustomer(customer: RawWalkInCustomer): Promise<void> {
  await offlineDb.syncMeta.put({ key: "walkInCustomer", value: JSON.stringify(customer) });
}

export async function getCachedWalkInCustomer(): Promise<RawWalkInCustomer | null> {
  const row = await offlineDb.syncMeta.get("walkInCustomer");
  return row ? (JSON.parse(row.value) as RawWalkInCustomer) : null;
}

/** Durable state used by POS. Safe to call independently on every mount. */
export async function readLocal(): Promise<PosOperationalSnapshot> {
  const [products, rate, customerRow, timestampRow] = await Promise.all([
    offlineDb.products.where("status").equals("active").sortBy("name"),
    offlineDb.exchangeRateCache.get("current"),
    offlineDb.syncMeta.get("walkInCustomer"),
    offlineDb.syncMeta.get("lastSnapshotAt"),
  ]);
  let walkInCustomer: RawWalkInCustomer | null = null;
  try {
    walkInCustomer = customerRow ? JSON.parse(customerRow.value) as RawWalkInCustomer : null;
  } catch {
    walkInCustomer = null;
  }
  return {
    products,
    exchangeRate: rate ? {
      _id: rate.rateId || "cached",
      rate: rate.rate,
      effectiveFrom: rate.effectiveFrom || rate.cachedAt,
      lastUpdated: rate.cachedAt,
    } : null,
    walkInCustomer,
    lastUpdated: timestampRow?.value ?? null,
  };
}

export function subscribeLocal(
  next: (snapshot: PosOperationalSnapshot) => void,
  error: (cause: unknown) => void,
): () => void {
  const subscription = liveQuery(readLocal).subscribe({ next, error });
  return () => subscription.unsubscribe();
}

/** Convenience: fetch + cache everything in one call, used on POS screen mount. */
export async function refreshFromServer(token: string): Promise<void> {
  if (!token) throw new Error("Online authentication is required to refresh POS data");
  const headers = { Authorization: `Bearer ${token}` };
  const [productsRes, rateRes, walkInRes] = await Promise.all([
    fetch(`${serverUrl}/products/offline-snapshot`, { headers, cache: "no-store" }),
    fetch(`${serverUrl}/exchange-rates/current`, { headers }),
    fetch(`${serverUrl}/customers/walkin`, { headers }),
  ]);
  if (!productsRes.ok || !rateRes.ok || !walkInRes.ok) {
    throw new Error(`Operational refresh failed (${productsRes.status}/${rateRes.status}/${walkInRes.status})`);
  }
  const [productPayload, rate, walkIn] = await Promise.all([
    productsRes.json(), rateRes.json() as Promise<RawExchangeRate>, walkInRes.json() as Promise<RawWalkInCustomer>,
  ]);
  const synchronizedAt = new Date().toISOString();
  const rows = toOfflineProducts(validateProducts(productPayload?.products), synchronizedAt);
  if (!Number.isFinite(rate?.rate) || rate.rate <= 0 || !walkIn?._id || !walkIn.name) {
    throw new Error("Invalid POS metadata returned by server");
  }

  // All trusted operational data changes together. A failed refresh leaves
  // the prior snapshot completely intact.
  await offlineDb.transaction(
    "rw",
    offlineDb.products,
    offlineDb.offlineSales,
    offlineDb.exchangeRateCache,
    offlineDb.syncMeta,
    async () => {
      const reconciled = await reconcileProjectedStock(rows);
      await offlineDb.products.clear();
      await offlineDb.products.bulkPut(reconciled);
      await offlineDb.exchangeRateCache.put({
        id: "current", rateId: rate._id, rate: rate.rate,
        effectiveFrom: rate.effectiveFrom, cachedAt: synchronizedAt,
      });
      await offlineDb.syncMeta.bulkPut([
        { key: "walkInCustomer", value: JSON.stringify(walkIn) },
        { key: "lastSnapshotAt", value: synchronizedAt },
      ]);
    },
  );
}

export const refreshOfflineSnapshot = refreshFromServer;
export const initializePosData = readLocal;
