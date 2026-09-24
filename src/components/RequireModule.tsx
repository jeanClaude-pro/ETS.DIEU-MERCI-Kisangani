import React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
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
      <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-8">
        <div className="ui-card flex max-w-md flex-col items-center px-6 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-600" aria-hidden="true">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-950">Accès non autorisé</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vous n'avez pas la permission d'accéder à ce module. Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.
          </p>
          <Link to="/" className="ui-btn ui-btn-secondary mt-5">Retour à l'accueil</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireModule;
