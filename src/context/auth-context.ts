import * as React from "react";
import type { AuthState, OfflineSession, User } from "../types/auth";

export type AuthContextValue = AuthState & {
  setAuth: (v: { token: string | null; user: User | null }) => void;
  clearAuth: () => void;
  setOfflineSession: (session: OfflineSession) => void;
  clearOfflineSession: () => void;
};

export const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
);
