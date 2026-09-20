import { serverUrl } from "../utils/constants/index.ts";
import {
  cleanupSyncedHistory,
  getPendingOfflineSales,
  incrementAttempts,
  markSyncState,
  offlineDb,
  type OfflineSale,
} from "../lib/offlineDb.ts";
import { refreshFromServer } from "./offlineProductSnapshot.ts";
import { refreshBusinessSalesSnapshot } from "./localBusinessReadModel.ts";

const BACKOFF_SCHEDULE_MS = [5_000, 15_000, 30_000, 60_000];

export interface SyncProgress {
  running: boolean;
  completed: number;
  total: number;
  synced: number;
  attention: number;
  // True when the last pass stopped because the server rejected the current
  // session (401) while queued sales remained — spec's AUTH_REQUIRED case:
  // the server is reachable, but a real online re-authentication is needed
  // before sync can continue. Never set from a network/connectivity failure.
  pausedForAuth: boolean;
}

let progress: SyncProgress = { running: false, completed: 0, total: 0, synced: 0, attention: 0, pausedForAuth: false };
const listeners = new Set<() => void>();

export function getSyncProgress(): SyncProgress { return progress; }
export function subscribeSyncProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publishProgress(patch: Partial<SyncProgress>) {
  progress = { ...progress, ...patch };
  listeners.forEach((listener) => listener());
}

function backoffDelayForAttempt(attempts: number): number {
  const base = BACKOFF_SCHEDULE_MS[Math.min(attempts, BACKOFF_SCHEDULE_MS.length - 1)];
  return base + base * 0.2 * Math.random();
}

function isDueForRetry(sale: OfflineSale): boolean {
  if (["PENDING", "PENDING_CONFIRMATION", "SYNCING"].includes(sale.syncState)) return true;
  if (sale.syncState !== "FAILED_RETRYABLE" || !sale.lastAttemptAt) return true;
  return Date.now() >= new Date(sale.lastAttemptAt).getTime() + backoffDelayForAttempt(sale.attempts);
}

async function reportConflict(sale: OfflineSale, reason: string): Promise<void> {
  const firstItem = sale.payload.items[0];
  try {
    await fetch(`${serverUrl}/sales/sync/conflicts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      body: JSON.stringify({
        clientSaleId: sale.clientSaleId,
        barcodeToken: sale.barcodeToken,
        receiptNumber: sale.receiptNumber,
        reason,
        productId: firstItem?.productId,
        productName: firstItem?.name,
        localQuantity: firstItem?.quantity,
        occurredAt: sale.occurredAt,
        salesPerson: sale.payload.salesPerson,
        region: firstItem?.region,
        regionCode: firstItem?.regionCode,
        payload: sale.payload,
      }),
    });
  } catch {
    // The local CONFLICT row remains durable even when reporting is offline.
  }
}

export type SyncOutcome = "synced" | "conflict" | "retry-later" | "paused";

export async function syncOfflineSale(sale: OfflineSale): Promise<SyncOutcome> {
  await markSyncState(sale.clientSaleId, "SYNCING");
  let response: Response;
  try {
    response = await fetch(`${serverUrl}/sales/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      body: JSON.stringify(sale.payload),
    });
  } catch {
    await incrementAttempts(sale.clientSaleId);
    await markSyncState(sale.clientSaleId, "FAILED_RETRYABLE", { lastError: "Réseau injoignable" });
    return "retry-later";
  }

  if (response.status === 401) {
    await markSyncState(sale.clientSaleId, "PENDING", { lastError: "Session expirée — reconnectez-vous pour synchroniser" });
    return "paused";
  }

  if (response.ok) {
    const savedSale = await response.json().catch(() => null);
    await markSyncState(sale.clientSaleId, "SYNCED", {
      syncedSaleId: savedSale?._id || null,
      syncedAt: new Date().toISOString(),
      lastError: null,
    });
    return "synced";
  }

  const body = await response.json().catch(() => ({}));
  const reason = body?.error || body?.message || `Synchronisation refusée (${response.status})`;
  if ([400, 403, 409].includes(response.status)) {
    await markSyncState(sale.clientSaleId, "CONFLICT", { lastError: reason });
    await reportConflict(sale, reason);
    return "conflict";
  }

  await incrementAttempts(sale.clientSaleId);
  await markSyncState(sale.clientSaleId, "FAILED_RETRYABLE", { lastError: reason });
  return "retry-later";
}

let activeSync: Promise<{ processed: number; paused: boolean; synced: number; attention: number }> | null = null;

/** Single-flight sequential drain. Every caller shares the active pass. */
export function runOfflineSyncPass(): Promise<{ processed: number; paused: boolean; synced: number; attention: number }> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    let processed = 0;
    let paused = false;
    let synced = 0;
    let attention = 0;
    try {
      const due = (await getPendingOfflineSales()).filter(isDueForRetry);
      // Optimistic reset: a fresh online login may have happened since the
      // last pass. It's set again below the moment a 401 actually recurs.
      publishProgress({ running: true, completed: 0, total: due.length, synced: 0, attention: 0, pausedForAuth: false });
      for (const sale of due) {
        const outcome = await syncOfflineSale(sale);
        processed += 1;
        if (outcome === "synced") synced += 1;
        if (outcome === "conflict") attention += 1;
        publishProgress({ completed: processed, synced, attention, pausedForAuth: outcome === "paused" });
        if (outcome === "paused") { paused = true; break; }
      }
      if (synced > 0 && !paused) {
        const token = localStorage.getItem("token") || "";
        try {
          await Promise.all([
            refreshFromServer(token),
            refreshBusinessSalesSnapshot(token),
          ]);
        } catch {
          // Queue durability is independent of snapshot refresh. NewSale also
          // retries refresh whenever authenticated connectivity is online.
        }
      }
      await cleanupSyncedHistory();
      return { processed, paused, synced, attention };
    } finally {
      publishProgress({ running: false });
    }
  })().finally(() => { activeSync = null; });
  return activeSync;
}

export async function getSyncSummary() {
  const [pending, all] = await Promise.all([getPendingOfflineSales(), offlineDb.offlineSales.toArray()]);
  return {
    pendingCount: pending.length,
    conflictCount: all.filter((sale) => sale.syncState === "CONFLICT" || sale.syncState === "FAILED_PERMANENT").length,
    syncingCount: all.filter((sale) => sale.syncState === "SYNCING").length,
  };
}
