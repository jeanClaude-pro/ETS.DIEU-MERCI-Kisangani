import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Alert, PageHeader } from "../../components/ui";
import { toast } from "react-toastify";
import { useAuth } from "../../hooks/useAuth";
import { useConnectivity } from "../../context/ConnectivityContext";
import { hasOfflinePinConfigured, setupOfflinePin, OfflinePinError } from "../../services/offlinePinService";

export default function OfflinePinSetup() {
  const { user, token } = useAuth();
  const connectivity = useConnectivity();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfigure = connectivity.status === "online" && Boolean(token) && Boolean(user);

  useEffect(() => {
    if (!user) return;
    void hasOfflinePinConfigured(user.id).then(setConfigured);
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    if (pin !== confirmPin) {
      setError("Les deux codes ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      await setupOfflinePin(user, pin);
      setConfigured(true);
      setPin("");
      setConfirmPin("");
      toast.success("Code PIN hors ligne enregistré sur cet appareil.");
    } catch (err) {
      setError(err instanceof OfflinePinError ? err.message : "Impossible d'enregistrer le code PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-page max-w-xl">
      <PageHeader
        eyebrow="Sécurité"
        title="Code PIN hors ligne"
        description="Configurez un code PIN pour vous connecter à cet appareil quand le serveur est inaccessible."
      />

      {configured && (
        <Alert tone="success">Un code PIN hors ligne est déjà configuré sur cet appareil pour ce compte.</Alert>
      )}

      {!canConfigure && (
        <Alert tone="warning">La configuration du code PIN nécessite une connexion en ligne active. Reconnectez-vous puis réessayez.</Alert>
      )}

      <form onSubmit={handleSubmit} className="ui-card">
        <div className="ui-card-header">
          <h2 className="ui-section-title flex items-center gap-2"><KeyRound className="h-4 w-4 text-blue-700" aria-hidden="true" />{configured ? "Modifier le code" : "Nouveau code"}</h2>
          <ShieldCheck className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
        </div>
        <div className="ui-card-body space-y-4">
          <div>
            <label htmlFor="pin" className="ui-label">Nouveau code <span className="font-normal text-slate-500">(4 à 12 chiffres)</span></label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={12}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              disabled={!canConfigure}
              className="ui-input tracking-[0.3em]"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="confirmPin" className="ui-label">Confirmer le code</label>
            <input
              id="confirmPin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={12}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              disabled={!canConfigure}
              className="ui-input tracking-[0.3em]"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-xs text-slate-500">Ce code n'est jamais envoyé au serveur et n'est valable que sur cet appareil. Il permet de vendre hors ligne si la connexion est perdue.</p>
        </div>
        <div className="ui-card-footer">
          <button
            type="submit"
            disabled={!canConfigure || saving || pin.length < 4 || confirmPin.length < 4}
            className="ui-btn ui-btn-primary w-full sm:w-auto"
          >
            {saving ? "Enregistrement…" : configured ? "Mettre à jour le code" : "Configurer le code"}
          </button>
        </div>
      </form>
    </div>
  );
}
