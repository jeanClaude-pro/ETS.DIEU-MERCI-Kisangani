// Pure rules for the short-lived access token (15 min) and its silent
// renewal. Kept free of browser APIs so they are unit-tested in Node.

export const TOKEN_STORAGE_KEY = "token";
export const REFRESH_TOKEN_STORAGE_KEY = "refreshToken";
export const ACCESS_EXPIRES_STORAGE_KEY = "accessExpiresAt";

/** Renew this long before the access token expires. */
export const RENEW_BEFORE_EXPIRY_MS = 90_000;
/** Below this margin a request waits for the renewal instead of racing it. */
export const BLOCKING_RENEW_MARGIN_MS = 15_000;

const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout|register)(\?|$)/;

/** Requests to our API that carry an access token and may be retried after renewal. */
export function isRenewableApiRequest(url: string, apiBase: string): boolean {
  if (!url || AUTH_ENDPOINTS.test(url)) return false;
  const base = apiBase.replace(/\/$/, "");
  if (base) return url === base || url.startsWith(`${base}/`);
  return url.startsWith("/api/");
}

export function parseExpiry(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Renew in the background only while the person is actually using the app:
 * a token expiring never ends an active session, while an idle one is left
 * to lapse (the inactivity sign-out closes it first anyway).
 */
export function shouldRenewInBackground(input: {
  expiresAt: number | null;
  now: number;
  lastActivityAt: number;
  idleTimeoutMs: number;
}): boolean {
  if (input.expiresAt === null) return false;
  if (input.expiresAt - input.now > RENEW_BEFORE_EXPIRY_MS) return false;
  return input.now - input.lastActivityAt < input.idleTimeoutMs;
}

/** True when a request is about to go out with a token that is (almost) dead. */
export function mustRenewBeforeSending(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt - now <= BLOCKING_RENEW_MARGIN_MS;
}

export type RefreshOutcome = "renewed" | "superseded" | "rejected" | "unavailable";

/**
 * How to read the server's answer to POST /auth/refresh.
 *  - 200 → renewed
 *  - 409 REFRESH_ROTATED → another tab renewed first; reuse its tokens
 *  - 401 / 400 → the session is over: sign in again
 *  - anything else (offline, 5xx, 429) → try again later, keep the session
 */
export function classifyRefreshResponse(status: number | null): RefreshOutcome {
  if (status === 200) return "renewed";
  if (status === 409) return "superseded";
  if (status === 401 || status === 400) return "rejected";
  return "unavailable";
}
