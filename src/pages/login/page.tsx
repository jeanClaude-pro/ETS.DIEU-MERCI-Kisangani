
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, WifiOff } from "lucide-react";
import { Alert } from "../../components/ui";

import { useAuth } from "../../hooks/useAuth";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useNavigate } from "react-router-dom";
import {
  login as loginApi,
  register as registerApi,
} from "../../services/authService";
import {
  listOfflineAuthorizedUsers,
  verifyOfflinePin,
  type OfflineLoginCandidate,
} from "../../services/offlinePinService";

type Mode = "login" | "register" | "offline-pin";
const REMEMBERED_LOGIN_KEY = "erp.rememberedLoginEmail";

const LoginPage = () => {
  const [mode, setMode] = React.useState<Mode>("login");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState(() => localStorage.getItem(REMEMBERED_LOGIN_KEY) || "");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [offlineCandidates, setOfflineCandidates] = React.useState<OfflineLoginCandidate[]>([]);
  const [offlineUserId, setOfflineUserId] = React.useState("");
  const [offlinePin, setOfflinePin] = React.useState("");
  const modeManuallyChosen = React.useRef(false);

  const { setAuth, setOfflineSession } = useAuth();
  const connectivity = useConnectivity();
  const navigate = useNavigate();

  React.useEffect(() => {
    void listOfflineAuthorizedUsers().then((candidates) => {
      setOfflineCandidates(candidates);
      if (candidates.length === 1) setOfflineUserId(candidates[0].userId);
      // Offer the offline-PIN screen by default once we know the backend is
      // genuinely unreachable and this device has at least one authorized
      // user — but never override a mode the person picked themselves.
      if (!modeManuallyChosen.current && connectivity.status !== "online" && candidates.length > 0) {
        setMode("offline-pin");
      }
    });
  }, [connectivity.status]);

  const handleOfflinePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!offlineUserId) {
      setError("Sélectionnez votre compte.");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyOfflinePin(offlineUserId, offlinePin);
      if (!result.ok || !result.session) {
        setError(result.reason || "Code incorrect.");
        return;
      }
      setOfflineSession(result.session);
      setOfflinePin("");
      toast.success(`Connexion hors ligne réussie — bienvenue ${result.session.username}.`);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const result = await registerApi({ username, email, password });
        toast.success(result.message || "Inscription réussie ! Un administrateur doit approuver votre compte.");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setMode("login");
      } else {
        const { user, token } = await loginApi({ email, password });
        localStorage.setItem(REMEMBERED_LOGIN_KEY, email.trim());
        setAuth({ token, user });
        setPassword("");
        toast.success("Connexion réussie !");
        navigate("/");
      }
    } catch (err: any) {
      const msg = err?.message || "Une erreur est survenue";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const heading = mode === "login" ? "Connexion" : mode === "register" ? "Créer un compte" : "Connexion hors ligne";
  const subtitle = mode === "login"
    ? "Connectez-vous à votre espace de travail"
    : mode === "register"
    ? "Créez votre accès à la boutique"
    : "Serveur inaccessible — utilisez le code PIN configuré sur cet appareil.";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-6 [background-image:radial-gradient(ellipse_at_top,rgb(219_234_254/.7),transparent_60%)] sm:px-6 sm:py-10" style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div className="grid w-full max-w-[26rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:max-w-4xl md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Brand panel — tablets and laptops */}
        <section className="relative hidden flex-col justify-between gap-10 bg-slate-900 p-8 text-white md:flex lg:p-10" aria-label="Identité de la boutique">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
              <img src="/Mrcleanlogo.png" alt="" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">Boutique</p>
              <p className="truncate text-sm font-semibold">C’EST DIEU QUI PARTAGE</p>
            </div>
          </div>

          <div className="grid place-items-center rounded-xl bg-white p-6">
            <img src="/Mrcleanlogo.png" alt="Logo de la boutique C’EST DIEU QUI PARTAGE" className="max-h-56 w-full object-contain" />
          </div>

          <div>
            <h2 className="text-xl font-semibold leading-snug tracking-tight text-white">Gestion de boutique, stock et point de vente</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">Av du 1er Janvier N°13, C. Makiso, Kisangani</p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
              <li className="flex items-center gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />Accès réservé au personnel autorisé</li>
              <li className="flex items-center gap-2.5"><WifiOff className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />Ventes possibles même hors ligne</li>
            </ul>
          </div>
        </section>

        {/* Form panel */}
        <section className="flex min-w-0 flex-col">
          <div className="flex-1 px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
            <div className="mb-7 flex flex-col items-center text-center md:hidden">
              <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                <img src="/Mrcleanlogo.png" alt="Logo de la boutique" className="h-full w-full object-contain" />
              </span>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">C’EST DIEU QUI PARTAGE</p>
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{heading}</h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>

            {mode === "offline-pin" ? (
              <form onSubmit={handleOfflinePinSubmit} autoComplete="off" className="space-y-4">
                <div>
                  <label htmlFor="offlineUser" className="ui-label">Compte</label>
                  <select
                    id="offlineUser"
                    value={offlineUserId}
                    onChange={(e) => setOfflineUserId(e.target.value)}
                    className="ui-input"
                    required
                  >
                    <option value="" disabled>Sélectionner un compte</option>
                    {offlineCandidates.map((candidate) => (
                      <option key={candidate.userId} value={candidate.userId}>{candidate.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="offlinePin" className="ui-label">Code PIN</label>
                  <input
                    id="offlinePin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    minLength={4}
                    maxLength={12}
                    value={offlinePin}
                    onChange={(e) => setOfflinePin(e.target.value.replace(/\D/g, ""))}
                    className="ui-input tracking-[0.3em]"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="••••"
                    required
                  />
                  <p className="ui-help">4 à 12 chiffres.</p>
                </div>
                {error && <Alert tone="danger">{error}</Alert>}
                <button type="submit" disabled={loading || offlinePin.length < 4} className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block">
                  {loading ? <><span className="ui-spinner h-4 w-4 border-white/40 border-t-white" aria-hidden="true" />Vérification…</> : <><KeyRound aria-hidden="true" />Se connecter hors ligne</>}
                </button>
                {offlineCandidates.length === 0 && (
                  <Alert tone="info">Aucun code PIN n'a encore été configuré sur cet appareil. Connectez-vous en ligne une première fois puis configurez-en un depuis l'application.</Alert>
                )}
              </form>
            ) : (
              <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label htmlFor="username" className="ui-label">Nom d'utilisateur</label>
                    <input
                      id="username"
                      type="text"
                      placeholder="Votre nom d'utilisateur"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="ui-input"
                      autoComplete="name"
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="ui-label">Adresse email</label>
                  <div className="relative">
                    <Mail className="ui-field-icon" aria-hidden="true" />
                    <input
                      id="email"
                      name={mode === "login" ? "username" : "email"}
                      type="email"
                      placeholder="nom@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="ui-input ui-input-icon"
                      autoComplete={mode === "login" ? "username" : "email"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="ui-label">Mot de passe</label>
                  <div className="relative">
                    <Lock className="ui-field-icon" aria-hidden="true" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Votre mot de passe"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="ui-input ui-input-icon pr-12"
                      // The password is never persisted by the app; these hints
                      // also stop keyboards/spellcheck from learning it while it
                      // is revealed as plain text.
                      autoComplete={mode === "login" ? "off" : "new-password"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      aria-pressed={showPassword}
                      aria-controls="password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {mode === "register" && (
                  <div>
                    <label htmlFor="confirmPassword" className="ui-label">Confirmer le mot de passe</label>
                    <input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirmez votre mot de passe"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="ui-input"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                  </div>
                )}

                {error && <Alert tone="danger">{error}</Alert>}

                <button type="submit" disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block">
                  {loading ? (
                    <><span className="ui-spinner h-4 w-4 border-white/40 border-t-white" aria-hidden="true" />Traitement en cours…</>
                  ) : mode === "login" ? (
                    <>Se connecter<ArrowRight aria-hidden="true" /></>
                  ) : (
                    "Créer un compte"
                  )}
                </button>
              </form>
            )}

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-center text-sm">
              {mode !== "offline-pin" && (
                <p className="text-slate-600">
                  {mode === "login" ? "Vous n'avez pas de compte ? " : "Vous avez déjà un compte ? "}
                  <button
                    type="button"
                    onClick={() => {
                      modeManuallyChosen.current = true;
                      setMode(mode === "login" ? "register" : "login");
                      setError("");
                      setPassword("");
                      setConfirmPassword("");
                      setShowPassword(false);
                    }}
                    className="rounded font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {mode === "login" ? "S'inscrire" : "Se connecter"}
                  </button>
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  modeManuallyChosen.current = true;
                  setMode(mode === "offline-pin" ? "login" : "offline-pin");
                  setError("");
                  // Never keep a typed password around once its form is gone.
                  setPassword("");
                  setConfirmPassword("");
                  setShowPassword(false);
                }}
                className="ui-btn ui-btn-ghost ui-btn-sm mx-auto"
              >
                <KeyRound aria-hidden="true" />
                {mode === "offline-pin" ? "Utiliser l'email et le mot de passe" : "Connexion hors ligne avec un code PIN"}
              </button>
            </div>
          </div>

          {mode === "login" && (
            <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-center text-xs text-slate-500">
              En continuant, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
