import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
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
    <div className="mx-auto max-w-xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-950">Sécurité hors ligne</h1>
          <p className="text-sm text-slate-600">Configurez un code PIN pour vous connecter à cet appareil quand le serveur est inaccessible.</p>
        </div>
      </div>

      {configured && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          Un code PIN hors ligne est déjà configuré sur cet appareil pour ce compte.
        </div>
      )}

      {!canConfigure && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          La configuration du code PIN nécessite une connexion en ligne active. Reconnectez-vous puis réessayez.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="pin" className="mb-1 block text-sm font-medium text-slate-700">Nouveau code (4 à 12 chiffres)</label>
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
            className="w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="confirmPin" className="mb-1 block text-sm font-medium text-slate-700">Confirmer le code</label>
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
            className="w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            autoComplete="off"
          />
        </div>
        {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={!canConfigure || saving || pin.length < 4 || confirmPin.length < 4}
          className="min-h-11 w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? "Enregistrement…" : configured ? "Mettre à jour le code" : "Configurer le code"}
        </button>
        <p className="text-xs text-slate-500">Ce code n'est jamais envoyé au serveur et n'est valable que sur cet appareil. Il permet de vendre hors ligne si la connexion est perdue.</p>
      </form>
    </div>
  );
}
