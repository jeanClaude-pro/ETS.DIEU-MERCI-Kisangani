export type Role = "admin" | "staff";

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
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
