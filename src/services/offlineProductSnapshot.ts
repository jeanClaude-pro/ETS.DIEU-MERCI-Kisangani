// Maintains the operational snapshot offline sales need (Part E): active
// products (with the stock that becomes the local projection), the current
// exchange rate, and the permanent Walk-in Customer. Called opportunistically
// whenever NewSale.tsx successfully loads this same data online — this is
// not a background poller, since the offline scope is deliberately limited
// to the one POS screen for now.
import { serverUrl } from "../utils/constants/index.ts";
import { offlineDb, setLastSnapshotAt, type OfflineProduct } from "../lib/offlineDb.ts";

interface RawProduct {
  _id: string;
  name: string;
  category: string;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
  stock: number;
  minStock?: number;
  unit?: string;
  unitCost?: number;
  status?: "active" | "inactive";
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

export async function snapshotProducts(products: RawProduct[]): Promise<void> {
  const rows: OfflineProduct[] = products
    .filter((product) => product.region && product.regionCode)
    .map((product) => ({
      productId: product._id,
      name: product.name,
      category: product.category,
      region: product.region as "Butembo" | "China",
      regionCode: product.regionCode as "Bbbb" | "Cnnn",
      stock: product.stock,
      minStock: product.minStock ?? 0,
      unit: product.unit || "pcs",
      unitCost: product.unitCost ?? 0,
      status: product.status ?? "active",
    }));
  // Preserve the already-projected stock for products that still participate
  // in an unresolved local transaction. Once those rows synchronize, the
  // authoritative server quantity replaces the projection.
  await offlineDb.transaction("rw", offlineDb.products, offlineDb.offlineSales, async () => {
    const unresolved = await offlineDb.offlineSales
      .where("syncState")
      .anyOf(["PENDING", "PENDING_CONFIRMATION", "SYNCING", "FAILED_RETRYABLE", "CONFLICT", "FAILED_PERMANENT"])
      .toArray();
    const protectedIds = new Set(unresolved.flatMap((sale) => sale.payload.items.map((item) => item.productId)));
    const existing = new Map((await offlineDb.products.toArray()).map((product) => [product.productId, product]));
    const reconciled = rows.map((row) => protectedIds.has(row.productId) && existing.has(row.productId)
      ? { ...row, stock: existing.get(row.productId)!.stock }
      : row);
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

/** Convenience: fetch + cache everything in one call, used on POS screen mount. */
export async function refreshOfflineSnapshot(token: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const [productsRes, rateRes, walkInRes] = await Promise.all([
    fetch(`${serverUrl}/products/offline-snapshot`, { headers, cache: "no-store" }),
    fetch(`${serverUrl}/exchange-rates/current`, { headers }),
    fetch(`${serverUrl}/customers/walkin`, { headers }),
  ]);
  if (!productsRes.ok) throw new Error(`Operational product snapshot failed (${productsRes.status})`);
  const data = await productsRes.json();
  const list: RawProduct[] = Array.isArray(data?.products) ? data.products : [];
  await snapshotProducts(list);
  if (rateRes.ok) await snapshotExchangeRate(await rateRes.json());
  if (walkInRes.ok) await snapshotWalkInCustomer(await walkInRes.json());
  await setLastSnapshotAt(new Date().toISOString());
}
