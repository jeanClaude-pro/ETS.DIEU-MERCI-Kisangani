import { Link, useLocation } from "react-router-dom";
import { Store } from "lucide-react";
import { navigationSections } from "./navigationConfig";

const navigationItems = navigationSections.flatMap((section) => section.items);

export default function AppHeader() {
  const { pathname } = useLocation();
  const current = navigationItems.find((item) =>
    pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`)),
  );

  return (
    <header className="app-header">
      <Link to="/" className="app-header-brand" aria-label="Retour à l’accueil">
        <span className="app-header-mark" aria-hidden="true"><Store className="h-4 w-4" /></span>
        <span>
          <strong>BOUTIQUE C'EST DIEU QUI PARTAGE</strong>
          <small>{current?.label ?? "Espace de travail"}</small>
        </span>
      </Link>
    </header>
  );
}
