/* eslint-disable react-refresh/only-export-components */
"use client";
import * as React from "react";
import { toast } from "react-toastify";
import { countOfflineSalesByState } from "../lib/offlineDb";
import { runOfflineSyncPass } from "../services/offlineSyncService";
import {
  ConnectivityController,
  type ConnectivityPhase,
  type ConnectivitySnapshot,
} from "../services/connectivityService";
import { serverUrl } from "../utils/constants";
import { useAuth } from "../hooks/useAuth";

export type ConnectivityStatus = ConnectivityPhase;

interface ConnectivityContextValue extends ConnectivitySnapshot {
  /** Compatibility alias for older consumers. */
  lastCheckedAt: number | null;
  checkNow: () => Promise<ConnectivityStatus>;
  forceCheck: () => Promise<ConnectivityStatus>;
  reportNetworkFailure: () => void;
}

const unavailableCheck = async (): Promise<ConnectivityStatus> => "offline";
const ConnectivityContext = React.createContext<ConnectivityContextValue>({
  status: "checking",
  lastSuccessfulCheck: null,
  lastAttempt: null,
  lastCheckedAt: null,
  consecutiveFailures: 0,
  checkNow: unavailableCheck,
  forceCheck: unavailableCheck,
  reportNetworkFailure: () => undefined,
});

export const useConnectivity = () => React.useContext(ConnectivityContext);

export const ConnectivityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [controller] = React.useState(
    () => new ConnectivityController(`${serverUrl}/health`),
  );
  const snapshot = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { token } = useAuth();
  const previousStable = React.useRef<"online" | "offline" | "degraded" | null>(null);
  const handledOnlineToken = React.useRef<string | null>(null);

  React.useEffect(() => {
    controller.start();

    const handleOnline = () => { void controller.browserOnline(); };
    const handleOffline = () => controller.browserOffline();
    const handleFocus = () => { void controller.activityHint(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void controller.activityHint();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      controller.stop();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [controller]);

  React.useEffect(() => {
    if (snapshot.status === "checking" || snapshot.status === "reconnecting") return;

    const before = previousStable.current;
    previousStable.current = snapshot.status;
    if (snapshot.status !== "online") {
      handledOnlineToken.current = null;
      if (before === "online") {
        toast.info("Connexion perdue. Le mode hors ligne est actif. Les ventes seront enregistrées sur cet appareil.");
      }
      return;
    }

    // A fresh online login is a new synchronization opportunity even when
    // connectivity itself never transitioned.
    if (!token || handledOnlineToken.current === token) return;
    handledOnlineToken.current = token;
    if (before && before !== "online") {
      toast.info("Connexion rétablie. Synchronisation des ventes en attente...");
    }
    window.dispatchEvent(new CustomEvent("backend-online"));

    void (async () => {
      const counts = await countOfflineSalesByState();
      const pending = counts.PENDING + counts.PENDING_CONFIRMATION + counts.SYNCING + counts.FAILED_RETRYABLE;
      if (pending === 0) return;
      const result = await runOfflineSyncPass();
      if (result.synced > 0 && result.synced === result.processed && !result.paused && result.attention === 0) {
        toast.success("Toutes les ventes sont synchronisées.");
      }
    })();
  }, [snapshot.status, token]);

  const checkNow = React.useCallback(
    async (): Promise<ConnectivityStatus> => controller.checkNow(),
    [controller],
  );
  const reportNetworkFailure = React.useCallback(
    () => controller.reportNetworkFailure(),
    [controller],
  );
  const value = React.useMemo<ConnectivityContextValue>(() => ({
    ...snapshot,
    lastCheckedAt: snapshot.lastAttempt,
    checkNow,
    forceCheck: checkNow,
    reportNetworkFailure,
  }), [checkNow, reportNetworkFailure, snapshot]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
};
