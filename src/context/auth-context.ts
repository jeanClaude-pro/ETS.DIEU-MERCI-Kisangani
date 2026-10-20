import * as React from "react";
import type { AuthenticationStatus, AuthState, OfflineSession, User } from "../types/auth";

export type AuthContextValue = AuthState & {
  status: AuthenticationStatus;
  activeUser: User | null;
  isAuthenticated: boolean;
  setAuth: (v: { token: string | null; user: User | null; refreshToken?: string | null; accessExpiresAt?: string | null }) => void;
  clearAuth: () => void;
  setOfflineSession: (session: OfflineSession) => void;
  clearOfflineSession: () => void;
};

export const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
);
