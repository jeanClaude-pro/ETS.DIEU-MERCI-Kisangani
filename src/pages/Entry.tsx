/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { DollarSign, RefreshCw, FileText, User, Calculator } from "lucide-react";
import { REGION_CODE_MAP } from "../utils/constants";
import {
  printHtmlDocumentsSequentially,
  buildCashEntryReceiptHtml,
  buildCashEntryStubHtml,
  type CashEntryReceiptData,
} from "../services/printService";

interface Entry {
  _id: string;
  entryId: string;
  amount: number;
  source: string;
  category: string;
  paymentMethod: string;
  description: string;
  receivedFrom: {
    name: string;
    phone: string;
    email: string;
  };
  createdBy: {
    _id: string;
    username: string;
  };
  createdAt: string;
  status: string;
}

interface ExchangeRate {
  rate: number;
  effectiveFrom: string;
  lastUpdated: string;
}

const API_BASE = import.meta.env.VITE_API_URL;

type UiPayment = "cash" | "mpesa" | "card" | "bank" | "other";

// Payment method normalization function (matches your route)
function uiToModelPayment(pm: UiPayment): "cash" | "card" | "transfer" | "other" {
  if (pm === "cash") return "cash";
  if (pm === "card") return "card";
  if (pm === "mpesa" || pm === "bank") return "transfer";
  return "other";
}

// Safe JSON parser to handle HTML errors
async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  return { __nonJson: true, text };
}

export default function Entry() {
  const [submitting, setSubmitting] = useState(false);
  const [receiptData, setReceiptData] = useState<CashEntryReceiptData | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);
  const receiptRef = useRef<HTMLDivElement>(null);

  const { user: currentUser } = useAuth();

  const [form, setForm] = useState({
    amount: "",
    amountInFC: "",
    source: "",
    category: "",
    paymentMethod: "cash" as UiPayment,
    description: "",
    receivedFromName: "",
    receivedFromPhone: "",
    receivedFromEmail: "",
    currencyMode: "usd" as "usd" | "fc",
    region: "China" as "Butembo" | "China"
  });

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sources prédéfinies
  const sources = [
    "Paiement Client",
    "Dépôt Bancaire",
    "Reçu d'Espèces",
    "Remboursement Prêt",
    "Investissement",
    "Revenue Divers",
    "Transfert Mobile",
    "Autre Source"
  ];

  // Catégories prédéfinies
  const categories = [
    "Revenue Ventes",
    "Dépôt Espèces",
    "Remboursement",
    "Prêt",
    "Investissement",
    "Revenue Divers",
    "Autre Catégorie"
  ];

  // Load exchange rate
  const loadExchangeRate = async () => {
    try {
      setLoadingRate(true);
      const response = await fetch(`${API_BASE}/exchange-rates/current`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem("token") || ""}`,
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
    parseFloat(form.amount) > 0 && 
    form.source.trim() !== "" && 
    form.category.trim() !== "" && 
    form.receivedFromName.trim() !== "" &&
    form.receivedFromPhone.trim() !== "";

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
    const token = localStorage.getItem("token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Format function for FC display
  const formatFc = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' FC';
  };

  // Format function for USD display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Printing reuses the shared canonical thermal document builder (same
  // architecture as sale/reservation receipts) instead of a duplicated inline
  // HTML/CSS document.
  useEffect(() => {
    if (!receiptData) return;
    void printHtmlDocumentsSequentially([
      buildCashEntryReceiptHtml(receiptData),
      buildCashEntryStubHtml(receiptData),
    ]).catch((printError: unknown) => {
      setError(printError instanceof Error ? printError.message : "Échec de l'impression.");
    });
  }, [receiptData]);

  async function handleEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      // Convert payment method to match backend model
      const normalizedPaymentMethod = uiToModelPayment(form.paymentMethod);

      const body = {
        amount: parseFloat(form.amount),
        source: form.source,
        category: form.category,
        paymentMethod: normalizedPaymentMethod,
        description: form.description,
        receivedFrom: {
          name: form.receivedFromName,
          phone: form.receivedFromPhone,
          email: form.receivedFromEmail || "",
        },
        region: form.region,
        regionCode: REGION_CODE_MAP[form.region],
      };

      console.log("Sending entry data:", body);

      const res = await fetch(`${API_BASE}/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify(body),
      });

      // Use safe JSON parser to handle HTML errors
      const data = await readJsonSafe(res);
      
      if (!res.ok) {
        const msg = data?.error || data?.text || `Échec de l'enregistrement (${res.status})`;
        throw new Error(msg);
      }

      console.log("Entry created successfully:", data);

      // Get the entry ID from the API response
      const entryId = data.entryId || data._id;
      
      // Receipt data for the shared thermal document builder. Shop identity
      // fields are sourced from printService's SALE_BUSINESS constant.
      const newReceiptData: CashEntryReceiptData = {
        entryId,
        amount: parseFloat(form.amount),
        source: form.source,
        category: form.category,
        paymentMethod: form.paymentMethod, // Keep UI payment method for display
        description: form.description,
        receivedFrom: {
          name: form.receivedFromName,
          phone: form.receivedFromPhone,
          email: form.receivedFromEmail,
        },
        agent: currentUser?.username || "Agent",
        date: new Date().toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        exchangeRate: exchangeRate?.rate
      };

      setReceiptData(newReceiptData);

      // Reset form
      setForm({
        amount: "",
        amountInFC: "",
        source: "",
        category: "",
        paymentMethod: "cash",
        description: "",
        receivedFromName: "",
        receivedFromPhone: "",
        receivedFromEmail: "",
        currencyMode: "usd",
        region: "China"
      });

      setMessage(
        "✅ Entrée d'argent enregistrée avec succès ! Impression du reçu et de la souche..."
      );
    } catch (e: any) {
      console.error("Error creating entry:", e);
      setError(e?.message || "L'entrée d'argent n'a pas pu être enregistrée");
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
              <h2 className="text-2xl font-bold text-gray-900">Nouvelle Entrée d'Argent</h2>
              <p className="text-gray-600 mt-1">Enregistrez une nouvelle entrée d'argent dans le système</p>
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
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        <form onSubmit={handleEntry} className="space-y-6">
          {/* Amount and Basic Info */}
          <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Informations de l'Entrée
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    placeholder="Entrer le montant en USD"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0.01"
                    required
                  />
                ) : (
                  <input
                    type="number"
                    name="amountInFC"
                    value={form.amountInFC}
                    onChange={(e) => setForm({ ...form, amountInFC: e.target.value })}
                    placeholder="Entrer le montant en FC"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
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
                  Source *
                </label>
                <select
                  name="source"
                  value={form.source}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Sélectionner la source</option>
                  {sources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Catégorie *
                </label>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Sélectionner la catégorie</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Région *
                </label>
                <select
                  name="region"
                  value={form.region}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="Butembo">Butembo (Bbbb)</option>
                  <option value="China">China (Cnnn)</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Méthode de Paiement *
                </label>
                <select
                  name="paymentMethod"
                  value={form.paymentMethod}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="cash">Espèces</option>
                  <option value="mpesa">M-Pesa ou Airtel Money (Transfert)</option>
                  <option value="bank">Transfert Bancaire</option>
                  <option value="card">Carte Visa</option>
                  <option value="other">Autre</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block mb-2 font-medium text-gray-700">
                Description (Optionnel)
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Description de l'entrée d'argent..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
          </div>

          {/* Received From Information */}
          <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Informations de l'Expéditeur
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Nom de l'Expéditeur *
                </label>
                <input
                  type="text"
                  name="receivedFromName"
                  value={form.receivedFromName}
                  onChange={handleChange}
                  placeholder="Entrer le nom de la personne"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block mb-2 font-medium text-gray-700">
                  Téléphone de l'Expéditeur *
                </label>
                <input
                  type="tel"
                  name="receivedFromPhone"
                  value={form.receivedFromPhone}
                  onChange={handleChange}
                  placeholder="Entrer le numéro de téléphone"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 font-medium text-gray-700">
                  Email de l'Expéditeur (Optionnel)
                </label>
                <input
                  type="email"
                  name="receivedFromEmail"
                  value={form.receivedFromEmail}
                  onChange={handleChange}
                  placeholder="Entrer l'email de l'expéditeur"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className={`w-full px-8 py-4 rounded-lg font-medium text-lg flex items-center justify-center gap-2 ${
                isFormValid && !submitting
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                  : "bg-gray-400 cursor-not-allowed text-white"
              } transition-colors`}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Enregistrement en cours...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Enregistrer l'Entrée d'Argent
                </span>
              )}
            </button>

            {!isFormValid && (
              <p className="text-sm text-orange-600 mt-2 text-center">
                * Veuillez remplir tous les champs obligatoires (Montant, Source, Catégorie, Nom et Téléphone)
              </p>
            )}
          </div>
        </form>

        {/* Hidden receipt container */}
        <div ref={receiptRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}
