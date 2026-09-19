import type { AuthenticationStatus, AuthState, OfflineSession, User } from "../types/auth.ts";

export function userFromOfflineSession(session: OfflineSession | null): User | null {
  return session ? {
    id: session.userId,
    username: session.username,
    email: "",
    role: session.role,
    status: "active",
    isActive: true,
    modulePermissions: session.modules,
  } : null;
}

export function authenticationStatus(
  state: Pick<AuthState, "loading" | "authRequired" | "token" | "user">,
  activeOfflineSession: OfflineSession | null,
): AuthenticationStatus {
  if (state.loading) return "INITIALIZING";
  if (state.authRequired) return "AUTH_REQUIRED";
  if (state.token && state.user) return "ONLINE_AUTHENTICATED";
  if (activeOfflineSession) return "OFFLINE_AUTHENTICATED";
  return "UNAUTHENTICATED";
}
