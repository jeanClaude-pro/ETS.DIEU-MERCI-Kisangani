import type React from "react";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Gauge,
  Home,
  Package,
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
      { id: "dashboard", label: "Tableau de bord", shortLabel: "Tableau", icon: Gauge, path: "/dashboard", roles: ["admin", "manager"], description: "Suivre les principaux indicateurs de la boutique" },
      { id: "rate", label: "Taux d’échange", shortLabel: "Taux", icon: BarChart3, path: "/rate", roles: ["admin", "manager"], description: "Consulter et actualiser le taux USD/FC" },
      { id: "pos", label: "Nouvelle vente", shortLabel: "Vente", icon: ShoppingCart, path: "/new-sale", roles: operationalRoles, phonePriority: 2, description: "Enregistrer une vente rapidement" },
      { id: "reservation", label: "Nouvelle réservation", shortLabel: "Réserver", icon: CalendarClock, path: "/reservation", roles: operationalRoles, description: "Préparer une commande à retirer plus tard" },
      { id: "entry", label: "Entrée de caisse", shortLabel: "Entrée", icon: WalletCards, path: "/entry", roles: operationalRoles, description: "Enregistrer une entrée d’argent" },
      { id: "sortie", label: "Sortie de caisse", shortLabel: "Sortie", icon: WalletCards, path: "/sortie", roles: operationalRoles, description: "Enregistrer une dépense ou une sortie" },
    ],
  },
  {
    title: "Stock",
    items: [
      { id: "products", label: "Articles & stock", shortLabel: "Stock", icon: Package, path: "/products", roles: ["admin", "manager", "inventory_manager"], phonePriority: 4, description: "Gérer les articles, les prix et le stock" },
    ],
  },
  {
    title: "Ventes & rapports",
    items: [
      { id: "sales", label: "Historique des ventes", shortLabel: "Ventes", icon: TrendingUp, path: "/sales", roles: historyRoles, phonePriority: 3, description: "Retrouver, consulter et réimprimer les ventes" },
      { id: "reservations", label: "Historique des réservations", shortLabel: "Réserv.", icon: ClipboardList, path: "/reservationhistory", roles: operationalRoles, description: "Suivre les réservations enregistrées" },
      { id: "entryhistory", label: "Historique des entrées", shortLabel: "Entrées", icon: WalletCards, path: "/EntryHistory", roles: operationalRoles, description: "Consulter les mouvements d’entrée" },
      { id: "sortiehistory", label: "Historique des sorties", shortLabel: "Sorties", icon: WalletCards, path: "/sortiehistory", roles: operationalRoles, description: "Consulter les dépenses et sorties" },
      { id: "reports", label: "Rapports & analyses", shortLabel: "Rapports", icon: BarChart3, path: "/reports", roles: ["admin"], description: "Analyser l’activité commerciale" },
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
  if (Array.isArray(user.modulePermissions)) return user.modulePermissions;
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
