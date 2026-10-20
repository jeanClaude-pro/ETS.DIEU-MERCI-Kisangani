import type { User } from "../types/auth";
import { useAuth } from "./useAuth";

export type ScopedRegion = "Bbbb" | "Cnnn";
export const REGION_SCOPE_LABELS: Record<ScopedRegion, string> = { Bbbb: "Butembo", Cnnn: "China" };

/** The single region this account is limited to, or null for both regions. */
export function regionScopeOf(user?: Pick<User, "role" | "regionScope"> | null): ScopedRegion | null {
  if (!user || user.role === "admin") return null;
  return user.regionScope === "Bbbb" || user.regionScope === "Cnnn" ? user.regionScope : null;
}

export function useRegionScope(): ScopedRegion | null {
  const { user } = useAuth();
  return regionScopeOf(user);
}
