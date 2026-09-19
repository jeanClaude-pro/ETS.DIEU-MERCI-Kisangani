import "fake-indexeddb/auto";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { offlineDb, type OfflineSale } from "../lib/offlineDb.ts";
import { runIntegrityAudit } from "./offlineIntegrityAudit.ts";

function sale(overrides: Partial<OfflineSale> = {}): OfflineSale {
  const occurredAt = "2026-09-19T10:00:00.000Z";
  return {
    clientSaleId: "sale-1",
    barcodeToken: "ABCDEFGHJKMN",
    receiptNumber: "ABCD-EFGH-JKMN",
    occurredAt,
    payload: {
      customer: { name: "Walk-in Customer", phone: "WALK-IN", email: "", isWalkIn: true },
      items: [{ productId: "prod-1", name: "Chemise", quantity: 2, price: 10, region: "Butembo", regionCode: "Bbbb" }],
      subtotal: 20,
      total: 20,
      paymentMethod: "cash",
      salesPerson: "Jean",
      exchangeRateSnapshot: null,
      clientSaleId: "sale-1",
      barcodeToken: "ABCDEFGHJKMN",
      receiptNumber: "ABCD-EFGH-JKMN",
      clientOccurredAt: occurredAt,
      origin: "offline",
    },
    receiptSnapshot: {},
    syncState: "PENDING",
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    syncedSaleId: null,
    syncedAt: null,
    createdAt: occurredAt,
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    offlineDb.offlineSales.clear(),
    offlineDb.stockMovements.clear(),
    offlineDb.products.clear(),
  ]);
});

test("runIntegrityAudit: a clean, fully consistent state reports no findings", async () => {
  await offlineDb.offlineSales.add(sale());
  await offlineDb.stockMovements.add({ productId: "prod-1", clientSaleId: "sale-1", quantityDelta: -2, occurredAt: sale().occurredAt });
  await offlineDb.products.add({ productId: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo", regionCode: "Bbbb", stock: 18, minStock: 1, unit: "pcs", unitCost: 0, status: "active" });

  const findings = await runIntegrityAudit();
  assert.deepEqual(findings, []);
});

test("runIntegrityAudit: an unresolved sale with no stock movement is flagged", async () => {
  await offlineDb.offlineSales.add(sale());
  const findings = await runIntegrityAudit();
  assert.ok(findings.some((f) => f.message.includes("Aucun mouvement de stock")));
});

test("runIntegrityAudit: a SYNCED sale missing a movement (already cleaned up) is not flagged", async () => {
  await offlineDb.offlineSales.add(sale({ syncState: "SYNCED", syncedAt: sale().occurredAt }));
  const findings = await runIntegrityAudit();
  assert.equal(findings.length, 0);
});

test("runIntegrityAudit: negative local stock is flagged", async () => {
  await offlineDb.products.add({ productId: "prod-1", name: "Chemise", category: "Vêtements", region: "Butembo", regionCode: "Bbbb", stock: -3, minStock: 1, unit: "pcs", unitCost: 0, status: "active" });
  const findings = await runIntegrityAudit();
  assert.ok(findings.some((f) => f.message.includes("Stock local négatif")));
});

test("runIntegrityAudit: a malformed sale (missing barcode/receipt identity) is flagged, never auto-repaired", async () => {
  await offlineDb.offlineSales.add(sale({ barcodeToken: "", receiptNumber: "" }));
  const findings = await runIntegrityAudit();
  assert.ok(findings.some((f) => f.message.includes("Code-barres manquant")));
  assert.ok(findings.some((f) => f.message.includes("Numéro de reçu manquant")));
  // Never deletes or mutates the record.
  assert.ok(await offlineDb.offlineSales.get("sale-1"));
});
