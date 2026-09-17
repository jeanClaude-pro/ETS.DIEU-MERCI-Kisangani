"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import type { Role } from "../../types/auth";
import { navigationSections, defaultModulesForRole } from "../../components/navigationConfig";
import {
  approveUser,
  getUser,
  reactivateUser,
  rejectUser,
  suspendUser,
  updateUserModules,
  updateUserRole,
  type UserDetail,
} from "../../services/userManagementService";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Administrateur" },
  { value: "manager", label: "Manager" },
  { value: "inventory_manager", label: "Gestionnaire de stock" },
  { value: "cashier_supervisor", label: "Superviseur caisse" },
  { value: "staff", label: "Personnel" },
];

// Everything except the "management" module itself: only admins ever have
// that, and admins bypass this checklist entirely (full access by design).
const ASSIGNABLE_SECTIONS = navigationSections
  .map((section) => ({ ...section, items: section.items.filter((item) => item.id !== "management") }))
  .filter((section) => section.items.length > 0);

const ACTION_LABELS: Record<string, string> = {
  requested: "Demande d'inscription",
  approved: "Compte approuvé",
  rejected: "Compte refusé",
  role_changed: "Rôle modifié",
  permissions_changed: "Permissions modifiées",
  suspended: "Compte suspendu",
  reactivated: "Compte réactivé",
};

export default function UserReviewDialog({ userId, onClose }: { userId: string; onClose: (didChange: boolean) => void }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<Role>("staff");
  const [modules, setModules] = useState<string[]>([]);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUser(userId).then((detail) => {
      if (cancelled) return;
      setUser(detail);
      setRole(detail.role);
      // A never-customized user has no stored modulePermissions; pre-check
      // their role's current default set as a helpful starting point rather
      // than an empty checklist. Saving always writes an explicit array.
      setModules(Array.isArray(detail.modulePermissions) ? detail.modulePermissions : defaultModulesForRole(detail.role));
      setLoading(false);
    }).catch((error) => {
      toast.error(error?.message || "Impossible de charger cet utilisateur");
      onClose(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const summaryLabels = useMemo(
    () => ASSIGNABLE_SECTIONS.flatMap((s) => s.items).filter((item) => modules.includes(item.id)).map((item) => item.label),
    [modules]
  );

  const toggleModule = (id: string) => {
    setModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const toggleSection = (ids: string[], allSelected: boolean) => {
    setModules((prev) => (allSelected ? prev.filter((m) => !ids.includes(m)) : [...new Set([...prev, ...ids])]));
  };

  async function withSaving<T>(fn: () => Promise<T>) {
    setSaving(true);
    try {
      const result = await fn();
      setChanged(true);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  const handleApprove = async () => {
    if (!user) return;
    try {
      const updated = await withSaving(() => approveUser(user.id, { role, modulePermissions: modules }));
      toast.success("Compte approuvé");
      setUser((u) => (u ? { ...u, ...updated } : u));
    } catch {
      /* toasted */
    }
  };

  const handleReject = async () => {
    if (!user) return;
    try {
      const updated = await withSaving(() => rejectUser(user.id));
      toast.success("Demande refusée");
      setUser((u) => (u ? { ...u, ...updated } : u));
    } catch {
      /* toasted */
    }
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      let updated = user;
      if (role !== user.role) updated = { ...updated, ...(await withSaving(() => updateUserRole(user.id, role))) };
      if (role !== "admin") updated = { ...updated, ...(await withSaving(() => updateUserModules(user.id, modules))) };
      toast.success("Modifications enregistrées");
      setUser(updated);
    } catch {
      /* toasted */
    }
  };

  const handleSuspend = async () => {
    if (!user) return;
    try {
      const updated = await withSaving(() => suspendUser(user.id));
      toast.success("Compte suspendu");
      setUser((u) => (u ? { ...u, ...updated } : u));
    } catch {
      /* toasted */
    }
  };

  const handleReactivate = async () => {
    if (!user) return;
    try {
      const updated = await withSaving(() => reactivateUser(user.id));
      toast.success("Compte réactivé");
      setUser((u) => (u ? { ...u, ...updated } : u));
    } catch {
      /* toasted */
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onClose(changed)}
      >
        <motion.div
          className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
            <h2 className="text-lg font-bold text-gray-900">Examiner le compte</h2>
            <button onClick={() => onClose(changed)} className="p-2 rounded-full hover:bg-gray-100" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading || !user ? (
            <div className="p-8 text-center text-gray-500">Chargement...</div>
          ) : (
            <div className="p-5 space-y-5">
              <div>
                <p className="font-semibold text-gray-900">{user.username}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Inscrit le {user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR") : "—"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {role === "admin" ? (
                <div className="rounded-lg bg-blue-50 text-blue-800 text-sm p-3">
                  Accès complet (Administrateur) — les administrateurs ont accès à tous les modules et ne peuvent pas être restreints.
                </div>
              ) : (
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-2">Modules autorisés</p>
                  <div className="space-y-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {ASSIGNABLE_SECTIONS.map((section) => {
                      const ids = section.items.map((i) => i.id);
                      const allSelected = ids.every((id) => modules.includes(id));
                      return (
                        <div key={section.title}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase text-gray-500">{section.title}</p>
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => toggleSection(ids, allSelected)}
                            >
                              {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                            </button>
                          </div>
                          <div className="mt-1 space-y-1">
                            {section.items.map((item) => (
                              <label key={item.id} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={modules.includes(item.id)}
                                  onChange={() => toggleModule(item.id)}
                                />
                                {item.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Résumé — Rôle : <strong>{ROLE_OPTIONS.find((r) => r.value === role)?.label}</strong>
                    {" · "}Modules autorisés : {summaryLabels.length ? summaryLabels.join(", ") : "aucun"}
                  </div>
                </div>
              )}

              {!!user.history?.length && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Historique</p>
                  <ul className="text-xs text-gray-500 space-y-1 max-h-28 overflow-y-auto">
                    {[...user.history].reverse().map((entry, idx) => (
                      <li key={idx}>
                        {ACTION_LABELS[entry.action] || entry.action}
                        {entry.performedByUsername ? ` — par ${entry.performedByUsername}` : ""}
                        {" · "}{new Date(entry.at).toLocaleString("fr-FR")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {(user.status === "pending" || user.status === "rejected") && (
                  <>
                    <button
                      disabled={saving}
                      onClick={handleApprove}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Approuver
                    </button>
                    {user.status === "pending" && (
                      <button
                        disabled={saving}
                        onClick={handleReject}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    )}
                  </>
                )}
                {user.status === "active" && (
                  <>
                    <button
                      disabled={saving}
                      onClick={handleSave}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                    <button
                      disabled={saving}
                      onClick={handleSuspend}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Suspendre
                    </button>
                  </>
                )}
                {user.status === "suspended" && (
                  <>
                    <button
                      disabled={saving}
                      onClick={handleSave}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                    <button
                      disabled={saving}
                      onClick={handleReactivate}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Réactiver
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
