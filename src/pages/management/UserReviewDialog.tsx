"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import { Alert, LoadingState } from "../../components/ui";
import { defaultModulesForRole } from "../../components/navigationConfig";
import { REGION_SCOPE_LABELS, ROLE_LABELS } from "../../utils/roles";
import RoleAccessPicker from "./RoleAccessPicker";
import { accessProblem, type RoleAccess } from "../../utils/roles";
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

const ACTION_LABELS: Record<string, string> = {
  requested: "Demande d'inscription",
  approved: "Compte approuvé",
  rejected: "Compte refusé",
  role_changed: "Rôle modifié",
  permissions_changed: "Permissions modifiées",
  region_changed: "Région modifiée",
  suspended: "Compte suspendu",
  reactivated: "Compte réactivé",
};

export default function UserReviewDialog({ userId, onClose }: { userId: string; onClose: (didChange: boolean) => void }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState<RoleAccess>({ role: "staff", regionScope: "all", modules: [] });
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUser(userId).then((detail) => {
      if (cancelled) return;
      setUser(detail);
      // A never-customized user has no stored modulePermissions; pre-check
      // their role's current default set as a helpful starting point rather
      // than an empty checklist. Saving always writes an explicit array.
      setAccess({
        role: detail.role,
        regionScope: detail.role === "admin" ? "all" : detail.regionScope || "all",
        modules: Array.isArray(detail.modulePermissions) ? detail.modulePermissions : defaultModulesForRole(detail.role),
      });
      setLoading(false);
    }).catch((error) => {
      toast.error(error?.message || "Impossible de charger cet utilisateur");
      onClose(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
      const problem = accessProblem(access);
      if (problem) { toast.error(problem); return; }
      const updated = await withSaving(() => approveUser(user.id, { role: access.role, regionScope: access.regionScope, modulePermissions: access.modules }));
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
      const problem = accessProblem(access);
      if (problem) { toast.error(problem); return; }
      let updated = user;
      const currentScope = user.role === "admin" ? "all" : user.regionScope || "all";
      if (access.role !== user.role || access.regionScope !== currentScope) {
        updated = { ...updated, ...(await withSaving(() => updateUserRole(user.id, access.role, access.regionScope))) };
      }
      if (access.role !== "admin") updated = { ...updated, ...(await withSaving(() => updateUserModules(user.id, access.modules))) };
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
          className="ui-dialog max-w-3xl"
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
                      Créé le {user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR") : "—"}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Actuellement : <strong className="font-semibold text-slate-700">{ROLE_LABELS[user.role]}</strong> · {REGION_SCOPE_LABELS[user.role === "admin" ? "all" : user.regionScope || "all"]}
                </p>

                <RoleAccessPicker value={access} onChange={setAccess} disabled={saving || user.status === "rejected"} />

                {access.role === "admin" && (
                  <Alert tone="info">
                    Accès complet (Administrateur) — les administrateurs ont accès à tous les modules et aux deux régions.
                  </Alert>
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
