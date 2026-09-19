export type StableConnectivity = "online" | "offline" | "degraded";
export type ConnectivityPhase = StableConnectivity | "checking" | "reconnecting";

export function beginConnectivityCheck(current: ConnectivityPhase): ConnectivityPhase {
  if (current === "offline" || current === "degraded") return "reconnecting";
  return current;
}

/** Backend health—not navigator.onLine—is the connectivity authority. */
export async function probeBackendHealth(
  url: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4_000,
): Promise<StableConnectivity> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) return "degraded";
    const body = await response.json().catch(() => null);
    return body?.ok === true && body?.database === "ready" ? "online" : "degraded";
  } catch {
    return "offline";
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
