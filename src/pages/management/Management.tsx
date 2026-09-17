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
  pending: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  suspended: "bg-red-100 text-red-800",
  rejected: "bg-gray-200 text-gray-700",
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
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des utilisateurs</h1>
          <p className="text-gray-600">Approbation des comptes, rôles et permissions par module</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={<Users className="w-5 h-5 text-amber-600" />} label="En attente" value={stats?.pending ?? "—"} />
        <StatTile icon={<UserCheck className="w-5 h-5 text-green-600" />} label="Actifs" value={stats?.active ?? "—"} />
        <StatTile icon={<UserX className="w-5 h-5 text-red-600" />} label="Suspendus" value={stats?.suspended ?? "—"} />
        <StatTile icon={<ShieldCheck className="w-5 h-5 text-gray-600" />} label="Refusés" value={stats?.rejected ?? "—"} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email..."
            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | "")}
        >
          <option value="">Tous les rôles</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {TABS.find((t) => t.id === tab)?.label} ({total})
          </h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Chargement...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun utilisateur trouvé</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisateur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inscrit le</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{user.username}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{ROLE_LABELS[user.role]}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[user.status || "active"]}`}>
                        {STATUS_LABEL[user.status || "active"]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedUserId(user.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
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
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
            >
              Précédent
            </button>
            <span className="text-sm text-gray-600">Page {page} / {pages}</span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        )}
      </div>

      {selectedUserId && <UserReviewDialog userId={selectedUserId} onClose={closeDialog} />}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow border">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
