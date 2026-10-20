import type { RegionScope, Role } from "../types/auth";
import { defaultModulesForRole } from "../components/navigationConfig";

// What each role can and cannot do, written from the rules the server
// enforces (server/config/modulePermissions.js, utils/saleAccess.js and the
// route guards). Shown to the administrator before assigning a role.
export interface RoleProfile {
  role: Role;
  label: string;
  summary: string;
  can: string[];
  cannot: string[];
  /** Home-screen ordering of modules for this role. */
  priority: string[];
  /** Only one region may be assigned. */
  singleRegion?: boolean;
  /** Always sees both regions. */
  allRegions?: boolean;
  readOnly?: boolean;
}

export const ROLE_PROFILES: RoleProfile[] = [
  {
    role: "admin",
    label: "Administrateur",
    summary: "Supervision complète de la boutique, des deux régions.",
    can: [
      "Accès à tous les modules, sans restriction",
      "Créer, modifier et supprimer des articles",
      "Modifier, annuler ou supprimer une vente",
      "Valider ou refuser les sorties de caisse",
      "Voir les coûts, marges et rapports complets",
      "Créer les comptes et attribuer rôles et régions",
    ],
    cannot: ["Être limité à une seule région"],
    priority: ["dashboard", "pos", "sales", "reports", "management"],
    allRegions: true,
  },
  {
    role: "manager",
    label: "Manager",
    summary: "Pilote les opérations quotidiennes.",
    can: [
      "Vendre, réserver, enregistrer entrées et sorties",
      "Consulter le tableau de bord et les historiques",
      "Gérer le taux d'échange",
      "Valider ou refuser les sorties de caisse",
      "Modifier les réservations en attente",
      "Voir les coûts et marges",
    ],
    cannot: ["Créer ou modifier des articles", "Annuler ou supprimer une vente", "Gérer les comptes utilisateurs"],
    priority: ["dashboard", "pos", "products", "sales", "rate"],
  },
  {
    role: "cashier_supervisor",
    label: "Superviseur caisse",
    summary: "Ventes, caisse et suivi des clients.",
    can: [
      "Vendre et réserver, même hors ligne",
      "Enregistrer les entrées et sorties de caisse",
      "Consulter les historiques et réimprimer les reçus",
      "Gérer le fichier clients",
    ],
    cannot: ["Voir les coûts et marges", "Valider les sorties de caisse", "Modifier ou annuler une vente"],
    priority: ["pos", "sales", "entry", "sortie", "customers"],
  },
  {
    role: "inventory_manager",
    label: "Gestionnaire de stock",
    summary: "Articles, stock et opérations autorisées.",
    can: [
      "Consulter les articles, le stock et leurs coûts",
      "Vendre et réserver",
      "Enregistrer les entrées et sorties de caisse",
      "Consulter les historiques",
    ],
    cannot: ["Créer ou modifier des articles", "Valider les sorties de caisse", "Accéder aux clients et aux rapports"],
    priority: ["products", "pos", "sales"],
  },
  {
    role: "staff",
    label: "Personnel",
    summary: "Consultation de ses activités autorisées.",
    can: ["Consulter l'historique des ventes", "Retrouver un reçu à partir de son numéro"],
    cannot: ["Vendre ou encaisser", "Voir les coûts et marges", "Modifier des données"],
    priority: ["sales"],
  },
  {
    role: "shareholder",
    label: "Actionnaire",
    summary: "Consultation seule des activités d'une seule région.",
    can: [
      "Voir les articles et le stock de sa région",
      "Voir les ventes et réservations de sa région",
      "Voir les entrées et sorties de caisse de sa région",
      "Consulter le tableau de bord et les rapports de sa région",
    ],
    cannot: [
      "Accéder à l'autre région",
      "Créer, modifier, valider ou supprimer quoi que ce soit",
      "Vendre ou encaisser",
      "Voir les coûts d'achat et les marges",
    ],
    priority: ["dashboard", "reports", "sales", "products"],
    singleRegion: true,
    readOnly: true,
  },
];

export const ROLE_PROFILE: Record<Role, RoleProfile> = Object.fromEntries(
  ROLE_PROFILES.map((profile) => [profile.role, profile]),
) as Record<Role, RoleProfile>;

export const ROLE_LABELS: Record<Role, string> = Object.fromEntries(
  ROLE_PROFILES.map((profile) => [profile.role, profile.label]),
) as Record<Role, string>;

export const REGION_SCOPE_OPTIONS: { value: RegionScope; label: string; description: string }[] = [
  { value: "all", label: "Les deux régions", description: "Butembo et China" },
  { value: "Bbbb", label: "Butembo uniquement", description: "Opérations de Butembo (Bbbb)" },
  { value: "Cnnn", label: "China uniquement", description: "Opérations de China (Cnnn)" },
];

export const REGION_SCOPE_LABELS: Record<RegionScope, string> = {
  all: "Les deux régions",
  Bbbb: "Butembo",
  Cnnn: "China",
};

/** The scope to keep when the role changes (shareholders need one region). */
export function scopeForRole(role: Role, current: RegionScope): RegionScope {
  const profile = ROLE_PROFILE[role];
  if (profile.allRegions) return "all";
  if (profile.singleRegion && current === "all") return "Bbbb";
  return current;
}

/** Same validation as the server; returns a French message or null. */
export function regionScopeProblem(role: Role, scope: RegionScope): string | null {
  const profile = ROLE_PROFILE[role];
  if (profile.allRegions && scope !== "all") return "Un administrateur voit toujours les deux régions.";
  if (profile.singleRegion && scope === "all") return "Un actionnaire doit être assigné à une seule région.";
  return null;
}

export interface RoleAccess {
  role: Role;
  regionScope: RegionScope;
  modules: string[];
}

export function defaultAccessFor(role: Role, regionScope: RegionScope = "all"): RoleAccess {
  return { role, regionScope: scopeForRole(role, regionScope), modules: role === "admin" ? [] : defaultModulesForRole(role) };
}

export function accessProblem(access: RoleAccess): string | null {
  return regionScopeProblem(access.role, access.regionScope);
}
