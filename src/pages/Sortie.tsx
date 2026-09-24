/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { Receipt, RefreshCw, UserRound } from "lucide-react";
import { Alert, CurrencyToggle, ExchangeRateChip, PageHeader } from "../components/ui";
import { REGION_CODE_MAP } from "../utils/constants";
import { useConnectivity } from "../context/ConnectivityContext";

interface SortieForm {
  reason: string;
  recipientName: string;
  recipientPhone: string;
  amount: string;
  amountInFC: string;
  paymentMethod: "cash" | "mpesa" | "bank" | "card" | "other";
  notes: string;
  currencyMode: "usd" | "fc";
  region: "Butembo" | "China";
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
  const connectivity = useConnectivity();
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
    region: "China",
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
    if (connectivity.status !== "online") {
      setError("Connexion requise pour cette opération d'approbation.");
      return;
    }

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
        region: form.region,
        regionCode: REGION_CODE_MAP[form.region],
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
        region: "China",
      });

      setMessage("Dépense enregistrée avec succès !");
    } catch (e: any) {
      setError(e?.message || "La dépense n'a pas pu être enregistrée");
    } finally {
      setSubmitting(false);
    }
  }

  const amountValue = parseFloat(form.amount);

  return (
    <div className="ui-page ui-page-narrow">
      <PageHeader
        eyebrow="Caisse"
        title="Nouvelle sortie de caisse"
        description="Enregistrez une dépense ; elle sera soumise à validation."
        actions={<ExchangeRateChip loading={loadingRate} rate={exchangeRate?.rate} effectiveFrom={exchangeRate?.effectiveFrom} />}
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleSortie} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <section className="ui-card" aria-labelledby="sortie-expense-title">
            <div className="ui-card-header">
              <h2 id="sortie-expense-title" className="ui-section-title flex items-center gap-2"><Receipt className="h-4 w-4 text-blue-700" />Dépense</h2>
            </div>
            <div className="ui-card-body space-y-4">
              {/* Reason for Expense */}
              <div>
                <label htmlFor="sortie-reason" className="ui-label">Raison de la dépense <span className="ui-required">*</span></label>
                <input
                  id="sortie-reason"
                  type="text"
                  name="reason"
                  value={form.reason}
                  onChange={handleChange}
                  placeholder="Ex. : achat fournitures bureau, transport…"
                  className="ui-input"
                  required
                />
              </div>

              {/* Amount and Payment Method */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="sortie-amount" className="ui-label">
                      Montant ({form.currencyMode === 'usd' ? 'USD' : 'FC'}) <span className="ui-required">*</span>
                  </label>
                  <div className="flex items-stretch gap-2">
                  <div className="min-w-0 flex-1">
                  {form.currencyMode === 'usd' ? (
                    <input
                      id="sortie-amount"
                      type="number"
                      step="0.01"
                      name="amount"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0.00"
                      min="0.01"
                      className="ui-input tabular-nums"
                      inputMode="decimal"
                      required
                    />
                  ) : (
                    <input
                      id="sortie-amount"
                      type="number"
                      name="amountInFC"
                      value={form.amountInFC}
                      onChange={(e) => setForm({ ...form, amountInFC: e.target.value })}
                      placeholder="0"
                      min="1"
                      className="ui-input tabular-nums"
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
                  <label htmlFor="sortie-payment" className="ui-label">Méthode de paiement <span className="ui-required">*</span></label>
                  <select
                    id="sortie-payment"
                    name="paymentMethod"
                    value={form.paymentMethod}
                    onChange={handleChange}
                    className="ui-input"
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

              {/* Region */}
              <div className="sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="sortie-region" className="ui-label">Région <span className="ui-required">*</span></label>
                <select
                  id="sortie-region"
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

              {/* Additional Notes */}
              <div>
                <label htmlFor="sortie-notes" className="ui-label">Notes <span className="font-normal text-slate-500">(optionnel)</span></label>
                <textarea
                  id="sortie-notes"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Détails supplémentaires sur cette dépense…"
                  rows={3}
                  className="ui-input"
                />
              </div>
            </div>
          </section>

          {/* Recipient Information */}
          <section className="ui-card" aria-labelledby="sortie-recipient-title">
            <div className="ui-card-header">
              <h2 id="sortie-recipient-title" className="ui-section-title flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-700" />Bénéficiaire</h2>
            </div>
            <div className="ui-card-body grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sortie-recipient-name" className="ui-label">Nom du bénéficiaire <span className="ui-required">*</span></label>
                <input
                  id="sortie-recipient-name"
                  type="text"
                  name="recipientName"
                  value={form.recipientName}
                  onChange={handleChange}
                  placeholder="Nom complet"
                  className="ui-input"
                  autoComplete="off"
                  required
                />
              </div>

              <div>
                <label htmlFor="sortie-recipient-phone" className="ui-label">Téléphone du bénéficiaire <span className="ui-required">*</span></label>
                <input
                  id="sortie-recipient-phone"
                  type="tel"
                  name="recipientPhone"
                  value={form.recipientPhone}
                  onChange={handleChange}
                  placeholder="+243 …"
                  className="ui-input"
                  inputMode="tel"
                  autoComplete="off"
                  required
                />
              </div>
            </div>
          </section>
        </div>

        {/* Summary + submit */}
        <aside className="ui-card min-w-0 lg:sticky lg:top-20" aria-labelledby="sortie-summary-title">
          <div className="ui-card-header">
            <h2 id="sortie-summary-title" className="ui-section-title">Récapitulatif</h2>
          </div>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Montant de la sortie</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${amountValue > 0 ? "text-red-700" : "text-slate-300"}`}>
                {amountValue > 0 ? `− ${formatCurrency(amountValue)}` : "—"}
              </p>
              {amountValue > 0 && exchangeRate && (
                <p className="text-sm font-medium tabular-nums text-slate-500">≈ {formatFc(amountValue * exchangeRate.rate)}</p>
              )}
            </div>
            <dl className="space-y-2 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Enregistré par</dt>
                <dd className="truncate font-medium text-slate-900">{currentUser?.username || "Utilisateur"}</dd>
              </div>
              {exchangeRate && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Taux utilisé</dt>
                  <dd className="font-medium tabular-nums text-slate-900">1 USD = {new Intl.NumberFormat('fr-FR').format(exchangeRate.rate)} FC</dd>
                </div>
              )}
            </dl>
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              Cette dépense est enregistrée comme sortie de caisse et n’est pas comptabilisée dans les ventes. Le reçu pourra être imprimé depuis l’historique des sorties.
            </p>
          </div>
          <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block"
            >
              {submitting ? (
                <>
                  <RefreshCw className="animate-spin" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Receipt />
                  Enregistrer la dépense
                </>
              )}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
