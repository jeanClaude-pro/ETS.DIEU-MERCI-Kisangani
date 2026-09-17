import type React from "react";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Gauge,
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
};

export type NavigationSection = { title: string; items: NavigationItem[] };

const operationalRoles = ["admin", "manager", "cashier_supervisor", "inventory_manager"];
const historyRoles = [...operationalRoles, "staff"];

// One source of truth for desktop, tablet, and phone navigation permissions.
export const navigationSections: NavigationSection[] = [
  {
    title: "Menu principal",
    items: [
      { id: "dashboard", label: "Tableau de bord", shortLabel: "Accueil", icon: Gauge, path: "/dashboard", roles: ["admin", "manager"] },
      { id: "rate", label: "Taux d’échange", shortLabel: "Taux", icon: BarChart3, path: "/rate", roles: ["admin"] },
      { id: "pos", label: "Point de vente", shortLabel: "Vente", icon: ShoppingCart, path: "/", roles: operationalRoles, phonePriority: 1 },
      { id: "reservation", label: "Nouvelle réservation", shortLabel: "Réserver", icon: CalendarClock, path: "/reservation", roles: operationalRoles },
      { id: "entry", label: "Entrée de caisse", shortLabel: "Entrée", icon: WalletCards, path: "/entry", roles: operationalRoles, phonePriority: 3 },
      { id: "sortie", label: "Sortie de caisse", shortLabel: "Sortie", icon: WalletCards, path: "/sortie", roles: operationalRoles, phonePriority: 4 },
    ],
  },
  {
    title: "Stock",
    items: [
      { id: "products", label: "Articles", shortLabel: "Articles", icon: Package, path: "/products", roles: ["admin", "manager", "inventory_manager"] },
    ],
  },
  {
    title: "Ventes & rapports",
    items: [
      { id: "sales", label: "Historique des ventes", shortLabel: "Ventes", icon: TrendingUp, path: "/sales", roles: historyRoles, phonePriority: 2 },
      { id: "reservations", label: "Historique des réservations", shortLabel: "Réserv.", icon: ClipboardList, path: "/reservationhistory", roles: operationalRoles },
      { id: "entryhistory", label: "Historique des entrées", shortLabel: "Entrées", icon: WalletCards, path: "/EntryHistory", roles: operationalRoles },
      { id: "sortiehistory", label: "Historique des sorties", shortLabel: "Sorties", icon: WalletCards, path: "/sortiehistory", roles: operationalRoles },
      { id: "reports", label: "Rapports", shortLabel: "Rapports", icon: BarChart3, path: "/reports", roles: ["admin"] },
    ],
  },
  {
    title: "Gestion",
    items: [
      { id: "customers", label: "Clients", shortLabel: "Clients", icon: Users, path: "/customers", roles: ["admin", "manager", "cashier_supervisor"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { id: "management", label: "Gestion des utilisateurs", shortLabel: "Gestion", icon: ShieldCheck, path: "/management", roles: ["admin"] },
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
  return navigationSections
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed.includes(item.id)) }))
    .filter((section) => section.items.length > 0);
};

export const permittedNavigationItems = (user?: Pick<User, "role" | "modulePermissions"> | null): NavigationItem[] =>
  permittedNavigationSections(user).flatMap((section) => section.items);

export const isNavigationItemActive = (pathname: string, path: string): boolean =>
  path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
