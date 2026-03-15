"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import jsPDF from "jspdf";

interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  _id: string;
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
  };
  items: SaleItem[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  salesPerson?: string;
  editedBy?: string;
  editedAt?: string;
  editHistory?: EditHistoryEntry[];
  type?: string;
}

interface Product {
  _id: string;
  name: string;
  stock: number;
  price: number;
  sku?: string;
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
  };
  performanceNote: string | null;
}

// Helper function to get today's date in correct format
const getTodayDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get current month in YYYY-MM format
const getCurrentMonth = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Helper function to get current year
const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

export default function SalesHistory() {
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
    customerPhone: ""
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

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch current user on component mount
  useEffect(() => {
    fetchCurrentUser();
    fetchSales();
    fetchProducts();
    const handleSalesUpdate = () => {
      // Refresh sales when triggered from other components
      fetchSales();
    };

    window.addEventListener("salesUpdated", handleSalesUpdate);

    return () => {
      window.removeEventListener("salesUpdated", handleSalesUpdate);
    };
  }, []);

  // Fetch sales when query params change
  useEffect(() => {
    if (Object.keys(queryParams).length > 0) {
      fetchSales();
    }
  }, [queryParams]);

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
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
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
      const invalidStatuses = ['voided', 'cancelled', 'refunded', 'expense', 'depense'];
      const isValidStatus = !invalidStatuses.includes(sale.status?.toLowerCase());
      
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
    
    return params.toString();
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryString = buildQueryString();
      const url = `${import.meta.env.VITE_API_URL}/sales${queryString ? `?${queryString}` : ''}`;
      
      console.log("Fetching sales from:", url);
      
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
          
          console.log(`Fetched ${fetchedSales.length} sales from API`);
          console.log("Timeframe metadata:", data.timeframe);
          console.log("Summary stats:", data.summary);
          
          // Filter out expenses and invalid sales
          const validSales = filterValidSales(fetchedSales);
          console.log(`After filtering: ${validSales.length} valid sales`);
          
          // Update sales state
          setSales(validSales);
          
          // Update metadata
          setTimeframeMetadata(data.timeframe);
          setSummaryStats(data.summary);
          setAppliedFilters(data.filtersApplied);
          
          // Update edited sales
          updateEditedSales(validSales);
        } else {
          console.warn("Unexpected sales data structure:", data);
          setError("Unexpected response format from server");
        }
      } else {
        console.error("Sales fetch failed:", res.status);
        const errorText = await res.text();
        setError(`Failed to load sales: ${res.status} ${errorText}`);
      }
    } catch (error) {
      console.error("Error loading sales:", error);
      setError("Failed to load sales. Please check your connection.");
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
        // Keep existing values or set defaults
        if (!newParams.from) {
          const today = new Date();
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          newParams.from = firstDay.toISOString().split('T')[0];
        }
        if (!newParams.to) {
          newParams.to = new Date().toISOString().split('T')[0];
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
    setQueryParams(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setQueryParams({
      from: "",
      to: "",
      date: getTodayDate(),
      year: getCurrentYear().toString(),
      month: getCurrentMonth().split('-')[1],
      type: "",
      status: "",
      customerPhone: ""
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

        console.log("Processed products:", productsArray.length);
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

  const filteredSales = showEditedSales 
    ? editedSales.filter(sale =>
        sale.saleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customer.phone.includes(searchTerm) ||
        (sale.salesPerson && sale.salesPerson.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : sales.filter(sale =>
        sale.saleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customer.phone.includes(searchTerm) ||
        (sale.salesPerson && sale.salesPerson.toLowerCase().includes(searchTerm.toLowerCase()))
      );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
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
                    <div className="bg-red-50 p-2 rounded">
                      <div className="text-red-600 font-medium">Avant:</div>
                      <div className="truncate">{JSON.stringify(changeData.from)}</div>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                      <div className="text-green-600 font-medium">Après:</div>
                      <div className="truncate">{JSON.stringify(changeData.to)}</div>
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
        setError("No data to export");
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
        'Item Total'
      ];

      const summaryRows = dataToExport.map(sale => {
        const latestEdit = sale.editHistory && sale.editHistory.length > 0 
          ? sale.editHistory[sale.editHistory.length - 1] 
          : null;
        
        return [
          `"${sale.saleId}"`,
          `"${sale.customer.name}"`,
          `"${sale.customer.phone}"`,
          `"${sale.customer.email || ''}"`,
          `"${sale.salesPerson || 'Not specified'}"`,
          sale.items.length,
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
          item.total.toFixed(2)
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

      setMessage(`✅ ${dataToExport.length} sales with ${itemRows.length} items exported successfully!`);
      
    } catch (error) {
      console.error('Export error:', error);
      setError('Failed to export sales data');
    }
  };

  const exportToJSON = () => {
    try {
      const dataToExport = showEditedSales ? editedSales : filteredSales;
      
      if (dataToExport.length === 0) {
        setError("No data to export");
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

      setMessage(`✅ ${dataToExport.length} sales exported as JSON!`);
      
    } catch (error) {
      console.error('JSON export error:', error);
      setError('Failed to export JSON data');
    }
  };

  // Print function for ESC/POS receipt - opens print dialog
  const printESC_POSReceipt = (sale: Sale) => {
    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (printWindow) {
      printWindow.document.write(`
<html>
  <head>
    <title>Sale Receipt - ESC/POS</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body { 
        font-family: 'Courier New', Courier, monospace; 
        margin: 0; 
        padding: 0; 
        font-size: 13px;
        font-weight: bold;
        line-height: 1.1;
        width: 72mm;
        background-color: white;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        display: flex;
        justify-content: center;
      }
      .receipt-container { 
        width: 70mm;
        margin: 0 auto;
        padding: 0.5mm;
        border: none;
        text-align: center;
      }
      .header { 
        text-align: center; 
        margin-bottom: 1mm; 
        padding-bottom: 1mm;
        border-bottom: 2px double #000;
      }
      .shop-name {
        font-size: 15px;
        font-weight: bold;
        margin-bottom: 0.5mm;
        text-transform: uppercase;
      }
      .shop-details {
        font-size: 11px;
        margin-bottom: 0.3mm;
        line-height: 1;
        font-weight: bold;
      }
      .receipt-info {
        margin: 1mm 0;
        padding: 1mm;
        background-color: #f8f8f8;
        border-left: 3px solid #000;
      }
      .receipt-title {
        font-size: 13px;
        font-weight: bold;
        margin: 1mm 0;
        text-transform: uppercase;
        background-color: #000;
        color: white;
        padding: 1mm;
        border-radius: 2px;
      }
      .items-section {
        margin: 1mm 0;
        padding: 1mm;
        background-color: #fafafa;
        border: 1px solid #eee;
      }
      .item-row { 
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5mm;
        padding: 0 1mm;
        border-bottom: 1px dotted #ddd;
      }
      .item-name {
        text-align: left;
        font-weight: bold;
        font-size: 12px;
        flex: 1;
      }
      .item-details {
        text-align: right;
        font-weight: bold;
        font-size: 12px;
        flex: 1;
      }
      .total-section { 
        font-weight: bold; 
        margin-top: 1mm;
        padding: 1mm;
        background-color: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 3px;
      }
      .total-row {
        display: flex;
        justify-between;
        margin-bottom: 0.3mm;
        font-size: 13px;
        padding: 0 1mm;
      }
      .payment-method {
        text-transform: uppercase;
        font-weight: bold;
        font-size: 13px;
        color: #000;
      }
      .footer { 
        text-align: center; 
        margin-top: 1mm; 
        font-size: 11px;
        font-weight: bold;
        padding: 1mm;
        background-color: #f8f8f8;
        border-top: 1px dashed #000;
      }
      .sales-person {
        margin-top: 1mm;
        text-align: center;
        font-weight: bold;
        font-size: 12px;
        padding: 1mm;
        background-color: #e8e8e8;
        border: 1px solid #ccc;
        border-radius: 2px;
      }
      .customer-info {
        margin: 1mm 0;
        padding: 1mm;
        font-weight: bold;
        text-align: center;
        background-color: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 3px;
      }
      .customer-field {
        margin-bottom: 0.3mm;
        font-size: 12px;
      }
      .separator {
        border-top: 1px dashed #000;
        margin: 1mm 0;
      }
      .cut-line {
        text-align: center;
        margin: 1mm 0;
        font-weight: bold;
        font-size: 11px;
        color: #000;
        letter-spacing: 1px;
      }
      .thank-you {
        font-weight: bold;
        margin: 0.5mm 0;
        font-size: 12px;
      }
      .warning {
        font-size: 10px;
        color: #000;
        margin: 0.3mm 0;
        font-weight: bold;
      }
      .section-divider {
        height: 2px;
        background: linear-gradient(to right, transparent, #000, transparent);
        margin: 1mm 0;
      }
      @media print {
        @page {
          margin: 0 !important;
          size: 72mm auto !important;
        }
        body { 
          margin: 0 !important; 
          padding: 0 !important; 
          width: 72mm !important;
          font-size: 13px !important;
          background: white !important;
          font-weight: bold !important;
          height: auto !important;
          overflow: hidden !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          display: flex !important;
          justify-content: center !important;
        }
        .receipt-container { 
          border: none !important; 
          box-shadow: none !important; 
          margin: 0 auto !important;
          padding: 0.5mm !important;
          width: 70mm !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
        .cut-line {
          page-break-after: always !important;
          margin-bottom: 0 !important;
        }
        body::after,
        body::before {
          display: none !important;
          content: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt-container">
      <div class="header">
        <div class="shop-name"><strong>Boutique C'EST DIEU QUI PARTAGE</strong></div>
        <div class="shop-details"><strong>Av du 1er Janvier N°13, C. Makiso, Kisangani</strong></div>
        <div class="shop-details">TEL: <strong>+243 839 336 794</strong></div>
        <div class="shop-details"><strong>RCCM/KIS : 22-A-267</strong></div>
      </div>
      
      <div class="section-divider"></div>
      
      <div class="receipt-info">
        <div class="shop-details">DATE: <strong>${formatDate(sale.createdAt)}</strong></div>
        <div class="shop-details">RECU #: <strong>${sale.saleId}</strong></div>
      </div>
      
      <div class="customer-info">
        <div class="customer-field">CLIENT: <strong>${sale.customer.name.toUpperCase()}</strong></div>
        <div class="customer-field">TELEPHONE: <strong>${sale.customer.phone}</strong></div>
        ${
          sale.customer.email
            ? `<div class="customer-field">EMAIL: <strong>${sale.customer.email}</strong></div>`
            : ""
        }
      </div>
      
      <div class="receipt-title">ARTICLES ACHETES</div>
      
      <div class="items-section">
      ${sale.items
        .map(
          (item) => `
        <div class="item-row">
          <div class="item-name"><strong>${item.name}</strong></div>
          <div class="item-details">
            <strong>${item.quantity}PcsX$${item.price.toFixed(2)}</strong>
          </div>
        </div>
      `
        )
        .join("")}
      </div>
      
      <div class="total-section">
        <div class="total-row">
          <div><strong>SOUS-TOTAL:</strong></div>
          <div><strong>$${sale.subtotal.toFixed(2)}</strong></div>
        </div>
        <div class="total-row">
          <div><strong>TOTAL:</strong></div>
          <div><strong>$${sale.total.toFixed(2)}</strong></div>
        </div>
        <div class="total-row">
          <div><strong>PAIEMENT:</strong></div>
          <div class="payment-method"><strong>${sale.paymentMethod.toUpperCase()}</strong></div>
        </div>
      </div>
      
      <div class="sales-person">
        Agent: <strong>${(sale.salesPerson || 'Non spécifié').toUpperCase()}</strong>
      </div>
      
      <div class="footer">
        <div class="thank-you"><strong>MERCI POUR VOTRE ACHAT !</strong></div>
        <div class="warning"><strong>Article non echangeable</strong></div>
        <div class="warning"><strong>Non remboursable</strong></div>
        <div class="thank-you"><strong>A BIENTOT !</strong></div>
      </div>
      
      <!-- PAPER CUT INDICATOR -->
      <div class="cut-line">
        ✄ ────────────────────────── ✄
      </div>
    </div>
    <script>
      window.onload = function() {
        try {
          window.print();
        } catch(e) {
          console.error('Print error:', e);
        }
        setTimeout(() => {
          window.close();
        }, 1000);
      };
    </script>
  </body>
</html>
`);
      printWindow.document.close();
    }
  };

  const generateReceiptPDF = (sale: Sale) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text("Boutique C'EST DIEU QUI PARTAGE", 105, 10, { align: "center" });
    doc.setFontSize(10);
    doc.text("", 105, 15, { align: "center" });
    doc.setFontSize(12);
    doc.text("RCCM/KIS : 22-A-267", 105, 20, { align: "center" });
    doc.text("Tél: +243 974 199 054 / +243 853 429 399", 105, 25, {
      align: "center",
    });
    doc.text("Av du 1er Janvier N°13, C. Makiso, Kisangani", 105, 30, {
      align: "center",
    });

    doc.setFontSize(16);
    doc.text("Reçu de vente", 105, 35, { align: "center" });

    // Sale Info
    doc.setFontSize(10);
    doc.text(`Date: ${formatDate(sale.createdAt)}`, 20, 45);
    doc.text(`Reçu #: ${sale.saleId}`, 20, 52);
    doc.text(`Payement: ${sale.paymentMethod.toUpperCase()}`, 20, 59);
    doc.text(`Statut: ${sale.status.toUpperCase()}`, 20, 66);

    // Sales Person Info
    doc.text(`Agent: ${sale.salesPerson || "Non spécifié"}`, 20, 73);

    // Customer Info
    doc.setFontSize(12);
    doc.text("Information sur le client:", 20, 85);
    doc.setFontSize(10);
    doc.text(`Nom: ${sale.customer.name}`, 20, 92);
    doc.text(`Phone: ${sale.customer.phone}`, 20, 99);
    if (sale.customer.email) {
      doc.text(`Email: ${sale.customer.email}`, 20, 106);
    }

    // Items
    doc.setFontSize(12);
    doc.text("Articles:", 20, 113);
    doc.setFontSize(10);
    let yPos = 120;

    sale.items.forEach((item, index) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(`${index + 1}. ${item.name}`, 20, yPos);
      doc.text(
        `Qty: ${item.quantity} x ${formatCurrency(
          item.price
        )} = ${formatCurrency(item.total)}`,
        25,
        yPos + 6
      );
      yPos += 15;
    });

    // Totals
    yPos += 7;
    doc.text(`Sous-total: ${formatCurrency(sale.subtotal)}`, 20, yPos);
    doc.text(`Total: ${formatCurrency(sale.total)}`, 20, yPos + 5);

    // Footer
    doc.setFontSize(10);
    doc.text("Merci pour votre achat !", 105, yPos + 20, {
      align: "center",
    });
    doc.text(
      "Les marchandises vendues ne sont ni reprises ni échangées.",
      105,
      yPos + 30,
      {
        align: "center",
      }
    );
    doc.text("À bientôt", 105, yPos + 40, {
      align: "center",
    });

    doc.save(`receipt-${sale.saleId}.pdf`);
  };

  const viewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowModal(true);
    setError(null);
  };

  const openEditModal = async (sale: Sale) => {
    if (sale.status === "voided" || sale.status === "corrected") {
      setError("Cannot edit a voided or corrected sale");
      return;
    }

    setEditingSale(sale);
    setEditForm({
      customer: { ...sale.customer },
      items: sale.items.map((item) => ({ ...item })),
      paymentMethod: sale.paymentMethod,
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
      setError(`Insufficient stock. Available: ${product.stock}`);
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
      setError("No products available. Please refresh products first.");
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
    };

    setEditForm((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const updateItemProduct = (index: number, productId: string) => {
    const product = products.find((p) => p._id === productId);
    if (!product) {
      setError("Selected product not found");
      return;
    }

    const updatedItems = [...editForm.items];
    updatedItems[index].productId = productId;
    updatedItems[index].name = product.name;
    updatedItems[index].price = product.price;
    updatedItems[index].total = product.price * updatedItems[index].quantity;

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
      setError("Sale must contain at least one item");
      return;
    }

    if (!editForm.customer.name || !editForm.customer.phone) {
      setError("Customer name and phone are required");
      return;
    }

    if (!editForm.reason) {
      setError("Please provide a reason for editing this sale");
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
        setMessage("✅ Sale updated successfully");

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
      setError("Failed to update sale. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleVoidSale = async (sale: Sale) => {
    if (sale.status === "voided") {
      setError("Sale is already voided");
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
        setMessage("✅ Sale voided successfully");
        await fetchSales();
        setShowModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to void sale");
      }
    } catch (error) {
      setError("Failed to void sale");
      console.error("Error voiding sale:", error);
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, total } = calculateTotals();

  return (
    <div className="space-y-6 p-6 flex-1 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4 overflow-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Historique des ventes
          </h1>
          <p className="text-gray-600">
            Voir toutes les transactions et ventes passées
          </p>
        </div>
        <div className="flex gap-3">
          {/* NEW: Edited Sales Filter Button */}
          <button
            onClick={() => setShowEditedSales(!showEditedSales)}
            className={`px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 ${
              showEditedSales
                ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            {showEditedSales ? "Toutes les ventes" : "Ventes modifiées"}
            {showEditedSales && (
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                {editedSales.length}
              </span>
            )}
          </button>

          {/* Export Button */}
          <button
            onClick={exportDetailedSalesToCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            title="Export sales data to CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          {/* Export JSON Button */}
          <button
            onClick={exportToJSON}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            title="Export sales data to JSON"
          >
            <FileText className="w-4 h-4" />
            Export JSON
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search sales..."
              className="pl-10 w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary Stats - ONLY VISIBLE TO ADMINS */}
      {isAdmin && summaryStats && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Summary Statistics (Admin View)
            </h3>
            {currentUser && (
              <span className="text-sm text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                Logged in as: {currentUser.name} ({currentUser.role})
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryStats.totalRecords}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Revenue</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(summaryStats.revenue)}</p>
                </div>
                <Download className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Expenses</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(summaryStats.expenses)}</p>
                </div>
                <Minus className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Net</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(summaryStats.net)}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>
          
          {/* Additional stats row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Sales</p>
                  <p className="text-xl font-bold text-green-700">{summaryStats.salesCount}</p>
                </div>
                <FileText className="w-6 h-6 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Expenses</p>
                  <p className="text-xl font-bold text-red-700">{summaryStats.expensesCount}</p>
                </div>
                <Minus className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeframe Filter Section */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
            {showEditedSales ? "Ventes modifiées" : "Toutes les ventes"} - {getTimeframeDescription()}
          </h3>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? "Hide Filters" : "Show Filters"}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            
            <button
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Clear Filters
            </button>
          </div>
        </div>

        {/* Timeframe Selection */}
        {showFilters && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeframe Type
              </label>
              <div className="flex flex-wrap gap-2">
                {(["today", "day", "month", "year", "custom"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTimeframeTypeChange(type)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      timeframeType === type
                        ? "bg-blue-500 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {type === "today" && "Today"}
                    {type === "day" && "Specific Day"}
                    {type === "month" && "Specific Month"}
                    {type === "year" && "Specific Year"}
                    {type === "custom" && "Custom Range"}
                  </button>
                ))}
              </div>
            </div>

            {/* Specific timeframe inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {timeframeType === "day" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={queryParams.date}
                    onChange={(e) => handleQueryParamChange("date", e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}

              {timeframeType === "month" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year
                    </label>
                    <input
                      type="number"
                      value={queryParams.year}
                      onChange={(e) => handleQueryParamChange("year", e.target.value)}
                      min="2000"
                      max="2100"
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Month
                    </label>
                    <select
                      value={queryParams.month}
                      onChange={(e) => handleQueryParamChange("month", e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthNum = (i + 1).toString().padStart(2, '0');
                        return (
                          <option key={monthNum} value={monthNum}>
                            {new Date(2000, i).toLocaleString('default', { month: 'long' })} ({monthNum})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </>
              )}

              {timeframeType === "year" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={queryParams.year}
                    onChange={(e) => handleQueryParamChange("year", e.target.value)}
                    min="2000"
                    max="2100"
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}

              {timeframeType === "custom" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={queryParams.from}
                      onChange={(e) => handleQueryParamChange("from", e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={queryParams.to}
                      onChange={(e) => handleQueryParamChange("to", e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Advanced Filters */}
            <div>
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {showAdvancedFilters ? "Hide Advanced Filters" : "Show Advanced Filters"}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </button>

              {showAdvancedFilters && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sale Type
                    </label>
                    <select
                      value={queryParams.type}
                      onChange={(e) => handleQueryParamChange("type", e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">All Types</option>
                      <option value="sale">Sale</option>
                      <option value="reservation">Reservation</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={queryParams.status}
                      onChange={(e) => handleQueryParamChange("status", e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">All Status</option>
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Phone
                    </label>
                    <input
                      type="text"
                      value={queryParams.customerPhone}
                      onChange={(e) => handleQueryParamChange("customerPhone", e.target.value)}
                      placeholder="Filter by phone..."
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Applied Filters Summary */}
        {appliedFilters && (
          <div className="mt-4 text-sm text-gray-600">
            <span className="font-medium">Applied filters:</span>
            <span className="ml-2">
              Status: {appliedFilters.status}, Type: {appliedFilters.type}
              {appliedFilters.customerPhone !== 'none' && `, Phone: ${appliedFilters.customerPhone}`}
            </span>
          </div>
        )}
      </div>

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

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {showEditedSales ? "Ventes modifiées" : "Transactions de vente"} ({filteredSales.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Chargement des ventes...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>
                {showEditedSales 
                  ? "Aucune vente modifiée trouvée" 
                  : "Aucune vente trouvée"
                }
              </p>
              <p className="text-sm">pour la période sélectionnée</p>
            </div>
          ) : (
            <>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Identifiant de vente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Articles
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payement
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    {showEditedSales && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dernière modification
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSales.map((sale) => (
                    <tr key={sale._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {sale.saleId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {sale.customer.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {sale.customer.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.salesPerson || "Non spécifié"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.items.length} Article(s)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(sale.total)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                            sale.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : sale.status === "voided"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(sale.createdAt)}
                      </td>
                      {showEditedSales && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {sale.editedAt ? formatDate(sale.editedAt) : "N/A"}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          {showEditedSales ? (
                            <button
                              onClick={() => viewEditedSaleDetails(sale)}
                              className="text-blue-600 hover:text-blue-900 p-1 rounded"
                              title="Voir les détails des modifications"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => viewSaleDetails(sale)}
                              className="text-blue-600 hover:text-blue-900 p-1 rounded"
                              title="Voir les détails de"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {!showEditedSales && (
                            <>
                              <button
                                onClick={() => openEditModal(sale)}
                                disabled={
                                  sale.status === "voided" ||
                                  sale.status === "corrected"
                                }
                                className={`p-1 rounded ${
                                  sale.status === "voided" ||
                                  sale.status === "corrected"
                                    ? "text-gray-400 cursor-not-allowed"
                                    : "text-yellow-600 hover:text-yellow-900"
                                }`}
                                title="Edit Sale"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => generateReceiptPDF(sale)}
                                className="text-green-600 hover:text-green-900 p-1 rounded"
                                title="Download PDF Receipt"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => printESC_POSReceipt(sale)}
                                className="text-purple-600 hover:text-purple-900 p-1 rounded"
                                title="Print ESC/POS Receipt"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleVoidSale(sale)}
                                disabled={sale.status === "voided"}
                                className={`p-1 rounded ${
                                  sale.status === "voided"
                                    ? "text-gray-400 cursor-not-allowed"
                                    : "text-red-600 hover:text-red-900"
                                }`}
                                title="Void Sale"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* Sale Details Modal */}
      {showModal && selectedSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Détails de la vente
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Sale Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Identifiant de vente
                  </label>
                  <p className="text-sm text-gray-900">{selectedSale.saleId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <p className="text-sm text-gray-900">
                    {formatDate(selectedSale.createdAt)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Methode de Payment{" "}
                  </label>
                  <p className="text-sm text-gray-900 capitalize">
                    {selectedSale.paymentMethod}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Statut
                  </label>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                      selectedSale.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : selectedSale.status === "voided"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {selectedSale.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent
                  </label>
                  <p className="text-sm text-gray-900">
                    {selectedSale.salesPerson || "Non spécifié"}
                  </p>
                </div>
                {selectedSale.editedBy && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dernière modification
                    </label>
                    <p className="text-sm text-gray-900">
                      By: {selectedSale.editedBy} at{" "}
                      {selectedSale.editedAt
                        ? formatDate(selectedSale.editedAt)
                        : "N/A"}
                    </p>
                  </div>
                )}
              </div>

              {/* Customer Info */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Information sur le client
                </h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nom
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedSale.customer.name}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedSale.customer.phone}
                      </p>
                    </div>
                    {selectedSale.customer.email && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedSale.customer.email}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Articles ({selectedSale.items.length})
                </h4>
                <div className="space-y-3">
                  {selectedSale.items.map((item, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium text-gray-900">
                            {item.name}
                          </h5>
                          <p className="text-sm text-gray-600">
                            Nombre de pieces: {item.quantity} ×{" "}
                            {formatCurrency(item.price)}
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

              {/* Show edit history if available */}
              {selectedSale.editHistory && selectedSale.editHistory.length > 0 && (
                renderChangeComparison(selectedSale)
              )}

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Sous-total:</span>
                  <span className="text-sm text-gray-900">
                    {formatCurrency(selectedSale.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-gray-900">
                    {formatCurrency(selectedSale.total)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => generateReceiptPDF(selectedSale)}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Télécharger PDF
                </button>
                <button
                  onClick={() => printESC_POSReceipt(selectedSale)}
                  className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer Reçu
                </button>
                <button
                  onClick={() => openEditModal(selectedSale)}
                  disabled={
                    selectedSale.status === "voided" ||
                    selectedSale.status === "corrected"
                  }
                  className={`px-4 py-2 border rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    selectedSale.status === "voided" ||
                    selectedSale.status === "corrected"
                      ? "border-gray-300 text-gray-400 cursor-not-allowed"
                      : "border-yellow-300 text-yellow-600 hover:bg-yellow-50"
                  }`}
                >
                  <Edit className="w-4 h-4" />
                  Modifier la vente
                </button>
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

      {/* NEW: Edited Sale Details Modal */}
      {showEditedDetailsModal && selectedEditedSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Détails des modifications - {selectedEditedSale.saleId}
              </h3>
              <button
                onClick={() => setShowEditedDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Current Sale Info */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3 bg-blue-50 p-3 rounded-lg">
                  État actuel de la vente
                </h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client
                    </label>
                    <p className="text-sm text-gray-900">
                      {selectedEditedSale.customer.name} ({selectedEditedSale.customer.phone})
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total actuel
                    </label>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(selectedEditedSale.total)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Méthode de paiement
                    </label>
                    <p className="text-sm text-gray-900 capitalize">
                      {selectedEditedSale.paymentMethod}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Articles
                    </label>
                    <p className="text-sm text-gray-900">
                      {selectedEditedSale.items.length} article(s)
                    </p>
                  </div>
                </div>
              </div>

              {/* Edit History */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">
                  Historique des modifications
                </h4>
                <div className="space-y-4">
                  {selectedEditedSale.editHistory && selectedEditedSale.editHistory.length > 0 ? (
                    selectedEditedSale.editHistory.map((edit, index) => (
                      <div key={edit._id || index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h5 className="font-medium text-gray-900">
                              Modification #{selectedEditedSale.editHistory!.length - index}
                            </h5>
                            <p className="text-sm text-gray-600">
                              {formatDate(edit.editedAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              Par: {edit.editedBy}
                            </p>
                            <p className="text-sm text-gray-600">
                              Raison: {edit.reason}
                            </p>
                          </div>
                        </div>

                        {edit.changes && Object.keys(edit.changes).length > 0 && (
                          <div className="space-y-3">
                            <h6 className="font-medium text-gray-700 text-sm">Changements détaillés:</h6>
                            {Object.entries(edit.changes).map(([field, changeData]: [string, any]) => (
                              <div key={field} className="border-l-4 border-blue-500 pl-3">
                                <div className="font-medium text-gray-700 text-sm capitalize mb-2">
                                  {field.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                  <div className="bg-red-50 p-3 rounded border border-red-200">
                                    <div className="text-red-700 font-medium mb-1">Avant:</div>
                                    <div className="text-red-600 break-words">
                                      {typeof changeData.from === 'object' 
                                        ? JSON.stringify(changeData.from, null, 2)
                                        : String(changeData.from || 'N/A')
                                      }
                                    </div>
                                  </div>
                                  <div className="bg-green-50 p-3 rounded border border-green-200">
                                    <div className="text-green-700 font-medium mb-1">Après:</div>
                                    <div className="text-green-600 break-words">
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
                    <div className="text-center py-8 text-gray-500">
                      <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Aucun détail de modification disponible</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowEditedDetailsModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Sale Modal */}
      {showEditModal && editingSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Sale - {editingSale.saleId}
              </h3>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
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
                  Information sur le client
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
                      Numéro de téléphone
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

              {/* Payment Method */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">
                  Methode de payement
                </h4>
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
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                  <option value="other">Other</option>
                </select>
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
                      Refresh Products
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
                              Loading products...
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
                              placeholder="Product name"
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
                                  {product.name} -{" "}
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
                            Nombre de pièces{" "}
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
                  Raison de modification
                </h4>
                <textarea
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Veuillez indiquer une raison pour la modification de cette vente...."
                  className="w-full p-2 border rounded h-20"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleEditSale}
                  disabled={loading || editForm.items.length === 0}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Updating...
                    </>
                  ) : (
                    <>
                      <Edit className="w-4 h-4" /> Mettre à jour la vente
                    </>
                  )}
                </button>
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}