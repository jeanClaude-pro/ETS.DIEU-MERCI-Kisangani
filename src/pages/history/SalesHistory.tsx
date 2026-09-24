/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  FileText,
  Eye,
  Download,
  User,
  Package,
  Edit,
  Trash2,
  Plus,
  Minus,
  RefreshCw,
  Printer,
  Calendar,
  History,
  Filter,
  ChevronDown,
  Shield,
  X,
} from "lucide-react";
import { Alert, EmptyState, LoadingState, MetricCard, PageHeader } from "../../components/ui";
import RegionFilterPills from "../../components/RegionFilterPills";
import type { RegionCodeFilter } from "../../types";
import { isReportableSale, projectSalesToRegion } from "../../utils/regionalSales";
import {
  downloadSaleReceiptAndStubPdf,
  normalizeSaleReceipt,
  printSaleReceiptAndStub,
} from "../../services/printService";
import { useConnectivity } from "../../context/ConnectivityContext";
import {
  cacheServerSales,
  getMergedBusinessSales,
  refreshBusinessSalesSnapshot,
  subscribeMergedBusinessSales,
  type BusinessSale,
} from "../../services/localBusinessReadModel";
import { localReportRange } from "../../services/localReportService";

interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  _id: string;
  region?: "Butembo" | "China";
  regionCode?: "Bbbb" | "Cnnn";
  subtotal?: number;
  unitCost?: number;
  cost?: number;
  profit?: number;
  discount?: number;
  tax?: number;
  transportCost?: number;
  otherCharges?: number;
  netTotal?: number;
}

interface EditHistoryEntry {
  editedBy: string;
  editedAt: string;
  changes: any;
  reason: string;
  _id?: string;
}

interface Sale {
  _id: string;
  saleId: string;
  customer: {
    name: string;
    phone: string;
    email: string;
    isWalkIn?: boolean;
  };
  items: SaleItem[];
  subtotal: number;
  total: number;
  discount?: number;
  tax?: number;
  transportCost?: number;
  otherCharges?: number;
  cost?: number;
  profit?: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  salesPerson?: string;
  editedBy?: string;
  editedAt?: string;
  editHistory?: EditHistoryEntry[];
  type?: string;
  clientSaleId?: string;
  receiptNumber?: string;
  barcodeToken?: string;
  localSyncState?: string;
  isLocalOnly?: boolean;
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

// User interface for role checking
interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
}

// Timeframe metadata interface
interface TimeframeMetadata {
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
}

// Response interface for timeframe API
interface SalesResponse {
  success: boolean;
  data: Sale[];
  timeframe: TimeframeMetadata;
  summary: {
    totalRecords: number;
    revenue: number;
    expenses: number;
    net: number;
    salesCount: number;
    expensesCount: number;
  };
  filtersApplied: {
    customerPhone: string;
    status: string;
    type: string;
    region?: string;
  };
  performanceNote: string | null;
  pagination: {
    totalRecords: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

// Kisangani is UTC+2 permanently — derive local date/time from UTC
const toKisanganiDate = (d = new Date()): Date =>
  new Date(d.getTime() + 2 * 60 * 60 * 1000);

const getTodayDate = (): string =>
  toKisanganiDate().toISOString().split('T')[0]; // YYYY-MM-DD in UTC+2

const getCurrentMonth = (): string => {
  const d = toKisanganiDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getCurrentYear = (): number => toKisanganiDate().getUTCFullYear();

export default function SalesHistory() {
  const connectivity = useConnectivity();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState({
    customer: { name: "", phone: "", email: "" },
    items: [] as SaleItem[],
    paymentMethod: "cash",
    reason: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // User state for role checking
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Timeframe state - Updated to match backend query parameters
  const [timeframeType, setTimeframeType] = useState<
    "custom" | "day" | "month" | "year" | "today"
  >("today");
  
  // Query parameters for timeframe
  const [queryParams, setQueryParams] = useState({
    from: "",
    to: "",
    date: getTodayDate(),
    year: getCurrentYear().toString(),
    month: getCurrentMonth().split('-')[1],
    type: "",
    status: "",
    customerPhone: "",
    region: ""
  });

  // NEW: Edited sales filter state
  const [showEditedSales, setShowEditedSales] = useState(false);
  const [editedSales, setEditedSales] = useState<Sale[]>([]);
  const [selectedEditedSale, setSelectedEditedSale] = useState<Sale | null>(null);
  const [showEditedDetailsModal, setShowEditedDetailsModal] = useState(false);

  // Timeframe metadata
  const [timeframeMetadata, setTimeframeMetadata] = useState<TimeframeMetadata | null>(null);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [appliedFilters, setAppliedFilters] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ totalRecords: 0, totalPages: 1, currentPage: 1, limit: 50 });

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch current user on component mount
  useEffect(() => {
    fetchCurrentUser();
    fetchProducts();
    const handleSalesUpdate = () => {
      // Refresh sales when triggered from other components
      fetchSales();
    };

    window.addEventListener("salesUpdated", handleSalesUpdate);

    return () => {
      window.removeEventListener("salesUpdated", handleSalesUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a server-filtered page; search is debounced to avoid one request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(fetchSales, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, currentPage, searchTerm, showEditedSales, connectivity.status]);

  useEffect(() => {
    const range = currentLocalRange();
    const subscription = subscribeMergedBusinessSales((rows) => {
      if (connectivity.status !== "online") applyLocalSales(rows);
    }, undefined, range);
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity.status, queryParams, currentPage, searchTerm, showEditedSales, timeframeType]);

  // Fetch current user from API or localStorage
  const fetchCurrentUser = async () => {
    try {
      // Try to get user from localStorage first
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setCurrentUser(userData);
        setIsAdmin(userData.role === "admin");
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
          setIsAdmin(userData.role === "admin");
          localStorage.setItem("user", JSON.stringify(userData));
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      // Default to non-admin if can't fetch user
      setIsAdmin(false);
    }
  };

  // Filter out expenses and voided sales - ONLY show completed sales
  const filterValidSales = (sales: Sale[]): Sale[] => {
    return sales.filter((sale: Sale) => {
      // Filter out voided, cancelled, refunded sales and expenses
      const isValidStatus = isReportableSale(sale);
      
      // Also check if it's a sale (has saleId and customer structure)
      const isSaleStructure = sale.saleId && sale.customer && sale.items;
      
      return isValidStatus && isSaleStructure;
    });
  };

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
    if (queryParams.type) params.append("type", queryParams.type);
    if (queryParams.status) params.append("status", queryParams.status);
    if (queryParams.customerPhone) params.append("customerPhone", queryParams.customerPhone);
    if (queryParams.region) params.append("region", queryParams.region);
    params.set("page", String(currentPage));
    params.set("limit", "50");
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (showEditedSales) params.set("edited", "true");

    return params.toString();
  };

  const currentLocalRange = () => {
    switch (timeframeType) {
      case "custom": return localReportRange({ from: queryParams.from, to: queryParams.to });
      case "day": return localReportRange({ date: queryParams.date });
      case "month": return localReportRange({ year: queryParams.year, month: queryParams.month });
      case "year": return localReportRange({ year: queryParams.year });
      default: return localReportRange();
    }
  };

  const applyLocalSales = (knownSales: BusinessSale[]) => {
    const range = currentLocalRange();
    const term = searchTerm.trim().toLocaleLowerCase("fr");
    let rows = knownSales.filter((sale) => {
      const time = new Date(sale.createdAt).getTime();
      if (time < range.start.getTime() || time > range.end.getTime()) return false;
      if (queryParams.type && sale.type !== queryParams.type) return false;
      if (queryParams.status && sale.status !== queryParams.status) return false;
      if (queryParams.customerPhone && sale.customer.phone !== queryParams.customerPhone) return false;
      if (showEditedSales && !sale.editedBy && !Array.isArray(sale.editHistory)) return false;
      return !term || [sale.saleId, sale.receiptNumber, sale.customer.name, sale.customer.phone, sale.salesPerson]
        .some((value) => String(value || "").toLocaleLowerCase("fr").includes(term));
    });
    rows = projectSalesToRegion(rows, queryParams.region as RegionCodeFilter);
    const totalRecords = rows.length;
    const revenue = rows.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const pageRows = rows.slice((currentPage - 1) * 50, currentPage * 50) as unknown as Sale[];
    setSales(filterValidSales(pageRows));
    setSummaryStats({ totalRecords, revenue, expenses: 0, net: revenue, salesCount: totalRecords, expensesCount: 0 });
    setPagination({ totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / 50)), currentPage, limit: 50 });
    setTimeframeMetadata({ description: range.description, start: range.start.toISOString(), end: range.end.toISOString(), query: { from: queryParams.from || null, to: queryParams.to || null, date: queryParams.date || null, year: queryParams.year || null, month: queryParams.month || null } });
    updateEditedSales(pageRows);
  };

  const loadLocalSales = async () => applyLocalSales(await getMergedBusinessSales(currentLocalRange()));

  const fetchSales = async () => {
    try {
      setLoading(true);
      setError(null);
      await loadLocalSales();
      if (connectivity.status !== "online") return;

      const token = localStorage.getItem("token") || "";
      await refreshBusinessSalesSnapshot(token).catch(() => undefined);
      
      const queryString = buildQueryString();
      const url = `${import.meta.env.VITE_API_URL}/sales${queryString ? `?${queryString}` : ''}`;
      
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (res.ok) {
        const data: SalesResponse = await res.json();
        
        if (data.success && data.data && Array.isArray(data.data)) {
          const fetchedSales = data.data;
          
          // Filter out expenses and invalid sales
          const validSales = filterValidSales(fetchedSales);
          await cacheServerSales(validSales as unknown as BusinessSale[]);
          
          // Update sales state
          setSales(validSales);
          
          // Update metadata
          setTimeframeMetadata(data.timeframe);
          setSummaryStats(data.summary);
          setAppliedFilters(data.filtersApplied);
          setPagination(data.pagination || { totalRecords: validSales.length, totalPages: 1, currentPage: 1, limit: 50 });
          
          // Update edited sales
          updateEditedSales(validSales);
        } else {
          console.warn("Unexpected sales data structure:", data);
          setError("Format de réponse inattendu du serveur");
        }
      } else {
        console.error("Sales fetch failed:", res.status);
        const errorText = await res.text();
        setError(`Échec du chargement des ventes : ${res.status} ${errorText}`);
      }
    } catch (error) {
      console.error("Error loading sales:", error);
      // A valid local read model is an expected offline mode, not an error.
      await loadLocalSales();
    } finally {
      setLoading(false);
    }
  };

  // Update edited sales when sales change
  const updateEditedSales = (salesList: Sale[]) => {
    // Filter sales that have editHistory or editedBy field
    const edited = salesList.filter(sale => 
      (sale.editHistory && sale.editHistory.length > 0) || sale.editedBy
    );

    // Sort by edit date (newest first)
    const sortedEditedSales = edited.sort((a, b) => {
      const dateA = a.editedAt ? new Date(a.editedAt).getTime() : new Date(a.updatedAt).getTime();
      const dateB = b.editedAt ? new Date(b.editedAt).getTime() : new Date(b.updatedAt).getTime();
      return dateB - dateA;
    });

    setEditedSales(sortedEditedSales);
  };

  // Handle timeframe type change
  const handleTimeframeTypeChange = (type: "custom" | "day" | "month" | "year" | "today") => {
    setTimeframeType(type);
    
    // Reset specific query params based on type
    const newParams = { ...queryParams };
    
    switch(type) {
      case "today":
        // Reset all specific date params
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

  // Handle query parameter changes
  const handleQueryParamChange = (key: keyof typeof queryParams, value: string) => {
    setCurrentPage(1);
    setQueryParams(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setCurrentPage(1);
    setQueryParams({
      from: "",
      to: "",
      date: getTodayDate(),
      year: getCurrentYear().toString(),
      month: getCurrentMonth().split('-')[1],
      type: "",
      status: "",
      customerPhone: "",
      region: ""
    });
    setTimeframeType("today");
    setShowEditedSales(false);
    setSearchTerm("");
  };

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/products?limit=0`, {
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

  const filteredSales = useMemo(() => {
    const source = projectSalesToRegion(
      showEditedSales ? editedSales : sales,
      queryParams.region as RegionCodeFilter,
    );
    return source.filter(sale =>
      sale.saleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customer.phone.includes(searchTerm) ||
      (sale.salesPerson && sale.salesPerson.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [showEditedSales, editedSales, sales, searchTerm, queryParams.region]);

  const displayedSummaryStats = useMemo(() => {
    return summaryStats;
  }, [summaryStats]);

  // Precompute each sale's region badge once per data/filter change, instead
  // of re-walking every sale's items on every render inside the row .map().
  const saleRegionBadges = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const sale of filteredSales) {
      const codes = Array.from(
        new Set((sale.items || []).map((item) => item.regionCode).filter((c): c is "Bbbb" | "Cnnn" => Boolean(c)))
      );
      map.set(sale._id, codes);
    }
    return map;
  }, [filteredSales]);

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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // Get human-readable timeframe description
  const getTimeframeDescription = () => {
    if (timeframeMetadata) {
      return timeframeMetadata.description;
    }
    
    switch(timeframeType) {
      case "today":
        return "Today";
      case "day":
        return queryParams.date ? `Day: ${queryParams.date}` : "Today";
      case "month":
        return queryParams.year && queryParams.month 
          ? `Month: ${queryParams.year}-${queryParams.month.padStart(2, '0')}`
          : "This month";
      case "year":
        return queryParams.year ? `Year: ${queryParams.year}` : "This year";
      case "custom":
        if (queryParams.from && queryParams.to) {
          return `Range: ${queryParams.from} to ${queryParams.to}`;
        } else if (queryParams.from) {
          return `From: ${queryParams.from}`;
        } else if (queryParams.to) {
          return `Until: ${queryParams.to}`;
        }
        return "Custom range";
      default:
        return "Today";
    }
  };

  // NEW: Function to view edited sale details
  const viewEditedSaleDetails = (sale: Sale) => {
    setSelectedEditedSale(sale);
    setShowEditedDetailsModal(true);
  };

  // NEW: Function to render change comparison
  const renderChangeComparison = (sale: Sale) => {
    if (!sale.editHistory || sale.editHistory.length === 0) return null;

    const latestEdit = sale.editHistory[sale.editHistory.length - 1];
    const changes = latestEdit.changes;

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
          <History className="w-4 h-4" />
          Dernière modification
        </h4>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-yellow-700">Modifié par:</span>
            <span className="font-medium">{latestEdit.editedBy || sale.editedBy || "Unknown"}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-yellow-700">Date de modification:</span>
            <span className="font-medium">{formatDate(latestEdit.editedAt || sale.editedAt || sale.updatedAt)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-yellow-700">Raison:</span>
            <span className="font-medium text-right">{latestEdit.reason}</span>
          </div>

          {changes && Object.keys(changes).length > 0 && (
            <div className="mt-3 pt-3 border-t border-yellow-200">
              <h5 className="font-medium text-yellow-800 mb-2">Changements:</h5>
              {Object.entries(changes).map(([field, changeData]: [string, any]) => (
                <div key={field} className="mb-2 last:mb-0">
                  <div className="font-medium text-yellow-700 capitalize">
                    {field.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0 rounded-md bg-red-50 p-2">
                      <div className="font-semibold text-red-700">Avant</div>
                      <div className="truncate" title={JSON.stringify(changeData.from)}>{JSON.stringify(changeData.from)}</div>
                    </div>
                    <div className="min-w-0 rounded-md bg-emerald-50 p-2">
                      <div className="font-semibold text-emerald-700">Après</div>
                      <div className="truncate" title={JSON.stringify(changeData.to)}>{JSON.stringify(changeData.to)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // EXPORT FUNCTIONS

  const exportDetailedSalesToCSV = () => {
    try {
      const dataToExport = showEditedSales ? editedSales : filteredSales;
      
      if (dataToExport.length === 0) {
        setError("Aucune donnée à exporter");
        return;
      }

      // Create separate sheets for sales summary and items detail
      const summaryHeaders = [
        'Sale ID',
        'Customer Name',
        'Customer Phone',
        'Customer Email',
        'Sales Person',
        'Items Count',
        'Region',
        'Subtotal',
        'Total',
        'Payment Method',
        'Status',
        'Created Date',
        'Last Modified',
        'Edit Reason',
        'Edited By'
      ];

      const itemHeaders = [
        'Sale ID',
        'Item Name',
        'Product ID',
        'Quantity',
        'Unit Price',
        'Item Total',
        'Region'
      ];

      const summaryRows = dataToExport.map(sale => {
        const latestEdit = sale.editHistory && sale.editHistory.length > 0
          ? sale.editHistory[sale.editHistory.length - 1]
          : null;
        const regionCodes = getSaleRegionCodes(sale);

        return [
          `"${sale.saleId}"`,
          `"${sale.customer.name}"`,
          `"${sale.customer.phone}"`,
          `"${sale.customer.email || ''}"`,
          `"${sale.salesPerson || 'Not specified'}"`,
          sale.items.length,
          `"${regionCodes.length > 1 ? 'Mixte' : regionCodes[0] || ''}"`,
          sale.subtotal.toFixed(2),
          sale.total.toFixed(2),
          `"${sale.paymentMethod}"`,
          `"${sale.status}"`,
          `"${formatDate(sale.createdAt)}"`,
          sale.editedAt ? `"${formatDate(sale.editedAt)}"` : '',
          latestEdit ? `"${latestEdit.reason}"` : '',
          latestEdit ? `"${latestEdit.editedBy}"` : ''
        ].join(',');
      });

      const itemRows = dataToExport.flatMap(sale =>
        sale.items.map(item => [
          `"${sale.saleId}"`,
          `"${item.name}"`,
          `"${item.productId}"`,
          item.quantity,
          item.price.toFixed(2),
          item.total.toFixed(2),
          `"${item.regionCode || ''}"`
        ].join(','))
      );

      const summaryContent = [
        '=== SALES SUMMARY ===',
        summaryHeaders.join(','),
        ...summaryRows,
        '',
        '=== ITEMS DETAIL ===',
        itemHeaders.join(','),
        ...itemRows
      ].join('\n');

      const blob = new Blob([summaryContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const timeframeDesc = getTimeframeDescription().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const exportType = showEditedSales ? 'edited_sales' : 'sales';
      const fileName = `${exportType}_${timeframeDesc}_${new Date().toISOString().split('T')[0]}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setMessage(`${dataToExport.length} ventes et ${itemRows.length} lignes d'articles exportées.`);
      
    } catch (error) {
      console.error('Export error:', error);
      setError("Échec de l'export des ventes");
    }
  };

  const exportToJSON = () => {
    try {
      const dataToExport = showEditedSales ? editedSales : filteredSales;
      
      if (dataToExport.length === 0) {
        setError("Aucune donnée à exporter");
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        timeframe: getTimeframeDescription(),
        totalSales: dataToExport.length,
        totalRevenue: dataToExport.reduce((sum, sale) => sum + sale.total, 0),
        sales: dataToExport
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const timeframeDesc = getTimeframeDescription().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const exportType = showEditedSales ? 'edited_sales' : 'sales';
      const fileName = `${exportType}_${timeframeDesc}_${new Date().toISOString().split('T')[0]}.json`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setMessage(`${dataToExport.length} ventes exportées au format JSON.`);
      
    } catch (error) {
      console.error('JSON export error:', error);
      setError("Échec de l'export JSON");
    }
  };

  const getCompleteSaleForReceipt = (sale: Sale): Sale =>
    sales.find((candidate) => candidate._id === sale._id) || sale;

  const printSavedSale = (sale: Sale) => {
    const receipt = normalizeSaleReceipt(getCompleteSaleForReceipt(sale), { type: "sale" });
    void printSaleReceiptAndStub(receipt, { directPrintMode: sale.localSyncState ? "none" : "remote" })
      .then((destination) => {
        setMessage(
          destination === "usb"
            ? "Reçu et souche envoyés à l'imprimante thermique."
            : "Reçu et souche imprimés successivement dans le navigateur.",
        );
      })
      .catch((printError: unknown) => {
        setError(printError instanceof Error ? printError.message : "Échec de l'impression.");
      });
  };

  const generateReceiptPDF = (sale: Sale) => {
    const receipt = normalizeSaleReceipt(getCompleteSaleForReceipt(sale), { type: "sale" });
    downloadSaleReceiptAndStubPdf(receipt);
  };

  const viewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowModal(true);
    setError(null);
  };

  const openEditModal = async (sale: Sale) => {
    if (sale.localSyncState && sale.localSyncState !== "SYNCED") {
      setError("Connexion requise pour corriger une vente locale non synchronisée.");
      return;
    }
    // Regional rows are read-only projections; editing must always load the
    // complete original receipt so hidden items from the other region survive.
    const fullSale = sales.find((candidate) => candidate._id === sale._id) || sale;
    if (fullSale.status === "voided" || fullSale.status === "corrected") {
      setError("Impossible de modifier une vente annulée ou corrigée");
      return;
    }

    setEditingSale(fullSale);
    setEditForm({
      customer: { ...fullSale.customer },
      items: fullSale.items.map((item) => ({ ...item })),
      paymentMethod: fullSale.paymentMethod,
      reason: "",
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
    setEditingSale(null);
    setEditForm({
      customer: { name: "", phone: "", email: "" },
      items: [],
      paymentMethod: "cash",
      reason: "",
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
      setError(`Stock insuffisant. Disponible : ${product.stock}`);
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
      setError("Aucun article disponible. Actualisez d'abord la liste des articles.");
      return;
    }

    const defaultProduct = products[0];
    const newItem: SaleItem = {
      productId: defaultProduct._id,
      name: defaultProduct.name,
      quantity: 1,
      price: defaultProduct.price,
      total: defaultProduct.price,
      _id: `temp-${Date.now()}`,
      region: defaultProduct.region,
      regionCode: defaultProduct.regionCode,
    };

    setEditForm((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const updateItemProduct = (index: number, productId: string) => {
    const product = products.find((p) => p._id === productId);
    if (!product) {
      setError("Article sélectionné introuvable");
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

  const handleEditSale = async () => {
    if (!editingSale) return;

    if (editForm.items.length === 0) {
      setError("La vente doit contenir au moins un article");
      return;
    }

    if (!editForm.customer.name || !editForm.customer.phone) {
      setError("Le nom et le téléphone du client sont obligatoires");
      return;
    }

    if (!editForm.reason) {
      setError("Veuillez indiquer la raison de la modification");
      return;
    }

    try {
      setLoading(true);

      // Calculate totals properly
      const { subtotal, total } = calculateTotals();

      // Make sure we're sending the correct data structure
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
        // Include the original sale ID to ensure update, not create
        _id: editingSale._id,
        saleId: editingSale.saleId, // Keep the same sale ID
      };

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/sales/${editingSale._id}`,
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
        await response.json();
        setMessage("Vente mise à jour avec succès");

        // Refresh the sales list immediately
        await fetchSales();

        // Also refresh customers to update their statistics
        setTimeout(() => {
          window.dispatchEvent(new Event("salesUpdated"));
        }, 1000);

        closeEditModal();
      } else {
        const errorData = await response.json();
        setError(
          errorData.error ||
            `Failed to update sale: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Error updating sale:", error);
      setError("Échec de la mise à jour de la vente. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  const handleVoidSale = async (sale: Sale) => {
    if (sale.status === "voided") {
      setError("Cette vente est déjà annulée");
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to void sale ${sale.saleId}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/sales/${sale._id}/void`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({
            reason: "Sale voided by admin",
          }),
        }
      );

      if (response.ok) {
        setMessage("Vente annulée avec succès");
        await fetchSales();
        setShowModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de l'annulation de la vente");
      }
    } catch (error) {
      setError("Échec de l'annulation de la vente");
      console.error("Error voiding sale:", error);
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, total } = calculateTotals();

  // Derive a single region label for a sale from its items (a sale can span both regions)
  const getSaleRegionCodes = (sale: Sale): string[] => {
    const codes = new Set(
      (sale.items || [])
        .map((item) => item.regionCode)
        .filter((code): code is "Bbbb" | "Cnnn" => Boolean(code))
    );
    return Array.from(codes);
  };

  const renderSaleRegionBadge = (codes: string[]) => {
    if (codes.length === 0) {
      return <span className="text-xs text-slate-400">—</span>;
    }
    if (codes.length > 1) {
      return (
        <span className="ui-badge ui-badge-info">
          Mixte
        </span>
      );
    }
    return (
      <span className="ui-tag">
        {codes[0]}
      </span>
    );
  };

  // Display-only labels; the stored values are left untouched.
  const saleStatusLabel: Record<string, string> = { completed: "Terminée", voided: "Annulée", pending: "En attente", corrected: "Corrigée" };
  const saleStatusTone = (status: string) =>
    status === "completed" ? "ui-badge-success" : status === "voided" ? "ui-badge-danger" : "ui-badge-warning";
  const paymentLabel: Record<string, string> = { cash: "Cash", card: "Carte", transfer: "Transfert", other: "Autre" };
  const timeframeLabels: Record<typeof timeframeType, string> = { today: "Aujourd'hui", day: "Jour précis", month: "Mois", year: "Année", custom: "Plage de dates" };
  const syncBlocked = (sale: Sale) => Boolean(sale.localSyncState && sale.localSyncState !== "SYNCED");

  return (
    <div className="ui-page ui-page-wide">
      <PageHeader
        eyebrow="Transactions"
        title="Historique des ventes"
        description="Retrouvez, consultez et réimprimez les ventes enregistrées."
        actions={
          <>
            <button type="button" onClick={exportToJSON} className="ui-btn ui-btn-secondary" title="Exporter les ventes au format JSON">
              <FileText />
              Export JSON
            </button>
            <button type="button" onClick={exportDetailedSalesToCSV} className="ui-btn ui-btn-primary" title="Exporter les ventes au format CSV">
              <Download />
              Export CSV
            </button>
          </>
        }
      />

      {/* Summary Stats - ONLY VISIBLE TO ADMINS */}
      {isAdmin && displayedSummaryStats && (
        <section aria-labelledby="sales-summary-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sales-summary-title" className="ui-kicker flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Synthèse (vue administrateur)
            </h2>
            {currentUser && (
              <span className="ui-badge ui-badge-neutral max-w-full truncate">
                Connecté : {currentUser.name} ({currentUser.role})
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Enregistrements" value={displayedSummaryStats.totalRecords} icon={FileText} />
            <MetricCard label="Revenus" value={formatCurrency(displayedSummaryStats.revenue)} tone="success" icon={Download} />
            <MetricCard label="Dépenses" value={formatCurrency(displayedSummaryStats.expenses)} tone="danger" icon={Minus} />
            <MetricCard label="Net" value={formatCurrency(displayedSummaryStats.net)} tone="primary" icon={Package} />
            <MetricCard label="Nombre de ventes" value={displayedSummaryStats.salesCount} icon={FileText} />
            <MetricCard label="Nombre de dépenses" value={displayedSummaryStats.expensesCount} icon={Minus} />
          </div>
        </section>
      )}

      {/* Toolbar: search, scope and period */}
      <section className="ui-card" aria-label="Recherche et filtres">
        <div className="flex flex-col gap-3 p-4 sm:p-5 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="sales-search" className="sr-only">Rechercher une vente</label>
            <Search className="ui-field-icon" aria-hidden="true" />
            <input
              id="sales-search"
              type="search"
              placeholder="Rechercher une vente…"
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
              onClick={() => setShowEditedSales(!showEditedSales)}
              aria-pressed={showEditedSales}
              className={`ui-btn ${showEditedSales ? "ui-btn-primary" : "ui-btn-secondary"}`}
            >
              <History />
              {showEditedSales ? "Toutes les ventes" : "Ventes modifiées"}
              {showEditedSales && (
                <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums">{editedSales.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="sales-filters"
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
            <span className="truncate">
              <span className="font-medium text-slate-900">{showEditedSales ? "Ventes modifiées" : "Toutes les ventes"}</span>
              {" · "}{getTimeframeDescription()}
            </span>
          </p>
          <button type="button" onClick={clearAllFilters} className="ui-btn ui-btn-ghost ui-btn-sm self-start sm:self-auto">
            <RefreshCw />
            Réinitialiser les filtres
          </button>
        </div>

        {/* Timeframe Selection */}
        {showFilters && (
          <div id="sales-filters" className="space-y-4 border-t border-slate-100 px-4 py-4 sm:px-5">
            <div>
              <span className="ui-label">Période</span>
              <div className="ui-segmented w-full sm:w-auto" role="group" aria-label="Type de période">
                {(["today", "day", "month", "year", "custom"] as const).map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => handleTimeframeTypeChange(type)}
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
                    <label htmlFor="sales-date" className="ui-label">Date</label>
                    <input
                      id="sales-date"
                      type="date"
                      value={queryParams.date}
                      onChange={(e) => handleQueryParamChange("date", e.target.value)}
                      className="ui-input"
                    />
                  </div>
                )}

                {timeframeType === "month" && (
                  <>
                    <div>
                      <label htmlFor="sales-month-year" className="ui-label">Année</label>
                      <input
                        id="sales-month-year"
                        type="number"
                        value={queryParams.year}
                        onChange={(e) => handleQueryParamChange("year", e.target.value)}
                        min="2000"
                        max="2100"
                        className="ui-input tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="sales-month" className="ui-label">Mois</label>
                      <select
                        id="sales-month"
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
                    <label htmlFor="sales-year" className="ui-label">Année</label>
                    <input
                      id="sales-year"
                      type="number"
                      value={queryParams.year}
                      onChange={(e) => handleQueryParamChange("year", e.target.value)}
                      min="2000"
                      max="2100"
                      className="ui-input tabular-nums"
                    />
                  </div>
                )}

                {timeframeType === "custom" && (
                  <>
                    <div>
                      <label htmlFor="sales-from" className="ui-label">Du</label>
                      <input
                        id="sales-from"
                        type="date"
                        value={queryParams.from}
                        onChange={(e) => handleQueryParamChange("from", e.target.value)}
                        className="ui-input"
                      />
                    </div>
                    <div>
                      <label htmlFor="sales-to" className="ui-label">Au</label>
                      <input
                        id="sales-to"
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
                    <label htmlFor="sales-type" className="ui-label">Type</label>
                    <select
                      id="sales-type"
                      value={queryParams.type}
                      onChange={(e) => handleQueryParamChange("type", e.target.value)}
                      className="ui-input"
                    >
                      <option value="">Ventes et réservations</option>
                      <option value="sale">Ventes</option>
                      <option value="reservation">Réservations</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sales-status" className="ui-label">Statut</label>
                    <select
                      id="sales-status"
                      value={queryParams.status}
                      onChange={(e) => handleQueryParamChange("status", e.target.value)}
                      className="ui-input"
                    >
                      <option value="">Tous les statuts</option>
                      <option value="completed">Terminée</option>
                      <option value="pending">En attente</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sales-phone" className="ui-label">Téléphone du client</label>
                    <input
                      id="sales-phone"
                      type="text"
                      value={queryParams.customerPhone}
                      onChange={(e) => handleQueryParamChange("customerPhone", e.target.value)}
                      placeholder="Filtrer par téléphone…"
                      className="ui-input"
                      inputMode="tel"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Applied Filters Summary */}
            {appliedFilters && (
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">Filtres appliqués :</span>{" "}
                Statut : {appliedFilters.status}, Type : {appliedFilters.type}
                {appliedFilters.customerPhone !== 'none' && `, Téléphone : ${appliedFilters.customerPhone}`}
              </p>
            )}
          </div>
        )}
      </section>

      {message && <Alert tone="success" onDismiss={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      <section className="ui-card overflow-hidden" aria-labelledby="sales-table-title">
        <div className="ui-card-header">
          <h2 id="sales-table-title" className="ui-section-title flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-700" />
            {showEditedSales ? "Ventes modifiées" : "Transactions de vente"}
            <span className="ui-badge ui-badge-neutral tabular-nums">{filteredSales.length}</span>
          </h2>
        </div>

        <div className="ui-table-wrap">
          {loading ? (
            <LoadingState label="Chargement des ventes…" />
          ) : filteredSales.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={showEditedSales ? "Aucune vente modifiée trouvée" : "Aucune vente trouvée"}
              description="Aucune transaction ne correspond à la période et aux filtres sélectionnés."
            />
          ) : (
            <table className="ui-table min-w-full">
              <thead>
                <tr>
                  <th scope="col">Vente</th>
                  <th scope="col">Client</th>
                  <th scope="col" className="text-center">Articles</th>
                  <th scope="col">Région</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col">Paiement</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Date · Agent</th>
                  {showEditedSales && <th scope="col">Dernière modification</th>}
                  <th scope="col" className="ui-sticky-end text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale._id}>
                    <td className="whitespace-nowrap font-medium text-slate-900">
                      {sale.saleId}
                    </td>
                    <td className="max-w-[12rem]">
                      <div className="flex flex-col">
                        <span className="truncate text-slate-900" title={sale.customer.name}>{sale.customer.name}</span>
                        {sale.customer.phone && <span className="text-xs tabular-nums text-slate-500">{sale.customer.phone}</span>}
                      </div>
                    </td>
                    <td className="text-center tabular-nums">{sale.items.length}</td>
                    <td>{renderSaleRegionBadge(saleRegionBadges.get(sale._id) || [])}</td>
                    <td className="ui-num whitespace-nowrap font-semibold text-slate-900">{formatCurrency(sale.total)}</td>
                    <td>
                      <span className="ui-badge ui-badge-neutral">{paymentLabel[sale.paymentMethod] || sale.paymentMethod}</span>
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <span className={`ui-badge ${saleStatusTone(sale.status)}`}>
                          {saleStatusLabel[sale.status] || sale.status}
                        </span>
                        {sale.localSyncState && (
                          <span className={`text-[11px] font-semibold ${
                            sale.localSyncState === "CONFLICT" || sale.localSyncState === "FAILED_PERMANENT"
                              ? "text-amber-700"
                              : sale.localSyncState === "SYNCED" ? "text-emerald-700" : "text-blue-700"
                          }`}>
                            {sale.localSyncState === "SYNCED"
                              ? "Synchronisée"
                              : sale.localSyncState === "CONFLICT" || sale.localSyncState === "FAILED_PERMANENT"
                                ? "À vérifier"
                                : "En attente de synchronisation"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-[7rem]">
                      <div className="flex flex-col">
                        <span className="whitespace-nowrap text-slate-700">{formatDate(sale.createdAt)}</span>
                        <span className="text-xs text-slate-500">{sale.salesPerson || "Non spécifié"}</span>
                      </div>
                    </td>
                    {showEditedSales && (
                      <td className="whitespace-nowrap text-slate-500">
                        {sale.editedAt ? formatDate(sale.editedAt) : "N/A"}
                      </td>
                    )}
                    <td className="ui-sticky-end">
                      <div className="ui-row-actions">
                        {showEditedSales ? (
                          <button
                            type="button"
                            onClick={() => viewEditedSaleDetails(sale)}
                            className="ui-icon-btn ui-icon-btn-primary"
                            title="Voir les détails des modifications"
                            aria-label={`Voir les modifications de la vente ${sale.saleId}`}
                          >
                            <History />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => viewSaleDetails(sale)}
                            className="ui-icon-btn ui-icon-btn-primary"
                            title="Voir les détails"
                            aria-label={`Voir la vente ${sale.saleId}`}
                          >
                            <Eye />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => printSavedSale(sale)}
                          className="ui-icon-btn"
                          title="Réimprimer le reçu et la souche"
                          aria-label={`Réimprimer la vente ${sale.saleId}`}
                        >
                          <Printer />
                        </button>
                        {!showEditedSales && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(sale)}
                              disabled={
                                sale.status === "voided" ||
                                sale.status === "corrected" ||
                                syncBlocked(sale)
                              }
                              className="ui-icon-btn ui-icon-btn-warning"
                              title={syncBlocked(sale) ? "Connexion requise" : "Modifier la vente"}
                              aria-label={`Modifier la vente ${sale.saleId}`}
                            >
                              <Edit />
                            </button>
                            <button
                              type="button"
                              onClick={() => generateReceiptPDF(sale)}
                              className="ui-icon-btn ui-icon-btn-success"
                              title="Télécharger le reçu et la souche PDF"
                              aria-label={`Télécharger le PDF de la vente ${sale.saleId}`}
                            >
                              <Download />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVoidSale(sale)}
                              disabled={sale.status === "voided" || syncBlocked(sale)}
                              className="ui-icon-btn ui-icon-btn-danger"
                              title={syncBlocked(sale) ? "Connexion requise" : "Annuler la vente"}
                              aria-label={`Annuler la vente ${sale.saleId}`}
                            >
                              <Trash2 />
                            </button>
                          </>
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
            <span className="text-sm tabular-nums text-slate-600">
              Page {pagination.currentPage} sur {pagination.totalPages} · {pagination.totalRecords} ventes
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Précédent</button>
              <button type="button" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Suivant</button>
            </div>
          </div>
        )}
      </section>

      {/* Sale Details Modal */}
      {showModal && selectedSale && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="sale-details-title">
          <div className="ui-dialog max-w-2xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="sale-details-title" className="ui-dialog-title">Détails de la vente</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{selectedSale.saleId}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              {/* Sale Info */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Date</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{formatDate(selectedSale.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Statut</dt>
                  <dd className="mt-1">
                    <span className={`ui-badge ${saleStatusTone(selectedSale.status)}`}>
                      {saleStatusLabel[selectedSale.status] || selectedSale.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Méthode de paiement</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{paymentLabel[selectedSale.paymentMethod] || selectedSale.paymentMethod}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Agent</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{selectedSale.salesPerson || "Non spécifié"}</dd>
                </div>
                {selectedSale.editedBy && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-slate-500">Dernière modification</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">
                      Par {selectedSale.editedBy} le{" "}
                      {selectedSale.editedAt
                        ? formatDate(selectedSale.editedAt)
                        : "N/A"}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Customer Info */}
              <div>
                <h4 className="ui-kicker mb-2 flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Client</h4>
                <dl className="ui-muted-panel grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Nom</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-900">{selectedSale.customer.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Téléphone</dt>
                    <dd className="mt-0.5 text-sm tabular-nums text-slate-900">{selectedSale.customer.phone || "—"}</dd>
                  </div>
                  {selectedSale.customer.email && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs font-medium text-slate-500">Email</dt>
                      <dd className="mt-0.5 break-words text-sm text-slate-900">{selectedSale.customer.email}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Items */}
              <div>
                <h4 className="ui-kicker mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Articles ({selectedSale.items.length})</h4>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {selectedSale.items.map((item, index) => (
                    <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                          <span className="break-words">{item.name}</span>
                          <span className={item.regionCode ? "ui-tag" : "ui-badge ui-badge-warning"}>
                            {item.regionCode || "Région inconnue"}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                          {item.quantity} pièce(s) × {formatCurrency(item.price)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        {formatCurrency(item.netTotal ?? item.total)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Show edit history if available */}
              {selectedSale.editHistory && selectedSale.editHistory.length > 0 && (
                renderChangeComparison(selectedSale)
              )}

              {/* Totals */}
              <div className="space-y-1.5 border-t border-slate-200 pt-4 text-sm tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total</span>
                  <span className="text-slate-900">{formatCurrency(selectedSale.subtotal)}</span>
                </div>
                {Number(selectedSale.discount || 0) > 0 && <div className="flex justify-between text-slate-600"><span>Remise allouée</span><span className="text-slate-900">-{formatCurrency(selectedSale.discount || 0)}</span></div>}
                {Number(selectedSale.tax || 0) > 0 && <div className="flex justify-between text-slate-600"><span>Taxe allouée</span><span className="text-slate-900">{formatCurrency(selectedSale.tax || 0)}</span></div>}
                {Number(selectedSale.transportCost || 0) > 0 && <div className="flex justify-between text-slate-600"><span>Transport alloué</span><span className="text-slate-900">{formatCurrency(selectedSale.transportCost || 0)}</span></div>}
                {isAdmin && Number.isFinite(selectedSale.cost) && <div className="flex justify-between text-slate-600"><span>Coût</span><span className="text-slate-900">{formatCurrency(selectedSale.cost || 0)}</span></div>}
                {isAdmin && Number.isFinite(selectedSale.profit) && <div className="flex justify-between text-slate-600"><span>Profit</span><span className="text-slate-900">{formatCurrency(selectedSale.profit || 0)}</span></div>}
                <div className="flex items-center justify-between pt-1.5 text-base font-semibold text-slate-950">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(selectedSale.total)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn ui-btn-ghost">
                Fermer
              </button>
              <button
                type="button"
                onClick={() => openEditModal(selectedSale)}
                disabled={
                  selectedSale.status === "voided" ||
                  selectedSale.status === "corrected"
                }
                className="ui-btn ui-btn-secondary"
              >
                <Edit />
                Modifier
              </button>
              <button type="button" onClick={() => generateReceiptPDF(selectedSale)} className="ui-btn ui-btn-secondary">
                <Download />
                PDF + souche
              </button>
              <button type="button" onClick={() => printSavedSale(selectedSale)} className="ui-btn ui-btn-primary">
                <Printer />
                Imprimer reçu + souche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Edited Sale Details Modal */}
      {showEditedDetailsModal && selectedEditedSale && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edited-sale-title">
          <div className="ui-dialog max-w-3xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="edited-sale-title" className="ui-dialog-title">Détails des modifications</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{selectedEditedSale.saleId}</p>
              </div>
              <button type="button" onClick={() => setShowEditedDetailsModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              {/* Current Sale Info */}
              <div>
                <h4 className="ui-kicker mb-2">État actuel de la vente</h4>
                <dl className="ui-muted-panel grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Client</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-900">
                      {selectedEditedSale.customer.name} ({selectedEditedSale.customer.phone})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Total actuel</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(selectedEditedSale.total)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Méthode de paiement</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{paymentLabel[selectedEditedSale.paymentMethod] || selectedEditedSale.paymentMethod}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Articles</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{selectedEditedSale.items.length} article(s)</dd>
                  </div>
                </dl>
              </div>

              {/* Edit History */}
              <div>
                <h4 className="ui-kicker mb-2">Historique des modifications</h4>
                <div className="space-y-3">
                  {selectedEditedSale.editHistory && selectedEditedSale.editHistory.length > 0 ? (
                    selectedEditedSale.editHistory.map((edit, index) => (
                      <div key={edit._id || index} className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-900">
                              Modification #{selectedEditedSale.editHistory!.length - index}
                            </h5>
                            <p className="text-xs text-slate-500">{formatDate(edit.editedAt)}</p>
                          </div>
                          <div className="text-sm sm:text-right">
                            <p className="font-medium text-slate-900">Par : {edit.editedBy}</p>
                            <p className="text-slate-600">Raison : {edit.reason}</p>
                          </div>
                        </div>

                        {edit.changes && Object.keys(edit.changes).length > 0 && (
                          <div className="space-y-3">
                            <h6 className="text-xs font-semibold text-slate-600">Changements détaillés</h6>
                            {Object.entries(edit.changes).map(([field, changeData]: [string, any]) => (
                              <div key={field} className="border-l-2 border-blue-500 pl-3">
                                <div className="mb-2 text-sm font-medium capitalize text-slate-700">
                                  {field.replace(/([A-Z])/g, ' $1').toLowerCase()}
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                                  <div className="rounded-md border border-red-200 bg-red-50 p-3">
                                    <div className="mb-1 text-xs font-semibold text-red-700">Avant</div>
                                    <div className="whitespace-pre-wrap break-words text-red-800">
                                      {typeof changeData.from === 'object'
                                        ? JSON.stringify(changeData.from, null, 2)
                                        : String(changeData.from || 'N/A')
                                      }
                                    </div>
                                  </div>
                                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                                    <div className="mb-1 text-xs font-semibold text-emerald-700">Après</div>
                                    <div className="whitespace-pre-wrap break-words text-emerald-800">
                                      {typeof changeData.to === 'object'
                                        ? JSON.stringify(changeData.to, null, 2)
                                        : String(changeData.to || 'N/A')
                                      }
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <EmptyState icon={History} title="Aucun détail de modification disponible" />
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowEditedDetailsModal(false)} className="ui-btn ui-btn-secondary">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Sale Modal */}
      {showEditModal && editingSale && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-sale-title">
          <div className="ui-dialog max-w-4xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="edit-sale-title" className="ui-dialog-title">Modifier la vente</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{editingSale.saleId}</p>
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
                    <label htmlFor="edit-sale-name" className="ui-label">Nom</label>
                    <input
                      id="edit-sale-name"
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
                    <label htmlFor="edit-sale-phone" className="ui-label">Téléphone</label>
                    <input
                      id="edit-sale-phone"
                      type="tel"
                      value={editForm.customer.phone}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, phone: e.target.value },
                        }))
                      }
                      className="ui-input"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-sale-email" className="ui-label">Email</label>
                    <input
                      id="edit-sale-email"
                      type="email"
                      value={editForm.customer.email}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customer: { ...prev.customer, email: e.target.value },
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Payment Method */}
              <div className="max-w-xs">
                <label htmlFor="edit-sale-payment" className="ui-label">Méthode de paiement</label>
                <select
                  id="edit-sale-payment"
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
                  <option value="transfer">Transfert</option>
                  <option value="other">Autre</option>
                </select>
              </div>

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
                      Actualiser les articles
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
                          <label htmlFor={`edit-item-${index}`} className="ui-label">Article</label>
                          {loadingProducts ? (
                            <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">
                              Chargement des articles…
                            </div>
                          ) : products.length === 0 ? (
                            <input
                              id={`edit-item-${index}`}
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
                              placeholder="Nom de l'article"
                              className="ui-input"
                            />
                          ) : (
                            <select
                              id={`edit-item-${index}`}
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
                          <label htmlFor={`edit-price-${index}`} className="ui-label">Prix</label>
                          <input
                            id={`edit-price-${index}`}
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
                          <label htmlFor={`edit-qty-${index}`} className="ui-label">Pièces</label>
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
                              id={`edit-qty-${index}`}
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
                <label htmlFor="edit-sale-reason" className="ui-label">Raison de la modification <span className="ui-required">*</span></label>
                <textarea
                  id="edit-sale-reason"
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Veuillez indiquer une raison pour la modification de cette vente…"
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
                onClick={handleEditSale}
                disabled={loading || editForm.items.length === 0}
                className="ui-btn ui-btn-primary"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" /> Mise à jour…
                  </>
                ) : (
                  <>
                    <Edit /> Mettre à jour la vente
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
