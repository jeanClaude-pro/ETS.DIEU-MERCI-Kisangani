import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { liveQuery } from "dexie";
import { toast } from "react-toastify";
import { AlertTriangle, ChevronDown, ChevronUp, CloudCheck, CloudOff, Clock3, KeyRound, Printer, RefreshCw, ShieldQuestion } from "lucide-react";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useOfflineQueueCounts } from "../../hooks/useOfflineQueue";
import { getLastSnapshotAt, offlineDb, type OfflineSale, type SyncState } from "../../lib/offlineDb";
import { getSyncProgress, runOfflineSyncPass, subscribeSyncProgress } from "../../services/offlineSyncService";
import { runIntegrityAudit, type IntegrityFinding } from "../../services/offlineIntegrityAudit";
import { printSaleReceiptAndStub, reconstructOfflineSaleReceipt } from "../../services/printService";

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
  if (state === "CONFLICT" || state === "FAILED_PERMANENT") return "bg-amber-100 text-amber-800";
  if (state === "SYNCING") return "bg-blue-100 text-blue-700";
  if (state === "PENDING_CONFIRMATION") return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-700";
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
    <main className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-blue-700"><CloudOff className="h-4 w-4" />File locale sécurisée</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Ventes non synchronisées</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Transactions conservées durablement sur cet appareil jusqu'à leur confirmation par le serveur.</p>
            {snapshotAt && <p className={`mt-2 text-xs ${snapshotAgeHours != null && snapshotAgeHours > 24 ? "font-semibold text-amber-700" : "text-slate-500"}`}>Données mises à jour à {formatDate(snapshotAt)}{snapshotAgeHours != null && snapshotAgeHours > 24 ? " · Snapshot ancien, vérifiez le stock avec prudence." : ""}</p>}
          </div>
          <button type="button" onClick={synchronizeNow} disabled={progress.running || pending === 0 || connectivity.status !== "online"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300">
            <RefreshCw className={`h-4 w-4 ${progress.running ? "motion-safe:animate-spin" : ""}`} />
            {progress.running ? `Synchronisation ${progress.completed}/${progress.total}` : "Synchroniser maintenant"}
          </button>
        </header>

        {progress.pausedForAuth && pending > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900" role="status">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
            <p><strong>Connexion requise.</strong> Le serveur a rejeté la session actuelle. Reconnectez-vous en ligne pour reprendre la synchronisation — les ventes en attente restent conservées sur cet appareil.</p>
          </div>
        )}

        <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Résumé de synchronisation">
          <Metric value={counts.PENDING + counts.PENDING_CONFIRMATION + retrying} label="En attente" icon={<Clock3 className="h-4 w-4 text-slate-500" />} />
          <Metric value={syncing} label="Synchronisation" icon={<RefreshCw className="h-4 w-4 text-blue-600" />} />
          <Metric value={attention} label="À vérifier" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} />
        </section>

        {sales.length === 0 ? (
          <section className="rounded-2xl border border-emerald-200 bg-white px-5 py-12 text-center shadow-sm">
            <CloudCheck className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-4 text-xl font-bold text-slate-950">Tout est synchronisé</h2>
            <p className="mt-1 text-sm text-slate-600">Il n'y a aucune vente en attente de synchronisation.</p>
          </section>
        ) : (
          <section className="space-y-3" aria-label="Transactions non synchronisées">
            {sales.map((sale) => {
              const itemCount = sale.payload.items.reduce((sum, item) => sum + item.quantity, 0);
              const rate = sale.payload.exchangeRateSnapshot?.rate;
              const regions = [...new Set(sale.payload.items.map((item) => item.regionCode))].join(" · ");
              const isOpen = expanded === sale.clientSaleId;
              return (
                <article key={sale.clientSaleId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : sale.clientSaleId)} aria-expanded={isOpen} className="w-full p-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate font-bold text-slate-950">Reçu {sale.receiptNumber}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(sale.occurredAt)}</p></div>
                      <div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(sale.syncState)}`}>{STATE_LABELS[sale.syncState]}</span>{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
                      <Field label="Client" value={sale.payload.customer?.name || "Client de passage"} />
                      <Field label="Total" value={money(sale.payload.total)} strong />
                      <Field label="Total FC" value={rate ? `${Math.round(sale.payload.total * rate).toLocaleString("fr-FR")} FC` : "—"} />
                      <Field label="Paiement" value={PAYMENT_LABELS[sale.payload.paymentMethod] || sale.payload.paymentMethod} />
                      <Field label="Articles" value={`${itemCount} · ${regions || "—"}`} />
                      <Field label="Caissier" value={sale.payload.salesPerson} />
                    </div>
                    {sale.lastError && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{sale.lastError}</p>}
                  </button>
                  {isOpen && <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Détail des articles</h3>
                      <button
                        type="button"
                        onClick={() => void reprintLocalSale(sale)}
                        disabled={printingSaleId !== null}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {printingSaleId === sale.clientSaleId ? "Impression..." : "Réimprimer"}
                      </button>
                    </div>
                    <ul className="divide-y divide-slate-200">{sale.payload.items.map((item, index) => <li key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.regionCode} · {item.quantity} × {money(item.price)}</p></div><strong className="shrink-0 text-slate-900">{money(item.quantity * item.price)}</strong></li>)}</ul>
                  </div>}
                </article>
              );
            })}
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => { setShowAudit((v) => !v); if (!showAudit && auditFindings === null) void runAudit(); }}
            aria-expanded={showAudit}
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:p-5"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldQuestion className="h-4 w-4 text-slate-500" />
              Vérification de l'intégrité locale
            </span>
            {showAudit ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAudit && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-slate-500">Contrôle en lecture seule — aucune donnée n'est modifiée ou supprimée automatiquement.</p>
                <button type="button" onClick={() => void runAudit()} disabled={auditRunning} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                  <RefreshCw className={`h-3.5 w-3.5 ${auditRunning ? "motion-safe:animate-spin" : ""}`} />
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
    </main>
  );
}

function Metric({ value, label, icon }: { value: number; label: string; icon: ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{icon}<span>{label}</span></div><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>;
}
function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`truncate ${strong ? "font-bold text-slate-950" : "font-medium text-slate-800"}`}>{value}</dd></div>;
}
