/* eslint-disable react-refresh/only-export-components */
"use client";
import * as React from "react";
import { toast } from "react-toastify";
import { countOfflineSalesByState } from "../lib/offlineDb";
import { runOfflineSyncPass } from "../services/offlineSyncService";
import { serverUrl } from "../utils/constants";
import { beginConnectivityCheck, probeBackendHealth } from "../services/connectivityService";

export type ConnectivityStatus = "online" | "offline" | "degraded" | "checking" | "reconnecting";

interface ConnectivityContextValue {
  status: ConnectivityStatus;
  lastCheckedAt: number | null;
  forceCheck: () => Promise<ConnectivityStatus>;
}

const ConnectivityContext = React.createContext<ConnectivityContextValue>({
  status: "checking",
  lastCheckedAt: null,
  forceCheck: async () => "offline",
});

export const useConnectivity = () => React.useContext(ConnectivityContext);

const POLL_INTERVAL_MS = 20_000;

export const ConnectivityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [status, setStatus] = React.useState<ConnectivityStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = React.useState<number | null>(null);
  const inFlight = React.useRef<Promise<ConnectivityStatus> | null>(null);
  const previousStable = React.useRef<ConnectivityStatus | null>(null);

  const forceCheck = React.useCallback(async (): Promise<ConnectivityStatus> => {
    if (inFlight.current) return inFlight.current;
    setStatus((current) => beginConnectivityCheck(current));
    const request = probeBackendHealth(`${serverUrl}/health`).then(async (next) => {
      const before = previousStable.current;
      previousStable.current = next;
      setStatus(next);
      setLastCheckedAt(Date.now());
      inFlight.current = null;

      if (before === "online" && next !== "online") {
        toast.info("Connexion perdue. Le mode hors ligne est actif. Les ventes seront enregistrées sur cet appareil.");
      }
      if (before !== "online" && next === "online") {
        if (before) toast.info("Connexion rétablie. Synchronisation des ventes en attente...");
        window.dispatchEvent(new CustomEvent("backend-online"));
      }
      // Also drain rows created by an ambiguous request while connectivity
      // remained nominally online. The sync engine applies retry backoff and
      // single-flight protection, so this periodic trigger cannot overlap.
      if (next === "online") {
        const counts = await countOfflineSalesByState();
        const pending = counts.PENDING + counts.PENDING_CONFIRMATION + counts.SYNCING + counts.FAILED_RETRYABLE;
        if (pending > 0) {
          const result = await runOfflineSyncPass();
          if (before && result.synced > 0 && result.synced === result.processed && !result.paused && result.attention === 0) {
            toast.success("Toutes les ventes sont synchronisées.");
          }
        }
      }
      return next;
    }).catch(() => {
      inFlight.current = null;
      previousStable.current = "offline";
      setStatus("offline");
      return "offline" as const;
    });
    inFlight.current = request;
    return request;
  }, []);

  React.useEffect(() => {
    void forceCheck();
    const interval = globalThis.setInterval(() => { void forceCheck(); }, POLL_INTERVAL_MS);
    const checkNow = () => { void forceCheck(); };
    const handleVisibility = () => { if (document.visibilityState === "visible") void forceCheck(); };
    window.addEventListener("online", checkNow);
    window.addEventListener("offline", checkNow);
    window.addEventListener("focus", checkNow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      globalThis.clearInterval(interval);
      window.removeEventListener("online", checkNow);
      window.removeEventListener("offline", checkNow);
      window.removeEventListener("focus", checkNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [forceCheck]);

  const value = React.useMemo(() => ({ status, lastCheckedAt, forceCheck }), [status, lastCheckedAt, forceCheck]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
};
