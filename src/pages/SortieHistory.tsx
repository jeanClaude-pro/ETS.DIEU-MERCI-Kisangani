"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  Edit,
  Printer,
  Calendar,
  RefreshCw,
  User,
  Lock,
  Trash2,
  Save,
  X,
  AlertCircle,
  History,
  Filter,
  ChevronDown,
  Shield,
} from "lucide-react";
import { Alert, EmptyState, LoadingState, MetricCard, PageHeader } from "../components/ui";
import RegionFilterPills from "../components/RegionFilterPills";
import type { RegionCodeFilter } from "../types";
import {
  printHtmlDocumentsSequentially,
  buildCashExpenseReceiptHtml,
} from "../services/printService";

interface ExpenseItem {
  _id: string;
  expenseId: string;
  reason: string;
  recipientName: string;
  recipientPhone: string;
  amount: number;
  paymentMethod: string;
  status: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  validatedBy?: string;
  validatedAt?: string;
  region?: string;
  regionCode?: string;
}

interface ExpensesResponse {
  success: boolean;
  data: ExpenseItem[];
  timeframe: {
    description: string;
    start: string;
    end: string;
    query: {
      from: string | null;
      to: string | null;
      date: string | null;
      year: string | null;
      month: string | null;
    };
  };
  summary: {
    totalRecords: number;
    totalAmount: number;
    pending: {
      count: number;
      amount: number;
    };
    validated: {
      count: number;
      amount: number;
    };
    rejected: {
      count: number;
      amount: number;
    };
  };
  filtersApplied: {
    status: string;
    paymentMethod: string;
    recordedBy: string;
    search: string;
    region?: string;
  };
  pagination: {
    totalRecords: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

interface UserPermissions {
  isAdmin: boolean;
  canValidate: boolean;
  canEditAll: boolean;
  canDeleteAll: boolean;
  userId: string;
  userName: string;
}

// User interface for role checking
interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  username?: string;
  permissions?: string[];
}

// Kisangani is UTC+2 permanently
const toKisanganiDate = (d = new Date()): Date =>
  new Date(d.getTime() + 2 * 60 * 60 * 1000);

const getTodayDate = (): string =>
  toKisanganiDate().toISOString().split('T')[0];

const getCurrentMonth = (): string => {
  const d = toKisanganiDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getCurrentYear = (): number => toKisanganiDate().getUTCFullYear();

export default function SortieHistory() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [validatingExpense, setValidatingExpense] = useState<ExpenseItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    reason: "",
    recipientName: "",
    recipientPhone: "",
    amount: "",
    paymentMethod: "cash",
    notes: "",
    updateReason: "",
  });
  const [deleteReason, setDeleteReason] = useState("");
  const [expenseHistory, setExpenseHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // User state for role checking
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Timeframe state - Updated to match backend query parameters
  const [timeframeType, setTimeframeType] = useState<
    "custom" | "day" | "month" | "year" | "today"
  >("today");
  
  const [queryParams, setQueryParams] = useState({
    from: "",
    to: "",
    date: getTodayDate(),
    year: getCurrentYear().toString(),
    month: getCurrentMonth().split('-')[1],
    status: "",
    paymentMethod: "",
    recordedBy: "",
    search: "",
    region: ""
  });

  const [initialLoad, setInitialLoad] = useState(true);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [appliedFilters, setAppliedFilters] = useState<any>(null);
  const [timeframeDescription, setTimeframeDescription] = useState<string>("Today");
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ totalRecords: 0, totalPages: 1, currentPage: 1, limit: 50 });

  // User permissions
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({
    isAdmin: false,
    canValidate: false,
    canEditAll: false,
    canDeleteAll: false,
    userId: "",
    userName: "",
  });

  // Build query string from queryParams
  const buildQueryString = () => {
    const params = new URLSearchParams();
    
    // Add timeframe parameters based on timeframeType
    switch(timeframeType) {
      case "custom":
        if (queryParams.from) params.append("from", queryParams.from);
        if (queryParams.to) params.append("to", queryParams.to);
        break;
      case "day":
        if (queryParams.date) params.append("date", queryParams.date);
        break;
      case "month":
        if (queryParams.year) params.append("year", queryParams.year);
        if (queryParams.month) params.append("month", queryParams.month);
        break;
      case "year":
        if (queryParams.year) params.append("year", queryParams.year);
        break;
      case "today":
        // No parameters needed - backend defaults to today
        break;
    }
    
    // Add additional filters
    if (queryParams.status) params.append("status", queryParams.status);
    if (queryParams.paymentMethod) params.append("paymentMethod", queryParams.paymentMethod);
    if (queryParams.recordedBy) params.append("recordedBy", queryParams.recordedBy);
    if (queryParams.search) params.append("search", queryParams.search);
    if (queryParams.region) params.append("region", queryParams.region);
    params.set("page", String(currentPage));
    params.set("limit", "50");
    if (searchTerm.trim()) params.set("search", searchTerm.trim());

    return params.toString();
  };

  // Fetch current user on component mount
  useEffect(() => {
    fetchCurrentUser();
    fetchUserPermissions();
  }, []);

  // Fetch data when query params change
  useEffect(() => {
    const timer = window.setTimeout(fetchExpenses, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, currentPage, searchTerm]);

  // Effect to automatically set to today's date when timeframe changes to "day"
  useEffect(() => {
    if (!initialLoad && timeframeType === "day") {
      const today = getTodayDate();
      setSelectedDate(today);
    }
  }, [timeframeType, initialLoad]);

  // Effect to enforce day-only view for non-admin users
  useEffect(() => {
    if (!userPermissions.isAdmin && timeframeType !== "day") {
      setTimeframeType("day");
      setQueryParams(prev => ({
        ...prev,
        date: getTodayDate(),
        from: "",
        to: "",
        year: "",
        month: ""
      }));
    }
  }, [timeframeType, userPermissions.isAdmin]);

  // Effect to mark initial load as complete
  useEffect(() => {
    if (expenses.length > 0) {
      setInitialLoad(false);
    }
  }, [expenses]);

  // Fetch current user from API or localStorage
  const fetchCurrentUser = async () => {
    try {
      // Try to get user from localStorage first
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setCurrentUser(userData);
      } else {
        // Fallback to API call
        const res = await fetch(`${import.meta.env.VITE_API_URL}/users/me`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });

        if (res.ok) {
          const userData = await res.json();
          setCurrentUser(userData);
          localStorage.setItem("user", JSON.stringify(userData));
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const fetchUserPermissions = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/expenses/permissions/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUserPermissions(data);
      }
    } catch (error) {
      console.error("Error fetching user permissions:", error);
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryString = buildQueryString();
      const url = `${import.meta.env.VITE_API_URL}/expenses${queryString ? `?${queryString}` : ''}`;
      
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (res.ok) {
        const data: ExpensesResponse = await res.json();
        
        if (data.success && data.data && Array.isArray(data.data)) {
          const fetchedExpenses = data.data;
          
          // Sort expenses by date - newest first
          const sortedExpenses = fetchedExpenses.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          setExpenses(sortedExpenses);
          setAllExpenses(sortedExpenses);
          
          // Update metadata
          setTimeframeDescription(data.timeframe.description);
          setSummaryStats(data.summary);
          setAppliedFilters(data.filtersApplied);
          setPagination(data.pagination || { totalRecords: fetchedExpenses.length, totalPages: 1, currentPage: 1, limit: 50 });
          
        } else {
          console.warn("Unexpected expenses data structure:", data);
          setError("Format de réponse inattendu du serveur");
        }
      } else {
        console.error("Expenses fetch failed:", res.status);
        const errorText = await res.text();
        setError(`Échec du chargement des dépenses : ${res.status} ${errorText}`);
      }
    } catch (error) {
      console.error("Error loading expenses:", error);
      setError("Échec du chargement des dépenses. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  const getAvailableYears = (): number[] => {
    return Array.from({ length: 10 }, (_, i) => getCurrentYear() - i);
  };

  const getTimeframeLabel = () => {
    if (!userPermissions.isAdmin) {
      return "Aujourd'hui";
    }
    
    return timeframeDescription;
  };

  const handleTimeframeTypeChange = (type: "custom" | "day" | "month" | "year" | "today") => {
    if (!userPermissions.isAdmin && type !== "day") {
      return;
    }
    
    setTimeframeType(type);
    
    // Reset specific query params based on type
    const newParams = { ...queryParams };
    
    switch(type) {
      case "today":
        newParams.date = getTodayDate();
        newParams.from = "";
        newParams.to = "";
        newParams.year = getCurrentYear().toString();
        newParams.month = getCurrentMonth().split('-')[1];
        break;
      case "day":
        newParams.date = getTodayDate();
        newParams.from = "";
        newParams.to = "";
        break;
      case "month":
        newParams.year = getCurrentYear().toString();
        newParams.month = getCurrentMonth().split('-')[1];
        newParams.date = "";
        newParams.from = "";
        newParams.to = "";
        break;
      case "year":
        newParams.year = getCurrentYear().toString();
        newParams.month = "";
        newParams.date = "";
        newParams.from = "";
        newParams.to = "";
        break;
      case "custom":
        if (!newParams.from) {
          const kis = toKisanganiDate();
          newParams.from = `${kis.getUTCFullYear()}-${String(kis.getUTCMonth() + 1).padStart(2, '0')}-01`;
        }
        if (!newParams.to) {
          newParams.to = getTodayDate();
        }
        newParams.date = "";
        newParams.year = "";
        newParams.month = "";
        break;
    }
    
    setQueryParams(newParams);
  };

  const handleQueryParamChange = (key: keyof typeof queryParams, value: string) => {
    setCurrentPage(1);
    setQueryParams(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearAllFilters = () => {
    setQueryParams({
      from: "",
      to: "",
      date: getTodayDate(),
      year: getCurrentYear().toString(),
      month: getCurrentMonth().split('-')[1],
      status: "",
      paymentMethod: "",
      recordedBy: "",
      search: "",
      region: ""
    });
    setTimeframeType("today");
    setSearchTerm("");
    setShowAdvancedFilters(false);
  };

  // Helper function to set selected date (for day view)
  const setSelectedDate = (date: string) => {
    handleQueryParamChange("date", date);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Lubumbashi",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter(
      (expense) =>
        expense.expenseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.recipientPhone.includes(searchTerm) ||
        expense.recordedBy.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [expenses, searchTerm]);

  const viewExpenseDetails = (expense: ExpenseItem) => {
    setSelectedExpense(expense);
    setShowModal(true);
    setError(null);
  };

  const openValidationModal = (expense: ExpenseItem) => {
    setValidatingExpense(expense);
    setShowValidationModal(true);
    setError(null);
  };

  const openEditModal = (expense: ExpenseItem) => {
    setEditingExpense(expense);
    setEditForm({
      reason: expense.reason,
      recipientName: expense.recipientName,
      recipientPhone: expense.recipientPhone,
      amount: expense.amount.toString(),
      paymentMethod: expense.paymentMethod,
      notes: expense.notes || "",
      updateReason: "",
    });
    setShowEditModal(true);
    setError(null);
  };

  const openDeleteModal = (expense: ExpenseItem) => {
    setDeletingExpense(expense);
    setDeleteReason("");
    setShowDeleteModal(true);
    setError(null);
  };

  const closeValidationModal = () => {
    setShowValidationModal(false);
    setValidatingExpense(null);
    setError(null);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingExpense(null);
    setEditForm({
      reason: "",
      recipientName: "",
      recipientPhone: "",
      amount: "",
      paymentMethod: "cash",
      notes: "",
      updateReason: "",
    });
    setError(null);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeletingExpense(null);
    setDeleteReason("");
    setError(null);
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setExpenseHistory([]);
  };

  const fetchExpenseHistory = async (expenseId: string) => {
    try {
      setHistoryLoading(true);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/expenses/${expenseId}/history`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setExpenseHistory(data.history || []);
        setShowHistoryModal(true);
      } else {
        setError("Échec du chargement de l'historique de la dépense");
      }
    } catch (error) {
      console.error("Error fetching expense history:", error);
      setError("Échec du chargement de l'historique de la dépense");
    } finally {
      setHistoryLoading(false);
    }
  };

  const validateExpense = async (isValid: boolean) => {
    if (!validatingExpense) return;

    setActionLoading(`validating-${validatingExpense._id}`);
    setError(null);

    try {
      if (!isValid) {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expenses/${validatingExpense._id}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            },
          }
        );

        if (response.ok) {
          setMessage("Dépense rejetée et suppression en cours...");
          closeValidationModal();

          // Wait 3 seconds before refreshing
          setTimeout(() => {
            fetchExpenses();
            setMessage(null);
          }, 3000);
        } else {
          const errorData = await response.json();
          setError(errorData.error || "Échec de la suppression de la dépense");
        }
      } else {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expenses/${
            validatingExpense._id
          }/validate`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            },
            body: JSON.stringify({
              validatedBy: userPermissions.userName || "admin",
            }),
          }
        );

        if (response.ok) {
          setMessage("Dépense validée avec succès !");
          closeValidationModal();
          fetchExpenses();
        } else {
          const errorData = await response.json();
          setError(errorData.error || "Failed to validate expense");
        }
      }
    } catch (error) {
      console.error("Error processing expense:", error);
      setError("Échec du traitement de la dépense");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditExpense = async () => {
    if (!editingExpense) return;

    setActionLoading(`editing-${editingExpense._id}`);
    setError(null);

    try {
      // Check if update reason is required (for validated/rejected expenses)
      const requiresUpdateReason = editingExpense.status !== "pending" && userPermissions.isAdmin;
      if (requiresUpdateReason && !editForm.updateReason.trim()) {
        setError("La raison de la mise à jour est requise pour les dépenses validées/rejetées");
        setActionLoading(null);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/expenses/${editingExpense._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({
            reason: editForm.reason,
            recipientName: editForm.recipientName,
            recipientPhone: editForm.recipientPhone,
            amount: parseFloat(editForm.amount),
            paymentMethod: editForm.paymentMethod,
            notes: editForm.notes,
            updateReason: editForm.updateReason,
          }),
        }
      );

      if (response.ok) {
        const updatedExpense = await response.json();
        setMessage("Dépense mise à jour avec succès !");
        closeEditModal();
        
        // Update the expense in the local state
        setExpenses(expenses.map(exp => 
          exp._id === editingExpense._id ? { ...exp, ...updatedExpense } : exp
        ));
        setAllExpenses(allExpenses.map(exp => 
          exp._id === editingExpense._id ? { ...exp, ...updatedExpense } : exp
        ));
        
        // Also update selected expense if it's the same one
        if (selectedExpense && selectedExpense._id === editingExpense._id) {
          setSelectedExpense({ ...selectedExpense, ...updatedExpense });
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de la mise à jour de la dépense");
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      setError("Échec de la mise à jour de la dépense");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;

    setActionLoading(`deleting-${deletingExpense._id}`);
    setError(null);

    try {
      let endpoint = `${import.meta.env.VITE_API_URL}/expenses/${deletingExpense._id}`;
      
      // If expense is not pending and user is admin, use admin delete endpoint
      if (deletingExpense.status !== "pending" && userPermissions.isAdmin) {
        endpoint = `${import.meta.env.VITE_API_URL}/expenses/${deletingExpense._id}/admin`;
      }

      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setMessage((result.message || "Dépense supprimée avec succès"));
        closeDeleteModal();
        
        // Remove the expense from the local state
        setExpenses(expenses.filter(exp => exp._id !== deletingExpense._id));
        setAllExpenses(allExpenses.filter(exp => exp._id !== deletingExpense._id));
        
        // Clear selected expense if it's the same one
        if (selectedExpense && selectedExpense._id === deletingExpense._id) {
          setSelectedExpense(null);
          setShowModal(false);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de la suppression de la dépense");
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      setError("Échec de la suppression de la dépense");
    } finally {
      setActionLoading(null);
    }
  };

  // Print function for expense receipt. Uses the shared canonical thermal
  // document builder (same architecture as sale/reservation receipts)
  // instead of a duplicated inline HTML/CSS document.
  const printExpenseReceipt = (expense: ExpenseItem) => {
      const formattedDate = new Date(expense.createdAt).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Lubumbashi",
      });

      const validatedDate = expense.validatedAt
        ? new Date(expense.validatedAt).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Africa/Lubumbashi",
          })
        : formattedDate;

      const html = buildCashExpenseReceiptHtml({
        expenseId: expense.expenseId,
        date: formattedDate,
        validatedDate,
        reason: expense.reason,
        recipientName: expense.recipientName,
        recipientPhone: expense.recipientPhone,
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        validatedBy: expense.validatedBy || "ADMIN",
      });
      void printHtmlDocumentsSequentially([html]).catch((printError: unknown) => {
        setError(printError instanceof Error ? printError.message : "Échec de l'impression.");
      });
  };

  // Check if user can edit this expense
  const canEditExpense = (expense: ExpenseItem): boolean => {
    if (userPermissions.isAdmin || userPermissions.canEditAll) {
      return true; // Admin can edit any expense
    }
    
    // Regular users can only edit their own pending expenses
    if (expense.status === "pending" && expense.recordedBy === userPermissions.userId) {
      return true;
    }
    
    return false;
  };

  // Check if user can delete this expense
  const canDeleteExpense = (expense: ExpenseItem): boolean => {
    if (userPermissions.isAdmin || userPermissions.canDeleteAll) {
      return true; // Admin can delete any expense
    }
    
    // Regular users can only delete their own pending expenses
    if (expense.status === "pending" && expense.recordedBy === userPermissions.userId) {
      return true;
    }
    
    return false;
  };

  // Check if update reason is required for editing
  const requiresUpdateReason = (expense: ExpenseItem | null): boolean => {
    if (!expense) return false;
    return expense.status !== "pending" && (userPermissions.isAdmin || userPermissions.canEditAll);
  };

  // Display-only helpers for statuses and payment methods.
  const expenseStatusLabel = (status?: string) =>
    status === "validated" ? "Validé" : status === "rejected" ? "Rejeté" : "En attente";
  const expenseStatusTone = (status?: string) =>
    status === "validated" ? "ui-badge-success" : status === "rejected" ? "ui-badge-danger" : "ui-badge-warning";
  const expensePaymentLabel: Record<string, string> = { cash: "Espèces", card: "Carte", bank: "Banque", mpesa: "M-Pesa", transfer: "Transfert", other: "Autre" };
  const timeframeLabels = { today: "Aujourd'hui", day: "Jour précis", month: "Mois", year: "Année", custom: "Plage de dates" } as const;

  // Summary Statistics component - Only visible to admins
  const SummaryStats = () => {
    if (!summaryStats || !userPermissions.isAdmin) return null;

    return (
      <section aria-labelledby="expense-summary-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="expense-summary-title" className="ui-kicker flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Statistiques des dépenses (vue administrateur)
          </h2>
          {currentUser && (
            <span className="ui-badge ui-badge-neutral max-w-full truncate">
              Connecté : {currentUser.name || currentUser.username} ({currentUser.role})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Total des dépenses" value={formatCurrency(summaryStats.totalAmount)} hint={`${summaryStats.totalRecords} dépense(s)`} icon={FileText} tone="primary" />
          <MetricCard label="Validées" value={formatCurrency(summaryStats.validated.amount)} hint={`${summaryStats.validated.count} dépense(s)`} icon={CheckCircle} tone="success" />
          <MetricCard label="En attente" value={formatCurrency(summaryStats.pending.amount)} hint={`${summaryStats.pending.count} dépense(s)`} icon={AlertCircle} tone="warning" />
          <MetricCard label="Rejetées" value={formatCurrency(summaryStats.rejected?.amount || 0)} hint={`${summaryStats.rejected?.count || 0} dépense(s)`} icon={XCircle} tone="danger" />
        </div>

        {/* Detailed statistics */}
        <div className="ui-card grid grid-cols-1 divide-y divide-slate-100 text-sm md:grid-cols-3 md:divide-x md:divide-y-0">
          <dl className="space-y-2 p-4">
            <dt className="ui-kicker mb-1">Montants</dt>
            <div className="flex justify-between gap-3">
              <dd className="text-slate-500">Montant moyen</dd>
              <dd className="font-medium tabular-nums text-slate-900">
                {summaryStats.totalRecords > 0
                  ? formatCurrency(summaryStats.totalAmount / summaryStats.totalRecords)
                  : formatCurrency(0)
                }
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dd className="text-slate-500">Taux de validation</dd>
              <dd className="font-medium tabular-nums text-emerald-700">
                {summaryStats.totalRecords > 0
                  ? `${((summaryStats.validated.count / summaryStats.totalRecords) * 100).toFixed(1)}%`
                  : '0%'
                }
              </dd>
            </div>
          </dl>
          <dl className="space-y-2 p-4">
            <dt className="ui-kicker mb-1">Période</dt>
            <div className="flex justify-between gap-3">
              <dd className="text-slate-500">Période</dd>
              <dd className="text-right font-medium text-slate-900">{timeframeDescription}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dd className="text-slate-500">Dernière mise à jour</dd>
              <dd className="tabular-nums text-slate-900">{new Date().toLocaleTimeString('fr-FR')}</dd>
            </div>
          </dl>
          <dl className="space-y-2 p-4">
            <dt className="ui-kicker mb-1">Affichage</dt>
            <div className="flex justify-between gap-3">
              <dd className="text-slate-500">Données filtrées</dd>
              <dd className="tabular-nums text-slate-900">{filteredExpenses.length} / {expenses.length}</dd>
            </div>
          </dl>
        </div>
      </section>
    );
  };

  return (
    <div className="ui-page ui-page-wide">
      <PageHeader
        eyebrow="Caisse"
        title="Historique des sorties de caisse"
        description={userPermissions.isAdmin ? "Gestion et validation des dépenses" : "Consultation des dépenses du jour"}
        meta={!userPermissions.isAdmin ? (
          <span className="ui-badge ui-badge-neutral"><Lock className="h-3 w-3" aria-hidden="true" />Vue limitée aux dépenses d'aujourd'hui</span>
        ) : undefined}
        actions={
          <button type="button" onClick={fetchExpenses} disabled={loading} className="ui-btn ui-btn-secondary">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>
        }
      />

      {/* Summary Stats - Only visible to admins */}
      <SummaryStats />

      {/* Toolbar */}
      <section className="ui-card" aria-label="Recherche et filtres">
        <div className="flex flex-col gap-3 p-4 sm:p-5 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="expense-search" className="sr-only">Rechercher une dépense</label>
            <Search className="ui-field-icon" aria-hidden="true" />
            <input
              id="expense-search"
              type="search"
              placeholder="Rechercher une dépense…"
              className="ui-input ui-input-icon"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <RegionFilterPills
              value={queryParams.region as RegionCodeFilter}
              onChange={(value) => handleQueryParamChange("region", value)}
            />
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="expense-filters"
              className="ui-btn ui-btn-secondary"
            >
              <Filter />
              Période & filtres
              <ChevronDown className={`transition-transform duration-150 ${showFilters ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="flex min-w-0 items-center gap-2 text-slate-600">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">Période : <span className="font-medium text-slate-900">{getTimeframeLabel()}</span></span>
          </p>
          <button type="button" onClick={clearAllFilters} className="ui-btn ui-btn-ghost ui-btn-sm self-start sm:self-auto">
            <RefreshCw />
            Réinitialiser les filtres
          </button>
        </div>

        {/* Timeframe Selection */}
        {showFilters && (
          <div id="expense-filters" className="space-y-4 border-t border-slate-100 px-4 py-4 sm:px-5">
            <div>
              <span className="ui-label">Type de période</span>
              <div className="ui-segmented w-full sm:w-auto" role="group" aria-label="Type de période">
                {(["today", "day", "month", "year", "custom"] as const).map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => handleTimeframeTypeChange(type)}
                    disabled={!userPermissions.isAdmin && type !== "day"}
                    aria-pressed={timeframeType === type}
                    className="ui-segment"
                  >
                    {timeframeLabels[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Specific timeframe inputs */}
            {timeframeType !== "today" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {timeframeType === "day" && (
                  <div>
                    <label htmlFor="expense-date" className="ui-label">Date</label>
                    <input
                      id="expense-date"
                      type="date"
                      value={queryParams.date}
                      onChange={(e) => handleQueryParamChange("date", e.target.value)}
                      className="ui-input"
                      disabled={!userPermissions.isAdmin}
                    />
                  </div>
                )}

                {timeframeType === "month" && (
                  <>
                    <div>
                      <label htmlFor="expense-month-year" className="ui-label">Année</label>
                      <select
                        id="expense-month-year"
                        value={queryParams.year}
                        onChange={(e) => handleQueryParamChange("year", e.target.value)}
                        className="ui-input"
                      >
                        {getAvailableYears().map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="expense-month" className="ui-label">Mois</label>
                      <select
                        id="expense-month"
                        value={queryParams.month}
                        onChange={(e) => handleQueryParamChange("month", e.target.value)}
                        className="ui-input capitalize"
                      >
                        {Array.from({ length: 12 }, (_, i) => {
                          const monthNum = (i + 1).toString().padStart(2, '0');
                          return (
                            <option key={monthNum} value={monthNum}>
                              {new Date(2000, i).toLocaleString('fr-FR', { month: 'long' })} ({monthNum})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </>
                )}

                {timeframeType === "year" && (
                  <div>
                    <label htmlFor="expense-year" className="ui-label">Année</label>
                    <select
                      id="expense-year"
                      value={queryParams.year}
                      onChange={(e) => handleQueryParamChange("year", e.target.value)}
                      className="ui-input"
                    >
                      {getAvailableYears().map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                )}

                {timeframeType === "custom" && (
                  <>
                    <div>
                      <label htmlFor="expense-from" className="ui-label">Date de début</label>
                      <input
                        id="expense-from"
                        type="date"
                        value={queryParams.from}
                        onChange={(e) => handleQueryParamChange("from", e.target.value)}
                        className="ui-input"
                      />
                    </div>
                    <div>
                      <label htmlFor="expense-to" className="ui-label">Date de fin</label>
                      <input
                        id="expense-to"
                        type="date"
                        value={queryParams.to}
                        onChange={(e) => handleQueryParamChange("to", e.target.value)}
                        className="ui-input"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Advanced Filters */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                aria-expanded={showAdvancedFilters}
                className="inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-semibold text-blue-700 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {showAdvancedFilters ? "Masquer les filtres avancés" : "Afficher les filtres avancés"}
                <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${showAdvancedFilters ? "rotate-180" : ""}`} />
              </button>

              {showAdvancedFilters && (
                <div className="ui-muted-panel mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="expense-status" className="ui-label">Statut</label>
                    <select
                      id="expense-status"
                      value={queryParams.status}
                      onChange={(e) => handleQueryParamChange("status", e.target.value)}
                      className="ui-input"
                    >
                      <option value="">Tous les statuts</option>
                      <option value="pending">En attente</option>
                      <option value="validated">Validées</option>
                      <option value="rejected">Rejetées</option>
                      <option value="all">Toutes</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="expense-payment" className="ui-label">Méthode de paiement</label>
                    <select
                      id="expense-payment"
                      value={queryParams.paymentMethod}
                      onChange={(e) => handleQueryParamChange("paymentMethod", e.target.value)}
                      className="ui-input"
                    >
                      <option value="">Toutes</option>
                      <option value="cash">Espèces</option>
                      <option value="card">Carte</option>
                      <option value="bank">Banque</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="expense-recorded-by" className="ui-label">Enregistré par</label>
                    <input
                      id="expense-recorded-by"
                      type="text"
                      value={queryParams.recordedBy}
                      onChange={(e) => handleQueryParamChange("recordedBy", e.target.value)}
                      placeholder="Filtrer par utilisateur…"
                      className="ui-input"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Applied Filters Summary */}
            {appliedFilters && (
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">Filtres appliqués :</span>{" "}
                Statut : {appliedFilters.status}, Paiement : {appliedFilters.paymentMethod}
                {appliedFilters.recordedBy !== 'none' && `, Enregistreur : ${appliedFilters.recordedBy}`}
                {appliedFilters.search !== 'none' && `, Recherche : ${appliedFilters.search}`}
              </p>
            )}
          </div>
        )}
      </section>

      {/* User restriction notice */}
      {!userPermissions.isAdmin && (
        <Alert tone="info" title="Accès limité">
          Vous ne pouvez voir que les dépenses d'aujourd'hui. Seul l'administrateur peut accéder à l'historique complet.
        </Alert>
      )}

      {message && <Alert tone="success" onDismiss={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      <section className="ui-card overflow-hidden" aria-labelledby="expenses-table-title">
        <div className="ui-card-header">
          <h2 id="expenses-table-title" className="ui-section-title flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-700" />
            {userPermissions.isAdmin ? "Dépenses en attente et validées" : "Dépenses du jour"}
            <span className="ui-badge ui-badge-neutral tabular-nums">{pagination.totalRecords}</span>
          </h2>
        </div>

        <div className="ui-table-wrap">
          {loading ? (
            <LoadingState label="Chargement des dépenses…" />
          ) : filteredExpenses.length === 0 ? (
            <EmptyState icon={FileText} title="Aucune dépense trouvée" description="Aucune dépense ne correspond à la période et aux filtres sélectionnés." />
          ) : (
            <table className="ui-table min-w-full">
              <thead>
                <tr>
                  <th scope="col">Dépense</th>
                  <th scope="col">Raison</th>
                  <th scope="col">Bénéficiaire</th>
                  <th scope="col" className="text-right">Montant</th>
                  <th scope="col">Paiement</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="ui-sticky-end text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense._id}>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-900">{expense.expenseId}</span>
                        {expense.regionCode && <span className="ui-tag">{expense.regionCode}</span>}
                      </div>
                    </td>
                    <td className="min-w-[12rem] max-w-[20rem]">
                      <span className="line-clamp-2 text-slate-900" title={expense.reason}>{expense.reason}</span>
                    </td>
                    <td className="min-w-[9rem]">
                      <div className="flex flex-col">
                        <span className="text-slate-900">{expense.recipientName}</span>
                        <span className="text-xs tabular-nums text-slate-500">{expense.recipientPhone}</span>
                      </div>
                    </td>
                    <td className="ui-num whitespace-nowrap font-semibold text-red-700">{formatCurrency(expense.amount)}</td>
                    <td>
                      <span className="ui-badge ui-badge-neutral">{expensePaymentLabel[expense.paymentMethod] || expense.paymentMethod}</span>
                    </td>
                    <td>
                      <span className={`ui-badge ${expenseStatusTone(expense.status)}`}>
                        {expenseStatusLabel(expense.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{formatDate(expense.createdAt)}</td>
                    <td className="ui-sticky-end">
                      <div className="ui-row-actions">
                        <button
                          type="button"
                          onClick={() => viewExpenseDetails(expense)}
                          className="ui-icon-btn ui-icon-btn-primary"
                          title="Voir les détails"
                          aria-label={`Voir la dépense ${expense.expenseId}`}
                        >
                          <Eye />
                        </button>

                        {/* History button */}
                        <button
                          type="button"
                          onClick={() => fetchExpenseHistory(expense._id)}
                          className="ui-icon-btn"
                          title="Voir l'historique"
                          aria-label={`Historique de la dépense ${expense.expenseId}`}
                        >
                          <History />
                        </button>

                        {/* Admin-only validation buttons */}
                        {userPermissions.canValidate &&
                          expense.status !== "validated" &&
                          expense.status !== "rejected" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openValidationModal(expense)}
                                disabled={
                                  actionLoading === `validating-${expense._id}`
                                }
                                className="ui-icon-btn ui-icon-btn-success text-emerald-700"
                                title="Valider la dépense"
                                aria-label={`Valider la dépense ${expense.expenseId}`}
                              >
                                <CheckCircle />
                              </button>
                              <button
                                type="button"
                                onClick={() => openValidationModal(expense)}
                                disabled={
                                  actionLoading === `validating-${expense._id}`
                                }
                                className="ui-icon-btn ui-icon-btn-danger"
                                title="Rejeter la dépense"
                                aria-label={`Rejeter la dépense ${expense.expenseId}`}
                              >
                                <XCircle />
                              </button>
                            </>
                          )}

                        {/* Edit button - show if user has permission */}
                        {canEditExpense(expense) && (
                          <button
                            type="button"
                            onClick={() => openEditModal(expense)}
                            className="ui-icon-btn ui-icon-btn-warning"
                            title="Modifier la dépense"
                            aria-label={`Modifier la dépense ${expense.expenseId}`}
                          >
                            <Edit />
                          </button>
                        )}

                        {/* Delete button - show if user has permission */}
                        {canDeleteExpense(expense) && (
                          <button
                            type="button"
                            onClick={() => openDeleteModal(expense)}
                            className="ui-icon-btn ui-icon-btn-danger"
                            title="Supprimer la dépense"
                            aria-label={`Supprimer la dépense ${expense.expenseId}`}
                          >
                            <Trash2 />
                          </button>
                        )}

                        {/* Print button - only show for validated expenses */}
                        {expense.status === "validated" && (
                          <button
                            type="button"
                            onClick={() => printExpenseReceipt(expense)}
                            className="ui-icon-btn"
                            title="Imprimer le reçu"
                            aria-label={`Imprimer le reçu de ${expense.expenseId}`}
                          >
                            <Printer />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-sm tabular-nums text-slate-600">Page {pagination.currentPage} sur {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Précédent</button>
              <button type="button" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Suivant</button>
            </div>
          </div>
        )}
      </section>

      {/* Expense Details Modal */}
      {showModal && selectedExpense && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="expense-details-title">
          <div className="ui-dialog max-w-2xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="expense-details-title" className="ui-dialog-title">Détails de la dépense</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{selectedExpense.expenseId}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              <div className="ui-muted-panel">
                <p className="text-xs font-medium text-slate-500">Raison</p>
                <p className="mt-0.5 break-words text-sm font-medium text-slate-900">{selectedExpense.reason}</p>
                <p className="mt-3 text-xs font-medium text-slate-500">Montant</p>
                <p className="text-2xl font-semibold tabular-nums text-red-700">{formatCurrency(selectedExpense.amount)}</p>
              </div>

              {/* Expense Info */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Date</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{formatDate(selectedExpense.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Statut</dt>
                  <dd className="mt-1"><span className={`ui-badge ${expenseStatusTone(selectedExpense.status)}`}>{expenseStatusLabel(selectedExpense.status)}</span></dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Méthode de paiement</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{expensePaymentLabel[selectedExpense.paymentMethod] || selectedExpense.paymentMethod}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Enregistré par</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{selectedExpense.recordedBy}</dd>
                </div>
              </dl>

              {/* Recipient Information */}
              <div>
                <h4 className="ui-kicker mb-2 flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Bénéficiaire</h4>
                <dl className="ui-muted-panel grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Nom</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-900">{selectedExpense.recipientName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Téléphone</dt>
                    <dd className="mt-0.5 text-sm tabular-nums text-slate-900">{selectedExpense.recipientPhone}</dd>
                  </div>
                </dl>
              </div>

              {/* Notes */}
              {selectedExpense.notes && (
                <div>
                  <h4 className="ui-kicker mb-2">Notes supplémentaires</h4>
                  <p className="ui-muted-panel whitespace-pre-line text-sm text-slate-900">{selectedExpense.notes}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn ui-btn-ghost">
                Fermer
              </button>
              <button type="button" onClick={() => fetchExpenseHistory(selectedExpense._id)} className="ui-btn ui-btn-secondary">
                <History />
                Historique
              </button>
              {canDeleteExpense(selectedExpense) && (
                <button type="button" onClick={() => openDeleteModal(selectedExpense)} className="ui-btn ui-btn-danger-outline">
                  <Trash2 />
                  Supprimer
                </button>
              )}
              {canEditExpense(selectedExpense) && (
                <button type="button" onClick={() => openEditModal(selectedExpense)} className="ui-btn ui-btn-secondary">
                  <Edit />
                  Modifier
                </button>
              )}
              {selectedExpense.status === "validated" && (
                <button type="button" onClick={() => printExpenseReceipt(selectedExpense)} className="ui-btn ui-btn-primary">
                  <Printer />
                  Imprimer le reçu
                </button>
              )}
              {userPermissions.canValidate &&
                selectedExpense.status !== "validated" &&
                selectedExpense.status !== "rejected" && (
                  <button type="button" onClick={() => openValidationModal(selectedExpense)} className="ui-btn ui-btn-primary">
                    <CheckCircle />
                    Valider / Rejeter
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Validation Modal */}
      {showValidationModal && validatingExpense && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="validate-expense-title">
          <div className="ui-dialog max-w-md">
            <div className="ui-dialog-header">
              <h3 id="validate-expense-title" className="ui-dialog-title">Validation de la dépense</h3>
              <button type="button" onClick={closeValidationModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-4">
              <p className="text-sm text-slate-600">Voulez-vous valider ou rejeter cette dépense ?</p>
              <div className="ui-muted-panel">
                <p className="break-words text-sm font-medium text-slate-900">{validatingExpense.reason}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{formatCurrency(validatingExpense.amount)}</p>
                <p className="mt-1 text-sm text-slate-600">Pour : {validatingExpense.recipientName}</p>
              </div>
              <dl className="space-y-1.5 text-xs text-slate-600">
                <div><dt className="inline font-semibold text-slate-800">Rejeter : </dt><dd className="inline">la dépense sera supprimée dans 3 secondes.</dd></div>
                <div><dt className="inline font-semibold text-slate-800">Valider : </dt><dd className="inline">le reçu deviendra disponible pour impression.</dd></div>
              </dl>
            </div>

            <div className="ui-dialog-footer">
              <button
                type="button"
                onClick={() => validateExpense(false)}
                disabled={
                  actionLoading === `validating-${validatingExpense._id}`
                }
                className="ui-btn ui-btn-danger-outline"
              >
                {actionLoading === `validating-${validatingExpense._id}` ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <XCircle />
                )}
                Rejeter
              </button>
              <button
                type="button"
                onClick={() => validateExpense(true)}
                disabled={
                  actionLoading === `validating-${validatingExpense._id}`
                }
                className="ui-btn ui-btn-success"
              >
                {actionLoading === `validating-${validatingExpense._id}` ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <CheckCircle />
                )}
                Valider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {showEditModal && editingExpense && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-expense-title">
          <div className="ui-dialog max-w-2xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="edit-expense-title" className="ui-dialog-title">Modifier la dépense</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{editingExpense.expenseId}</p>
              </div>
              <button type="button" onClick={closeEditModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-4">
              {requiresUpdateReason(editingExpense) && (
                <Alert tone="warning" title={`Modification d'une dépense ${expenseStatusLabel(editingExpense.status).toLowerCase()}`}>
                  Veuillez fournir une raison pour cette modification.
                </Alert>
              )}

              <div>
                <label htmlFor="edit-expense-reason" className="ui-label">Raison de la dépense <span className="ui-required">*</span></label>
                <input
                  id="edit-expense-reason"
                  type="text"
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm({ ...editForm, reason: e.target.value })
                  }
                  className="ui-input"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="edit-expense-recipient" className="ui-label">Nom du bénéficiaire <span className="ui-required">*</span></label>
                  <input
                    id="edit-expense-recipient"
                    type="text"
                    value={editForm.recipientName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, recipientName: e.target.value })
                    }
                    className="ui-input"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="edit-expense-phone" className="ui-label">Téléphone du bénéficiaire <span className="ui-required">*</span></label>
                  <input
                    id="edit-expense-phone"
                    type="tel"
                    value={editForm.recipientPhone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, recipientPhone: e.target.value })
                    }
                    className="ui-input"
                    inputMode="tel"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="edit-expense-amount" className="ui-label">Montant (USD) <span className="ui-required">*</span></label>
                  <input
                    id="edit-expense-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, amount: e.target.value })
                    }
                    className="ui-input tabular-nums"
                    inputMode="decimal"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="edit-expense-payment" className="ui-label">Méthode de paiement <span className="ui-required">*</span></label>
                  <select
                    id="edit-expense-payment"
                    value={editForm.paymentMethod}
                    onChange={(e) =>
                      setEditForm({ ...editForm, paymentMethod: e.target.value })
                    }
                    className="ui-input"
                  >
                    <option value="cash">Espèces</option>
                    <option value="card">Carte</option>
                    <option value="bank">Virement bancaire</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
              </div>

              {requiresUpdateReason(editingExpense) && (
                <div>
                  <label htmlFor="edit-expense-update-reason" className="ui-label">Raison de la modification <span className="ui-required">*</span></label>
                  <textarea
                    id="edit-expense-update-reason"
                    value={editForm.updateReason}
                    onChange={(e) =>
                      setEditForm({ ...editForm, updateReason: e.target.value })
                    }
                    className="ui-input"
                    rows={3}
                    placeholder="Expliquez pourquoi vous modifiez cette dépense…"
                    required
                  />
                  <p className="ui-help">Cette raison sera enregistrée dans l'historique de la dépense.</p>
                </div>
              )}

              <div>
                <label htmlFor="edit-expense-notes" className="ui-label">Notes supplémentaires <span className="font-normal text-slate-500">(optionnel)</span></label>
                <textarea
                  id="edit-expense-notes"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  className="ui-input"
                  rows={3}
                  placeholder="Ajoutez des notes supplémentaires…"
                />
              </div>
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={closeEditModal} className="ui-btn ui-btn-ghost">
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEditExpense}
                disabled={actionLoading === `editing-${editingExpense._id}`}
                className="ui-btn ui-btn-primary"
              >
                {actionLoading === `editing-${editingExpense._id}` ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <Save />
                )}
                Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Expense Modal */}
      {showDeleteModal && deletingExpense && (
        <div className="ui-dialog-overlay" role="alertdialog" aria-modal="true" aria-labelledby="delete-expense-title">
          <div className="ui-dialog max-w-md">
            <div className="ui-dialog-header">
              <h3 id="delete-expense-title" className="ui-dialog-title">Supprimer la dépense</h3>
              <button type="button" onClick={closeDeleteModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-4">
              <p className="text-sm text-slate-600">Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action ne peut pas être annulée.</p>
              <div className="ui-muted-panel">
                <p className="break-words text-sm font-medium text-slate-900">{deletingExpense.reason}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{formatCurrency(deletingExpense.amount)}</p>
                <p className="mt-1 text-sm text-slate-600">Pour : {deletingExpense.recipientName}</p>
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  Statut :
                  <span className={`ui-badge ${expenseStatusTone(deletingExpense.status)}`}>{expenseStatusLabel(deletingExpense.status)}</span>
                </p>
              </div>

              {deletingExpense.status !== "pending" && (
                <Alert tone="warning" title={`Attention : dépense ${expenseStatusLabel(deletingExpense.status).toLowerCase()}`}>
                  Cette action est permanente et enverra une notification aux administrateurs.
                </Alert>
              )}

              {userPermissions.isAdmin &&
                deletingExpense.status !== "pending" && (
                  <div>
                    <label htmlFor="delete-expense-reason" className="ui-label">Raison de la suppression <span className="font-normal text-slate-500">(optionnel)</span></label>
                    <textarea
                      id="delete-expense-reason"
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      className="ui-input"
                      rows={2}
                      placeholder="Expliquez pourquoi vous supprimez cette dépense…"
                    />
                  </div>
                )}

              {deletingExpense.status === "validated" && (
                <p className="text-xs text-slate-500">Les administrateurs seront notifiés par email.</p>
              )}
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={closeDeleteModal} className="ui-btn ui-btn-ghost">
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDeleteExpense}
                disabled={actionLoading === `deleting-${deletingExpense._id}`}
                className="ui-btn ui-btn-danger"
              >
                {actionLoading === `deleting-${deletingExpense._id}` ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense History Modal */}
      {showHistoryModal && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="expense-history-title">
          <div className="ui-dialog max-w-2xl">
            <div className="ui-dialog-header">
              <h3 id="expense-history-title" className="ui-dialog-title">Historique de la dépense</h3>
              <button type="button" onClick={closeHistoryModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body">
              {historyLoading ? (
                <LoadingState label="Chargement de l'historique…" />
              ) : expenseHistory.length === 0 ? (
                <EmptyState icon={History} title="Aucun historique disponible" description="Aucune modification n'a été enregistrée pour cette dépense." />
              ) : (
                <div className="space-y-4">
                  <div className="ui-muted-panel flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">Dépense : {selectedExpense?.expenseId || "N/A"}</span>
                    <span className="flex items-center gap-2 text-slate-600">
                      Statut actuel :
                      <span className={`ui-badge ${expenseStatusTone(selectedExpense?.status)}`}>{expenseStatusLabel(selectedExpense?.status)}</span>
                    </span>
                  </div>

                  <div>
                    <h4 className="ui-kicker mb-2">Journal des modifications</h4>
                    <ol className="space-y-3 border-l border-slate-200 pl-4">
                      {expenseHistory.map((item, index) => (
                        <li key={index} className="relative">
                          <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-4 ring-white" aria-hidden="true" />
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{item.action}</p>
                            <span className="text-xs text-slate-500">{item.formattedDate}</span>
                          </div>
                          <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString("fr-FR")}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="ui-dialog-footer">
              <button type="button" onClick={closeHistoryModal} className="ui-btn ui-btn-secondary">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
