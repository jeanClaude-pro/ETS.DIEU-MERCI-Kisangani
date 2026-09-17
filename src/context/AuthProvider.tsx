"use client";
import * as React from "react";
import type { AuthState, User } from "../types/auth";
import { AuthContext } from "./auth-context";
import { fetchMe } from "../services/authService";

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = React.useState<AuthState>({
    token: null,
    user: null,
    loading: true,
  });

  // Boot from localStorage
  React.useEffect(() => {
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");

    if (!token) {
      setState({ token: null, user: null, loading: false });
      return;
    }

    const user: User | null = userRaw ? JSON.parse(userRaw) : null;
    setState({ token, user, loading: false });

    // The cached user is only a fast first paint. Refresh role/status/module
    // permissions from the server so a change an admin made elsewhere (or an
    // expired/invalid token) takes effect instead of trusting stale storage.
    fetchMe()
      .then((fresh) => {
        localStorage.setItem("user", JSON.stringify(fresh));
        setState((s) => ({ ...s, user: fresh }));
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setState({ token: null, user: null, loading: false });
      });
  }, []);

  const setAuth = React.useCallback(
    ({ token, user }: { token: string | null; user: User | null }) => {
      if (token) localStorage.setItem("token", token);
      else localStorage.removeItem("token");

      if (user) localStorage.setItem("user", JSON.stringify(user));
      else localStorage.removeItem("user");

      setState((s) => ({ ...s, token, user }));
    },
    []
  );

  const clearAuth = React.useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState({ token: null, user: null, loading: false });
  }, []);

  const value = { ...state, setAuth, clearAuth };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
