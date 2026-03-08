/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { Calculator, DollarSign, RefreshCw } from "lucide-react";

interface SortieForm {
  reason: string;
  recipientName: string;
  recipientPhone: string;
  amount: string;
  amountInFC: string;
  paymentMethod: "cash" | "mpesa" | "bank" | "card" | "other";
  notes: string;
  currencyMode: "usd" | "fc";
}

interface ExchangeRate {
  rate: number;
  effectiveFrom: string;
  lastUpdated: string;
}

const API_BASE = import.meta.env.VITE_API_URL;

async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  return { __nonJson: true, text };
}

export default function Sortie() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);

  // Get the current user from your auth context
  const { user: currentUser } = useAuth();

  const [form, setForm] = useState<SortieForm>({
    reason: "",
    recipientName: "",
    recipientPhone: "",
    amount: "",
    amountInFC: "",
    paymentMethod: "cash",
    notes: "",
    currencyMode: "usd",
  });

  // Load exchange rate
  const loadExchangeRate = async () => {
    try {
      setLoadingRate(true);
      const response = await fetch(`${API_BASE}/exchange-rates/current`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setExchangeRate(data);
      } else {
        console.warn('Failed to load exchange rate');
      }
    } catch (error) {
      console.error('Error loading exchange rate:', error);
    } finally {
      setLoadingRate(false);
    }
  };

  useEffect(() => {
    loadExchangeRate();
  }, []);

  // Calculate USD amount when FC amount changes
  useEffect(() => {
    if (form.currencyMode === "fc" && form.amountInFC && exchangeRate) {
      const fcAmount = parseFloat(form.amountInFC) || 0;
      const usdAmount = fcAmount / exchangeRate.rate;
      setForm(prev => ({
        ...prev,
        amount: usdAmount.toFixed(2)
      }));
    }
  }, [form.amountInFC, form.currencyMode, exchangeRate]);

  // Calculate FC amount when USD amount changes
  useEffect(() => {
    if (form.currencyMode === "usd" && form.amount && exchangeRate) {
      const usdAmount = parseFloat(form.amount) || 0;
      const fcAmount = usdAmount * exchangeRate.rate;
      setForm(prev => ({
        ...prev,
        amountInFC: Math.round(fcAmount).toString()
      }));
    }
  }, [form.amount, form.currencyMode, exchangeRate]);

  const isFormValid =
    form.reason.trim() !== "" &&
    form.recipientName.trim() !== "" &&
    form.recipientPhone.trim() !== "" &&
    parseFloat(form.amount) > 0;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  // Toggle between USD and FC input modes
  const toggleCurrencyMode = () => {
    setForm(prev => ({
      ...prev,
      currencyMode: prev.currencyMode === "usd" ? "fc" : "usd",
      amount: "",
      amountInFC: ""
    }));
  };

  function authHeader(): Record<string, string> {
    const token =
      localStorage.getItem("authToken") || localStorage.getItem("token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatFc = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' FC';
  };

  async function handleSortie(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const body = {
        reason: form.reason,
        recipientName: form.recipientName,
        recipientPhone: form.recipientPhone,
        amount: parseFloat(form.amount),
        paymentMethod: form.paymentMethod,
        notes: form.notes || "",
        recordedBy: currentUser?.username || "unknown",
      };

      // ✅ Changed from /sales to /expenses
      const res = await fetch(`${API_BASE}/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify(body),
      });

      const data = await readJsonSafe(res);
      if (!res.ok) {
        const msg =
          (data as any)?.error ||
          (data as any)?.text ||
          `Expense recording failed: ${res.status}`;
        throw new Error(msg);
      }

      // Reset form on success
      setForm({
        reason: "",
        recipientName: "",
        recipientPhone: "",
        amount: "",
        amountInFC: "",
        paymentMethod: "cash",
        notes: "",
        currencyMode: "usd",
      });

      setMessage("✅ Dépense enregistrée avec succès !");
    } catch (e: any) {
      setError(e?.message || "La dépense n'a pas pu être enregistrée");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header with Exchange Rate */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Nouvelle Sortie de Caisse</h2>
              <p className="text-gray-600 mt-1">Enregistrez les dépenses avec gestion multi-devises</p>
            </div>
            
            {/* Exchange Rate Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 min-w-[280px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">Taux du jour:</span>
                </div>
                {loadingRate ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                ) : exchangeRate ? (
                  <div className="text-right">
                    <div className="font-bold text-blue-800 text-lg">
                      1 USD = {new Intl.NumberFormat('fr-FR').format(exchangeRate.rate)} FC
                    </div>
                    <div className="text-xs text-blue-600">
                      Effectif depuis {new Date(exchangeRate.effectiveFrom).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                ) : (
                  <span className="text-red-600 text-sm">Taux non disponible</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg border border-green-200">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg border border-red-200">{error}</div>
        )}

        <div className="bg-white shadow-lg rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6">
            <h3 className="text-xl font-semibold text-white text-center">
              Enregistrement de Dépense
            </h3>
            <p className="text-blue-100 text-center mt-2">
              Enregistrez les sorties de caisse pour le suivi des dépenses
            </p>
          </div>

          <form onSubmit={handleSortie} className="p-6 space-y-6">
            {/* Reason for Expense */}
            <div>
              <label className="block mb-2 font-medium text-gray-700">
                Raison de la dépense *
              </label>
              <input
                type="text"
                name="reason"
                value={form.reason}
                onChange={handleChange}
                placeholder="Ex: Achat fournitures bureau, Transport, etc."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Recipient Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Nom du bénéficiaire *
                </label>
                <input
                  type="text"
                  name="recipientName"
                  value={form.recipientName}
                  onChange={handleChange}
                  placeholder="Nom complet"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Téléphone du bénéficiaire *
                </label>
                <input
                  type="tel"
                  name="recipientPhone"
                  value={form.recipientPhone}
                  onChange={handleChange}
                  placeholder="Numéro de téléphone"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Amount and Payment Method */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-medium text-gray-700">
                    Montant *
                  </label>
                  <button
                    type="button"
                    onClick={toggleCurrencyMode}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  >
                    <Calculator className="w-3 h-3" />
                    {form.currencyMode === 'usd' ? 'USD → FC' : 'FC → USD'}
                  </button>
                </div>
                
                {form.currencyMode === 'usd' ? (
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    min="0.01"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                ) : (
                  <input
                    type="number"
                    name="amountInFC"
                    value={form.amountInFC}
                    onChange={(e) => setForm({ ...form, amountInFC: e.target.value })}
                    placeholder="0"
                    min="1"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                )}
                
                {/* Conversion Display */}
                {form.amount && form.currencyMode === 'usd' && exchangeRate && (
                  <p className="text-xs text-green-600 mt-1">
                    ≈ {formatFc(parseFloat(form.amount) * exchangeRate.rate)}
                  </p>
                )}
                {form.amountInFC && form.currencyMode === 'fc' && exchangeRate && (
                  <p className="text-xs text-green-600 mt-1">
                    ≈ {formatCurrency(parseFloat(form.amountInFC) / exchangeRate.rate)}
                  </p>
                )}
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Méthode de paiement *
                </label>
                <select
                  name="paymentMethod"
                  value={form.paymentMethod}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa ou Airtel Money</option>
                  <option value="bank">Transfert Bancaire</option>
                  <option value="card">Carte</option>
                  <option value="other">Autre</option>
                </select>
              </div>
            </div>

            {/* Amount Summary */}
            {form.amount && exchangeRate && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-gray-700">Montant en USD</div>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(parseFloat(form.amount))}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-gray-700">Équivalent en FC</div>
                    <div className="text-lg font-bold text-blue-600">
                      {formatFc(parseFloat(form.amount) * exchangeRate.rate)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Notes */}
            <div>
              <label className="block mb-2 font-medium text-gray-700">
                Notes supplémentaires (optionnel)
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Détails supplémentaires sur cette dépense..."
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Recorded By */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="block mb-1 text-sm font-medium text-gray-600">
                Enregistré par
              </label>
              <p className="text-gray-900 font-medium">
                {currentUser?.username || "Utilisateur"}
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className={`w-full py-3 px-4 rounded-lg text-white font-semibold transition-all ${
                isFormValid && !submitting
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {submitting ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Enregistrement...
                </div>
              ) : (
                "📝 Enregistrer la Dépense"
              )}
            </button>
          </form>

          {/* Info Box */}
          <div className="bg-blue-50 border-t border-blue-200 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Information importante
                </h3>
                <div className="mt-1 text-sm text-blue-700">
                  <p>
                    Cette dépense sera enregistrée comme une sortie de caisse et ne sera pas comptabilisée dans les ventes.
                    Le reçu pourra être imprimé ultérieurement depuis l'historique des sorties.
                  </p>
                  {exchangeRate && (
                    <p className="mt-2 font-medium">
                      💱 Taux utilisé: 1 USD = {new Intl.NumberFormat('fr-FR').format(exchangeRate.rate)} FC
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}