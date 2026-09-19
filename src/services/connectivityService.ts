export type StableConnectivity = "online" | "offline" | "degraded";
export type ConnectivityPhase = StableConnectivity | "checking" | "reconnecting";

export interface ConnectivitySnapshot {
  status: ConnectivityPhase;
  lastSuccessfulCheck: number | null;
  lastAttempt: number | null;
  consecutiveFailures: number;
}

export const HEALTH_TIMEOUT_MS = 4_000;
export const ONLINE_RECHECK_MS = 60_000;
export const ACTIVITY_THROTTLE_MS = 15_000;
export const OFFLINE_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000, 60_000] as const;

export function beginConnectivityCheck(current: ConnectivityPhase): ConnectivityPhase {
  if (current === "offline" || current === "degraded") return "reconnecting";
  return current;
}

/** Backend health—not navigator.onLine—is the connectivity authority. */
export async function probeBackendHealth(
  url: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<StableConnectivity> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return "degraded";
    const body = await response.json().catch(() => null);
    return body?.ok === true && body?.database === "ready" ? "online" : "degraded";
  } catch {
    return "offline";
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

interface ConnectivityControllerOptions {
  probe?: () => Promise<StableConnectivity>;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Sole owner of health request concurrency and scheduling. */
export class ConnectivityController {
  private readonly probe: () => Promise<StableConnectivity>;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<ConnectivityControllerOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<ConnectivityControllerOptions["clearTimer"]>;
  private snapshot: ConnectivitySnapshot = {
    status: "checking",
    lastSuccessfulCheck: null,
    lastAttempt: null,
    consecutiveFailures: 0,
  };
  private stableStatus: StableConnectivity | null = null;
  private listeners = new Set<() => void>();
  private inFlight: Promise<StableConnectivity> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private nextProbeAt = 0;
  private started = false;
  private generation = 0;

  constructor(url: string, options: ConnectivityControllerOptions = {}) {
    this.probe = options.probe || (() => probeBackendHealth(url));
    this.now = options.now || Date.now;
    this.setTimer = options.setTimer || ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.clearTimer = options.clearTimer || ((timer) => globalThis.clearTimeout(timer));
  }

  getSnapshot = (): ConnectivitySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.performCheck(true);
  }

  stop(): void {
    this.started = false;
    this.clearScheduledProbe();
  }

  checkNow = (): Promise<StableConnectivity> => this.performCheck(false);
  browserOnline = (): Promise<StableConnectivity> => this.performCheck(true);

  browserOffline = (): void => {
    this.generation += 1;
    this.stableStatus = "offline";
    const failures = Math.max(1, this.snapshot.consecutiveFailures);
    this.update({ status: "offline", consecutiveFailures: failures });
    this.scheduleProbe(this.backoffFor(failures));
  };

  reportNetworkFailure = (): void => this.browserOffline();
  activityHint = (): Promise<StableConnectivity> => this.performCheck(false);

  private performCheck(immediate: boolean): Promise<StableConnectivity> {
    if (this.inFlight) return this.inFlight;

    const now = this.now();
    if (!immediate && now < this.nextProbeAt) return Promise.resolve(this.stableStatus || "offline");
    if (!immediate && this.snapshot.lastAttempt !== null && now - this.snapshot.lastAttempt < ACTIVITY_THROTTLE_MS) {
      return Promise.resolve(this.stableStatus || "offline");
    }

    this.clearScheduledProbe();
    const generation = ++this.generation;
    this.update({ status: beginConnectivityCheck(this.snapshot.status), lastAttempt: now });

    const request = this.probe()
      .catch(() => "offline" as const)
      .then((next) => {
        if (generation !== this.generation) return this.stableStatus || "offline";

        this.stableStatus = next;
        const completedAt = this.now();
        if (next === "online") {
          this.update({ status: "online", lastSuccessfulCheck: completedAt, consecutiveFailures: 0 });
          this.scheduleProbe(ONLINE_RECHECK_MS);
        } else {
          const failures = this.snapshot.consecutiveFailures + 1;
          this.update({ status: next, consecutiveFailures: failures });
          this.scheduleProbe(this.backoffFor(failures));
        }
        return next;
      })
      .finally(() => {
        if (this.inFlight === request) this.inFlight = null;
      });

    this.inFlight = request;
    return request;
  }

  private backoffFor(failures: number): number {
    return OFFLINE_BACKOFF_MS[Math.min(Math.max(failures - 1, 0), OFFLINE_BACKOFF_MS.length - 1)];
  }

  private scheduleProbe(delay: number): void {
    if (!this.started) return;
    this.clearScheduledProbe();
    this.nextProbeAt = this.now() + delay;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      this.nextProbeAt = 0;
      void this.performCheck(true);
    }, delay);
  }

  private clearScheduledProbe(): void {
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.nextProbeAt = 0;
  }

  private update(patch: Partial<ConnectivitySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
