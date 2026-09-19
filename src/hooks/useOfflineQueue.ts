import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { countOfflineSalesByState, type SyncState } from "../lib/offlineDb";

const EMPTY_COUNTS: Record<SyncState, number> = {
  PENDING: 0,
  PENDING_CONFIRMATION: 0,
  SYNCING: 0,
  SYNCED: 0,
  CONFLICT: 0,
  FAILED_RETRYABLE: 0,
  FAILED_PERMANENT: 0,
};

/** Reactive IndexedDB queue summary shared by navigation and status UI. */
export function useOfflineQueueCounts() {
  const [counts, setCounts] = useState<Record<SyncState, number>>(EMPTY_COUNTS);
  useEffect(() => {
    const subscription = liveQuery(countOfflineSalesByState).subscribe({
      next: setCounts,
      error: () => setCounts(EMPTY_COUNTS),
    });
    return () => subscription.unsubscribe();
  }, []);
  const pending = counts.PENDING + counts.PENDING_CONFIRMATION + counts.SYNCING + counts.FAILED_RETRYABLE;
  const attention = counts.CONFLICT + counts.FAILED_PERMANENT;
  return { counts, pending, attention };
}
