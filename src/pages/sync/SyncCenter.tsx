import { useEffect, useState, useSyncExternalStore } from "react";
import { liveQuery } from "dexie";
import { toast } from "react-toastify";
import { AlertTriangle, ChevronDown, ChevronUp, CloudCheck, CloudOff, Clock3, KeyRound, Printer, RefreshCw, ShieldQuestion } from "lucide-react";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useOfflineQueueCounts } from "../../hooks/useOfflineQueue";
import { getLastSnapshotAt, offlineDb, type OfflineSale, type SyncState } from "../../lib/offlineDb";
import { getSyncProgress, runOfflineSyncPass, subscribeSyncProgress } from "../../services/offlineSyncService";
import { runIntegrityAudit, type IntegrityFinding } from "../../services/offlineIntegrityAudit";
import { printSaleReceiptAndStub, reconstructOfflineSaleReceipt } from "../../services/printService";
import { MetricCard, PageHeader } from "../../components/ui";

const STATE_LABELS: Record<SyncState, string> = {
  PENDING: "En attente",
  PENDING_CONFIRMATION: "Confirmation en attente",
  SYNCING: "Synchronisation...",
  SYNCED: "Synchronisée",
  CONFLICT: "À vérifier",
  FAILED_RETRYABLE: "Nouvelle tentative prévue",
  FAILED_PERMANENT: "À vérifier",
};

const PAYMENT_LABELS: Record<string, string> = { cash: "Espèces", card: "Carte", transfer: "Transfert", other: "Autre" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });
}
function money(value: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(value); }
function statusTone(state: SyncState) {
  if (state === "CONFLICT" || state === "FAILED_PERMANENT") return "ui-badge-warning";
  if (state === "SYNCING") return "ui-badge-info";
  if (state === "PENDING_CONFIRMATION") return "bg-violet-50 text-violet-700 ring-violet-200";
  return "ui-badge-neutral";
}

export default function SyncCenter() {
  const connectivity = useConnectivity();
  const { counts, pending, attention } = useOfflineQueueCounts();
  const progress = useSyncExternalStore(subscribeSyncProgress, getSyncProgress, getSyncProgress);
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [showAudit, setShowAudit] = useState(false);
  const [auditFindings, setAuditFindings] = useState<IntegrityFinding[] | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [printingSaleId, setPrintingSaleId] = useState<string | null>(null);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const all = await offlineDb.offlineSales.toArray();
      return all
        .filter((sale) => sale.syncState !== "SYNCED")
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    }).subscribe({ next: setSales, error: () => setSales([]) });
    void getLastSnapshotAt().then(setSnapshotAt);
    return () => subscription.unsubscribe();
  }, []);

  async function synchronizeNow() {
    if (connectivity.status !== "online") {
      toast.info("Le serveur doit être en ligne pour synchroniser.");
      return;
    }
    const result = await runOfflineSyncPass();
    if (result.attention > 0) toast.warning(`${result.synced} synchronisée(s) · ${result.attention} nécessitent votre attention.`);
    else if (result.synced > 0) toast.success(`${result.synced} vente${result.synced > 1 ? "s" : ""} synchronisée${result.synced > 1 ? "s" : ""} avec succès.`);
  }

  async function runAudit() {
    setAuditRunning(true);
    try {
      setAuditFindings(await runIntegrityAudit());
    } finally {
      setAuditRunning(false);
    }
  }

  async function reprintLocalSale(sale: OfflineSale) {
    setPrintingSaleId(sale.clientSaleId);
    try {
      const receipt = reconstructOfflineSaleReceipt(sale);
      await printSaleReceiptAndStub(receipt, {
        // This row is authoritative before synchronization. Reprint it from
        // IndexedDB even if connectivity happens to return meanwhile; never
        // require a MongoDB lookup for a pending local transaction.
        directPrintMode: "none",
      });
      toast.success("Reçu et souche envoyés à l'impression.");
    } catch (error) {
      toast.error(error instanceof Error
        ? error.message
        : "La vente reste enregistrée, mais l'impression n'a pas pu démarrer.");
    } finally {
      setPrintingSaleId(null);
    }
  }

  const syncing = counts.SYNCING;
  const retrying = counts.FAILED_RETRYABLE;
  const snapshotAgeHours = snapshotAt ? (openedAt - new Date(snapshotAt).getTime()) / 3_600_000 : null;

  return (
    <div className="ui-page">
        <PageHeader
          eyebrow="File locale sécurisée"
          title="Ventes non synchronisées"
          description="Transactions conservées durablement sur cet appareil jusqu'à leur confirmation par le serveur."
          meta={snapshotAt ? (
            <span className={`ui-badge ${snapshotAgeHours != null && snapshotAgeHours > 24 ? "ui-badge-warning" : "ui-badge-neutral"}`}>
              <CloudOff className="h-3 w-3" aria-hidden="true" />
              Données mises à jour à {formatDate(snapshotAt)}{snapshotAgeHours != null && snapshotAgeHours > 24 ? " · snapshot ancien, vérifiez le stock avec prudence" : ""}
            </span>
          ) : undefined}
          actions={
            <button type="button" onClick={synchronizeNow} disabled={progress.running || pending === 0 || connectivity.status !== "online"} className="ui-btn ui-btn-primary">
              <RefreshCw className={progress.running ? "motion-safe:animate-spin" : ""} />
              {progress.running ? `Synchronisation ${progress.completed}/${progress.total}` : "Synchroniser maintenant"}
            </button>
          }
        />

        {progress.pausedForAuth && pending > 0 && (
          <div className="ui-alert border-violet-200 bg-violet-50 text-violet-900" role="status">
            <KeyRound aria-hidden="true" />
            <p><strong className="font-semibold">Connexion requise.</strong> Le serveur a rejeté la session actuelle. Reconnectez-vous en ligne pour reprendre la synchronisation — les ventes en attente restent conservées sur cet appareil.</p>
          </div>
        )}

        <section className="grid grid-cols-3 gap-2 sm:gap-3 max-sm:[&_.ui-metric-icon]:hidden max-sm:[&_.ui-metric-label]:leading-tight" aria-label="Résumé de synchronisation">
          <MetricCard value={counts.PENDING + counts.PENDING_CONFIRMATION + retrying} label="En attente" icon={Clock3} />
          <MetricCard value={syncing} label="Synchronisation" icon={RefreshCw} tone="primary" />
          <MetricCard value={attention} label="À vérifier" icon={AlertTriangle} tone={attention > 0 ? "warning" : "neutral"} />
        </section>

        {sales.length === 0 ? (
          <section className="ui-card px-5 py-12 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-600" aria-hidden="true"><CloudCheck className="h-5 w-5" /></span>
            <h2 className="mt-3 text-base font-semibold text-slate-950">Tout est synchronisé</h2>
            <p className="mt-1 text-sm text-slate-500">Il n'y a aucune vente en attente de synchronisation.</p>
          </section>
        ) : (
          <section className="space-y-3" aria-label="Transactions non synchronisées">
            {sales.map((sale) => {
              const itemCount = sale.payload.items.reduce((sum, item) => sum + item.quantity, 0);
              const rate = sale.payload.exchangeRateSnapshot?.rate;
              const regions = [...new Set(sale.payload.items.map((item) => item.regionCode))].join(" · ");
              const isOpen = expanded === sale.clientSaleId;
              return (
                <article key={sale.clientSaleId} className="ui-card overflow-hidden">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : sale.clientSaleId)} aria-expanded={isOpen} className="w-full p-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate font-semibold text-slate-950">Reçu {sale.receiptNumber}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(sale.occurredAt)}</p></div>
                      <div className="flex shrink-0 items-center gap-2"><span className={`ui-badge ${statusTone(sale.syncState)}`}>{STATE_LABELS[sale.syncState]}</span>{isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
                      <Field label="Client" value={sale.payload.customer?.name || "Client de passage"} />
                      <Field label="Total" value={money(sale.payload.total)} strong />
                      <Field label="Total FC" value={rate ? `${Math.round(sale.payload.total * rate).toLocaleString("fr-FR")} FC` : "—"} />
                      <Field label="Paiement" value={PAYMENT_LABELS[sale.payload.paymentMethod] || sale.payload.paymentMethod} />
                      <Field label="Articles" value={`${itemCount} · ${regions || "—"}`} />
                      <Field label="Caissier" value={sale.payload.salesPerson} />
                    </dl>
                    {sale.lastError && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{sale.lastError}</p>}
                  </button>
                  {isOpen && <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="ui-kicker">Détail des articles</h3>
                      <button
                        type="button"
                        onClick={() => void reprintLocalSale(sale)}
                        disabled={printingSaleId !== null}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                      >
                        <Printer />
                        {printingSaleId === sale.clientSaleId ? "Impression..." : "Réimprimer"}
                      </button>
                    </div>
                    <ul className="divide-y divide-slate-200">{sale.payload.items.map((item, index) => <li key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium text-slate-900" title={item.name}>{item.name}</p><p className="text-xs tabular-nums text-slate-500">{item.regionCode} · {item.quantity} × {money(item.price)}</p></div><strong className="shrink-0 font-semibold tabular-nums text-slate-900">{money(item.quantity * item.price)}</strong></li>)}</ul>
                  </div>}
                </article>
              );
            })}
          </section>
        )}

        <section className="ui-card overflow-hidden">
          <button
            type="button"
            onClick={() => { setShowAudit((v) => !v); if (!showAudit && auditFindings === null) void runAudit(); }}
            aria-expanded={showAudit}
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:p-5"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldQuestion className="h-4 w-4 text-slate-500" />
              Vérification de l'intégrité locale
            </span>
            {showAudit ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAudit && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Contrôle en lecture seule — aucune donnée n'est modifiée ou supprimée automatiquement.</p>
                <button type="button" onClick={() => void runAudit()} disabled={auditRunning} className="ui-btn ui-btn-secondary ui-btn-sm">
                  <RefreshCw className={auditRunning ? "motion-safe:animate-spin" : ""} />
                  Relancer
                </button>
              </div>
              {auditFindings === null || auditRunning ? (
                <p className="text-sm text-slate-500">Vérification en cours…</p>
              ) : auditFindings.length === 0 ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CloudCheck className="h-4 w-4" />Aucune anomalie détectée.</p>
              ) : (
                <ul className="space-y-2">
                  {auditFindings.map((finding) => (
                    <li key={finding.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-semibold">{finding.receiptNumber}</span> — {finding.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
    </div>
  );
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`truncate ${strong ? "font-semibold tabular-nums text-slate-950" : "font-medium text-slate-800"}`} title={value}>{value}</dd></div>;
}
