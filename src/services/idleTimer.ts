// Inactivity sign-out for shared POS terminals. Pure helpers so the timing
// rules are unit-tested independently of React and the DOM.

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 4;
export const MIN_IDLE_TIMEOUT_MINUTES = 1;
export const IDLE_WARNING_MS = 60_000;
export const LAST_ACTIVITY_STORAGE_KEY = "lastActivityAt";

export type IdleState = "active" | "warning" | "expired";

// Sign-out after 4 minutes without any action. VITE_IDLE_TIMEOUT_MINUTES
// may shorten it (down to 1 minute) but never lengthen it.
export function idleTimeoutMs(rawMinutes: unknown): number {
  const minutes = Number(rawMinutes);
  const safe = Number.isFinite(minutes) && minutes >= MIN_IDLE_TIMEOUT_MINUTES && minutes <= DEFAULT_IDLE_TIMEOUT_MINUTES
    ? minutes
    : DEFAULT_IDLE_TIMEOUT_MINUTES;
  return safe * 60_000;
}

/**
 * Where the idle clock starts when the app (re)opens: the last recorded
 * action, so closing the lid or reloading the tab never resets it. With no
 * record at all the session has just been created.
 */
export function initialActivity(storedValue: string | null, now: number): number {
  const stored = Number(storedValue);
  return storedValue !== null && Number.isFinite(stored) && stored > 0 && stored <= now ? stored : now;
}

export function idleState(lastActivityAt: number, now: number, timeoutMs: number, warningMs = IDLE_WARNING_MS): IdleState {
  const idleFor = now - lastActivityAt;
  if (idleFor >= timeoutMs) return "expired";
  if (idleFor >= timeoutMs - Math.min(warningMs, timeoutMs / 2)) return "warning";
  return "active";
}

export function secondsUntilLogout(lastActivityAt: number, now: number, timeoutMs: number): number {
  return Math.max(0, Math.ceil((lastActivityAt + timeoutMs - now) / 1000));
}

// The most recent activity across all tabs of this browser (shared through
// localStorage), so an idle background tab never signs out an active one.
export function latestActivity(localValue: number, storedValue: string | null): number {
  const stored = Number(storedValue);
  return Number.isFinite(stored) && stored > localValue ? stored : localValue;
}
