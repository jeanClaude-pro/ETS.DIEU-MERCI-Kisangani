import { useMemo } from "react";
import { ArrowRight, CalendarDays, ChevronRight, LogOut, Store } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { permittedNavigationItems, type NavigationItem } from "../components/navigationConfig";
import type { Role } from "../types/auth";

const ROLE_DETAILS: Record<Role, { label: string; message: string; priority: string[] }> = {
  admin: {
    label: "Administrateur",
    message: "Supervision complète de la boutique",
    priority: ["dashboard", "pos", "sales", "reports", "management"],
  },
  manager: {
    label: "Manager",
    message: "Pilotage des opérations quotidiennes",
    priority: ["dashboard", "pos", "products", "sales", "rate"],
  },
  cashier_supervisor: {
    label: "Superviseur caisse",
    message: "Ventes, caisse et suivi des clients",
    priority: ["pos", "sales", "entry", "sortie", "customers"],
  },
  inventory_manager: {
    label: "Gestionnaire de stock",
    message: "Articles, stock et opérations autorisées",
    priority: ["products", "pos", "sales", "reservation"],
  },
  staff: {
    label: "Personnel",
    message: "Consultation de vos activités autorisées",
    priority: ["sales"],
  },
};

const sortForRole = (items: NavigationItem[], role: Role): NavigationItem[] => {
  const priority = ROLE_DETAILS[role].priority;
  return [...items].sort((left, right) => {
    const leftIndex = priority.indexOf(left.id);
    const rightIndex = priority.indexOf(right.id);
    const leftOrder = leftIndex === -1 ? priority.length + 1 : leftIndex;
    const rightOrder = rightIndex === -1 ? priority.length + 1 : rightIndex;
    return leftOrder - rightOrder;
  });
};

export default function Welcome() {
  const { activeUser: user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const role = user?.role ?? "staff";
  const roleDetails = ROLE_DETAILS[role];
  const modules = useMemo(() => {
    const permitted = permittedNavigationItems(user).filter((item) => item.id !== "home");
    return sortForRole(permitted, role);
  }, [role, user]);

  const primaryModules = modules.slice(0, Math.min(3, modules.length));
  const secondaryModules = modules.slice(primaryModules.length);
  const displayName = user?.username?.trim() || user?.email?.split("@")[0] || "Utilisateur";
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const logout = () => {
    clearAuth();
    navigate("/login", { replace: true });
  };

  return (
    <main className="welcome-workspace">
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-hero-topbar">
          <div className="welcome-shop">
            <span className="welcome-shop-icon" aria-hidden="true"><Store className="h-5 w-5" /></span>
            <div><span>BOUTIQUE</span><strong>C'EST DIEU QUI PARTAGE</strong></div>
          </div>
          <button type="button" className="welcome-signout" onClick={logout}>
            <LogOut className="h-4 w-4" aria-hidden="true" /><span>Se déconnecter</span>
          </button>
        </div>

        <div className="welcome-hero-content">
          <div className="welcome-greeting">
            <span className="welcome-role-badge">{roleDetails.label}</span>
            <h1 id="welcome-title">Bonjour, {displayName}</h1>
            <p>{roleDetails.message}. Choisissez une action pour commencer.</p>
          </div>
          <div className="welcome-date" aria-label={`Date : ${today}`}>
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            <span>{today}</span>
          </div>
        </div>
      </section>

      <section className="welcome-launcher" aria-labelledby="quick-title">
        <div className="welcome-heading-row">
          <div>
            <span className="welcome-kicker">Démarrage rapide</span>
            <h2 id="quick-title">Que souhaitez-vous faire&nbsp;?</h2>
          </div>
          <span className="welcome-access-count">{modules.length} accès autorisé{modules.length > 1 ? "s" : ""}</span>
        </div>

        {primaryModules.length > 0 ? (
          <div className={`welcome-primary-grid ${primaryModules.length === 1 ? "welcome-primary-grid-single" : ""}`}>
            {primaryModules.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link key={item.id} to={item.path} className={`welcome-primary-card ${index === 0 ? "welcome-primary-card-featured" : ""}`}>
                  <span className="welcome-primary-icon" aria-hidden="true"><Icon className="h-6 w-6" /></span>
                  <span className="welcome-primary-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ArrowRight className="welcome-primary-arrow h-5 w-5" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="welcome-no-access" role="status">
            <strong>Aucun module disponible</strong>
            <span>Contactez un administrateur pour vérifier vos accès.</span>
          </div>
        )}
      </section>

      {secondaryModules.length > 0 && (
        <section className="welcome-other-tools" aria-labelledby="other-tools-title">
          <div className="welcome-heading-row welcome-heading-row-compact">
            <div><span className="welcome-kicker">Espace de travail</span><h2 id="other-tools-title">Autres outils disponibles</h2></div>
          </div>
          <div className="welcome-tools-grid">
            {secondaryModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.id} to={item.path} className="welcome-tool-link">
                  <span className="welcome-tool-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
