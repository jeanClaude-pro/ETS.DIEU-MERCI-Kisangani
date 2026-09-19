"use client";
import * as React from "react";
import type { AuthState, OfflineSession, User } from "../types/auth";
import { AuthContext } from "./auth-context";
import { fetchMe, HttpError, NetworkError } from "../services/authService";
import { isOfflineSessionExpired } from "../services/authorizationService";

const OFFLINE_SESSION_STORAGE_KEY = "offlineSession";

function readStoredOfflineSession(): OfflineSession | null {
  try {
    const raw = sessionStorage.getItem(OFFLINE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as OfflineSession;
    // An expired PIN session is discarded on boot rather than surfaced —
    // it must be re-established explicitly, never silently extended.
    if (isOfflineSessionExpired(session)) {
      sessionStorage.removeItem(OFFLINE_SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = React.useState<AuthState>({
    token: null,
    user: null,
    loading: true,
    verified: false,
    offlineSession: null,
  });

  // Boot from localStorage (online session) and sessionStorage (offline PIN
  // session, if this device/user set one up) independently — a rejected
  // online session must never silently discard a still-valid offline one,
  // and vice versa.
  React.useEffect(() => {
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");
    const offlineSession = readStoredOfflineSession();

    if (!token) {
      setState({ token: null, user: null, loading: false, verified: false, offlineSession });
      return;
    }

    const user: User | null = userRaw ? JSON.parse(userRaw) : null;
    setState({ token, user, loading: false, verified: false, offlineSession });

    // The cached user is only a fast first paint. Refresh role/status/module
    // permissions from the server so a change an admin made elsewhere (or an
    // expired/invalid token) takes effect instead of trusting stale storage.
    const revalidate = () => fetchMe()
      .then((fresh) => {
        localStorage.setItem("user", JSON.stringify(fresh));
        setState((s) => ({ ...s, user: fresh, verified: true }));
      })
      .catch((error) => {
        // A genuine 401/invalid-token response means this session really is
        // no longer valid — clear it, exactly as before. A NetworkError
        // means the app simply couldn't reach the server right now (e.g.
        // opened offline); the cached session stays intact so the designated
        // offline laptop can still authorize sales (Part K) — it just isn't
        // freshly reverified until connectivity returns.
        if (error instanceof NetworkError || !(error instanceof HttpError) || ![401, 403].includes(error.status)) {
          setState((s) => ({ ...s, verified: false }));
          return;
        }
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setState((s) => ({ token: null, user: null, loading: false, verified: false, offlineSession: s.offlineSession }));
      });
    void revalidate();
    const handleBackendOnline = () => { void revalidate(); };
    window.addEventListener("backend-online", handleBackendOnline);
    return () => window.removeEventListener("backend-online", handleBackendOnline);
  }, []);

  const setAuth = React.useCallback(
    ({ token, user }: { token: string | null; user: User | null }) => {
      if (token) localStorage.setItem("token", token);
      else localStorage.removeItem("token");

      if (user) localStorage.setItem("user", JSON.stringify(user));
      else localStorage.removeItem("user");

      // A real online login supersedes any device-local PIN session — never
      // run both at once, so downstream code has one unambiguous identity.
      if (token) sessionStorage.removeItem(OFFLINE_SESSION_STORAGE_KEY);
      setState((s) => ({ ...s, token, user, verified: true, offlineSession: token ? null : s.offlineSession }));
    },
    []
  );

  const clearAuth = React.useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState((s) => ({ token: null, user: null, loading: false, verified: false, offlineSession: s.offlineSession }));
  }, []);

  const setOfflineSession = React.useCallback((session: OfflineSession) => {
    sessionStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, JSON.stringify(session));
    setState((s) => ({ ...s, offlineSession: session }));
  }, []);

  const clearOfflineSession = React.useCallback(() => {
    sessionStorage.removeItem(OFFLINE_SESSION_STORAGE_KEY);
    setState((s) => ({ ...s, offlineSession: null }));
  }, []);

  const value = { ...state, setAuth, clearAuth, setOfflineSession, clearOfflineSession };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
