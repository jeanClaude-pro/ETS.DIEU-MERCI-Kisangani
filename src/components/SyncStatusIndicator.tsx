import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CloudCheck, CloudOff, KeyRound, LoaderCircle, RefreshCw, ServerOff } from "lucide-react";
import { useConnectivity } from "../context/ConnectivityContext";
import { useOfflineQueueCounts } from "../hooks/useOfflineQueue";
import { getSyncProgress, subscribeSyncProgress } from "../services/offlineSyncService";
import { useOfflineReadiness } from "../hooks/useOfflineReadiness";

export default function SyncStatusIndicator() {
  const connectivity = useConnectivity();
  const { counts, pending, attention } = useOfflineQueueCounts();
  const progress = useSyncExternalStore(subscribeSyncProgress, getSyncProgress, getSyncProgress);
  const offlineReadiness = useOfflineReadiness();

  let label = "En ligne · Synchronisé";
  let icon = <CloudCheck className="h-3.5 w-3.5" />;
  let tone = "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (attention > 0) {
    label = `Attention · ${attention} à vérifier`;
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    tone = "border-amber-300 bg-amber-50 text-amber-800";
  } else if (progress.pausedForAuth && pending > 0) {
    // Server reachable, session rejected (401) — spec's AUTH_REQUIRED: this
    // is never a connectivity problem, so it must never read as "offline".
    label = "Connexion requise";
    icon = <KeyRound className="h-3.5 w-3.5" />;
    tone = "border-violet-300 bg-violet-50 text-violet-800";
  } else if (progress.running || counts.SYNCING > 0) {
    label = `Synchronisation · ${progress.completed}/${progress.total}`;
    icon = <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" />;
    tone = "border-blue-200 bg-blue-50 text-blue-700";
  } else if (connectivity.status === "degraded") {
    label = offlineReadiness.ready
      ? pending > 0 ? `Hors ligne · ${pending} vente${pending > 1 ? "s" : ""} en attente` : "Hors ligne · Mode de vente actif"
      : "Service temporairement indisponible";
    icon = offlineReadiness.ready ? <CloudOff className="h-3.5 w-3.5" /> : <ServerOff className="h-3.5 w-3.5" />;
    tone = offlineReadiness.ready ? "border-slate-300 bg-slate-100 text-slate-700" : "border-orange-200 bg-orange-50 text-orange-800";
  } else if (connectivity.status === "checking" || connectivity.status === "reconnecting") {
    label = connectivity.status === "checking" ? "Vérification de la connexion..." : "Reconnexion...";
    icon = <LoaderCircle className="h-3.5 w-3.5 motion-safe:animate-spin" />;
    tone = "border-slate-200 bg-slate-50 text-slate-700";
  } else if (connectivity.status === "offline") {
    label = pending > 0 ? `Hors ligne · ${pending} vente${pending > 1 ? "s" : ""} en attente` : "Hors ligne";
    icon = <CloudOff className="h-3.5 w-3.5" />;
    tone = "border-slate-300 bg-slate-100 text-slate-700";
  } else if (pending > 0) {
    label = `En ligne · ${pending} en attente`;
    icon = <RefreshCw className="h-3.5 w-3.5" />;
    tone = "border-blue-200 bg-blue-50 text-blue-700";
  }

  // Phones get the short state (before the "·"), full detail stays in the
  // accessible label and on wider screens.
  const [shortLabel, detail] = label.split(" · ");
  const shortCount = detail?.match(/^\d+(\/\d+)?/)?.[0];

  return (
    <Link
      to="/sync-center"
      className={`inline-flex h-9 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tone}`}
      aria-label={`État de synchronisation : ${label}`}
      title={label}
    >
      {icon}
      <span className="max-w-[7.5rem] truncate sm:hidden">{shortLabel}</span>
      {shortCount && <span className="rounded-full bg-current/10 px-1.5 text-[11px] tabular-nums sm:hidden">{shortCount}</span>}
      <span className="hidden max-w-[16rem] truncate sm:inline">{label}</span>
    </Link>
  );
}
