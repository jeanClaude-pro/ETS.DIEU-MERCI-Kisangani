import { Link, useLocation } from "react-router-dom";
import { KeyRound } from "lucide-react";
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
      <Link to="/" className="app-header-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Retour à l’accueil">
        <span className="app-header-mark" aria-hidden="true"><img src="/Mrcleanlogo.png" alt="" /></span>
        <span>
          <small>C'est Dieu qui partage</small>
          <strong>{current?.label ?? "Espace de travail"}</strong>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {canConfigureOfflinePin && (
          <Link
            to="/offline-pin-setup"
            className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Configurer le code PIN hors ligne"
            title="Sécurité hors ligne"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">PIN hors ligne</span>
          </Link>
        )}
        <SyncStatusIndicator />
      </div>
    </header>
  );
}
