import { Link, useLocation } from "react-router-dom";
import { KeyRound, Store } from "lucide-react";
import { effectiveModulesForUser, navigationSections } from "./navigationConfig";
import SyncStatusIndicator from "./SyncStatusIndicator";
import { useAuth } from "../hooks/useAuth";

const navigationItems = navigationSections.flatMap((section) => section.items);

export default function AppHeader() {
  const { pathname } = useLocation();
  const { token, user } = useAuth();
  const current = navigationItems.find((item) =>
    pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`)),
  );
  // Only a real online session can configure a device PIN — no value in
  // surfacing the link to a device already running on a PIN session.
  const canConfigureOfflinePin = Boolean(token) && effectiveModulesForUser(user).includes("pos");

  return (
    <header className="app-header">
      <Link to="/" className="app-header-brand" aria-label="Retour à l’accueil">
        <span className="app-header-mark" aria-hidden="true"><Store className="h-4 w-4" /></span>
        <span>
          <strong>BOUTIQUE C'EST DIEU QUI PARTAGE</strong>
          <small>{current?.label ?? "Espace de travail"}</small>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        {canConfigureOfflinePin && (
          <Link
            to="/offline-pin-setup"
            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Configurer le code PIN hors ligne"
            title="Sécurité hors ligne"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">PIN hors ligne</span>
          </Link>
        )}
        <SyncStatusIndicator />
      </div>
    </header>
  );
}
