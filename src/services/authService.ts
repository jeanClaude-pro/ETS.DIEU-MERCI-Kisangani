/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LoginPayload, RegisterPayload, LoginResponse, User } from "../types/auth";
import { serverUrl } from "../utils/constants";

const API_BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") ||
  `${serverUrl}`; // adjust if needed

// Thrown when the request never reached the server (offline, DNS failure,
// timeout, etc.) — distinct from a real HTTP error response, so callers
// like AuthProvider can tell "can't verify right now" apart from "the
// server said no" and avoid logging a cashier out just because the device
// went offline (Part K).
export class NetworkError extends Error {}
export class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch (networkFailure) {
    throw new NetworkError(networkFailure instanceof Error ? networkFailure.message : "Network unavailable");
  }

  const data = (await res.json().catch(() => ({}))) as any;
  if (res.status === 401 && typeof window !== "undefined" && localStorage.getItem("token")) {
    window.dispatchEvent(new CustomEvent("auth-required"));
  }
  if (!res.ok) throw new HttpError(data?.message || `Request failed (${res.status})`, res.status);
  return data as T;
}

export function login(payload: LoginPayload) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function register(payload: RegisterPayload) {
  return apiFetch<{ message: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

// Only if you implement it on the server:
export function fetchMe() {
  return apiFetch<User>("/users/me", { method: "GET" });
}
