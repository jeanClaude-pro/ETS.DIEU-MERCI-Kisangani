// Silent renewal of the 15-minute access token.
//
// The access token sent with every API call expires after 15 minutes so a
// copied or old token is useless quickly. While the person keeps working,
// it is renewed in the background with a single-use refresh token: an
// expiring token never interrupts a session. The inactivity sign-out
// (IdleLogout, 4 minutes) is what ends an unattended session.
//
// installSessionKeeper() patches window.fetch once, at startup, so the
// ~30 places that call the API directly all benefit without changes:
//  - a request about to leave with a dying token waits for the renewal;
//  - a request answered 401 TOKEN_EXPIRED is renewed and retried once.
import { serverUrl } from "../utils/constants";
import { LAST_ACTIVITY_STORAGE_KEY, idleTimeoutMs } from "./idleTimer";
import {
  ACCESS_EXPIRES_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  classifyRefreshResponse,
  isRenewableApiRequest,
  mustRenewBeforeSending,
  parseExpiry,
  shouldRenewInBackground,
} from "./sessionPolicy";
import type { User } from "../types/auth";

const API_BASE = serverUrl.replace(/\/$/, "");
const IDLE_TIMEOUT_MS = idleTimeoutMs(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES);
const KEEPER_INTERVAL_MS = 20_000;
const LOCK_NAME = "boutique-auth-refresh";

// The unpatched fetch: renewal calls must never recurse into the interceptor.
const nativeFetch: typeof fetch = typeof window !== "undefined" ? window.fetch.bind(window) : fetch;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null | undefined) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}

export interface SessionTokens {
  token: string;
  refreshToken?: string | null;
  accessExpiresAt?: string | null;
}

export function storeSessionTokens({ token, refreshToken, accessExpiresAt }: SessionTokens) {
  write(TOKEN_STORAGE_KEY, token);
  if (refreshToken !== undefined) write(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  if (accessExpiresAt !== undefined) write(ACCESS_EXPIRES_STORAGE_KEY, accessExpiresAt);
}

export function clearSessionTokens() {
  write(TOKEN_STORAGE_KEY, null);
  write(REFRESH_TOKEN_STORAGE_KEY, null);
  write(ACCESS_EXPIRES_STORAGE_KEY, null);
}

/** Logout: the server forgets the refresh token, then local copies go. */
export function revokeSession() {
  const refreshToken = read(REFRESH_TOKEN_STORAGE_KEY);
  clearSessionTokens();
  if (!refreshToken) return;
  void nativeFetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    keepalive: true,
  }).catch(() => { /* offline: the token dies on its own within 30 minutes */ });
}

let inFlight: Promise<string | null> | null = null;

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks?.request) return locks.request(LOCK_NAME, fn) as Promise<T>;
  return fn();
}

async function performRefresh(): Promise<string | null> {
  const tokenBefore = read(TOKEN_STORAGE_KEY);
  return withCrossTabLock(async () => {
    // Another tab may have renewed while this one waited for the lock.
    const current = read(TOKEN_STORAGE_KEY);
    if (current && current !== tokenBefore) return current;

    const refreshToken = read(REFRESH_TOKEN_STORAGE_KEY);
    if (!refreshToken || !current) return null;

    let status: number | null = null;
    let body: { token?: string; refreshToken?: string; accessExpiresAt?: string; user?: User } = {};
    try {
      const res = await nativeFetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch {
      status = null;
    }

    const outcome = classifyRefreshResponse(status);
    if (outcome === "renewed" && body.token && body.refreshToken) {
      storeSessionTokens({ token: body.token, refreshToken: body.refreshToken, accessExpiresAt: body.accessExpiresAt ?? null });
      if (body.user) {
        write("user", JSON.stringify(body.user));
        window.dispatchEvent(new CustomEvent("session-renewed", { detail: { token: body.token, user: body.user } }));
      }
      return body.token;
    }
    if (outcome === "superseded") {
      const latest = read(TOKEN_STORAGE_KEY);
      return latest && latest !== current ? latest : null;
    }
    if (outcome === "rejected") {
      clearSessionTokens();
      window.dispatchEvent(new CustomEvent("auth-required"));
    }
    // "unavailable": keep the session; a later attempt may succeed.
    return null;
  });
}

/** Renews the access token once, however many callers ask at the same time. */
export function refreshAccessToken(): Promise<string | null> {
  if (!inFlight) {
    inFlight = performRefresh().finally(() => { inFlight = null; });
  }
  return inFlight;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function bearerOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const value = headers.get("Authorization");
  return value && value.startsWith("Bearer ") ? value.slice(7) : null;
}

function withBearer(input: RequestInfo | URL, init: RequestInit | undefined, token: string): [RequestInfo | URL, RequestInit] {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("Authorization", `Bearer ${token}`);
  return [input, { ...init, headers }];
}

async function isExpiredTokenResponse(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const data = await res.clone().json();
    return data?.code === "TOKEN_EXPIRED";
  } catch {
    return false;
  }
}

let installed = false;

export function installSessionKeeper() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const sentToken = bearerOf(input, init);
    if (!sentToken || !isRenewableApiRequest(url, API_BASE)) return nativeFetch(input, init);

    // A Request body can be read only once: keep a copy for the retry.
    const spare = input instanceof Request ? input.clone() : input;

    let token = sentToken;
    if (token === read(TOKEN_STORAGE_KEY) && mustRenewBeforeSending(parseExpiry(read(ACCESS_EXPIRES_STORAGE_KEY)), Date.now())) {
      token = (await refreshAccessToken()) ?? token;
    } else if (token !== read(TOKEN_STORAGE_KEY) && read(TOKEN_STORAGE_KEY)) {
      // Caller captured the token before a renewal: send the current one.
      token = read(TOKEN_STORAGE_KEY) as string;
    }

    const response = await nativeFetch(...(token === sentToken ? [input, init] as const : withBearer(input, init, token)));
    if (!(await isExpiredTokenResponse(response))) return response;

    const renewed = await refreshAccessToken();
    if (!renewed) return response;
    return nativeFetch(...withBearer(spare, init, renewed));
  };

  // Proactive renewal while the person is active, so most requests never
  // even see an expired token.
  window.setInterval(() => {
    if (!read(REFRESH_TOKEN_STORAGE_KEY)) return;
    const lastActivityAt = Number(read(LAST_ACTIVITY_STORAGE_KEY)) || 0;
    if (shouldRenewInBackground({
      expiresAt: parseExpiry(read(ACCESS_EXPIRES_STORAGE_KEY)),
      now: Date.now(),
      lastActivityAt,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    })) {
      void refreshAccessToken();
    }
  }, KEEPER_INTERVAL_MS);
}
