"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import type { AccountStatus, Role } from "../../types/auth";
import {
  getUserStats,
  listUsers,
  type ManagedUser,
  type UserStats,
} from "../../services/userManagementService";
import UserReviewDialog from "./UserReviewDialog";
import { EmptyState, LoadingState, MetricCard, PageHeader } from "../../components/ui";

const TABS: { id: AccountStatus | "suspended_rejected"; label: string }[] = [
  { id: "pending", label: "Demandes en attente" },
  { id: "active", label: "Utilisateurs actifs" },
  { id: "suspended_rejected", label: "Suspendus / refusés" },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Manager",
  inventory_manager: "Gestionnaire de stock",
  cashier_supervisor: "Superviseur caisse",
  staff: "Personnel",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "ui-badge-warning",
  active: "ui-badge-success",
  suspended: "ui-badge-danger",
  rejected: "ui-badge-neutral",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  active: "Actif",
  suspended: "Suspendu",
  rejected: "Refusé",
};

function formatDate(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default function Management() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = tab === "suspended_rejected" ? undefined : (tab as AccountStatus);
      const [listResult, statsResult] = await Promise.all([
        listUsers({ status: statusParam, role: roleFilter || undefined, search: search || undefined, page }),
        getUserStats(),
      ]);
      const rows = tab === "suspended_rejected"
        ? listResult.users.filter((u) => u.status === "suspended" || u.status === "rejected")
        : listResult.users;
      setUsers(rows);
      setPages(listResult.pages);
      setTotal(tab === "suspended_rejected" ? rows.length : listResult.total);
      setStats(statsResult);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  }, [tab, roleFilter, search, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, roleFilter, search]);

  const closeDialog = (didChange: boolean) => {
    setSelectedUserId(null);
    if (didChange) load();
  };

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Administration"
        title="Gestion des utilisateurs"
        description="Approbation des comptes, rôles et permissions par module."
        actions={
          <button type="button" onClick={() => load()} disabled={loading} className="ui-btn ui-btn-secondary">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="En attente" value={stats?.pending ?? "—"} icon={Users} tone="warning" />
        <MetricCard label="Actifs" value={stats?.active ?? "—"} icon={UserCheck} tone="success" />
        <MetricCard label="Suspendus" value={stats?.suspended ?? "—"} icon={UserX} tone="danger" />
        <MetricCard label="Refusés" value={stats?.rejected ?? "—"} icon={ShieldCheck} />
      </div>

      <section className="ui-card overflow-hidden" aria-labelledby="users-table-title">
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 sm:px-3" role="tablist" aria-label="Statut des comptes">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                tab === t.id ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {t.id === "pending" && Boolean(stats?.pending) && (
                <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold tabular-nums text-amber-800">{stats?.pending}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-5">
          <div className="relative">
            <label htmlFor="users-search" className="sr-only">Rechercher un utilisateur</label>
            <Search className="ui-field-icon" aria-hidden="true" />
            <input
              id="users-search"
              type="search"
              placeholder="Rechercher par nom ou email…"
              className="ui-input ui-input-icon"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="users-role" className="sr-only">Rôle</label>
            <select
              id="users-role"
              className="ui-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | "")}
            >
              <option value="">Tous les rôles</option>
              {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <h2 id="users-table-title" className="ui-section-title flex items-center gap-2">
            {TABS.find((t) => t.id === tab)?.label}
            <span className="ui-badge ui-badge-neutral tabular-nums">{total}</span>
          </h2>
        </div>

        <div className="ui-table-wrap border-t border-slate-100">
          {loading ? (
            <LoadingState label="Chargement des utilisateurs…" />
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="Aucun utilisateur trouvé" description="Modifiez la recherche, le rôle ou l'onglet sélectionné." />
          ) : (
            <table className="ui-table min-w-full">
              <thead>
                <tr>
                  <th scope="col">Utilisateur</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Inscrit le</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="min-w-[14rem]">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold uppercase text-slate-600" aria-hidden="true">
                          {user.username?.charAt(0) || "?"}
                        </span>
                        <span className="min-w-0">
                          <span className="block break-words font-medium text-slate-900">{user.username}</span>
                          <span className="block break-all text-xs text-slate-500">{user.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{ROLE_LABELS[user.role]}</td>
                    <td>
                      <span className={`ui-badge ${STATUS_BADGE[user.status || "active"]}`}>
                        {STATUS_LABEL[user.status || "active"]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                      >
                        Examiner
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="ui-btn ui-btn-secondary ui-btn-sm"
            >
              Précédent
            </button>
            <span className="text-sm tabular-nums text-slate-600">Page {page} / {pages}</span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="ui-btn ui-btn-secondary ui-btn-sm"
            >
              Suivant
            </button>
          </div>
        )}
      </section>

      {selectedUserId && <UserReviewDialog userId={selectedUserId} onClose={closeDialog} />}
    </div>
  );
}
