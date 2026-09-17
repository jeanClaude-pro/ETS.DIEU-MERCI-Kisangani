export type Role = "admin" | "manager" | "inventory_manager" | "cashier_supervisor" | "staff";
export type AccountStatus = "pending" | "active" | "suspended" | "rejected";

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  status?: AccountStatus;
  modulePermissions?: string[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
}

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
