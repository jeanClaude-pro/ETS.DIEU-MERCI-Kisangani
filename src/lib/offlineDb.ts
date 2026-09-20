import Dexie, { type Table } from "dexie";

// Explicit, purpose-built offline stores for the POS's offline-sales scope
// only (Part D/E) — not a dump of arbitrary application state. Nothing here
// stores passwords or raw authentication secrets; the existing
// localStorage token/user cache (written by AuthProvider) is reused as-is
// for offline authorization checks.

export type SyncState =
  | "PENDING"
  | "PENDING_CONFIRMATION"
  | "SYNCING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT";

// Cached operational product snapshot. `stock` doubles as the local stock
// projection: it starts as the last trusted server value and is decremented
// per offline sale; it is wholesale-refreshed from the server whenever
// online (Part G — MongoDB stays authoritative, this is never written back).
export interface OfflineProduct {
  productId: string;
  name: string;
  /** Retained for compatibility with the stock module; POS never depends on it. */
  category?: string;
  sku?: string;
  price?: number;
  region: "Butembo" | "China";
  regionCode: "Bbbb" | "Cnnn";
  stock: number;
  minStock: number;
  unit: string;
  unitCost: number;
  status: "active" | "inactive";
  serverUpdatedAt?: string;
  synchronizedAt?: string;
}

export interface OfflineExchangeRate {
  id: "current";
  rateId: string | null;
  rate: number;
  effectiveFrom: string | null;
  cachedAt: string;
}

// Minimal cached category list for the NewSale category filter — mirrors
// the server's Category model just enough to render/filter offline; nothing
// else about a category is needed on this device.
export interface OfflineCategory {
  id: string; // Mongo _id
  name: string;
}

// A device/user authorized for offline PIN login (Part K). Only a salted
// PBKDF2 verifier is stored — never the PIN itself. `offlineModules` is a
// capped allowlist decided at setup time (never the user's full permission
// set), so knowing the PIN can never grant more than baseline POS access.
export interface OfflineUserAuthorization {
  userId: string; // PK — server User _id
  deviceId: string;
  username: string;
  role: string;
  offlineModules: string[];
  salt: string; // base64
  verifier: string; // base64 PBKDF2 output
  authorizedAt: string;
  updatedAt: string;
}

// Brute-force lockout bookkeeping, kept separate from the credential row so
// it survives independently and a page refresh can never reset it.
export interface OfflineAuthAttemptState {
  userId: string; // PK
  failedAttempts: number;
  lockedUntil: string | null; // ISO, or null when not locked
}

// The exact request body the offline sync endpoint (`POST /api/sales/sync`)
// expects, generated at the moment of an offline sale and never mutated
// afterward — the barcode/receipt identity in it is permanent (Part A).
export interface OfflineSalePayload {
  customer: { name: string; phone: string; email: string; isWalkIn?: boolean };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
    region: "Butembo" | "China";
    regionCode: "Bbbb" | "Cnnn";
    unit?: string;
    unitCost?: number;
  }>;
  subtotal: number;
  total: number;
  paymentMethod: string;
  salesPerson: string;
  exchangeRateSnapshot: { rateId: string | null; rate: number; effectiveFrom: string | null } | null;
  clientSaleId: string;
  barcodeToken: string;
  receiptNumber: string;
  clientOccurredAt: string;
  origin: "offline" | "online";
}

export interface OfflineSale {
  clientSaleId: string; // primary key
  barcodeToken: string;
  receiptNumber: string;
  occurredAt: string; // ISO — the true transaction time, never overwritten
  payload: OfflineSalePayload;
  // Denormalized so the receipt/stub can be printed and reprinted instantly
  // without recomputation, exactly as originally issued.
  receiptSnapshot: unknown;
  syncState: SyncState;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  syncedSaleId: string | null; // server _id once SYNCED, for cross-reference
  syncedAt: string | null;
  createdAt: string; // local wall-clock time the sale was saved to IndexedDB
}

export interface StockMovement {
  id?: number; // auto-increment
  productId: string;
  clientSaleId: string;
  quantityDelta: number; // negative for consumption
  occurredAt: string;
}

export interface SyncMetaRow {
  key: "deviceId" | "lastSnapshotAt" | "walkInCustomer" | "lastCleanupAt" |
    "salesCoverageStart" | "salesCoverageEnd" | "salesSnapshotAt";
  value: string;
}

/** Server-confirmed sale retained as the durable base of the local read model. */
export interface CachedServerSale {
  cacheKey: string;
  serverId: string;
  clientSaleId: string | null;
  createdAt: string;
  type: string;
  status: string;
  cachedAt: string;
  sale: Record<string, unknown>;
}

export interface CachedReport {
  key: string;
  cachedAt: string;
  start: string;
  end: string;
  payload: Record<string, unknown>;
}

export interface CachedCustomer {
  id: string;
  phone: string;
  name: string;
  cachedAt: string;
  customer: Record<string, unknown>;
}

class OfflineDatabase extends Dexie {
  products!: Table<OfflineProduct, string>;
  exchangeRateCache!: Table<OfflineExchangeRate, string>;
  offlineSales!: Table<OfflineSale, string>;
  stockMovements!: Table<StockMovement, number>;
  syncMeta!: Table<SyncMetaRow, string>;
  categories!: Table<OfflineCategory, string>;
  offlineUsers!: Table<OfflineUserAuthorization, string>;
  offlineAuthState!: Table<OfflineAuthAttemptState, string>;
  cachedSales!: Table<CachedServerSale, string>;
  cachedReports!: Table<CachedReport, string>;
  cachedCustomers!: Table<CachedCustomer, string>;

  constructor() {
    super("cdp-pos-offline");
    this.version(1).stores({
      products: "productId, category, region, regionCode, status",
      exchangeRateCache: "id",
      offlineSales: "clientSaleId, syncState, occurredAt, barcodeToken",
      stockMovements: "++id, productId, clientSaleId, occurredAt",
      syncMeta: "key",
    });
    // Additive only — every v1 store keeps its exact definition/data.
    this.version(2).stores({
      categories: "id, name",
      offlineUsers: "userId, deviceId",
      offlineAuthState: "userId",
    });
    // Durable ERP read model. Existing offline queues and stock projections
    // remain untouched; these stores add a server base snapshot only.
    this.version(3).stores({
      cachedSales: "cacheKey, serverId, clientSaleId, createdAt, type, status",
      cachedReports: "key, cachedAt, start, end",
      cachedCustomers: "id, phone, name, cachedAt",
    });
  }
}

export const offlineDb = new OfflineDatabase();

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await offlineDb.syncMeta.get("deviceId");
  if (existing) return existing.value;
  const deviceId = crypto.randomUUID();
  await offlineDb.syncMeta.put({ key: "deviceId", value: deviceId });
  return deviceId;
}

export async function getLastSnapshotAt(): Promise<string | null> {
  const row = await offlineDb.syncMeta.get("lastSnapshotAt");
  return row?.value ?? null;
}

export async function setLastSnapshotAt(iso: string): Promise<void> {
  await offlineDb.syncMeta.put({ key: "lastSnapshotAt", value: iso });
}

/**
 * Atomically persists an offline sale together with its local stock
 * projection and audit ledger entry (Part F/G). If this throws, nothing was
 * written — the caller must not report the sale as saved or print from it.
 */
export async function commitOfflineSale(
  sale: OfflineSale,
  stockDeltas: Array<{ productId: string; quantityDelta: number }>
): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.offlineSales, offlineDb.products, offlineDb.stockMovements, async () => {
    await offlineDb.offlineSales.add(sale);
    for (const { productId, quantityDelta } of stockDeltas) {
      const product = await offlineDb.products.get(productId);
      if (product) {
        await offlineDb.products.update(productId, { stock: product.stock + quantityDelta });
      }
      await offlineDb.stockMovements.add({
        productId,
        clientSaleId: sale.clientSaleId,
        quantityDelta,
        occurredAt: sale.occurredAt,
      });
    }
  });
}

export async function getPendingOfflineSales(): Promise<OfflineSale[]> {
  // SYNCING is included deliberately: if the browser/PWA was terminated in
  // the middle of a request, that durable row must be retried idempotently
  // after restart instead of remaining stuck forever.
  return offlineDb.offlineSales
    .where("syncState")
    .anyOf(["PENDING", "PENDING_CONFIRMATION", "FAILED_RETRYABLE", "SYNCING"])
    .sortBy("createdAt");
}

export async function countOfflineSalesByState(): Promise<Record<SyncState, number>> {
  const all = await offlineDb.offlineSales.toArray();
  const counts: Record<SyncState, number> = {
    PENDING: 0, PENDING_CONFIRMATION: 0, SYNCING: 0, SYNCED: 0, CONFLICT: 0, FAILED_RETRYABLE: 0, FAILED_PERMANENT: 0,
  };
  for (const sale of all) counts[sale.syncState] += 1;
  return counts;
}

export async function markSyncState(
  clientSaleId: string,
  syncState: SyncState,
  patch: Partial<Pick<OfflineSale, "lastError" | "syncedSaleId" | "syncedAt">> = {}
): Promise<void> {
  await offlineDb.offlineSales.update(clientSaleId, {
    syncState,
    attempts: (await offlineDb.offlineSales.get(clientSaleId))?.attempts ?? 0,
    lastAttemptAt: new Date().toISOString(),
    ...patch,
  });
}

const SYNCED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Removes only old, finalized local history. Financial rows that still need
 * synchronization or human attention are never eligible for cleanup.
 */
export async function cleanupSyncedHistory(now = Date.now()): Promise<number> {
  const cutoff = now - SYNCED_RETENTION_MS;
  const expired = (await offlineDb.offlineSales.where("syncState").equals("SYNCED").toArray())
    .filter((sale) => new Date(sale.syncedAt || sale.createdAt).getTime() < cutoff)
    .map((sale) => sale.clientSaleId);
  if (expired.length === 0) return 0;
  await offlineDb.transaction("rw", offlineDb.offlineSales, offlineDb.stockMovements, async () => {
    await offlineDb.offlineSales.bulkDelete(expired);
    await offlineDb.stockMovements.where("clientSaleId").anyOf(expired).delete();
  });
  return expired.length;
}

export async function getOfflineSaleByBarcode(barcodeToken: string): Promise<OfflineSale | undefined> {
  return offlineDb.offlineSales.where("barcodeToken").equals(barcodeToken).first();
}

export async function incrementAttempts(clientSaleId: string): Promise<number> {
  const sale = await offlineDb.offlineSales.get(clientSaleId);
  const attempts = (sale?.attempts ?? 0) + 1;
  await offlineDb.offlineSales.update(clientSaleId, { attempts });
  return attempts;
}
