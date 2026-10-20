import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { Eye, EyeOff, UserPlus, X } from "lucide-react";
import { Alert } from "../../components/ui";
import { createUser } from "../../services/userManagementService";
import { REGION_SCOPE_LABELS, ROLE_PROFILE } from "../../utils/roles";
import RoleAccessPicker from "./RoleAccessPicker";
import { accessProblem, defaultAccessFor, type RoleAccess } from "../../utils/roles";

const MIN_PASSWORD_LENGTH = 8;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accounts are only created here, by an administrator, with a role and a region. */
export default function CreateUserDialog({ onClose }: { onClose: (created: boolean) => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [access, setAccess] = useState<RoleAccess>(defaultAccessFor("cashier_supervisor"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = [
    !username.trim() && "Le nom d'utilisateur est requis.",
    !emailPattern.test(email.trim()) && "Une adresse email valide est requise.",
    password.length < MIN_PASSWORD_LENGTH && `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    accessProblem(access),
  ].filter(Boolean) as string[];
  const profile = ROLE_PROFILE[access.role];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createUser({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: access.role,
        regionScope: access.regionScope,
        ...(access.role !== "admin" && { modulePermissions: access.modules }),
      });
      toast.success(`Compte créé pour ${username.trim()}`);
      onClose(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La création du compte a échoué.";
      setError(/already exists/i.test(message) ? "Un compte existe déjà avec cet email." : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div className="ui-dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onClose(false)}>
        <motion.form
          onSubmit={submit}
          className="ui-dialog max-w-3xl"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 340 }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-title"
          noValidate
        >
          <div className="ui-dialog-header">
            <div>
              <h2 id="create-user-title" className="ui-dialog-title flex items-center gap-2"><UserPlus className="h-4 w-4 text-blue-700" aria-hidden="true" /> Créer un compte</h2>
              <p className="mt-0.5 text-sm text-slate-500">Le compte est actif immédiatement avec le rôle et la région choisis.</p>
            </div>
            <button type="button" onClick={() => onClose(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer"><X /></button>
          </div>

          <div className="ui-dialog-body space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="new-user-name" className="ui-label">Nom d'utilisateur <span className="ui-required">*</span></label>
                <input id="new-user-name" className="ui-input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={60} autoComplete="off" required />
              </div>
              <div>
                <label htmlFor="new-user-email" className="ui-label">Email (identifiant de connexion) <span className="ui-required">*</span></label>
                <input id="new-user-email" type="email" className="ui-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="new-user-password" className="ui-label">Mot de passe initial <span className="ui-required">*</span></label>
                <div className="relative">
                  <input
                    id="new-user-password"
                    type={showPassword ? "text" : "password"}
                    className="ui-input pr-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((shown) => !shown)} className="ui-icon-btn absolute right-0.5 top-1/2 -translate-y-1/2" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                <p className="ui-help">Au moins {MIN_PASSWORD_LENGTH} caractères. Communiquez-le à la personne ; elle pourra le changer ensuite.</p>
              </div>
            </div>

            <RoleAccessPicker value={access} onChange={setAccess} disabled={saving} />

            <Alert tone={profile.readOnly ? "warning" : "info"} title="Résumé">
              {username.trim() || "Ce compte"} sera <strong>{profile.label}</strong> · {REGION_SCOPE_LABELS[access.regionScope]}
              {profile.readOnly ? " · consultation uniquement" : ""}.
            </Alert>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>

          <div className="ui-dialog-footer">
            <button type="button" onClick={() => onClose(false)} className="ui-btn ui-btn-secondary" disabled={saving}>Annuler</button>
            <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>
              <UserPlus /> {saving ? "Création…" : "Créer le compte"}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
