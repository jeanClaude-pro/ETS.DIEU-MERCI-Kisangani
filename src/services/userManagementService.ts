import { apiFetch } from "../lib/api";
import type { AccountStatus, Role, User } from "../types/auth";

export interface UserHistoryEntry {
  action: string;
  performedBy?: string | null;
  performedByUsername?: string | null;
  at: string;
  details?: Record<string, unknown> | null;
}

export interface ManagedUser extends User {
  isActive: boolean;
}

export interface UserDetail extends ManagedUser {
  history: UserHistoryEntry[];
}

export interface UserListResponse {
  users: ManagedUser[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface UserStats {
  pending: number;
  active: number;
  suspended: number;
  rejected: number;
  byRole: Record<string, number>;
}

export interface ListUsersParams {
  [key: string]: string | number | undefined;
  status?: AccountStatus;
  role?: Role;
  search?: string;
  page?: number;
  limit?: number;
}

function toQueryString(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listUsers(params: ListUsersParams = {}) {
  return apiFetch<UserListResponse>(`users${toQueryString(params)}`);
}

export function getUserStats() {
  return apiFetch<UserStats>("users/stats");
}

export function getUser(userId: string) {
  return apiFetch<UserDetail>(`users/${userId}`);
}

export function createUser(payload: { username: string; email: string; password: string; role: Role }) {
  return apiFetch<ManagedUser>("users", { method: "POST", body: JSON.stringify(payload) });
}

export function approveUser(userId: string, payload: { role: Role; modulePermissions: string[] }) {
  return apiFetch<ManagedUser>(`users/${userId}/approve`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function rejectUser(userId: string, reason?: string) {
  return apiFetch<ManagedUser>(`users/${userId}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
}

export function suspendUser(userId: string, reason?: string) {
  return apiFetch<ManagedUser>(`users/${userId}/suspend`, { method: "PATCH", body: JSON.stringify({ reason }) });
}

export function reactivateUser(userId: string) {
  return apiFetch<ManagedUser>(`users/${userId}/reactivate`, { method: "PATCH" });
}

export function updateUserRole(userId: string, role: Role) {
  return apiFetch<ManagedUser>(`users/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) });
}

export function updateUserModules(userId: string, modulePermissions: string[]) {
  return apiFetch<ManagedUser>(`users/${userId}/modules`, { method: "PUT", body: JSON.stringify({ modulePermissions }) });
}

export function deleteUser(userId: string) {
  return apiFetch<{ message: string }>(`users/${userId}`, { method: "DELETE" });
}
