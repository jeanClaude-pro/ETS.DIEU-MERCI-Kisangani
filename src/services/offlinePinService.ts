// Offline PIN setup/verification (spec §14-17). Setup must only ever be
// reachable from a genuinely authenticated online session — enforced by the
// UI (route guard + a live connectivity/token check), not here, so this
// module stays a plain, testable function set.
import { offlineDb, getOrCreateDeviceId, type OfflineUserAuthorization } from "../lib/offlineDb.ts";
import { constantTimeEqual, deriveVerifier, generateSalt, isValidPinFormat } from "../utils/offlinePin.ts";
import { effectiveModulesForUser } from "../components/navigationConfig.ts";
import { OFFLINE_SESSION_DURATION_MS } from "./authorizationService.ts";
import type { OfflineSession, User } from "../types/auth";

export class OfflinePinError extends Error {}

// Never full admin/management access, regardless of the user's real role —
// knowing the PIN must never grant more than baseline POS operation.
const OFFLINE_MODULE_ALLOWLIST = ["pos", "sync", "scanner"];

const LOCK_THRESHOLD_SHORT = 5;
const LOCK_THRESHOLD_LONG = 10;
const LOCK_DURATION_SHORT_MS = 5 * 60 * 1000;
const LOCK_DURATION_LONG_MS = 30 * 60 * 1000;

export async function setupOfflinePin(
  user: Pick<User, "id" | "username" | "role" | "modulePermissions">,
  pin: string,
): Promise<void> {
  if (!isValidPinFormat(pin)) {
    throw new OfflinePinError("Le code doit contenir entre 4 et 12 chiffres.");
  }
  const deviceId = await getOrCreateDeviceId();
  const salt = generateSalt();
  const verifier = await deriveVerifier(pin, salt);
  const offlineModules = effectiveModulesForUser(user).filter((id) => OFFLINE_MODULE_ALLOWLIST.includes(id));
  const now = new Date().toISOString();
  const row: OfflineUserAuthorization = {
    userId: user.id,
    deviceId,
    username: user.username,
    role: user.role,
    offlineModules,
    salt,
    verifier,
    authorizedAt: now,
    updatedAt: now,
  };
  await offlineDb.offlineUsers.put(row);
  await offlineDb.offlineAuthState.put({ userId: user.id, failedAttempts: 0, lockedUntil: null });
}

export async function hasOfflinePinConfigured(userId: string): Promise<boolean> {
  return Boolean(await offlineDb.offlineUsers.get(userId));
}

export interface OfflineLoginCandidate {
  userId: string;
  username: string;
  role: string;
}

// Username/role only — the salt and verifier are never surfaced to the UI.
export async function listOfflineAuthorizedUsers(): Promise<OfflineLoginCandidate[]> {
  const rows = await offlineDb.offlineUsers.toArray();
  return rows.map((row) => ({ userId: row.userId, username: row.username, role: row.role }));
}

export interface OfflinePinVerifyResult {
  ok: boolean;
  reason?: string;
  session?: OfflineSession;
}

function lockDurationForAttempts(attempts: number): number | null {
  if (attempts >= LOCK_THRESHOLD_LONG) return LOCK_DURATION_LONG_MS;
  if (attempts >= LOCK_THRESHOLD_SHORT) return LOCK_DURATION_SHORT_MS;
  return null;
}

export async function verifyOfflinePin(userId: string, pin: string): Promise<OfflinePinVerifyResult> {
  const [credential, attemptState] = await Promise.all([
    offlineDb.offlineUsers.get(userId),
    offlineDb.offlineAuthState.get(userId),
  ]);
  if (!credential) {
    return { ok: false, reason: "Aucune autorisation hors ligne enregistrée pour cet utilisateur sur cet appareil." };
  }

  const now = Date.now();
  if (attemptState?.lockedUntil && new Date(attemptState.lockedUntil).getTime() > now) {
    const remainingMin = Math.ceil((new Date(attemptState.lockedUntil).getTime() - now) / 60_000);
    return { ok: false, reason: `Trop de tentatives. Réessayez dans ${remainingMin} minute${remainingMin > 1 ? "s" : ""}.` };
  }

  const candidate = await deriveVerifier(pin, credential.salt);
  const matches = constantTimeEqual(candidate, credential.verifier);

  if (!matches) {
    const failedAttempts = (attemptState?.failedAttempts ?? 0) + 1;
    const lockMs = lockDurationForAttempts(failedAttempts);
    await offlineDb.offlineAuthState.put({
      userId,
      failedAttempts,
      lockedUntil: lockMs ? new Date(now + lockMs).toISOString() : null,
    });
    return { ok: false, reason: "Code incorrect." };
  }

  await offlineDb.offlineAuthState.put({ userId, failedAttempts: 0, lockedUntil: null });
  const issuedAt = new Date(now).toISOString();
  return {
    ok: true,
    session: {
      userId: credential.userId,
      username: credential.username,
      role: credential.role as OfflineSession["role"],
      modules: credential.offlineModules,
      issuedAt,
      expiresAt: new Date(now + OFFLINE_SESSION_DURATION_MS).toISOString(),
    },
  };
}
