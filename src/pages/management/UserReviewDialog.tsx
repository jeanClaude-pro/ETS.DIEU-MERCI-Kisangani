"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import { Alert, LoadingState } from "../../components/ui";
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
        className="ui-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onClose(changed)}
      >
        <motion.div
          className="ui-dialog max-w-lg"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 340 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-review-title"
        >
          <div className="ui-dialog-header">
            <h2 id="user-review-title" className="ui-dialog-title">Examiner le compte</h2>
            <button type="button" onClick={() => onClose(changed)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
              <X />
            </button>
          </div>

          {loading || !user ? (
            <LoadingState label="Chargement du compte…" />
          ) : (
            <>
              <div className="ui-dialog-body space-y-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold uppercase text-slate-600" aria-hidden="true">
                    {user.username?.charAt(0) || "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-900">{user.username}</p>
                    <p className="break-all text-sm text-slate-500">{user.email}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Inscrit le {user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR") : "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="user-review-role" className="ui-label">Rôle</label>
                  <select
                    id="user-review-role"
                    className="ui-input"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {role === "admin" ? (
                  <Alert tone="info">
                    Accès complet (Administrateur) — les administrateurs ont accès à tous les modules et ne peuvent pas être restreints.
                  </Alert>
                ) : (
                  <fieldset>
                    <legend className="ui-label">Modules autorisés</legend>
                    <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-3">
                      {ASSIGNABLE_SECTIONS.map((section) => {
                        const ids = section.items.map((i) => i.id);
                        const allSelected = ids.every((id) => modules.includes(id));
                        return (
                          <div key={section.title}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="ui-kicker">{section.title}</p>
                              <button
                                type="button"
                                className="rounded px-1 text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                onClick={() => toggleSection(ids, allSelected)}
                              >
                                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                              </button>
                            </div>
                            <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {section.items.map((item) => (
                                <label key={item.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    className="ui-checkbox"
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
                    <p className="ui-help">
                      Résumé — Rôle : <strong className="font-semibold text-slate-700">{ROLE_OPTIONS.find((r) => r.value === role)?.label}</strong>
                      {" · "}Modules autorisés : {summaryLabels.length ? summaryLabels.join(", ") : "aucun"}
                    </p>
                  </fieldset>
                )}

                {!!user.history?.length && (
                  <div>
                    <p className="ui-kicker mb-2">Historique</p>
                    <ul className="max-h-32 space-y-1.5 overflow-y-auto text-xs text-slate-500">
                      {[...user.history].reverse().map((entry, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                          <span>
                            <span className="font-medium text-slate-700">{ACTION_LABELS[entry.action] || entry.action}</span>
                            {entry.performedByUsername ? ` — par ${entry.performedByUsername}` : ""}
                            {" · "}{new Date(entry.at).toLocaleString("fr-FR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="ui-dialog-footer">
                {(user.status === "pending" || user.status === "rejected") && (
                  <>
                    {user.status === "pending" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleReject}
                        className="ui-btn ui-btn-danger-outline"
                      >
                        Refuser
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleApprove}
                      className="ui-btn ui-btn-success"
                    >
                      Approuver
                    </button>
                  </>
                )}
                {user.status === "active" && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSuspend}
                      className="ui-btn ui-btn-danger-outline"
                    >
                      Suspendre
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSave}
                      className="ui-btn ui-btn-primary"
                    >
                      Enregistrer
                    </button>
                  </>
                )}
                {user.status === "suspended" && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleReactivate}
                      className="ui-btn ui-btn-success"
                    >
                      Réactiver
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSave}
                      className="ui-btn ui-btn-primary"
                    >
                      Enregistrer
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
