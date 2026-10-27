import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, ShieldCheck, X } from "lucide-react";
import { toast } from "react-toastify";
import { Alert } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import { changeOwnPassword } from "../../services/userManagementService";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  inputRef?: React.RefObject<HTMLInputElement | null>;
  help?: string;
};

function PasswordField({ id, label, value, onChange, autoComplete, inputRef, help }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="ui-label">{label} <span className="ui-required">*</span></label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          className="ui-input pr-11"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={autoComplete === "new-password" ? MIN_PASSWORD_LENGTH : undefined}
          maxLength={MAX_PASSWORD_LENGTH}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          className="ui-icon-btn absolute right-0.5 top-1/2 -translate-y-1/2"
          aria-label={visible ? `Masquer ${label.toLowerCase()}` : `Afficher ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {help && <p className="ui-help">{help}</p>}
    </div>
  );
}

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { clearAuth } = useAuth();
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentPasswordRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!currentPassword) return setError("Saisissez votre mot de passe actuel.");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return setError(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
    }
    if (newPassword === currentPassword) return setError("Choisissez un mot de passe différent de l’ancien.");
    if (newPassword !== confirmation) return setError("La confirmation ne correspond pas au nouveau mot de passe.");

    setSaving(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success("Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.");
      clearAuth();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Impossible de modifier le mot de passe.";
      setError(/current password is incorrect/i.test(message)
        ? "Le mot de passe actuel est incorrect."
        : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="ui-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => { if (!saving) onClose(); }}
      >
        <motion.form
          onSubmit={submit}
          className="ui-dialog max-w-lg"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 340 }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          aria-describedby="change-password-description"
          noValidate
        >
          <div className="ui-dialog-header">
            <div className="min-w-0">
              <h2 id="change-password-title" className="ui-dialog-title flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-700" aria-hidden="true" />
                Modifier mon mot de passe
              </h2>
              <p id="change-password-description" className="mt-1 text-sm text-slate-500">
                Confirmez votre identité avec votre mot de passe actuel.
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
              <X />
            </button>
          </div>

          <div className="ui-dialog-body space-y-4">
            <PasswordField
              id="current-password"
              label="Mot de passe actuel"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              inputRef={currentPasswordRef}
            />
            <PasswordField
              id="new-password"
              label="Nouveau mot de passe"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              help={`Utilisez entre ${MIN_PASSWORD_LENGTH} et ${MAX_PASSWORD_LENGTH} caractères et évitez un mot de passe déjà utilisé.`}
            />
            <PasswordField
              id="confirm-password"
              label="Confirmer le nouveau mot de passe"
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
            />

            <Alert tone="info" title="Sécurité">
              <span className="inline-flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Après la modification, toutes vos sessions seront fermées et vous devrez vous reconnecter.
              </span>
            </Alert>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>

          <div className="ui-dialog-footer">
            <button type="button" onClick={onClose} disabled={saving} className="ui-btn ui-btn-secondary">Annuler</button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary">
              <KeyRound /> {saving ? "Modification…" : "Modifier le mot de passe"}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
