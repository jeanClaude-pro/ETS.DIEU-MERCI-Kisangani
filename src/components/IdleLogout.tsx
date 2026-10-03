import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Clock } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  LAST_ACTIVITY_STORAGE_KEY,
  idleState,
  idleTimeoutMs,
  latestActivity,
  secondsUntilLogout,
} from "../services/idleTimer";

const TIMEOUT_MS = idleTimeoutMs(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES);
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
const CHECK_INTERVAL_MS = 5_000;
const STORAGE_WRITE_THROTTLE_MS = 5_000;

function readStoredActivity(): string | null {
  try { return localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY); } catch { return null; }
}

function writeStoredActivity(value: number) {
  try { localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(value)); } catch { /* storage unavailable */ }
}

// Signs a shared terminal out after a period without any input. Any key
// press (including a barcode scanner, which types), tap or click counts as
// activity, so a cashier actively ringing up a sale is never interrupted;
// a one-minute warning gives an absent-minded cashier the chance to stay.
export default function IdleLogout() {
  const { isAuthenticated, clearAuth } = useAuth();
  const navigate = useNavigate();
  // Set to the current time as soon as a session starts (effect below).
  const lastActivity = useRef(0);
  const lastStoredWrite = useRef(0);
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const warningShown = useRef(false);

  useEffect(() => {
    warningShown.current = warningSeconds !== null;
  }, [warningSeconds]);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    if (now - lastStoredWrite.current > STORAGE_WRITE_THROTTLE_MS) {
      lastStoredWrite.current = now;
      writeStoredActivity(now);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    markActive();

    const onActivity = () => {
      // While the warning is shown, only the explicit button keeps the
      // session; a stray event must not silently dismiss it.
      if (!warningShown.current) markActive();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      const now = Date.now();
      lastActivity.current = latestActivity(lastActivity.current, readStoredActivity());
      const state = idleState(lastActivity.current, now, TIMEOUT_MS);
      if (state === "expired") {
        setWarningSeconds(null);
        clearAuth();
        toast.info("Session fermée après une période d'inactivité.");
        navigate("/login", { replace: true });
      } else if (state === "warning") {
        setWarningSeconds(secondsUntilLogout(lastActivity.current, now, TIMEOUT_MS));
      } else {
        setWarningSeconds(null);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      window.clearInterval(timer);
      // Never carry a pending warning into the next session.
      setWarningSeconds(null);
    };
  }, [clearAuth, isAuthenticated, markActive, navigate]);

  if (!isAuthenticated || warningSeconds === null) return null;

  return (
    <div className="ui-dialog-overlay" role="presentation">
      <div className="ui-dialog max-w-sm" role="alertdialog" aria-modal="true" aria-labelledby="idle-logout-title" aria-describedby="idle-logout-text">
        <div className="ui-dialog-header">
          <h3 id="idle-logout-title" className="ui-dialog-title flex items-center gap-2">
            <Clock className="h-5 w-5" aria-hidden="true" />
            Toujours là ?
          </h3>
        </div>
        <div className="ui-dialog-body">
          <p id="idle-logout-text" className="text-sm text-slate-600">
            Pour protéger ce poste partagé, la session sera fermée dans {warningSeconds} s faute d'activité.
          </p>
        </div>
        <div className="ui-dialog-footer">
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            autoFocus
            onClick={() => {
              lastStoredWrite.current = 0;
              markActive();
              setWarningSeconds(null);
            }}
          >
            Rester connecté
          </button>
        </div>
      </div>
    </div>
  );
}
