"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import {
  Users,
  Search,
  Eye,
  Trash2,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  ShoppingBag,
  RefreshCw,
  UserPlus,
  X,
} from "lucide-react";
import { Alert, EmptyState, LoadingState, MetricCard, PageHeader } from "../../components/ui";
import { useConnectivity } from "../../context/ConnectivityContext";
import { cacheCustomers, getLocalCustomers } from "../../services/localCustomerReadModel";

interface Customer {
  _id: string;
  name: string;
  phone: string;
  email: string;
  totalPurchases: number;
  totalSpent: number;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
  createdAt: string;
  updatedAt: string;
}

const serverUrl = import.meta.env.VITE_API_URL;

export default function Customers() {
  const connectivity = useConnectivity();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [refreshing, setRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [usingLocalData, setUsingLocalData] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, currentPage: 1, limit: 50 });
  const [portfolioTotal, setPortfolioTotal] = useState(0);
  const [activeCustomerCount, setActiveCustomerCount] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(fetchCustomers, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, connectivity.status]);

  useEffect(() => {
    const subscription = liveQuery(getLocalCustomers).subscribe({
      next: (rows) => { if (connectivity.status !== "online") applyLocalCustomers(rows); },
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity.status, currentPage, searchTerm]);

  const applyLocalCustomers = (rows: Customer[]) => {
    const term = searchTerm.trim().toLocaleLowerCase("fr");
    const filtered = term
      ? rows.filter((customer) => [customer.name, customer.phone, customer.email].some((value) => value.toLocaleLowerCase("fr").includes(term)))
      : rows;
    setCustomers(filtered.slice((currentPage - 1) * 50, currentPage * 50));
    setPagination({ total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / 50)), currentPage, limit: 50 });
    setPortfolioTotal(filtered.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0));
    setActiveCustomerCount(filtered.filter((customer) => customer.totalPurchases > 0).length);
    setUsingLocalData(true);
  };

  const loadLocalCustomers = async () => applyLocalCustomers(await getLocalCustomers());

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      await loadLocalCustomers();
      if (connectivity.status !== "online") return;
      const params = new URLSearchParams({ page: String(currentPage), limit: "50" });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const response = await fetch(`${serverUrl}/customers?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const serverCustomers = Array.isArray(data.customers) ? data.customers : [];
      await cacheCustomers(serverCustomers);
      setCustomers(serverCustomers);
      setPagination({
        total: Number(data.total || 0),
        totalPages: Number(data.totalPages || 1),
        currentPage: Number(data.currentPage || 1),
        limit: Number(data.limit || 50),
      });
      setPortfolioTotal(Number(data.summary?.totalSpent || 0));
      setActiveCustomerCount(Number(data.summary?.activeCustomers || 0));
      setUsingLocalData(false);
    } catch (error) {
      console.error("Error fetching customers:", error);
      await loadLocalCustomers();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshCustomers = async () => {
    setRefreshing(true);
    await fetchCustomers();
  };

  const filteredCustomers = customers;

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === "null" || dateString === "undefined") return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString || dateString === "null" || dateString === "undefined") return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "N/A";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connectivity.status !== "online") {
      alert("Connexion requise pour cette opération");
      return;
    }
    try {
      const response = await fetch(`${serverUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowAddModal(false);
        setFormData({ name: "", phone: "", email: "" });
        await fetchCustomers();
      } else {
        console.error("Failed to add customer:", response.status);
      }
    } catch (error) {
      console.error("Error adding customer:", error);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (connectivity.status !== "online") {
      alert("Connexion requise pour cette opération");
      return;
    }
    if (confirm("Êtes-vous sûr de vouloir supprimer ce client?")) {
      try {
        const response = await fetch(`${serverUrl}/customers/${customerId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });

        if (response.ok) {
          await fetchCustomers();
        } else {
          console.error("Failed to delete customer:", response.status);
        }
      } catch (error) {
        console.error("Error deleting customer:", error);
      }
    }
  };

  const recalculateCustomerStats = async (customerId: string) => {
    if (connectivity.status !== "online") {
      alert("Connexion requise pour cette opération");
      return;
    }
    try {
      setRecalculating(customerId);

      const response = await fetch(
        `${serverUrl}/customers/${customerId}/recalculate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );

      if (response.ok) {
        await fetchCustomers();
        alert("Statistiques recalculées avec succès!");
      } else if (response.status === 404) {
        alert(
          "Fonction de recalcul non disponible. Pour corriger les statistiques:\n\n" +
            "1. Allez dans l'historique des ventes\n" +
            "2. Modifiez puis sauvegardez une vente de ce client\n" +
            "3. Les statistiques seront automatiquement recalculées"
        );
      }
    } catch (error) {
      console.error("Error recalculating customer stats:", error);
      alert("Erreur lors du recalcul. Vérifiez la console pour plus de détails.");
    } finally {
      setRecalculating(null);
    }
  };

  const viewCustomerDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowModal(true);
  };

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Relations clients"
        title="Clients"
        description="Consultez le fichier clients, leurs achats et leur historique."
        meta={usingLocalData ? <span className="ui-badge ui-badge-info">Hors ligne · clients en cache et ventes locales incluses</span> : undefined}
        actions={
          <>
            <button type="button" onClick={refreshCustomers} disabled={refreshing} className="ui-btn ui-btn-secondary">
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Actualisation…" : "Actualiser"}
            </button>
            <button type="button" onClick={() => setShowAddModal(true)} className="ui-btn ui-btn-primary">
              <UserPlus />
              Ajouter un client
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Nombre total de clients" value={pagination.total} icon={Users} />
        <MetricCard label="Revenu total clients" value={formatCurrency(portfolioTotal)} hint={`${activeCustomerCount} clients actifs`} icon={DollarSign} />
        <div className="relative col-span-2 self-end">
          <label htmlFor="customer-search" className="sr-only">Rechercher un client</label>
          <Search className="ui-field-icon" aria-hidden="true" />
          <input
            id="customer-search"
            type="search"
            placeholder="Rechercher un client par nom ou téléphone…"
            className="ui-input ui-input-icon"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {customers.some(
        (customer) =>
          customer.totalPurchases > 0 &&
          (customer.totalSpent === 0 || customer.totalSpent > 100000)
      ) && (
        <Alert tone="warning" title="Statistiques potentiellement inexactes">
          Certaines statistiques clients peuvent être incorrectes suite à des modifications de ventes. Utilisez « Recalculer les statistiques » pour corriger.
        </Alert>
      )}

      <section className="ui-card overflow-hidden" aria-labelledby="customers-title">
        <div className="ui-card-header">
          <h2 id="customers-title" className="ui-section-title flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-700" />
            Répertoire clients
            <span className="ui-badge ui-badge-neutral tabular-nums">{pagination.total}</span>
          </h2>
        </div>

        <div className="ui-table-wrap">
          {loading ? (
            <LoadingState label="Chargement des clients…" />
          ) : filteredCustomers.length === 0 ? (
            <EmptyState icon={Users} title="Aucun client trouvé" description="Modifiez la recherche ou ajoutez un nouveau client." />
          ) : (
            <>
            <table className="ui-table min-w-full">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Contact</th>
                  <th scope="col" className="text-right">Achats</th>
                  <th scope="col" className="text-right">Total dépensé</th>
                  <th scope="col">Dernier achat</th>
                  <th scope="col" className="ui-sticky-end text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer._id}>
                    <td className="min-w-[13rem]">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700" aria-hidden="true">
                          {customer.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block break-words font-medium text-slate-900">{customer.name}</span>
                          <span className="block text-xs text-slate-500">Client depuis {formatDate(customer.createdAt)}</span>
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 tabular-nums text-slate-900">
                          <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          {customer.phone}
                        </span>
                        {customer.email && (
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="ui-num">{customer.totalPurchases}</td>
                    <td className="ui-num whitespace-nowrap font-semibold text-slate-900">{formatCurrency(customer.totalSpent)}</td>
                    <td className="whitespace-nowrap text-slate-500">{formatDate(customer.lastPurchaseDate)}</td>
                    <td className="ui-sticky-end">
                      <div className="ui-row-actions">
                        <button
                          type="button"
                          onClick={() => viewCustomerDetails(customer)}
                          className="ui-icon-btn ui-icon-btn-primary"
                          title="Voir les détails du client"
                          aria-label={`Voir ${customer.name}`}
                        >
                          <Eye />
                        </button>
                        <button
                          type="button"
                          onClick={() => recalculateCustomerStats(customer._id)}
                          disabled={recalculating === customer._id}
                          className="ui-icon-btn ui-icon-btn-success"
                          title="Recalculer les statistiques"
                          aria-label={`Recalculer les statistiques de ${customer.name}`}
                        >
                          <RefreshCw className={recalculating === customer._id ? "animate-spin" : ""} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomer(customer._id)}
                          className="ui-icon-btn ui-icon-btn-danger"
                          title="Supprimer le client"
                          aria-label={`Supprimer ${customer.name}`}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination.totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="text-sm tabular-nums text-slate-600">Page {pagination.currentPage} sur {pagination.totalPages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Précédent</button>
                  <button type="button" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Suivant</button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </section>

      {showAddModal && (
        <div className="ui-dialog-overlay" role="presentation">
          <form onSubmit={handleAddCustomer} className="ui-dialog max-w-md" role="dialog" aria-modal="true" aria-labelledby="add-customer-title">
            <div className="ui-dialog-header">
              <h3 id="add-customer-title" className="ui-dialog-title">Ajouter un client</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-4">
              <div>
                <label htmlFor="new-customer-name" className="ui-label">Nom <span className="ui-required">*</span></label>
                <input
                  id="new-customer-name"
                  type="text"
                  required
                  className="ui-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="new-customer-phone" className="ui-label">Téléphone <span className="ui-required">*</span></label>
                <input
                  id="new-customer-phone"
                  type="tel"
                  required
                  className="ui-input"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  inputMode="tel"
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="new-customer-email" className="ui-label">Email</label>
                <input
                  id="new-customer-email"
                  type="email"
                  className="ui-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  inputMode="email"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowAddModal(false)} className="ui-btn ui-btn-ghost">
                Annuler
              </button>
              <button type="submit" className="ui-btn ui-btn-primary">
                Ajouter le client
              </button>
            </div>
          </form>
        </div>
      )}

      {showModal && selectedCustomer && (
        <div className="ui-dialog-overlay" role="presentation">
          <div className="ui-dialog max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="customer-details-title">
            <div className="ui-dialog-header">
              <h3 id="customer-details-title" className="ui-dialog-title">Détails du client</h3>
              <button type="button" onClick={() => setShowModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-lg font-semibold text-blue-700" aria-hidden="true">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h4 className="break-words text-lg font-semibold text-slate-950">{selectedCustomer.name}</h4>
                  <p className="text-sm text-slate-500">Client depuis {formatDate(selectedCustomer.createdAt)}</p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="ui-muted-panel">
                  <dt className="text-xs font-medium text-slate-500">Téléphone</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm tabular-nums text-slate-900"><Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />{selectedCustomer.phone}</dd>
                </div>
                {selectedCustomer.email && (
                  <div className="ui-muted-panel min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Email</dt>
                    <dd className="mt-1 flex items-center gap-2 break-all text-sm text-slate-900"><Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{selectedCustomer.email}</dd>
                  </div>
                )}
              </dl>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Nombre d'achats" value={selectedCustomer.totalPurchases} icon={ShoppingBag} className="shadow-none" />
                <MetricCard label="Somme dépensée" value={formatCurrency(selectedCustomer.totalSpent)} icon={DollarSign} className="shadow-none" />
                <MetricCard label="Premier achat" value={<span className="text-sm font-semibold">{formatDateTime(selectedCustomer.firstPurchaseDate)}</span>} icon={Calendar} className="shadow-none" />
                <MetricCard label="Dernier achat" value={<span className="text-sm font-semibold">{formatDateTime(selectedCustomer.lastPurchaseDate)}</span>} icon={Calendar} className="shadow-none" />
              </div>
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn ui-btn-ghost">
                Fermer
              </button>
              <button type="button" onClick={() => recalculateCustomerStats(selectedCustomer._id)} className="ui-btn ui-btn-secondary">
                <RefreshCw />
                Recalculer les statistiques
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
