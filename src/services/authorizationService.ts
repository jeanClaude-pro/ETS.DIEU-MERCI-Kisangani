// Offline authorization (Part K). Two independent paths can authorize an
// offline sale: (1) the same localStorage token/user cache AuthProvider
// already writes on every successful login/`/users/me` refresh, still valid
// (a cashier mid-shift never sees a PIN prompt); or (2) a device-local PIN
// session (spec §14-17) — for the case where that cached JWT itself has
// expired while still offline (e.g. the PWA restarted after the token's
// window closed). Neither path stores a secret beyond what's needed: no
// password, no PIN, no server session forged from the PIN.
import type { OfflineSession, User } from "../types/auth";
import { effectiveModulesForUser } from "../components/navigationConfig.ts";

export const OFFLINE_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const OFFLINE_SESSION_STORAGE_KEY = "offlineSession";

export interface CachedSession {
  token: string;
  user: User;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
  return atob(padded);
}

// Local convenience only — the server is always the real authority on token
// validity. This just avoids offering an offline sale on a token that's
// already expired on this device's own clock.
export function isJwtExpired(token: string, now: number = Date.now()): boolean {
  try {
    const payload = JSON.parse(base64UrlDecode(token.split(".")[1]));
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 <= now;
  } catch {
    return true; // an unparsable token can't be trusted offline
  }
}

// Mirrors server/utils/userAccess.js's isAccountUsable so the offline gate
// matches the server's real rule instead of inventing a looser one.
export function isAccountUsable(user: Pick<User, "isActive" | "status"> | null | undefined): boolean {
  if (!user) return false;
  if (user.isActive === false) return false;
  if (user.status === "pending" || user.status === "rejected") return false;
  return true;
}

export function readCachedSession(): CachedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");
    if (!token || !userRaw) return null;
    return { token, user: JSON.parse(userRaw) as User };
  } catch {
    return null;
  }
}

export function readOfflineSession(): OfflineSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OFFLINE_SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineSession) : null;
  } catch {
    return null;
  }
}

export function isOfflineSessionExpired(session: OfflineSession, now: number = Date.now()): boolean {
  return new Date(session.expiresAt).getTime() <= now;
}

export interface EffectiveIdentity {
  username: string;
  role: string;
}

export interface OfflineSaleAuthorization {
  allowed: boolean;
  reason?: string;
  session: CachedSession | null;
  // Who to attribute the sale to, regardless of which of the two paths
  // above authorized it — NewSale.tsx uses this instead of reading
  // useAuth().user directly, since a PIN session has no `user`.
  identity: EffectiveIdentity | null;
}

type PathCheck = { ok: true; identity: EffectiveIdentity } | { ok: false; reason: string } | null;

function checkCachedJwtSession(session: CachedSession | null): PathCheck {
  if (!session) return null;
  if (isJwtExpired(session.token)) return { ok: false, reason: "Votre session a expiré. Reconnectez-vous dès que possible ou utilisez le code PIN hors ligne." };
  if (!isAccountUsable(session.user)) return { ok: false, reason: "Ce compte n'est pas autorisé à vendre actuellement." };
  if (!effectiveModulesForUser(session.user).includes("pos")) return { ok: false, reason: "Ce compte n'a pas accès au module Vente." };
  return { ok: true, identity: { username: session.user.username, role: session.user.role } };
}

function checkOfflinePinSession(offlineSession: OfflineSession | null): PathCheck {
  if (!offlineSession) return null;
  if (isOfflineSessionExpired(offlineSession)) return { ok: false, reason: "Votre session hors ligne (code PIN) a expiré. Reconnectez-vous." };
  if (!offlineSession.modules.includes("pos")) return { ok: false, reason: "Ce compte n'a pas accès au module Vente hors ligne." };
  return { ok: true, identity: { username: offlineSession.username, role: offlineSession.role } };
}

// The single gate NewSale.tsx checks before allowing an offline sale: either
// a previously-authenticated session not expired by this device's clock, or
// a valid device-local PIN session — in good standing, with POS access —
// evaluated locally because the server can't be reached right now.
export function canSellOffline(): OfflineSaleAuthorization {
  const session = readCachedSession();
  const jwtResult = checkCachedJwtSession(session);
  if (jwtResult?.ok) return { allowed: true, session, identity: jwtResult.identity };

  const offlineSession = readOfflineSession();
  const pinResult = checkOfflinePinSession(offlineSession);
  if (pinResult?.ok) return { allowed: true, session: null, identity: pinResult.identity };

  if (!jwtResult && !pinResult) {
    return { allowed: false, reason: "Aucune session locale. Connectez-vous en ligne au moins une fois sur cet appareil.", session: null, identity: null };
  }
  // The PIN-specific reason is the more actionable one when both paths
  // exist but neither currently qualifies.
  const reason = (pinResult && !pinResult.ok ? pinResult.reason : null)
    || (jwtResult && !jwtResult.ok ? jwtResult.reason : null)
    || "Vente hors-ligne non autorisée sur cet appareil.";
  return { allowed: false, reason, session: null, identity: null };
}
