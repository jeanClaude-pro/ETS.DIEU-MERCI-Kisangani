import type React from "react";
import {
  BarChart3,
  CloudOff,
  Gauge,
  Home,
  Package,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import type { User } from "../types/auth";

export type NavigationItem = {
  id: string;
  label: string;
  shortLabel: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  phonePriority?: number;
  badge?: number;
  description?: string;
};

export type NavigationSection = { title: string; items: NavigationItem[] };

const operationalRoles = ["admin", "manager", "cashier_supervisor", "inventory_manager"];
const historyRoles = [...operationalRoles, "staff"];
// Read-only consultation of one region (mirrors server SHAREHOLDER_MODULES).
const shareholder = "shareholder";
export const SHAREHOLDER_MODULES = ["dashboard", "products", "sales", "entryhistory", "sortiehistory", "reports"];

export const homeNavigationItem: NavigationItem = {
  id: "home",
  label: "Accueil",
  shortLabel: "Accueil",
  icon: Home,
  path: "/",
  roles: [],
  phonePriority: 1,
  description: "Choisir un module et commencer votre travail",
};

// One source of truth for desktop, tablet, and phone navigation permissions.
export const navigationSections: NavigationSection[] = [
  {
    title: "Menu principal",
    items: [
      { id: "dashboard", label: "Tableau de bord", shortLabel: "Tableau", icon: Gauge, path: "/dashboard", roles: ["admin", "manager", shareholder], description: "Suivre les principaux indicateurs de la boutique" },
      { id: "rate", label: "Taux d’échange", shortLabel: "Taux", icon: BarChart3, path: "/rate", roles: ["admin", "manager"], description: "Consulter et actualiser le taux USD/FC" },
      { id: "pos", label: "Nouvelle vente", shortLabel: "Vente", icon: ShoppingCart, path: "/new-sale", roles: operationalRoles, phonePriority: 2, description: "Enregistrer une vente rapidement" },
      { id: "entry", label: "Entrée de caisse", shortLabel: "Entrée", icon: WalletCards, path: "/entry", roles: operationalRoles, description: "Enregistrer une entrée d’argent" },
      { id: "sortie", label: "Sortie de caisse", shortLabel: "Sortie", icon: WalletCards, path: "/sortie", roles: operationalRoles, description: "Enregistrer une dépense ou une sortie" },
    ],
  },
  {
    title: "Stock",
    items: [
      { id: "products", label: "Articles & stock", shortLabel: "Stock", icon: Package, path: "/products", roles: ["admin", "manager", "inventory_manager", shareholder], phonePriority: 4, description: "Gérer les articles, les prix et le stock" },
    ],
  },
  {
    title: "Ventes & rapports",
    items: [
      { id: "sales", label: "Historique des ventes", shortLabel: "Ventes", icon: TrendingUp, path: "/sales", roles: [...historyRoles, shareholder], phonePriority: 3, description: "Retrouver, consulter et réimprimer les ventes" },
      { id: "sync", label: "Ventes non synchronisées", shortLabel: "À synchroniser", icon: CloudOff, path: "/sync-center", roles: operationalRoles, description: "Suivre les ventes conservées sur cet appareil" },
      { id: "scanner", label: "Scanner un reçu", shortLabel: "Scanner", icon: ScanLine, path: "/scan", roles: historyRoles, description: "Retrouver un reçu à partir de son numéro" },
      { id: "entryhistory", label: "Historique des entrées", shortLabel: "Entrées", icon: WalletCards, path: "/EntryHistory", roles: [...operationalRoles, shareholder], description: "Consulter les mouvements d’entrée" },
      { id: "sortiehistory", label: "Historique des sorties", shortLabel: "Sorties", icon: WalletCards, path: "/sortiehistory", roles: [...operationalRoles, shareholder], description: "Consulter les dépenses et sorties" },
      { id: "reports", label: "Rapports & analyses", shortLabel: "Rapports", icon: BarChart3, path: "/reports", roles: ["admin", shareholder], description: "Analyser l’activité commerciale" },
    ],
  },
  {
    title: "Gestion",
    items: [
      { id: "customers", label: "Clients", shortLabel: "Clients", icon: Users, path: "/customers", roles: ["admin", "manager", "cashier_supervisor"], description: "Consulter et gérer le fichier clients" },
    ],
  },
  {
    title: "Administration",
    items: [
      { id: "management", label: "Gestion des utilisateurs", shortLabel: "Gestion", icon: ShieldCheck, path: "/management", roles: ["admin"], description: "Administrer les comptes et les accès" },
    ],
  },
];

export const ALL_MODULE_IDS: string[] = navigationSections.flatMap((section) => section.items.map((item) => item.id));

// Ids where role appears in the item's `roles` array — the exact access every
// user of that role has today, before any per-user customization exists.
export const defaultModulesForRole = (role?: string): string[] =>
  role ? navigationSections.flatMap((section) => section.items).filter((item) => item.roles.includes(role)).map((item) => item.id) : [];

// Single source of truth for "what can this user actually reach", consumed
// by Sidebar, AdaptiveNavigation (phone/tablet), and RequireModule alike.
// Admins always get every module so they can never lock themselves out of
// Management (or anything else) via their own permission edits.
export const effectiveModulesForUser = (user?: Pick<User, "role" | "modulePermissions"> | null): string[] => {
  if (!user) return [];
  if (user.role === "admin") return ALL_MODULE_IDS;
  // Mirrors the server: a shareholder only ever consults these modules.
  if (user.role === "shareholder") {
    const chosen = Array.isArray(user.modulePermissions) ? user.modulePermissions : defaultModulesForRole("shareholder");
    return chosen.filter((id) => SHAREHOLDER_MODULES.includes(id));
  }
  if (Array.isArray(user.modulePermissions)) {
    // Sync Center is an operational safety companion to POS. Existing
    // customized users who already have POS access must not lose access just
    // because their stored array predates the new module id.
    return user.modulePermissions.includes("pos") && !user.modulePermissions.includes("sync")
      ? [...user.modulePermissions, "sync"]
      : user.modulePermissions;
  }
  return defaultModulesForRole(user.role);
};

export const permittedNavigationSections = (user?: Pick<User, "role" | "modulePermissions"> | null): NavigationSection[] => {
  const allowed = effectiveModulesForUser(user);
  const permitted = navigationSections
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed.includes(item.id)) }))
    .filter((section) => section.items.length > 0);
  return user ? [{ title: "Accueil", items: [homeNavigationItem] }, ...permitted] : [];
};

export const permittedNavigationItems = (user?: Pick<User, "role" | "modulePermissions"> | null): NavigationItem[] =>
  permittedNavigationSections(user).flatMap((section) => section.items);

export const isNavigationItemActive = (pathname: string, path: string): boolean =>
  path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
