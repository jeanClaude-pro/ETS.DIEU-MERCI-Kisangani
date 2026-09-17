
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  login as loginApi,
  register as registerApi,
} from "../../services/authService";

type Mode = "login" | "register";

const LoginPage = () => {
  const [mode, setMode] = React.useState<Mode>("login");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const result = await registerApi({ username, email, password });
        toast.success(result.message || "Inscription réussie ! Un administrateur doit approuver votre compte.");
        setMode("login");
      } else {
        const { user, token } = await loginApi({ email, password });
        setAuth({ token, user });
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

  return (
    <div className="login-shell flex h-[100dvh] items-center justify-center overflow-hidden p-2 sm:p-6">
      <div className="login-card relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[1.1fr_.9fr]">
        <section className="login-visual hidden md:flex" aria-label="Identité Mr Clean">
          <div className="login-image-frame">
            <img src="/Mrcleanlogo.png" alt="Logo complet Mr Clean" />
          </div>
          <div className="login-brand-caption">
            <p>Kisangani</p>
            <h2>Boutique C’EST DIEU QUI PARTAGE</h2>
          </div>
        </section>
        <section className="login-panel">
        <div className="login-form-content p-4 sm:p-8 md:p-10">
          <div className="login-heading text-center mb-6 sm:mb-8">
            <div className="login-mobile-logo md:hidden"><img src="/Mrcleanlogo.png" alt="Logo complet Mr Clean" /></div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-blue-600 md:hidden">C’EST DIEU QUI PARTAGE</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
              {mode === "login" ? "Bon retour" : "Créer un compte"}
            </h1>
            <p className="login-subtitle text-sm sm:text-base text-gray-600">
              {mode === "login"
                ? "Connectez-vous à votre espace de travail"
                : "Créez votre accès à la boutique"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form space-y-4 sm:space-y-5">
            {mode === "register" && (
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nom d'utilisateur
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="Entrez votre nom d'utilisateur"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input"
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="Entrez votre email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                placeholder="Entrez votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </div>

            {mode === "register" && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirmez votre mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="login-input"
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-submit"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Traitement en cours...
                </span>
              ) : mode === "login" ? (
                "Se connecter"
              ) : (
                "Créer un compte"
              )}
            </button>
          </form>

          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-sm text-gray-600">
              {mode === "login"
                ? "Vous n'avez pas de compte ? "
                : "Vous avez déjà un compte ? "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="text-indigo-600 font-medium hover:text-indigo-800 focus:outline-none focus:underline transition"
              >
                {mode === "login" ? "S'inscrire" : "Se connecter"}
              </button>
            </p>
          </div>
        </div>

        {mode === "login" && (
          <div className="login-legal bg-gray-50 px-4 py-3 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">
              En continuant, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité.
            </p>
          </div>
        )}
        </section>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
};

export default LoginPage;
