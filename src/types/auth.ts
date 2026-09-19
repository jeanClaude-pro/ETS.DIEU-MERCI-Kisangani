export type Role = "admin" | "manager" | "inventory_manager" | "cashier_supervisor" | "staff";
export type AccountStatus = "pending" | "active" | "suspended" | "rejected";

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  status?: AccountStatus;
  isActive?: boolean;
  modulePermissions?: string[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// A device-local authorization granted via offline PIN login (spec §14-17).
// Deliberately NOT a JWT/server session — it authorizes nothing on the
// server, and must never be sent to it. `modules` is a capped allowlist
// decided at PIN-setup time, always a subset of the user's real permissions.
export interface OfflineSession {
  userId: string;
  username: string;
  role: Role;
  modules: string[];
  issuedAt: string;
  expiresAt: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  authRequired: boolean;
  // True once this session's role/status/permissions have been confirmed
  // against the server (not just read from localStorage). False while
  // running on a cached session because the device is offline (Part K).
  verified: boolean;
  offlineSession: OfflineSession | null;
}

export type AuthenticationStatus =
  | "INITIALIZING"
  | "ONLINE_AUTHENTICATED"
  | "OFFLINE_AUTHENTICATED"
  | "UNAUTHENTICATED"
  | "AUTH_REQUIRED";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}
