/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { RefreshCw, FileText, User, Wallet } from "lucide-react";
import { Alert, CurrencyToggle, ExchangeRateChip, PageHeader } from "../components/ui";
import { REGION_CODE_MAP } from "../utils/constants";
import { useConnectivity } from "../context/ConnectivityContext";
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
  const connectivity = useConnectivity();
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
    if (connectivity.status !== "online") {
      setError("Connexion requise pour cette opération.");
      return;
    }

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
        "Entrée d'argent enregistrée avec succès ! Impression du reçu et de la souche..."
      );
    } catch (e: any) {
      console.error("Error creating entry:", e);
      setError(e?.message || "L'entrée d'argent n'a pas pu être enregistrée");
    } finally {
      setSubmitting(false);
    }
  }

  const amountValue = parseFloat(form.amount);

  return (
    <div className="ui-page ui-page-narrow">
      <PageHeader
        eyebrow="Caisse"
        title="Nouvelle entrée d'argent"
        description="Enregistrez une entrée de caisse ; le reçu et la souche sont imprimés automatiquement."
        actions={<ExchangeRateChip loading={loadingRate} rate={exchangeRate?.rate} effectiveFrom={exchangeRate?.effectiveFrom} />}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleEntry} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Amount and Basic Info */}
          <section className="ui-card" aria-labelledby="entry-info-title">
            <div className="ui-card-header">
              <h2 id="entry-info-title" className="ui-section-title flex items-center gap-2"><Wallet className="h-4 w-4 text-blue-700" />Entrée</h2>
            </div>
            <div className="ui-card-body space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="entry-amount" className="ui-label">
                      Montant ({form.currencyMode === 'usd' ? 'USD' : 'FC'}) <span className="ui-required">*</span>
                  </label>
                  <div className="flex items-stretch gap-2">
                  <div className="min-w-0 flex-1">
                  {form.currencyMode === 'usd' ? (
                    <input
                      id="entry-amount"
                      type="number"
                      step="0.01"
                      name="amount"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="Montant en USD"
                      className="ui-input tabular-nums"
                      min="0.01"
                      inputMode="decimal"
                      required
                    />
                  ) : (
                    <input
                      id="entry-amount"
                      type="number"
                      name="amountInFC"
                      value={form.amountInFC}
                      onChange={(e) => setForm({ ...form, amountInFC: e.target.value })}
                      placeholder="Montant en FC"
                      className="ui-input tabular-nums"
                      min="1"
                      inputMode="numeric"
                      required
                    />
                  )}
                  </div>
                  <CurrencyToggle mode={form.currencyMode} onToggle={toggleCurrencyMode} />
                  </div>

                  {/* Conversion Display */}
                  {form.amount && form.currencyMode === 'usd' && exchangeRate && (
                    <p className="ui-help tabular-nums">≈ {formatFc(parseFloat(form.amount) * exchangeRate.rate)}</p>
                  )}
                  {form.amountInFC && form.currencyMode === 'fc' && exchangeRate && (
                    <p className="ui-help tabular-nums">≈ {formatCurrency(parseFloat(form.amountInFC) / exchangeRate.rate)}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="entry-payment" className="ui-label">Méthode de paiement <span className="ui-required">*</span></label>
                  <select
                    id="entry-payment"
                    name="paymentMethod"
                    value={form.paymentMethod}
                    onChange={handleChange}
                    className="ui-input"
                    required
                  >
                    <option value="cash">Espèces</option>
                    <option value="mpesa">M-Pesa ou Airtel Money (Transfert)</option>
                    <option value="bank">Transfert Bancaire</option>
                    <option value="card">Carte Visa</option>
                    <option value="other">Autre</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="entry-source" className="ui-label">Source <span className="ui-required">*</span></label>
                  <select
                    id="entry-source"
                    name="source"
                    value={form.source}
                    onChange={handleChange}
                    className="ui-input"
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
                  <label htmlFor="entry-category" className="ui-label">Catégorie <span className="ui-required">*</span></label>
                  <select
                    id="entry-category"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className="ui-input"
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
                  <label htmlFor="entry-region" className="ui-label">Région <span className="ui-required">*</span></label>
                  <select
                    id="entry-region"
                    name="region"
                    value={form.region}
                    onChange={handleChange}
                    className="ui-input"
                    required
                  >
                    <option value="Butembo">Butembo (Bbbb)</option>
                    <option value="China">China (Cnnn)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="entry-description" className="ui-label">Description <span className="font-normal text-slate-500">(optionnel)</span></label>
                <textarea
                  id="entry-description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Description de l'entrée d'argent…"
                  className="ui-input"
                  rows={3}
                />
              </div>
            </div>
          </section>

          {/* Received From Information */}
          <section className="ui-card" aria-labelledby="entry-sender-title">
            <div className="ui-card-header">
              <h2 id="entry-sender-title" className="ui-section-title flex items-center gap-2"><User className="h-4 w-4 text-blue-700" />Expéditeur</h2>
            </div>
            <div className="ui-card-body grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="entry-sender-name" className="ui-label">Nom de l'expéditeur <span className="ui-required">*</span></label>
                <input
                  id="entry-sender-name"
                  type="text"
                  name="receivedFromName"
                  value={form.receivedFromName}
                  onChange={handleChange}
                  placeholder="Nom de la personne"
                  className="ui-input"
                  autoComplete="off"
                  required
                />
              </div>

              <div>
                <label htmlFor="entry-sender-phone" className="ui-label">Téléphone de l'expéditeur <span className="ui-required">*</span></label>
                <input
                  id="entry-sender-phone"
                  type="tel"
                  name="receivedFromPhone"
                  value={form.receivedFromPhone}
                  onChange={handleChange}
                  placeholder="+243 …"
                  className="ui-input"
                  inputMode="tel"
                  autoComplete="off"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="entry-sender-email" className="ui-label">Email de l'expéditeur <span className="font-normal text-slate-500">(optionnel)</span></label>
                <input
                  id="entry-sender-email"
                  type="email"
                  name="receivedFromEmail"
                  value={form.receivedFromEmail}
                  onChange={handleChange}
                  placeholder="email@exemple.com"
                  className="ui-input"
                  inputMode="email"
                  autoComplete="off"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Summary + submit */}
        <aside className="ui-card min-w-0 lg:sticky lg:top-20" aria-labelledby="entry-summary-title">
          <div className="ui-card-header">
            <h2 id="entry-summary-title" className="ui-section-title">Récapitulatif</h2>
          </div>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Montant reçu</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${amountValue > 0 ? "text-emerald-700" : "text-slate-300"}`}>
                {amountValue > 0 ? `+ ${formatCurrency(amountValue)}` : "—"}
              </p>
              {amountValue > 0 && exchangeRate && (
                <p className="text-sm font-medium tabular-nums text-slate-500">≈ {formatFc(amountValue * exchangeRate.rate)}</p>
              )}
            </div>
            <dl className="space-y-2 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Agent</dt>
                <dd className="truncate font-medium text-slate-900">{currentUser?.username || "Agent"}</dd>
              </div>
              {form.source && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Source</dt>
                  <dd className="truncate font-medium text-slate-900">{form.source}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="ui-btn ui-btn-success ui-btn-lg ui-btn-block"
            >
              {submitting ? (
                <>
                  <RefreshCw className="animate-spin" />
                  Enregistrement en cours…
                </>
              ) : (
                <>
                  <FileText />
                  Enregistrer l'entrée
                </>
              )}
            </button>

            {!isFormValid && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Remplissez les champs obligatoires : montant, source, catégorie, nom et téléphone.
              </p>
            )}
          </div>
        </aside>
      </form>

      {/* Hidden receipt container */}
      <div ref={receiptRef} style={{ display: "none" }} />
    </div>
  );
}
