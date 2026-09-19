import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, TriangleAlert } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useOfflineQueueCounts } from "../hooks/useOfflineQueue";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function PwaUpdatePrompt() {
  const activationRequestedRef = useRef(false);
  const reloadStartedRef = useRef(false);
  const lastUpdateCheckRef = useRef(0);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration>();
  const [isApplying, setIsApplying] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [confirmingWithPending, setConfirmingWithPending] = useState(false);
  const { pending, attention } = useOfflineQueueCounts();
  const unsafeToUpdateSilently = pending + attention > 0;

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, serviceWorkerRegistration) {
      lastUpdateCheckRef.current = Date.now();
      setRegistration(serviceWorkerRegistration);
    },
    onNeedReload() {
      // Another open tab may activate the worker. Never reload this POS window
      // unless its own user explicitly requested the update here.
      if (!activationRequestedRef.current) return;

      // Workbox can report more than one lifecycle event for the same update.
      // Keep the user-triggered activation to exactly one page reload.
      if (reloadStartedRef.current) return;
      reloadStartedRef.current = true;
      window.location.reload();
    },
    onRegisterError(error) {
      console.error("Impossible d'enregistrer le service worker.", error);
    },
  });

  useEffect(() => {
    const dismissPromptAfterExternalActivation = () => {
      if (!activationRequestedRef.current) setNeedRefresh(false);
    };

    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      dismissPromptAfterExternalActivation,
    );
    return () => {
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        dismissPromptAfterExternalActivation,
      );
    };
  }, [setNeedRefresh]);

  const checkForUpdate = useCallback(async () => {
    if (!registration || !navigator.onLine) return;

    const now = Date.now();
    if (now - lastUpdateCheckRef.current < UPDATE_CHECK_INTERVAL_MS) return;

    lastUpdateCheckRef.current = now;
    try {
      await registration.update();
    } catch (error) {
      // A transient network failure must not disturb an active POS session.
      console.warn("La vérification de mise à jour PWA a échoué.", error);
    }
  }, [registration]);

  useEffect(() => {
    if (!registration) return;

    const intervalId = window.setInterval(
      checkForUpdate,
      UPDATE_CHECK_INTERVAL_MS,
    );
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkForUpdate, registration]);

  const applyUpdate = async () => {
    if (isApplying) return;

    // Never silently reload over unsynchronized work — the first tap while
    // sales are pending/need attention only asks for confirmation. IndexedDB
    // itself survives a service-worker update regardless; this is purely
    // about not surprising the cashier mid-shift.
    if (unsafeToUpdateSilently && !confirmingWithPending) {
      setConfirmingWithPending(true);
      return;
    }

    setIsApplying(true);
    setUpdateError(false);
    activationRequestedRef.current = true;
    try {
      await updateServiceWorker();
    } catch (error) {
      console.error("Impossible d'appliquer la mise à jour PWA.", error);
      activationRequestedRef.current = false;
      setUpdateError(true);
      setIsApplying(false);
    }
  };

  if (!needRefresh || dismissed) return null;

  return (
    <section
      aria-labelledby="pwa-update-title"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[110] rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl shadow-slate-950/20 min-[481px]:inset-x-auto min-[481px]:right-5 min-[481px]:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] min-[481px]:w-[min(26rem,calc(100vw-2.5rem))] sm:p-5"
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <Download aria-hidden="true" className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <h2
            className="text-base font-bold text-slate-900 sm:text-lg"
            id="pwa-update-title"
          >
            Nouvelle version disponible
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Une nouvelle version de l&apos;application est prête.
          </p>

          {unsafeToUpdateSilently && (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-amber-800" role="alert">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {pending + attention} vente{pending + attention > 1 ? "s" : ""} non synchronisée{pending + attention > 1 ? "s" : ""} sur cet appareil — vérifiez le Centre de synchronisation avant de mettre à jour.
            </p>
          )}

          {updateError && (
            <p className="mt-2 text-sm font-medium text-red-700" role="alert">
              La mise à jour n&apos;a pas pu démarrer. Veuillez réessayer.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
              disabled={isApplying}
              onClick={() => void applyUpdate()}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${isApplying ? "animate-spin" : ""}`}
              />
              {isApplying ? "Mise à jour…" : confirmingWithPending ? "Confirmer la mise à jour" : "Mettre à jour"}
            </button>
            <button
              className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50"
              disabled={isApplying}
              onClick={() => { setDismissed(true); setConfirmingWithPending(false); }}
              type="button"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
