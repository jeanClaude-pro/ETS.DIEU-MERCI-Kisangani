// Read-only integrity audit for the local offline database (spec §35).
// Surfaces problems for human review — never auto-repairs or deletes a
// financial record.
import { offlineDb, type OfflineSale, type SyncState } from "../lib/offlineDb.ts";

const KNOWN_SYNC_STATES: SyncState[] = [
  "PENDING", "PENDING_CONFIRMATION", "SYNCING", "SYNCED", "CONFLICT", "FAILED_RETRYABLE", "FAILED_PERMANENT",
];

export interface IntegrityFinding {
  id: string;
  receiptNumber: string;
  message: string;
}

function saleLabel(sale: OfflineSale): string {
  return sale.receiptNumber || sale.clientSaleId || "Vente inconnue";
}

export async function runIntegrityAudit(): Promise<IntegrityFinding[]> {
  const [sales, movements, products] = await Promise.all([
    offlineDb.offlineSales.toArray(),
    offlineDb.stockMovements.toArray(),
    offlineDb.products.toArray(),
  ]);

  const findings: IntegrityFinding[] = [];
  const movementsBySale = new Map<string, number>();
  for (const movement of movements) {
    movementsBySale.set(movement.clientSaleId, (movementsBySale.get(movement.clientSaleId) || 0) + 1);
  }

  for (const sale of sales) {
    const label = saleLabel(sale);

    if (!sale.clientSaleId) {
      findings.push({ id: `${sale.clientSaleId || Math.random()}-id`, receiptNumber: label, message: "Identifiant de vente (clientSaleId) manquant." });
    }
    if (!sale.barcodeToken) {
      findings.push({ id: `${sale.clientSaleId}-barcode`, receiptNumber: label, message: "Code-barres manquant pour cette vente." });
    }
    if (!sale.receiptNumber) {
      findings.push({ id: `${sale.clientSaleId}-receipt`, receiptNumber: label, message: "Numéro de reçu manquant pour cette vente." });
    }
    if (!KNOWN_SYNC_STATES.includes(sale.syncState)) {
      findings.push({ id: `${sale.clientSaleId}-state`, receiptNumber: label, message: `État de synchronisation inconnu : "${sale.syncState}".` });
    }

    // A sale still awaiting/needing sync should have logged a stock
    // movement per item; SYNCED sales may have had theirs cleaned up
    // separately, so only unresolved states are checked here.
    const isUnresolved = sale.syncState !== "SYNCED";
    const itemCount = sale.payload?.items?.length ?? 0;
    if (isUnresolved && itemCount > 0 && !movementsBySale.has(sale.clientSaleId)) {
      findings.push({ id: `${sale.clientSaleId}-movement`, receiptNumber: label, message: "Aucun mouvement de stock local associé à cette vente en attente." });
    }
  }

  for (const product of products) {
    if (product.stock < 0) {
      findings.push({ id: `${product.productId}-negative-stock`, receiptNumber: product.name, message: `Stock local négatif (${product.stock}) pour "${product.name}".` });
    }
  }

  return findings;
}
