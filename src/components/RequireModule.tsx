import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { effectiveModulesForUser } from "./navigationConfig";
import { ShieldAlert } from "lucide-react";

// Backend enforcement (requireModulePermission middleware) is the real
// security boundary; this only decides what the UI renders/navigates to.
export const RequireModule: React.FC<React.PropsWithChildren<{ moduleId: string }>> = ({ moduleId, children }) => {
  const { token, activeUser, offlineSession, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;

  // A device-local PIN session is capped to its own allowlist (spec §16),
  // never the user's full server-side permission set.
  const allowed = token
    ? effectiveModulesForUser(activeUser).includes(moduleId)
    : offlineSession!.modules.includes(moduleId);
  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-red-500" />
        <h1 className="text-xl font-bold text-gray-900">Accès non autorisé</h1>
        <p className="max-w-sm text-sm text-gray-600">
          Vous n'avez pas la permission d'accéder à ce module. Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireModule;
