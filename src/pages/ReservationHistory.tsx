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
  Minus
} from "lucide-react";
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
        setMessage("✅ Réservation mise à jour avec succès");

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
        setMessage("✅ Réservation supprimée avec succès");
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
            ? "✅ Réservation et souche envoyées à l'imprimante thermique."
            : "✅ Réservation et souche imprimées successivement dans le navigateur.",
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
        
        setMessage("✅ Réservation marquée comme complétée avec succès");
        
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
        
        setMessage("✅ Réservation remise en attente avec succès");
        
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

  return (
    <div className="space-y-6 p-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Gestion des Réservations
          </h1>
          <p className="text-gray-600">
            Gérez et suivez l'état des réservations des clients
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-600 font-medium">
              En attente: <span className="font-bold">{reservationSummary.pending}</span>
            </div>
          </div>
          <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-200">
            <div className="text-sm text-green-600 font-medium">
              Complétées: <span className="font-bold">{reservationSummary.completed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-2xl font-bold text-blue-600">{reservationSummary.totalReservations}</div>
          <div className="text-sm text-gray-600">Total Réservations</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-2xl font-bold text-orange-600">{reservationSummary.pending}</div>
          <div className="text-sm text-gray-600">En Attente</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-2xl font-bold text-green-600">{reservationSummary.completed}</div>
          <div className="text-sm text-gray-600">Complétées</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-2xl font-bold text-purple-600">
            {reservationSummary.itemCount}
          </div>
          <div className="text-sm text-gray-600">Articles Réservés</div>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg border border-green-200">
          {message}
          <button
            onClick={() => setMessage(null)}
            className="float-right text-green-700 hover:text-green-900"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-200">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-700 hover:text-red-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Rechercher par ID, client, téléphone..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Toutes les réservations</option>
            <option value="pending">En attente seulement</option>
            <option value="completed">Complétées seulement</option>
          </select>

          <select
            value={filterRegion}
            onChange={(e) => { setFilterRegion(e.target.value as '' | 'Bbbb' | 'Cnnn'); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Toutes régions</option>
            <option value="Bbbb">Butembo (Bbbb)</option>
            <option value="Cnnn">China (Cnnn)</option>
          </select>

          <div className="flex gap-2">
            <button
              onClick={fetchReservations}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              {loading ? "Chargement..." : "Actualiser"}
            </button>
          </div>
        </div>
      </div>

      {/* Reservations Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Liste des Réservations ({pagination.totalRecords})
          </h2>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Chargement des réservations...</p>
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucune réservation trouvée</p>
              <p className="text-sm">
                Aucune réservation ne correspond à vos critères de recherche
              </p>
            </div>
          ) : (
            <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID Réservation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date Réservation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Articles
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Région
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Montant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReservations.map((reservation) => (
                  <tr key={reservation._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {reservation.saleId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-medium">
                        {reservation.customer.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {reservation.customer.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        {displayReservationDate(reservation)}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {displayReservationTime(reservation)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reservation.items.length} article(s)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const codes = reservationRegionBadges.get(reservation._id) || [];
                        if (codes.length === 0) return <span className="text-xs text-gray-400">—</span>;
                        if (codes.length > 1) return (
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">Mixte</span>
                        );
                        return (
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">{codes[0]}</span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(reservation.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          reservation.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {reservation.status === 'completed' ? 'Complétée' : 'En Attente'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => viewReservationDetails(reservation)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded"
                          title="Voir les détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => printReservationReceipt(reservation)}
                          className="text-purple-600 hover:text-purple-900 p-1 rounded"
                          title="Imprimer le reçu et la souche"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Edit Button - Only for admin/manager */}
                        {canEditReservation && (
                          <button
                            onClick={() => openEditModal(reservation)}
                            disabled={reservation.status === 'cancelled'}
                            className={`p-1 rounded ${
                              reservation.status === 'cancelled'
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-yellow-600 hover:text-yellow-900"
                            }`}
                            title="Modifier la réservation"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Delete Button - Only for admin */}
                        {canDeleteReservation && (
                          <button
                            onClick={() => handleDeleteReservation(reservation)}
                            className="text-red-600 hover:text-red-900 p-1 rounded"
                            title="Supprimer la réservation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        
                        {canEditReservation && (
                          <>
                            {reservation.status !== 'completed' ? (
                              <button
                                onClick={() => openCompletionDialog(reservation)}
                                disabled={loading}
                                className="text-green-600 hover:text-green-900 p-1 rounded disabled:opacity-50"
                                title="Marquer comme complétée"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => markAsPending(reservation)}
                                disabled={loading}
                                className="text-orange-600 hover:text-orange-900 p-1 rounded disabled:opacity-50"
                                title="Remettre en attente"
                              >
                                <XCircle className="w-4 h-4" />
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
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-sm text-gray-600">Page {pagination.currentPage} sur {pagination.totalPages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="px-3 py-1.5 border rounded disabled:opacity-50">Précédent</button>
                  <button type="button" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="px-3 py-1.5 border rounded disabled:opacity-50">Suivant</button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Completion Confirmation Dialog */}
      {showCompletionDialog && reservationToComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Confirmer la complétion
              </h3>
            </div>
            
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Êtes-vous sûr de vouloir marquer la réservation <strong>{reservationToComplete.saleId}</strong> comme complétée ?
                Un reçu de retrait sera imprimé.
              </p>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeCompletionDialog}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => markAsCompleted(reservationToComplete)}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {loading ? "Traitement..." : "Confirmer et Imprimer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reservation Details Modal */}
      {showModal && selectedReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Détails de la Réservation - {selectedReservation.saleId}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Reservation Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID Réservation
                  </label>
                  <p className="text-sm text-gray-900">{selectedReservation.saleId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de Création
                  </label>
                  <p className="text-sm text-gray-900">
                    {formatDateTime(selectedReservation.createdAt)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de Réservation
                  </label>
                  <p className="text-sm text-gray-900">
                    {selectedReservation.reservationDate 
                      ? `${formatDate(selectedReservation.reservationDate)} à ${selectedReservation.reservationTime || displayReservationTime(selectedReservation)}`
                      : 'Non spécifiée'
                    }
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Méthode de Paiement
                  </label>
                  <p className="text-sm text-gray-900 capitalize">
                    {selectedReservation.paymentMethod}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Statut
                  </label>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedReservation.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {selectedReservation.status === 'completed' ? 'Complétée' : 'En Attente'}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendeur
                  </label>
                  <p className="text-sm text-gray-900">
                    {selectedReservation.salesPerson || "Non spécifié"}
                  </p>
                </div>
                {selectedReservation.completedAt && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Complétée le
                      </label>
                      <p className="text-sm text-gray-900">
                        {formatDateTime(selectedReservation.completedAt)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Complétée par
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedReservation.completedBy || "Inconnu"}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Customer Info */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Informations du Client
                </h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Nom</p>
                        <p className="text-sm text-gray-900">{selectedReservation.customer.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Téléphone</p>
                        <p className="text-sm text-gray-900">{selectedReservation.customer.phone}</p>
                      </div>
                    </div>
                    {selectedReservation.customer.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Email</p>
                          <p className="text-sm text-gray-900">{selectedReservation.customer.email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Articles Réservés ({selectedReservation.items.length})
                </h4>
                <div className="space-y-3">
                  {selectedReservation.items.map((item, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium text-gray-900">
                            {item.name}
                            {item.regionCode && (
                              <span className="ml-2 inline-flex px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                                {item.regionCode}
                              </span>
                            )}
                          </h5>
                          <p className="text-sm text-gray-600">
                            Quantité: {item.quantity} × {formatCurrency(item.price)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">
                            {formatCurrency(item.total)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selectedReservation.notes && (
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">
                    Notes
                  </h4>
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <p className="text-sm text-gray-700">{selectedReservation.notes}</p>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span className="text-gray-900">Montant Total:</span>
                  <span className="text-gray-900">
                    {formatCurrency(selectedReservation.total)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => printReservationReceipt(selectedReservation)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer Reçu + Souche
                </button>
                
                {canEditReservation && (
                  <>
                    <button
                      onClick={() => openEditModal(selectedReservation)}
                      disabled={selectedReservation.status === 'cancelled'}
                      className={`px-4 py-2 border rounded-lg transition-colors flex items-center justify-center gap-2 ${
                        selectedReservation.status === 'cancelled'
                          ? "border-gray-300 text-gray-400 cursor-not-allowed"
                          : "border-yellow-300 text-yellow-600 hover:bg-yellow-50"
                      }`}
                    >
                      <Edit className="w-4 h-4" />
                      Modifier la Réservation
                    </button>

                    {selectedReservation.status !== 'completed' ? (
                      <button
                        onClick={() => openCompletionDialog(selectedReservation)}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Marquer comme Complétée
                      </button>
                    ) : (
                      <button
                        onClick={() => markAsPending(selectedReservation)}
                        className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Remettre en Attente
                      </button>
                    )}
                  </>
                )}

                {canDeleteReservation && (
                  <button
                    onClick={() => handleDeleteReservation(selectedReservation)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                )}

                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reservation Modal */}
      {showEditModal && editingReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Modifier la Réservation - {editingReservation.saleId}
              </h3>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                  {error}
                </div>
              )}

              {/* Customer Information */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">
                  Informations du Client
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom
                    </label>
                    <input
                      type="text"
                      value={editForm.customer.name}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, name: e.target.value },
                        }))
                      }
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={editForm.customer.phone}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, phone: e.target.value },
                        }))
                      }
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editForm.customer.email}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, email: e.target.value },
                        }))
                      }
                      className="w-full p-2 border rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Reservation Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de Réservation
                  </label>
                  <input
                    type="date"
                    value={editForm.reservationDate}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        reservationDate: e.target.value,
                      }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Heure de Réservation
                  </label>
                  <input
                    type="time"
                    value={editForm.reservationTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        reservationTime: e.target.value,
                      }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Méthode de Paiement
                  </label>
                  <select
                    value={editForm.paymentMethod}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        paymentMethod: e.target.value,
                      }))
                    }
                    className="w-full p-2 border rounded"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Carte</option>
                    <option value="transfer">Virement</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Notes supplémentaires..."
                  className="w-full p-2 border rounded h-20"
                />
              </div>

              {/* Items Section */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-md font-medium text-gray-900">
                    Articles
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={fetchProducts}
                      disabled={loadingProducts}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          loadingProducts ? "animate-spin" : ""
                        }`}
                      />{" "}
                      Actualiser Produits
                    </button>
                    <button
                      onClick={addNewItem}
                      disabled={products.length === 0}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Ajouter un article
                    </button>
                  </div>
                </div>

                {products.length === 0 && !loadingProducts && (
                  <div className="p-3 bg-yellow-100 text-yellow-700 rounded-lg mb-4">
                    <p className="text-sm">
                      Aucun article disponible. Veuillez vérifier si des
                      articles existent dans votre base de données.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  {editForm.items.map((item, index) => (
                    <div
                      key={item._id}
                      className="border rounded-lg p-4 bg-gray-50"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Article
                          </label>
                          {loadingProducts ? (
                            <div className="p-2 border rounded bg-gray-200 text-gray-600 text-sm">
                              Chargement des produits...
                            </div>
                          ) : products.length === 0 ? (
                            <input
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
                              className="w-full p-2 border rounded"
                            />
                          ) : (
                            <select
                              value={item.productId}
                              onChange={(e) =>
                                updateItemProduct(index, e.target.value)
                              }
                              className="w-full p-2 border rounded"
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Prix
                          </label>
                          <input
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
                            className="w-full p-2 border rounded"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantité
                          </label>
                          <div className="flex items-center border rounded">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity(index, item.quantity - 1)
                              }
                              className="p-2 hover:bg-gray-200"
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItemQuantity(
                                  index,
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="w-full p-2 text-center border-0"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity(index, item.quantity + 1)
                              }
                              className="p-2 hover:bg-gray-200"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Total
                          </label>
                          <div className="p-2 bg-white border rounded font-medium">
                            {formatCurrency(item.total)}
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="w-full p-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Sous-total:</span>
                  <span className="text-sm text-gray-900">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-gray-900">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Edit Reason */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">
                  Raison de la modification
                </h4>
                <textarea
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Veuillez indiquer une raison pour la modification de cette réservation..."
                  className="w-full p-2 border rounded h-20"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleEditReservation}
                  disabled={loading || editForm.items.length === 0}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Mise à jour...
                    </>
                  ) : (
                    <>
                      <Edit className="w-4 h-4" /> Mettre à jour la réservation
                    </>
                  )}
                </button>
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
