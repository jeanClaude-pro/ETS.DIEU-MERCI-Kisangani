/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from "react";
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Calendar,
  User,
  Package,
  Phone,
  Mail,
  RefreshCw,
  Printer,
  Edit,
  Trash2,
  Plus,
  Minus,
  Clock,
  X,
} from "lucide-react";
import { Alert, EmptyState, LoadingState, MetricCard, PageHeader } from "../components/ui";
import {
  normalizeSaleReceipt,
  printCommittedSaleAfterDelay,
  printSaleReceiptAndStub,
} from "../services/printService";

interface ReservationItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  _id: string;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
}

interface EditHistoryEntry {
  editedBy: string;
  editedAt: string;
  changes: any;
  reason: string;
  _id?: string;
}

interface Reservation {
  _id: string;
  saleReference: string;
  saleId: string;
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  items: ReservationItem[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  status: 'pending' | 'completed' | 'cancelled';
  type: string;
  reservationDate: string;
  reservationTime: string;
  createdAt: string;
  updatedAt: string;
  salesPerson?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  editedBy?: string;
  editedAt?: string;
  editHistory?: EditHistoryEntry[];
}

interface Product {
  _id: string;
  name: string;
  stock: number;
  price: number;
  sku?: string;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
}

const API_BASE = import.meta.env.VITE_API_URL;

export default function ReservationManagement() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [reservationToComplete, setReservationToComplete] = useState<Reservation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [filterRegion, setFilterRegion] = useState<'' | 'Bbbb' | 'Cnnn'>('');
  const [userRole, setUserRole] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ totalRecords: 0, totalPages: 1, currentPage: 1, limit: 50 });
  const [reservationSummary, setReservationSummary] = useState({ totalReservations: 0, pending: 0, completed: 0, itemCount: 0, totalValue: 0 });

  // Edit modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editForm, setEditForm] = useState({
    customer: { name: "", phone: "", email: "" },
    items: [] as ReservationItem[],
    paymentMethod: "cash",
    reason: "",
    notes: "",
    reservationDate: "",
    reservationTime: ""
  });
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    fetchProducts();
    // Get user role from localStorage or auth context
    const role = localStorage.getItem('userRole') || 'admin'; // Default to admin for testing
    setUserRole(role);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(fetchReservations, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterRegion, searchTerm, currentPage]);

  const fetchReservations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({ page: String(currentPage), limit: "50" });
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterRegion) params.set("region", filterRegion);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const response = await fetch(`${API_BASE}/sales/reservations/all?${params}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setReservations(data.data);
          setPagination(data.pagination || { totalRecords: data.data.length, totalPages: 1, currentPage: 1, limit: 50 });
          setReservationSummary(data.summary || { totalReservations: 0, pending: 0, completed: 0, itemCount: 0, totalValue: 0 });
        } else {
          console.warn("❌ Invalid data format from API");
          setError("Format de données invalide reçu de l'API");
          setReservations([]);
        }
      } else {
        console.error("❌ Reservations endpoint failed, status:", response.status);
        setError("Impossible de charger les réservations");
        setReservations([]);
      }
    } catch (error) {
      console.error("❌ Error loading reservations:", error);
      setError("Échec du chargement des réservations");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      const res = await fetch(`${API_BASE}/products?limit=0`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        let productsArray: Product[] = [];

        if (Array.isArray(data)) {
          productsArray = data;
        } else if (data && Array.isArray(data.products)) {
          productsArray = data.products;
        } else if (data && typeof data === "object") {
          productsArray = [data];
        }

        setProducts(productsArray);
      } else {
        console.error("Products API Error:", res.status, res.statusText);
      }
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const filteredReservations = reservations;

  // Precompute each reservation's region codes once per data/filter change
  // instead of re-walking every reservation's items inside the row .map().
  const reservationRegionBadges = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const reservation of filteredReservations) {
      const codes = Array.from(
        new Set((reservation.items || []).map((i) => i.regionCode).filter(Boolean) as string[])
      );
      map.set(reservation._id, codes);
    }
    return map;
  }, [filteredReservations]);

  const formatDate = (dateString: string) => {
    try {
      // Handle different date formats
      let date: Date;
      
      // If it's already a valid date string
      if (dateString && !isNaN(new Date(dateString).getTime())) {
        date = new Date(dateString);
      } else {
        // Try to parse as timestamp
        const timestamp = parseInt(dateString);
        if (!isNaN(timestamp)) {
          date = new Date(timestamp);
        } else {
          return "Date invalide";
        }
      }
      
      if (isNaN(date.getTime())) {
        return "Date invalide";
      }
      
      return date.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Date invalide";
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      let date: Date;
      
      if (dateString && !isNaN(new Date(dateString).getTime())) {
        date = new Date(dateString);
      } else {
        const timestamp = parseInt(dateString);
        if (!isNaN(timestamp)) {
          date = new Date(timestamp);
        } else {
          return "Date invalide";
        }
      }
      
      if (isNaN(date.getTime())) {
        return "Date invalide";
      }
      
      return date.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Date invalide";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // NEW: Improved function to display reservation date properly
  const displayReservationDate = (reservation: Reservation) => {
    // Priority 1: Use reservationDate if available
    if (reservation.reservationDate) {
      const datePart = formatDate(reservation.reservationDate);
      // If time is also available, show both
      if (reservation.reservationTime) {
        return `${datePart} ${reservation.reservationTime}`;
      }
      return datePart;
    }
    
    // Priority 2: Fallback to createdAt date
    return formatDate(reservation.createdAt);
  };

  // NEW: Function to display only the time part
  const displayReservationTime = (reservation: Reservation) => {
    if (reservation.reservationTime) {
      return reservation.reservationTime;
    }
    
    // Fallback to time from createdAt
    if (reservation.createdAt) {
      try {
        const date = new Date(reservation.createdAt);
        if (!isNaN(date.getTime())) {
          return date.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        }
      } catch {
        // Ignore errors
      }
    }
    
    return "Heure non spécifiée";
  };

  const viewReservationDetails = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setShowModal(true);
    setError(null);
  };

  const openCompletionDialog = (reservation: Reservation) => {
    setReservationToComplete(reservation);
    setShowCompletionDialog(true);
  };

  const closeCompletionDialog = () => {
    setShowCompletionDialog(false);
    setReservationToComplete(null);
  };

  // Check if user can edit reservations (admin or manager)
  const canEditReservation = userRole === 'admin' || userRole === 'manager';
  
  // Check if user can delete reservations (admin only)
  const canDeleteReservation = userRole === 'admin';

  // EDIT FUNCTIONALITY
  const openEditModal = async (reservation: Reservation) => {
    if (reservation.status === 'cancelled') {
      setError("Impossible de modifier une réservation annulée");
      return;
    }

    // Only admin can edit completed reservations
    if (reservation.status === 'completed' && userRole !== 'admin') {
      setError("Seul l'administrateur peut modifier une réservation complétée");
      return;
    }

    setEditingReservation(reservation);
    setEditForm({
      customer: { ...reservation.customer },
      items: reservation.items.map((item) => ({ ...item })),
      paymentMethod: reservation.paymentMethod,
      reason: "",
      notes: reservation.notes || "",
      reservationDate: reservation.reservationDate || "",
      reservationTime: reservation.reservationTime || ""
    });
    setShowEditModal(true);
    setError(null);

    // Ensure products are loaded
    if (products.length === 0) {
      await fetchProducts();
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingReservation(null);
    setEditForm({
      customer: { name: "", phone: "", email: "" },
      items: [],
      paymentMethod: "cash",
      reason: "",
      notes: "",
      reservationDate: "",
      reservationTime: ""
    });
    setError(null);
  };

  const updateItemQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;

    const updatedItems = [...editForm.items];
    const product = products.find(
      (p) => p._id === updatedItems[index].productId
    );

    if (product && newQuantity > product.stock + updatedItems[index].quantity) {
      setError(`Stock insuffisant. Disponible: ${product.stock}`);
      return;
    }

    updatedItems[index].quantity = newQuantity;
    updatedItems[index].total = newQuantity * updatedItems[index].price;

    setEditForm((prev) => ({
      ...prev,
      items: updatedItems,
    }));
    setError(null);
  };

  const updateItemPrice = (index: number, newPrice: number) => {
    if (newPrice < 0) return;

    const updatedItems = [...editForm.items];
    updatedItems[index].price = newPrice;
    updatedItems[index].total = newPrice * updatedItems[index].quantity;

    setEditForm((prev) => ({
      ...prev,
      items: updatedItems,
    }));
  };

  const removeItem = (index: number) => {
    const updatedItems = editForm.items.filter((_, i) => i !== index);
    setEditForm((prev) => ({
      ...prev,
      items: updatedItems,
    }));
  };

  const addNewItem = () => {
    if (products.length === 0) {
      setError("Aucun produit disponible. Veuillez actualiser les produits d'abord.");
      return;
    }

    const defaultProduct = products[0];
    const newItem: ReservationItem = {
      productId: defaultProduct._id,
      name: defaultProduct.name,
      quantity: 1,
      price: defaultProduct.price,
      total: defaultProduct.price,
      _id: `temp-${Date.now()}`,
    };

    setEditForm((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const updateItemProduct = (index: number, productId: string) => {
    const product = products.find((p) => p._id === productId);
    if (!product) {
      setError("Produit sélectionné non trouvé");
      return;
    }

    const updatedItems = [...editForm.items];
    updatedItems[index].productId = productId;
    updatedItems[index].name = product.name;
    updatedItems[index].price = product.price;
    updatedItems[index].total = product.price * updatedItems[index].quantity;
    updatedItems[index].region = product.region;
    updatedItems[index].regionCode = product.regionCode;

    setEditForm((prev) => ({
      ...prev,
      items: updatedItems,
    }));
    setError(null);
  };

  const calculateTotals = () => {
    const subtotal = editForm.items.reduce((sum, item) => sum + item.total, 0);
    return { subtotal, total: subtotal };
  };

  const handleEditReservation = async () => {
    if (!editingReservation) return;

    if (editForm.items.length === 0) {
      setError("La réservation doit contenir au moins un article");
      return;
    }

    if (!editForm.customer.name || !editForm.customer.phone) {
      setError("Le nom et le téléphone du client sont requis");
      return;
    }

    if (!editForm.reason) {
      setError("Veuillez fournir une raison pour la modification de cette réservation");
      return;
    }

    try {
      setLoading(true);

      // Calculate totals properly
      const { subtotal, total } = calculateTotals();

      const updateData = {
        customer: editForm.customer,
        items: editForm.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })),
        subtotal: subtotal,
        total: total,
        paymentMethod: editForm.paymentMethod,
        reason: editForm.reason,
        notes: editForm.notes,
        reservationDate: editForm.reservationDate,
        reservationTime: editForm.reservationTime,
        _id: editingReservation._id,
        saleId: editingReservation.saleId,
      };


      const response = await fetch(
        `${API_BASE}/sales/${editingReservation._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify(updateData),
        }
      );


      if (response.ok) {
        setMessage("Réservation mise à jour avec succès");

        // Refresh the reservations list immediately
        await fetchReservations();

        closeEditModal();
        setShowModal(false);
      } else {
        const errorData = await response.json();
        console.error("Update error:", errorData);
        setError(
          errorData.error ||
            `Échec de la mise à jour de la réservation: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Error updating reservation:", error);
      setError("Échec de la mise à jour de la réservation. Veuillez vérifier votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  // DELETE FUNCTIONALITY
  const handleDeleteReservation = async (reservation: Reservation) => {
    if (!canDeleteReservation) {
      setError("Seul l'administrateur peut supprimer une réservation");
      return;
    }

    if (
      !window.confirm(
        `Êtes-vous sûr de vouloir supprimer la réservation ${reservation.saleId} ? Cette action est irréversible.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/sales/${reservation._id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );

      if (response.ok) {
        setMessage("Réservation supprimée avec succès");
        await fetchReservations();
        setShowModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de la suppression de la réservation");
      }
    } catch (error) {
      setError("Échec de la suppression de la réservation");
      console.error("Error deleting reservation:", error);
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, total } = calculateTotals();

  // Reservations remain clearly labelled and use the shared receipt + stub pipeline.
  const printReservationReceipt = (reservation: Reservation, afterSave = false) => {
    const receipt = normalizeSaleReceipt(reservation, { type: "reservation" });
    const printOperation = afterSave
      ? printCommittedSaleAfterDelay(receipt)
      : printSaleReceiptAndStub(receipt);
    void printOperation
      .then((destination) => {
        setMessage(
          destination === "usb"
            ? "Réservation et souche envoyées à l'imprimante thermique."
            : "Réservation et souche imprimées successivement dans le navigateur.",
        );
      })
      .catch((printError: unknown) => {
        setError(printError instanceof Error ? printError.message : "Échec de l'impression.");
      });
  };

  const markAsCompleted = async (reservation: Reservation) => {
    try {
      setLoading(true);
      
      // Use the sales completion endpoint
      const response = await fetch(`${API_BASE}/sales/${reservation._id}/complete`, {
        method: 'PATCH',
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({
          completedBy: localStorage.getItem("username") || "Admin"
        }),
      });

      if (response.ok) {
        const updatedReservation = await response.json() as Reservation;
        
        setMessage("Réservation marquée comme complétée avec succès");
        
        // Update local state immediately
        setReservations(prev => prev.map(r =>
          r._id === reservation._id ? updatedReservation : r
        ));
        
        setShowCompletionDialog(false);
        
        // Print the authoritative object returned by the completion endpoint.
        printReservationReceipt(updatedReservation, true);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de la mise à jour de la réservation");
      }
    } catch (error) {
      setError("Erreur de connexion lors de la mise à jour");
      console.error("Error completing reservation:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsPending = async (reservation: Reservation) => {
    const confirmMessage = `Êtes-vous sûr de vouloir remettre la réservation ${reservation.saleId} en attente ?\n\nCette action ne pourra pas être annulée.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setLoading(true);
      
      // Use the sales pending endpoint
      const response = await fetch(`${API_BASE}/sales/${reservation._id}/pending`, {
        method: 'PATCH',
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (response.ok) {
        await response.json();
        
        setMessage("Réservation remise en attente avec succès");
        
        // Update local state immediately
        setReservations(prev => prev.map(r => 
          r._id === reservation._id 
            ? { 
                ...r, 
                status: "pending",
                completedBy: undefined,
                completedAt: undefined
              }
            : r
        ));
        
        setShowModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de la mise à jour de la réservation");
      }
    } catch (error) {
      setError("Erreur de connexion lors de la mise à jour");
      console.error("Error setting reservation to pending:", error);
    } finally {
      setLoading(false);
    }
  };

  const reservationPaymentLabel: Record<string, string> = { cash: "Cash", card: "Carte", transfer: "Virement", other: "Autre" };

  return (
    <div className="ui-page ui-page-wide">
      <PageHeader
        eyebrow="Commandes"
        title="Gestion des réservations"
        description="Suivez l'état des réservations clients, imprimez les reçus et marquez les retraits."
        actions={
          <button type="button" onClick={fetchReservations} disabled={loading} className="ui-btn ui-btn-secondary">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {loading ? "Chargement…" : "Actualiser"}
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total des réservations" value={reservationSummary.totalReservations} icon={Calendar} />
        <MetricCard label="En attente" value={reservationSummary.pending} icon={Clock} tone="warning" />
        <MetricCard label="Complétées" value={reservationSummary.completed} icon={CheckCircle} tone="success" />
        <MetricCard label="Articles réservés" value={reservationSummary.itemCount} icon={Package} />
      </div>

      {/* Messages */}
      {message && <Alert tone="success" onDismiss={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      {/* Filters and Search */}
      <section className="ui-card p-4 sm:p-5" aria-label="Recherche et filtres">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_12rem]">
          <div className="relative min-w-0">
            <label htmlFor="reservation-search" className="sr-only">Rechercher une réservation</label>
            <Search className="ui-field-icon" aria-hidden="true" />
            <input
              id="reservation-search"
              type="search"
              placeholder="Rechercher par ID, client, téléphone…"
              className="ui-input ui-input-icon"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div>
            <label htmlFor="reservation-status-filter" className="sr-only">Statut</label>
            <select
              id="reservation-status-filter"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
              className="ui-input"
            >
              <option value="all">Toutes les réservations</option>
              <option value="pending">En attente seulement</option>
              <option value="completed">Complétées seulement</option>
            </select>
          </div>

          <div>
            <label htmlFor="reservation-region-filter" className="sr-only">Région</label>
            <select
              id="reservation-region-filter"
              value={filterRegion}
              onChange={(e) => { setFilterRegion(e.target.value as '' | 'Bbbb' | 'Cnnn'); setCurrentPage(1); }}
              className="ui-input"
            >
              <option value="">Toutes régions</option>
              <option value="Bbbb">Butembo (Bbbb)</option>
              <option value="Cnnn">China (Cnnn)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Reservations Table */}
      <section className="ui-card overflow-hidden" aria-labelledby="reservations-table-title">
        <div className="ui-card-header">
          <h2 id="reservations-table-title" className="ui-section-title flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-700" />
            Liste des réservations
            <span className="ui-badge ui-badge-neutral tabular-nums">{pagination.totalRecords}</span>
          </h2>
        </div>

        <div className="ui-table-wrap">
          {loading ? (
            <LoadingState label="Chargement des réservations…" />
          ) : filteredReservations.length === 0 ? (
            <EmptyState icon={Calendar} title="Aucune réservation trouvée" description="Aucune réservation ne correspond à vos critères de recherche." />
          ) : (
            <>
            <table className="ui-table min-w-full">
              <thead>
                <tr>
                  <th scope="col">Réservation</th>
                  <th scope="col">Client</th>
                  <th scope="col">Date de réservation</th>
                  <th scope="col" className="text-center">Articles</th>
                  <th scope="col">Région</th>
                  <th scope="col" className="text-right">Montant</th>
                  <th scope="col">Statut</th>
                  <th scope="col" className="ui-sticky-end text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map((reservation) => (
                  <tr key={reservation._id}>
                    <td className="whitespace-nowrap font-medium text-slate-900">
                      {reservation.saleId}
                    </td>
                    <td className="min-w-[10rem]">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">{reservation.customer.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{reservation.customer.phone}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-slate-700">{displayReservationDate(reservation)}</span>
                        <span className="text-xs text-slate-500">{displayReservationTime(reservation)}</span>
                      </div>
                    </td>
                    <td className="text-center tabular-nums">{reservation.items.length}</td>
                    <td>
                      {(() => {
                        const codes = reservationRegionBadges.get(reservation._id) || [];
                        if (codes.length === 0) return <span className="text-xs text-slate-400">—</span>;
                        if (codes.length > 1) return (
                          <span className="ui-badge ui-badge-info">Mixte</span>
                        );
                        return (
                          <span className="ui-tag">{codes[0]}</span>
                        );
                      })()}
                    </td>
                    <td className="ui-num whitespace-nowrap font-semibold text-slate-900">{formatCurrency(reservation.total)}</td>
                    <td>
                      <span className={`ui-badge ${reservation.status === 'completed' ? "ui-badge-success" : "ui-badge-warning"}`}>
                        {reservation.status === 'completed' ? 'Complétée' : 'En attente'}
                      </span>
                    </td>
                    <td className="ui-sticky-end">
                      <div className="ui-row-actions">
                        <button
                          type="button"
                          onClick={() => viewReservationDetails(reservation)}
                          className="ui-icon-btn ui-icon-btn-primary"
                          title="Voir les détails"
                          aria-label={`Voir la réservation ${reservation.saleId}`}
                        >
                          <Eye />
                        </button>

                        <button
                          type="button"
                          onClick={() => printReservationReceipt(reservation)}
                          className="ui-icon-btn"
                          title="Imprimer le reçu et la souche"
                          aria-label={`Imprimer la réservation ${reservation.saleId}`}
                        >
                          <Printer />
                        </button>

                        {/* Edit Button - Only for admin/manager */}
                        {canEditReservation && (
                          <button
                            type="button"
                            onClick={() => openEditModal(reservation)}
                            disabled={reservation.status === 'cancelled'}
                            className="ui-icon-btn ui-icon-btn-warning"
                            title="Modifier la réservation"
                            aria-label={`Modifier la réservation ${reservation.saleId}`}
                          >
                            <Edit />
                          </button>
                        )}

                        {/* Delete Button - Only for admin */}
                        {canDeleteReservation && (
                          <button
                            type="button"
                            onClick={() => handleDeleteReservation(reservation)}
                            className="ui-icon-btn ui-icon-btn-danger"
                            title="Supprimer la réservation"
                            aria-label={`Supprimer la réservation ${reservation.saleId}`}
                          >
                            <Trash2 />
                          </button>
                        )}

                        {canEditReservation && (
                          <>
                            {reservation.status !== 'completed' ? (
                              <button
                                type="button"
                                onClick={() => openCompletionDialog(reservation)}
                                disabled={loading}
                                className="ui-icon-btn ui-icon-btn-success text-emerald-700"
                                title="Marquer comme complétée"
                                aria-label={`Marquer ${reservation.saleId} comme complétée`}
                              >
                                <CheckCircle />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => markAsPending(reservation)}
                                disabled={loading}
                                className="ui-icon-btn ui-icon-btn-warning"
                                title="Remettre en attente"
                                aria-label={`Remettre ${reservation.saleId} en attente`}
                              >
                                <XCircle />
                              </button>
                            )}
                          </>
                        )}
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

      {/* Completion Confirmation Dialog */}
      {showCompletionDialog && reservationToComplete && (
        <div className="ui-dialog-overlay" role="alertdialog" aria-modal="true" aria-labelledby="complete-reservation-title">
          <div className="ui-dialog max-w-md">
            <div className="ui-dialog-header">
              <h3 id="complete-reservation-title" className="ui-dialog-title">Confirmer le retrait</h3>
              <button type="button" onClick={closeCompletionDialog} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body">
              <p className="text-sm text-slate-700">
                Êtes-vous sûr de vouloir marquer la réservation <strong className="font-semibold text-slate-950">{reservationToComplete.saleId}</strong> comme complétée ?
                Un reçu de retrait sera imprimé.
              </p>
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={closeCompletionDialog} className="ui-btn ui-btn-ghost">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => markAsCompleted(reservationToComplete)}
                disabled={loading}
                className="ui-btn ui-btn-success"
              >
                <CheckCircle />
                {loading ? "Traitement…" : "Confirmer et imprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reservation Details Modal */}
      {showModal && selectedReservation && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="reservation-details-title">
          <div className="ui-dialog max-w-2xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="reservation-details-title" className="ui-dialog-title">Détails de la réservation</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{selectedReservation.saleId}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              {/* Reservation Info */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Statut</dt>
                  <dd className="mt-1">
                    <span className={`ui-badge ${selectedReservation.status === 'completed' ? "ui-badge-success" : "ui-badge-warning"}`}>
                      {selectedReservation.status === 'completed' ? 'Complétée' : 'En attente'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Date de réservation</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">
                    {selectedReservation.reservationDate
                      ? `${formatDate(selectedReservation.reservationDate)} à ${selectedReservation.reservationTime || displayReservationTime(selectedReservation)}`
                      : 'Non spécifiée'
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Date de création</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{formatDateTime(selectedReservation.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Méthode de paiement</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{reservationPaymentLabel[selectedReservation.paymentMethod] || selectedReservation.paymentMethod}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Vendeur</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{selectedReservation.salesPerson || "Non spécifié"}</dd>
                </div>
                {selectedReservation.completedAt && (
                  <>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Complétée le</dt>
                      <dd className="mt-0.5 text-sm text-slate-900">{formatDateTime(selectedReservation.completedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Complétée par</dt>
                      <dd className="mt-0.5 text-sm text-slate-900">{selectedReservation.completedBy || "Inconnu"}</dd>
                    </div>
                  </>
                )}
              </dl>

              {/* Customer Info */}
              <div>
                <h4 className="ui-kicker mb-2 flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Client</h4>
                <dl className="ui-muted-panel grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Nom</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-900">{selectedReservation.customer.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Téléphone</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-sm tabular-nums text-slate-900"><Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />{selectedReservation.customer.phone}</dd>
                  </div>
                  {selectedReservation.customer.email && (
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-500">Email</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5 break-all text-sm text-slate-900"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />{selectedReservation.customer.email}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Items */}
              <div>
                <h4 className="ui-kicker mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Articles réservés ({selectedReservation.items.length})</h4>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {selectedReservation.items.map((item, index) => (
                    <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                          <span className="break-words">{item.name}</span>
                          {item.regionCode && <span className="ui-tag">{item.regionCode}</span>}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                          Quantité : {item.quantity} × {formatCurrency(item.price)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(item.total)}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Notes */}
              {selectedReservation.notes && (
                <div>
                  <h4 className="ui-kicker mb-2">Notes</h4>
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">{selectedReservation.notes}</p>
                </div>
              )}

              {/* Totals */}
              <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-base font-semibold text-slate-950">
                <span>Montant total</span>
                <span className="text-lg tabular-nums">{formatCurrency(selectedReservation.total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn ui-btn-ghost">
                Fermer
              </button>
              {canDeleteReservation && (
                <button type="button" onClick={() => handleDeleteReservation(selectedReservation)} className="ui-btn ui-btn-danger-outline">
                  <Trash2 />
                  Supprimer
                </button>
              )}
              {canEditReservation && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedReservation)}
                    disabled={selectedReservation.status === 'cancelled'}
                    className="ui-btn ui-btn-secondary"
                  >
                    <Edit />
                    Modifier
                  </button>

                  {selectedReservation.status !== 'completed' ? (
                    <button type="button" onClick={() => openCompletionDialog(selectedReservation)} className="ui-btn ui-btn-secondary">
                      <CheckCircle />
                      Marquer comme complétée
                    </button>
                  ) : (
                    <button type="button" onClick={() => markAsPending(selectedReservation)} className="ui-btn ui-btn-secondary">
                      <XCircle />
                      Remettre en attente
                    </button>
                  )}
                </>
              )}
              <button type="button" onClick={() => printReservationReceipt(selectedReservation)} className="ui-btn ui-btn-primary">
                <Printer />
                Imprimer reçu + souche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reservation Modal */}
      {showEditModal && editingReservation && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-reservation-title">
          <div className="ui-dialog max-w-4xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="edit-reservation-title" className="ui-dialog-title">Modifier la réservation</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{editingReservation.saleId}</p>
              </div>
              <button type="button" onClick={closeEditModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-6">
              {error && <Alert tone="danger">{error}</Alert>}

              {/* Customer Information */}
              <fieldset>
                <legend className="ui-kicker mb-3">Client</legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="edit-res-name" className="ui-label">Nom</label>
                    <input
                      id="edit-res-name"
                      type="text"
                      value={editForm.customer.name}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, name: e.target.value },
                        }))
                      }
                      className="ui-input"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-res-phone" className="ui-label">Téléphone</label>
                    <input
                      id="edit-res-phone"
                      type="tel"
                      value={editForm.customer.phone}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, phone: e.target.value },
                        }))
                      }
                      className="ui-input"
                      inputMode="tel"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-res-email" className="ui-label">Email</label>
                    <input
                      id="edit-res-email"
                      type="email"
                      value={editForm.customer.email}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, email: e.target.value },
                        }))
                      }
                      className="ui-input"
                      inputMode="email"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Reservation Details */}
              <fieldset>
                <legend className="ui-kicker mb-3">Réservation</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="edit-res-date" className="ui-label">Date de réservation</label>
                    <input
                      id="edit-res-date"
                      type="date"
                      value={editForm.reservationDate}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reservationDate: e.target.value,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-res-time" className="ui-label">Heure de réservation</label>
                    <input
                      id="edit-res-time"
                      type="time"
                      value={editForm.reservationTime}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reservationTime: e.target.value,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-res-payment" className="ui-label">Méthode de paiement</label>
                    <select
                      id="edit-res-payment"
                      value={editForm.paymentMethod}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value,
                        }))
                      }
                      className="ui-input"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Carte</option>
                      <option value="transfer">Virement</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor="edit-res-notes" className="ui-label">Notes</label>
                    <textarea
                      id="edit-res-notes"
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Notes supplémentaires…"
                      className="ui-input min-h-20"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Items Section */}
              <div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="ui-kicker">Articles</h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={fetchProducts}
                      disabled={loadingProducts}
                      className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none"
                    >
                      <RefreshCw className={loadingProducts ? "animate-spin" : ""} />
                      Actualiser les produits
                    </button>
                    <button
                      type="button"
                      onClick={addNewItem}
                      disabled={products.length === 0}
                      className="ui-btn ui-btn-primary ui-btn-sm flex-1 sm:flex-none"
                    >
                      <Plus /> Ajouter un article
                    </button>
                  </div>
                </div>

                {products.length === 0 && !loadingProducts && (
                  <Alert tone="warning" className="mb-4">
                    Aucun article disponible. Veuillez vérifier si des articles existent dans votre base de données.
                  </Alert>
                )}

                <div className="space-y-3">
                  {editForm.items.map((item, index) => (
                    <div key={item._id} className="ui-muted-panel">
                      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-12">
                        <div className="col-span-2 md:col-span-5">
                          <label htmlFor={`edit-res-item-${index}`} className="ui-label">Article</label>
                          {loadingProducts ? (
                            <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">
                              Chargement des produits…
                            </div>
                          ) : products.length === 0 ? (
                            <input
                              id={`edit-res-item-${index}`}
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const updatedItems = [...editForm.items];
                                updatedItems[index].name = e.target.value;
                                setEditForm((prev) => ({
                                  ...prev,
                                  items: updatedItems,
                                }));
                              }}
                              placeholder="Nom du produit"
                              className="ui-input"
                            />
                          ) : (
                            <select
                              id={`edit-res-item-${index}`}
                              value={item.productId}
                              onChange={(e) =>
                                updateItemProduct(index, e.target.value)
                              }
                              className="ui-input"
                            >
                              {products.map((product) => (
                                <option key={product._id} value={product._id}>
                                  {product.name}
                                  {product.regionCode ? ` (${product.regionCode})` : ""} -{" "}
                                  {formatCurrency(product.price)} (Stock:{" "}
                                  {product.stock})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="md:col-span-2">
                          <label htmlFor={`edit-res-price-${index}`} className="ui-label">Prix</label>
                          <input
                            id={`edit-res-price-${index}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(e) =>
                              updateItemPrice(
                                index,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="ui-input tabular-nums"
                            inputMode="decimal"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label htmlFor={`edit-res-qty-${index}`} className="ui-label">Quantité</label>
                          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity(index, item.quantity - 1)
                              }
                              className="grid w-10 shrink-0 place-items-center text-slate-600 hover:bg-slate-100"
                              disabled={item.quantity <= 1}
                              aria-label="Diminuer la quantité"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              id={`edit-res-qty-${index}`}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItemQuantity(
                                  index,
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="w-full min-w-0 border-0 text-center tabular-nums shadow-none focus:ring-0"
                              inputMode="numeric"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity(index, item.quantity + 1)
                              }
                              className="grid w-10 shrink-0 place-items-center text-slate-600 hover:bg-slate-100"
                              aria-label="Augmenter la quantité"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <span className="ui-label">Total</span>
                          <div className="flex min-h-11 items-center justify-end rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(item.total)}
                          </div>
                        </div>

                        <div className="md:col-span-1">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="ui-btn ui-btn-danger-outline w-full px-0"
                            aria-label={`Supprimer ${item.name}`}
                            title="Supprimer"
                          >
                            <Trash2 />
                            <span className="md:sr-only">Supprimer</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 border-t border-slate-200 pt-4 text-sm tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total</span>
                  <span className="text-slate-900">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold text-slate-950">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Edit Reason */}
              <div>
                <label htmlFor="edit-res-reason" className="ui-label">Raison de la modification <span className="ui-required">*</span></label>
                <textarea
                  id="edit-res-reason"
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Veuillez indiquer une raison pour la modification de cette réservation…"
                  className="ui-input min-h-20"
                  required
                />
              </div>
            </div>

            {/* Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={closeEditModal} className="ui-btn ui-btn-ghost">
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEditReservation}
                disabled={loading || editForm.items.length === 0}
                className="ui-btn ui-btn-primary"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" /> Mise à jour…
                  </>
                ) : (
                  <>
                    <Edit /> Mettre à jour la réservation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
