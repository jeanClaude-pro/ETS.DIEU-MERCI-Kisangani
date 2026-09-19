// Offline cache for categories (Part offline-readiness §6) — same
// fetch-then-replace-on-success shape as offlineProductSnapshot.ts: a failed
// refresh must never erase a previously valid local cache.
import { serverUrl } from "../utils/constants/index.ts";
import { offlineDb, type OfflineCategory } from "../lib/offlineDb.ts";

interface RawCategory {
  _id: string;
  name: string;
}

export async function snapshotCategories(categories: RawCategory[]): Promise<void> {
  const rows: OfflineCategory[] = categories.map((category) => ({
    id: category._id,
    name: category.name,
  }));
  await offlineDb.transaction("rw", offlineDb.categories, async () => {
    await offlineDb.categories.clear();
    await offlineDb.categories.bulkPut(rows);
  });
}

export async function getCachedCategories(): Promise<OfflineCategory[]> {
  return offlineDb.categories.orderBy("name").toArray();
}

/**
 * Fetches the current category list and, only on success, replaces the
 * local cache. On failure the caller falls back to whatever
 * `getCachedCategories()` already has — this function itself never clears
 * the cache.
 */
export async function refreshCategorySnapshot(token: string): Promise<RawCategory[]> {
  const response = await fetch(`${serverUrl}/categories`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Categories fetch failed (${response.status})`);
  const data = (await response.json()) as RawCategory[];
  const list = Array.isArray(data) ? data : [];
  await snapshotCategories(list);
  return list;
}
