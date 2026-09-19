import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { offlineDb } from "../lib/offlineDb.ts";
import { getCachedCategories, refreshCategorySnapshot, snapshotCategories } from "./offlineCategorySnapshot.ts";

beforeEach(async () => {
  await offlineDb.categories.clear();
});

test("snapshotCategories: replaces the local cache", async () => {
  await snapshotCategories([{ _id: "c1", name: "Vêtements" }, { _id: "c2", name: "Chaussures" }]);
  const cached = await getCachedCategories();
  assert.deepEqual(cached.map((c) => c.name).sort(), ["Chaussures", "Vêtements"]);
});

test("refreshCategorySnapshot: a successful fetch replaces the cache", async () => {
  await snapshotCategories([{ _id: "old", name: "Ancienne" }]);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([{ _id: "c1", name: "Nouvelle" }]), { status: 200, headers: { "Content-Type": "application/json" } })
  ) as typeof fetch;

  await refreshCategorySnapshot("token");
  const cached = await getCachedCategories();
  assert.deepEqual(cached.map((c) => c.name), ["Nouvelle"]);
});

test("refreshCategorySnapshot: a failed fetch throws and never touches the existing cache", async () => {
  await snapshotCategories([{ _id: "keep", name: "À conserver" }]);
  globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;

  await assert.rejects(() => refreshCategorySnapshot("token"));
  const cached = await getCachedCategories();
  assert.deepEqual(cached.map((c) => c.name), ["À conserver"]);
});

test("refreshCategorySnapshot: a network failure throws and never touches the existing cache", async () => {
  await snapshotCategories([{ _id: "keep", name: "À conserver" }]);
  globalThis.fetch = (async () => { throw new TypeError("network down"); }) as typeof fetch;

  await assert.rejects(() => refreshCategorySnapshot("token"));
  const cached = await getCachedCategories();
  assert.deepEqual(cached.map((c) => c.name), ["À conserver"]);
});
