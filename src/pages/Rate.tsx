import React, { useState, useEffect } from 'react';
import {
  DollarSign, 
  RefreshCw, 
  History, 
  Save, 
  Edit, 
  TrendingUp,
  Calendar,
  User,
  CheckCircle,
  Info,
} from 'lucide-react';
import { Alert, EmptyState, LoadingState, PageHeader } from '../components/ui';
import { useConnectivity } from '../context/ConnectivityContext';
import { offlineDb } from '../lib/offlineDb';

interface TauxChange {
  _id: string;
  rate: number;
  effectiveFrom: string;
  createdBy: {
    _id: string;
    username: string;
    email: string;
  };
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface HistoriqueTaux {
  _id: string;
  rate: number;
  effectiveFrom: string;
  createdBy: {
    username: string;
    email: string;
  };
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL;

export default function TauxChange() {
  const connectivity = useConnectivity();
  const [tauxActuel, setTauxActuel] = useState<TauxChange | null>(null);
  const [historiqueTaux, setHistoriqueTaux] = useState<HistoriqueTaux[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // État du formulaire
  const [form, setForm] = useState({
    rate: '',
    effectiveFrom: '',
    notes: ''
  });

  // Charger le taux actuel et l'historique
  const chargerTaux = async () => {
    try {
      setLoading(true);
      setError(null);
      const cached = await offlineDb.exchangeRateCache.get("current");
      if (cached) {
        setTauxActuel({
          _id: cached.rateId || "cached",
          rate: cached.rate,
          effectiveFrom: cached.effectiveFrom || cached.cachedAt,
          createdBy: { _id: "", username: "Cache local", email: "" },
          isActive: true,
          createdAt: cached.cachedAt,
          updatedAt: cached.cachedAt,
        });
      }
      if (connectivity.status !== "online") return;

      // Charger le taux actuel
      const reponseActuel = await fetch(`${API_BASE}/exchange-rates/current`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (reponseActuel.ok) {
        const donneesActuel = await reponseActuel.json();
        console.log('Données taux actuel:', donneesActuel); // Debug log
        
        // Handle different response structures
        if (donneesActuel.rate) {
          // If the response has a rate object (from POST response)
          setTauxActuel(donneesActuel.rate);
        } else if (donneesActuel._id) {
          // If the response is the rate object itself
          setTauxActuel(donneesActuel);
        } else {
          setTauxActuel(null);
        }
      } else {
        console.warn('Aucun taux actuel trouvé ou erreur de chargement');
        setTauxActuel(null);
      }

      // Charger l'historique des taux
      const reponseHistorique = await fetch(`${API_BASE}/exchange-rates/history?limit=20`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (reponseHistorique.ok) {
        const donneesHistorique = await reponseHistorique.json();
        console.log('Données historique:', donneesHistorique); // Debug log
        setHistoriqueTaux(donneesHistorique.history || donneesHistorique || []);
      } else if (reponseHistorique.status === 403) {
        setError('Vous n\'avez pas la permission de voir l\'historique des taux');
      } else {
        setHistoriqueTaux([]);
      }

    } catch (error) {
      console.error('Erreur lors du chargement des taux:', error);
      if (!await offlineDb.exchangeRateCache.get("current")) setError('Échec du chargement des taux de change');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerTaux();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connectivity.status !== "online") {
      setError('Connexion requise pour modifier le taux de change');
      return;
    }
    
    if (!form.rate || parseFloat(form.rate) <= 0) {
      setError('Veuillez entrer un taux de change valide');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);

      const response = await fetch(`${API_BASE}/exchange-rates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({
          rate: parseFloat(form.rate),
          effectiveFrom: form.effectiveFrom || new Date().toISOString(),
          notes: form.notes
        }),
      });

      const data = await response.json();
      console.log('Réponse mise à jour:', data); // Debug log

      if (response.ok) {
        setMessage('Taux de change mis à jour avec succès !');
        setForm({ rate: '', effectiveFrom: '', notes: '' });
        await chargerTaux(); // Actualiser les données
      } else {
        setError(data.error || `Échec de la mise à jour: ${response.status}`);
      }
    } catch (error: unknown) {
      console.error('Erreur lors de la mise à jour du taux:', error);
      setError(error instanceof Error ? error.message : 'Échec de la mise à jour du taux de change');
    } finally {
      setSubmitting(false);
    }
  };

  const formaterDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Date invalide';
    }
  };

  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(montant);
  };

  // Display-only: the inverse rate is tiny (≈ 0,00035), so show significant digits.
  const formaterInverse = (montant: number) =>
    new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 4 }).format(montant);

  if (loading) {
    return (
      <div className="ui-page">
        <LoadingState label="Chargement des taux de change…" className="ui-card" />
      </div>
    );
  }

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Finance"
        title="Taux de change"
        description="Définissez le taux USD → FC utilisé par les ventes, réservations et mouvements de caisse."
        actions={
          <button type="button" onClick={chargerTaux} className="ui-btn ui-btn-secondary">
            <RefreshCw />
            Actualiser
          </button>
        }
      />

      {/* Messages */}
      {message && <Alert tone="success" onDismiss={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Colonne de gauche - Taux actuel et formulaire */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* Carte du taux actuel */}
          <section className="ui-card" aria-labelledby="current-rate-title">
            <div className="ui-card-header">
              <h2 id="current-rate-title" className="ui-section-title flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-700" />
                Taux actuel
              </h2>
              {tauxActuel?.isActive && (
                <span className="ui-badge ui-badge-success"><CheckCircle className="h-3 w-3" aria-hidden="true" />Actif</span>
              )}
            </div>

            {tauxActuel ? (
              <div className="ui-card-body space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                    <p className="text-xs font-medium text-blue-700">USD → FC</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-950">
                      1 USD = {formaterMontant(tauxActuel.rate)} FC
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-medium text-slate-500">FC → USD</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-950">
                      1 FC = {formaterInverse(1 / tauxActuel.rate)} USD
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <dt>Effectif depuis :</dt>
                    <dd className="font-medium text-slate-900">{formaterDate(tauxActuel.effectiveFrom)}</dd>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <User className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <dt>Défini par :</dt>
                    <dd className="font-medium text-slate-900">{tauxActuel.createdBy?.username || 'Inconnu'}</dd>
                  </div>
                </dl>

                {tauxActuel.notes && (
                  <div className="ui-muted-panel text-sm">
                    <p className="text-xs font-medium text-slate-500">Notes</p>
                    <p className="mt-0.5 text-slate-700">{tauxActuel.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={DollarSign} title="Aucun taux de change actif" description="Veuillez définir un taux de change ci-dessous." />
            )}
          </section>

          {/* Formulaire de mise à jour */}
          <form onSubmit={handleSubmit} className="ui-card" aria-labelledby="update-rate-title">
            <div className="ui-card-header">
              <h2 id="update-rate-title" className="ui-section-title flex items-center gap-2">
                <Edit className="h-4 w-4 text-blue-700" />
                Mettre à jour le taux
              </h2>
            </div>

            <div className="ui-card-body space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="rate-value" className="ui-label">Nouveau taux (1 USD = X FC) <span className="ui-required">*</span></label>
                  <input
                    id="rate-value"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                    placeholder="Ex. : 2500"
                    className="ui-input tabular-nums"
                    inputMode="decimal"
                    required
                  />
                  <p className="ui-help">Nombre de francs congolais pour 1 USD.</p>
                </div>

                <div>
                  <label htmlFor="rate-effective" className="ui-label">Date d'effet</label>
                  <input
                    id="rate-effective"
                    type="datetime-local"
                    value={form.effectiveFrom}
                    onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                    className="ui-input"
                  />
                  <p className="ui-help">Laisser vide pour utiliser la date actuelle.</p>
                </div>
              </div>

              <div>
                <label htmlFor="rate-notes" className="ui-label">Notes <span className="font-normal text-slate-500">(optionnel)</span></label>
                <textarea
                  id="rate-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Raison du changement, source du taux, etc."
                  rows={3}
                  className="ui-input"
                />
              </div>

              <Alert tone="warning">Vérifiez la valeur avant de valider : le taux actif est utilisé pour toutes les nouvelles opérations.</Alert>
            </div>

            <div className="ui-card-footer">
              <button
                type="submit"
                disabled={submitting || !form.rate}
                className="ui-btn ui-btn-primary w-full sm:w-auto"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="animate-spin" />
                    Mise à jour…
                  </>
                ) : (
                  <>
                    <Save />
                    Mettre à jour le taux
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Colonne de droite - Historique */}
        <section className="ui-card min-w-0 self-start" aria-labelledby="rate-history-title">
          <div className="ui-card-header">
            <h2 id="rate-history-title" className="ui-section-title flex items-center gap-2">
              <History className="h-4 w-4 text-blue-700" />
              Historique
            </h2>
            <span className="ui-badge ui-badge-neutral tabular-nums">{historiqueTaux.length} entrées</span>
          </div>

          {historiqueTaux.length > 0 ? (
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {historiqueTaux.map((taux) => (
                <li key={taux._id} className={`px-4 py-3 sm:px-5 ${taux.isActive ? "bg-emerald-50/50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-slate-900">
                      1 USD = {formaterMontant(taux.rate)} FC
                      {taux.isActive && <span className="ui-badge ui-badge-success">Actif</span>}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-slate-500">
                    <span>Effet : {formaterDate(taux.effectiveFrom)}</span>
                    <span>Par {taux.createdBy?.username || 'Inconnu'}</span>
                  </div>
                  {taux.notes && (
                    <p className="mt-1 truncate text-xs text-slate-500" title={taux.notes}>{taux.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="Aucun historique disponible" description="Les changements de taux apparaîtront ici." />
          )}
        </section>
      </div>

      {/* Section d'information */}
      <section className="ui-card p-4 sm:p-5" aria-labelledby="rate-help-title">
        <h3 id="rate-help-title" className="ui-section-title mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-700" />
          Comment utiliser les taux de change
        </h3>
        <div className="grid grid-cols-1 gap-4 text-sm text-slate-600 md:grid-cols-2">
          <div>
            <p className="mb-1.5 font-medium text-slate-900">Pour les ventes en FC</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Les prix saisis en FC sont convertis en USD</li>
              <li>Le système utilise toujours le taux actif</li>
              <li>Bien vérifier avant de définir un nouveau taux</li>
            </ul>
          </div>
          <div>
            <p className="mb-1.5 font-medium text-slate-900">Bonnes pratiques</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Mettez à jour le taux régulièrement</li>
              <li>Notez la source du taux (banque, marché, etc.)</li>
              <li>Un seul taux peut être actif à la fois</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
