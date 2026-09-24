"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  FileText,
  Eye,
  Download,
  User,
  DollarSign,
  Edit,
  Trash2,
  RefreshCw,
  Printer,
  Calendar,
  ChevronLeft,
  ChevronRight,
  History,
  Shield,
  X,
} from "lucide-react";
import { Alert, EmptyState, LoadingState, MetricCard, PageHeader } from "../components/ui";
import jsPDF from "jspdf";
import RegionFilterPills from "../components/RegionFilterPills";
import type { RegionCodeFilter } from "../types";
import { printHtmlDocumentsSequentially } from "../services/printService";

interface EditHistoryEntry {
  editedBy: string;
  editedAt: string;
  changes: any;
  reason: string;
  _id?: string;
}

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
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    _id: string;
    username: string;
  };
  updatedBy?: string;
  editedBy?: string;
  editedAt?: string;
  editHistory?: EditHistoryEntry[];
  region?: string;
  regionCode?: string;
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

// Helper function to get date range for different timeframes
const getTimeframeParams = (
  timeframe: "day" | "week" | "month" | "year",
  selectedYear?: number,
  selectedDate?: string
) => {
  const params = new URLSearchParams();
  const kis = toKisanganiDate();

  switch (timeframe) {
    case "day":
      params.set("date", selectedDate || getTodayDate());
      break;

    case "week": {
      const weekStart = new Date(kis);
      const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
      weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
      params.set("from", weekStart.toISOString().split('T')[0]);
      params.set("to", getTodayDate());
      break;
    }

    case "month": {
      const y = kis.getUTCFullYear();
      const m = String(kis.getUTCMonth() + 1).padStart(2, '0');
      const lastDay = new Date(Date.UTC(y, kis.getUTCMonth() + 1, 0)).getUTCDate();
      params.set("from", `${y}-${m}-01`);
      params.set("to", `${y}-${m}-${String(lastDay).padStart(2, '0')}`);
      break;
    }

    case "year": {
      const year = selectedYear || kis.getUTCFullYear();
      params.set("year", year.toString());
      break;
    }
  }

  return params.toString();
};

export default function EntryHistory() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editForm, setEditForm] = useState({
    amount: 0,
    source: "",
    category: "",
    paymentMethod: "cash" as "cash" | "card" | "transfer" | "other",
    description: "",
    receivedFrom: { name: "", phone: "", email: "" },
    reason: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // User state for role checking
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Timeframe state
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month" | "year">("day");
  const [selectedYear, setSelectedYear] = useState<number>(toKisanganiDate().getUTCFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [initialLoad, setInitialLoad] = useState(true);
  const [timeframeDescription, setTimeframeDescription] = useState<string>("");

  // Edited entries filter state
  const [showEditedEntries, setShowEditedEntries] = useState(false);
  const [editedEntries, setEditedEntries] = useState<Entry[]>([]);
  const [selectedEditedEntry, setSelectedEditedEntry] = useState<Entry | null>(null);
  const [showEditedDetailsModal, setShowEditedDetailsModal] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [regionFilter, setRegionFilter] = useState<RegionCodeFilter>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ totalRecords: 0, totalPages: 1, currentPage: 1, limit: 50 });

  // Sources and categories (same as Entry.tsx)
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

  const categories = [
    "Revenue Ventes",
    "Dépôt Espèces",
    "Remboursement",
    "Prêt",
    "Investissement",
    "Revenue Divers",
    "Autre Catégorie"
  ];

  // Effect to automatically set to today's date when timeframe changes to "day"
  useEffect(() => {
    if (!initialLoad && timeframe === "day") {
      const today = getTodayDate();
      setSelectedDate(today);
    }
  }, [timeframe, initialLoad]);

  // Fetch current user on component mount
  useEffect(() => {
    fetchCurrentUser();
  }, []);

  // Fetch entries when timeframe or filters change
  useEffect(() => {
    if (currentUser === null) return;
    const timer = window.setTimeout(fetchEntries, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, selectedYear, selectedDate, showEditedEntries, currentUser, regionFilter, currentPage, searchTerm]);

  // Update edited entries when entries change
  useEffect(() => {
    updateEditedEntries();
  }, [entries]);

  // Fetch current user from API or localStorage
  const fetchCurrentUser = async () => {
    try {
      // Try to get user from localStorage first
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setCurrentUser(userData);
        setIsAdmin(userData.role === "admin" || userData.role === "administrator");
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
          setIsAdmin(userData.role === "admin" || userData.role === "administrator");
          localStorage.setItem("user", JSON.stringify(userData));
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      // Default to non-admin if can't fetch user
      setIsAdmin(false);
    }
  };

  const updateEditedEntries = () => {
    // Filter entries that have editHistory or editedBy field
    const edited = entries.filter(entry => 
      (entry.editHistory && entry.editHistory.length > 0) || entry.editedBy
    );

    // Sort by edit date (newest first)
    const sortedEditedEntries = edited.sort((a, b) => {
      const dateA = a.editedAt ? new Date(a.editedAt).getTime() : new Date(a.updatedAt).getTime();
      const dateB = b.editedAt ? new Date(b.editedAt).getTime() : new Date(b.updatedAt).getTime();
      return dateB - dateA;
    });

    setEditedEntries(sortedEditedEntries);
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      
      // Build query parameters based on timeframe
      const timeframeParams = getTimeframeParams(timeframe, selectedYear, selectedDate);
      
      // Add status filter for edited entries view
      const statusParam = showEditedEntries ? "&status=all" : "&status=active";
      const regionParam = regionFilter ? `&region=${regionFilter}` : "";
      const searchParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : "";
      const editedParam = showEditedEntries ? "&edited=true" : "";

      const url = `${import.meta.env.VITE_API_URL}/entries?${timeframeParams}${statusParam}${regionParam}${searchParam}${editedParam}&page=${currentPage}&limit=50`;
      
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        
        if (data.success && data.data) {
          // Set entries
          const fetchedEntries: Entry[] = data.data;
          setEntries(fetchedEntries);
          
          // Set timeframe description
          setTimeframeDescription(data.timeframe?.description || "");
          
          // Set summary data
          if (data.summary) {
            setSummary(data.summary);
          }
          setPagination(data.pagination || { totalRecords: fetchedEntries.length, totalPages: 1, currentPage: 1, limit: 50 });
          
        } else {
          console.error("Unexpected API response format:", data);
          setEntries([]);
          setSummary(null);
          setError("Format de réponse API inattendu");
        }
      } else {
        const errorData = await res.json().catch(() => ({ error: "Erreur serveur" }));
        console.error("Entries fetch failed:", res.status, errorData);
        setError(errorData.error || `Échec du chargement (${res.status})`);
        setEntries([]);
      }
    } catch (error) {
      console.error("Error loading entries:", error);
      setError("Échec de la connexion au serveur");
      setEntries([]);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  // Get available years from API or default
  const getAvailableYears = (): number[] => {
    // Start with current year
    const currentYear = toKisanganiDate().getUTCFullYear();
    const years = [currentYear];
    
    // Add previous years (up to 5 years back)
    for (let i = 1; i <= 5; i++) {
      years.push(currentYear - i);
    }
    
    return years.sort((a, b) => b - a);
  };

  const navigateYear = (direction: 'prev' | 'next') => {
    const years = getAvailableYears();
    const currentIndex = years.indexOf(selectedYear);
    
    if (direction === 'prev' && currentIndex < years.length - 1) {
      setSelectedYear(years[currentIndex + 1]);
    } else if (direction === 'next' && currentIndex > 0) {
      setSelectedYear(years[currentIndex - 1]);
    }
  };

  const getTimeframeLabel = () => {
    if (timeframeDescription) {
      return timeframeDescription;
    }
    
    switch (timeframe) {
      case "day":
        if (selectedDate) {
          const date = new Date(selectedDate);
          return date.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        return "Aujourd'hui";
      case "week":
        return "Cette Semaine";
      case "month":
        return "Ce Mois";
      case "year":
        return `Année ${selectedYear}`;
      default:
        return "Cette Semaine";
    }
  };

  const handleTimeframeChange = (period: "day" | "week" | "month" | "year") => {
    setCurrentPage(1);
    setTimeframe(period);
    
    if (period === "year") {
      const years = getAvailableYears();
      setSelectedYear(years[0] || toKisanganiDate().getUTCFullYear());
    }
  };

  // Filter entries based on search term
  const filteredEntries = useMemo(() => {
    return (showEditedEntries ? editedEntries : entries).filter(entry =>
      entry.entryId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.receivedFrom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.receivedFrom.phone.includes(searchTerm) ||
      entry.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.createdBy?.username && entry.createdBy.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [showEditedEntries, editedEntries, entries, searchTerm]);

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

  // Function to view edited entry details
  const viewEditedEntryDetails = (entry: Entry) => {
    setSelectedEditedEntry(entry);
    setShowEditedDetailsModal(true);
  };

  // Function to render change comparison
  const renderChangeComparison = (entry: Entry) => {
    if (!entry.editHistory || entry.editHistory.length === 0) return null;

    const latestEdit = entry.editHistory[entry.editHistory.length - 1];
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
            <span className="font-medium">{latestEdit.editedBy || entry.editedBy || "Unknown"}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-yellow-700">Date de modification:</span>
            <span className="font-medium">{formatDate(latestEdit.editedAt || entry.editedAt || entry.updatedAt)}</span>
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

  // Print function for entry receipt
  const printEntryReceipt = (entry: Entry) => {
    const html = `
<html>
  <head>
    <meta charset="utf-8">
    <title>Reçu d'Entrée d'Argent</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Courier New', Courier, monospace; 
        margin: 0; padding: 0; 
        font-size: 13px; font-weight: normal; line-height: 1.2;
        width: 72mm; background-color: white;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
        display: flex; justify-content: center;
      }
      .receipt-container { width: 70mm; margin: 0 auto; padding: 0.5mm; border: none; text-align: center; }
      .header { text-align: center; margin-bottom: 1mm; padding-bottom: 1mm; border-bottom: 2px double #000; }
      .shop-name { font-size: 15px; font-weight: bold; margin-bottom: 0.5mm; text-transform: uppercase; }
      .shop-details { font-size: 11px; margin-bottom: 0.3mm; line-height: 1; font-weight: bold; }
      .receipt-info { margin: 1mm 0; padding: 1mm; background-color: #f8f8f8; border-left: 3px solid #000; }
      .receipt-title { font-size: 13px; font-weight: bold; margin: 1mm 0; text-transform: uppercase; background-color: #000; color: white; padding: 1mm; border-radius: 2px; }
      .entry-badge { background-color: #000; color: white; padding: 2mm; font-weight: bold; text-align: center; margin: 1mm 0; font-size: 14px; border-radius: 3px; }
      .details-section { margin: 1mm 0; padding: 1mm; background-color: #fafafa; border: 1px solid #eee; }
      .detail-row { display: flex; justify-content: space-between; margin-bottom: 0.5mm; padding: 0 1mm; border-bottom: 1px dotted #ddd; }
      .detail-label { text-align: left; font-weight: bold; font-size: 12px; flex: 1; }
      .detail-value { text-align: right; font-weight: bold; font-size: 12px; flex: 1; }
      .amount-section { font-weight: bold; margin-top: 1mm; padding: 1mm; background-color: #f0f0f0; border: 1px solid #ddd; border-radius: 3px; }
      .amount-row { display: flex; justify-content: space-between; margin-bottom: 0.3mm; font-size: 13px; padding: 0 1mm; }
      .payment-method { text-transform: uppercase; font-weight: bold; font-size: 13px; color: #000; }
      .footer { text-align: center; margin-top: 1mm; font-size: 11px; font-weight: bold; padding: 1mm; background-color: #f8f8f8; border-top: 1px dashed #000; }
      .agent-info { margin-top: 1mm; text-align: center; font-weight: bold; font-size: 12px; padding: 1mm; background-color: #e8e8e8; border: 1px solid #ccc; border-radius: 2px; }
      .sender-info { margin: 1mm 0; padding: 1mm; font-weight: bold; text-align: center; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; }
      .sender-field { margin-bottom: 0.3mm; font-size: 12px; }
      .cut-line { text-align: center; margin: 1mm 0; font-weight: bold; font-size: 11px; color: #000; letter-spacing: 1px; }
      .thank-you { font-weight: bold; margin: 0.5mm 0; font-size: 12px; }
      .warning { font-size: 10px; color: #000; margin: 0.3mm 0; font-weight: bold; }
      .description { margin: 1mm 0; padding: 1mm; background-color: #f5f5f5; border-left: 3px solid #ccc; font-size: 11px; font-weight: bold; border-radius: 2px; }
      .section-divider { height: 2px; background: linear-gradient(to right, transparent, #000, transparent); margin: 1mm 0; }
      @media print {
        @page { margin: 0 !important; size: 72mm auto !important; }
        body { margin: 0 !important; padding: 0 !important; width: 72mm !important; min-height: 0 !important; font-size: 13px !important; background: white !important; font-weight: normal !important; height: auto !important; overflow: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; display: flex !important; justify-content: center !important; }
        .receipt-container { border: none !important; box-shadow: none !important; margin: 0 auto !important; padding: 0.5mm !important; width: 70mm !important; page-break-after: avoid !important; page-break-inside: avoid !important; }
        .cut-line { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="receipt-container">
      <div class="header">
        <div class="shop-name"><strong>Boutique C'EST DIEU QUI PARTAGE</strong></div>
        <div class="shop-details"><strong>Av du 1er Janvier N°13, C. Makiso, Kisangani</strong></div>
        <div class="shop-details">TEL: <strong>0839336794</strong></div>
        <div class="shop-details"><strong>RCCM/KIS : 22-A-267</strong></div>
      </div>
      
      <div class="section-divider"></div>
      
      <div class="receipt-info">
        <div class="shop-details">DATE: <strong>${formatDate(entry.createdAt)}</strong></div>
        <div class="shop-details">REÇU #: <strong>${entry.entryId}</strong></div>
      </div>
      
      <div class="entry-badge">
        <strong>💰 ENTRÉE D'ARGENT CONFIRMÉE 💰</strong>
      </div>
      
      <div class="sender-info">
        <div class="sender-field">REÇU DE: <strong>${entry.receivedFrom.name.toUpperCase()}</strong></div>
        <div class="sender-field">TÉLÉPHONE: <strong>${entry.receivedFrom.phone}</strong></div>
        ${entry.receivedFrom.email ? `<div class="sender-field">EMAIL: <strong>${entry.receivedFrom.email}</strong></div>` : ""}
      </div>
      
      ${entry.description ? `<div class="description"><strong>DESCRIPTION:</strong> <strong>${entry.description}</strong></div>` : ''}
      
      <div class="receipt-title">DÉTAILS DE L'ENTRÉE</div>
      
      <div class="details-section">
        <div class="detail-row">
          <div class="detail-label"><strong>SOURCE:</strong></div>
          <div class="detail-value"><strong>${entry.source}</strong></div>
        </div>
        <div class="detail-row">
          <div class="detail-label"><strong>CATÉGORIE:</strong></div>
          <div class="detail-value"><strong>${entry.category}</strong></div>
        </div>
        <div class="detail-row">
          <div class="detail-label"><strong>MÉTHODE PAIEMENT:</strong></div>
          <div class="detail-value"><strong>${entry.paymentMethod.toUpperCase()}</strong></div>
        </div>
      </div>
      
      <div class="amount-section">
        <div class="amount-row">
          <div><strong>MONTANT REÇU:</strong></div>
          <div><strong>$${entry.amount.toFixed(2)}</strong></div>
        </div>
      </div>
      
      <div class="agent-info">
        Enregistré par: <strong>${(entry.createdBy?.username || 'Non spécifié').toUpperCase()}</strong>
      </div>
      
      <div class="footer">
        <div class="thank-you"><strong>ENTRÉE ENREGISTRÉE AVEC SUCCÈS !</strong></div>
        <div class="warning"><strong>Conserver ce reçu comme preuve</strong></div>
        <div class="warning"><strong>Merci pour votre confiance</strong></div>
        <div class="thank-you"><strong>À BIENTÔT !</strong></div>
      </div>

    </div>
  </body>
</html>
`;
    void printHtmlDocumentsSequentially([html]).catch((printError: unknown) => {
      setError(printError instanceof Error ? printError.message : "Échec de l'impression.");
    });
  };

  const generateEntryPDF = (entry: Entry) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text("Boutique C'EST DIEU QUI PARTAGE", 105, 10, { align: "center" });
    doc.setFontSize(10);
    doc.text("", 105, 15, { align: "center" });
    doc.setFontSize(12);
    doc.text("RCCM/KIS : 22-A-267", 105, 20, { align: "center" });
    doc.text("Tél: +243 839 336 794", 105, 25, { align: "center" });
    doc.text("Av du 1er Janvier N°13, C. Makiso, Kisangani", 105, 30, { align: "center" });

    doc.setFontSize(16);
    doc.text("Reçu d'entrée d'argent", 105, 35, { align: "center" });

    // Entry Info
    doc.setFontSize(10);
    doc.text(`Date: ${formatDate(entry.createdAt)}`, 20, 45);
    doc.text(`Reçu #: ${entry.entryId}`, 20, 52);
    doc.text(`Méthode de paiement: ${entry.paymentMethod.toUpperCase()}`, 20, 59);
    doc.text(`Statut: ${entry.status.toUpperCase()}`, 20, 66);

    // Created By Info
    doc.text(`Enregistré par: ${entry.createdBy?.username || "Non spécifié"}`, 20, 73);

    // Received From Info
    doc.setFontSize(12);
    doc.text("Information sur l'expéditeur:", 20, 85);
    doc.setFontSize(10);
    doc.text(`Nom: ${entry.receivedFrom.name}`, 20, 92);
    doc.text(`Téléphone: ${entry.receivedFrom.phone}`, 20, 99);
    if (entry.receivedFrom.email) {
      doc.text(`Email: ${entry.receivedFrom.email}`, 20, 106);
    }

    // Entry Details
    doc.setFontSize(12);
    doc.text("Détails de l'entrée:", 20, 113);
    doc.setFontSize(10);
    
    let yPos = 120;
    doc.text(`Source: ${entry.source}`, 20, yPos); yPos += 7;
    doc.text(`Catégorie: ${entry.category}`, 20, yPos); yPos += 7;
    doc.text(`Montant: ${formatCurrency(entry.amount)}`, 20, yPos); yPos += 7;
    
    if (entry.description) {
      yPos += 3;
      doc.text(`Description: ${entry.description}`, 20, yPos); yPos += 10;
    }

    // Footer
    doc.setFontSize(10);
    doc.text("Entrée enregistrée avec succès !", 105, yPos + 20, { align: "center" });
    doc.text("Conserver ce reçu comme preuve.", 105, yPos + 30, { align: "center" });
    doc.text("Merci pour votre confiance", 105, yPos + 40, { align: "center" });

    doc.save(`entry-${entry.entryId}.pdf`);
  };

  const viewEntryDetails = (entry: Entry) => {
    setSelectedEntry(entry);
    setShowModal(true);
    setError(null);
  };

  const openEditModal = async (entry: Entry) => {
    if (entry.status === "deleted") {
      setError("Impossible de modifier une entrée supprimée");
      return;
    }

    setEditingEntry(entry);
    setEditForm({
      amount: entry.amount,
      source: entry.source,
      category: entry.category,
      paymentMethod: entry.paymentMethod as "cash" | "card" | "transfer" | "other",
      description: entry.description,
      receivedFrom: { ...entry.receivedFrom },
      reason: "",
    });
    setShowEditModal(true);
    setError(null);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingEntry(null);
    setEditForm({
      amount: 0,
      source: "",
      category: "",
      paymentMethod: "cash",
      description: "",
      receivedFrom: { name: "", phone: "", email: "" },
      reason: "",
    });
    setError(null);
  };

  const handleEditEntry = async () => {
    if (!editingEntry) return;

    if (!editForm.receivedFrom.name || !editForm.receivedFrom.phone) {
      setError("Le nom et le téléphone de l'expéditeur sont requis");
      return;
    }

    if (!editForm.reason) {
      setError("Veuillez fournir une raison pour la modification de cette entrée");
      return;
    }

    try {
      setLoading(true);

      const updateData = {
        amount: editForm.amount,
        source: editForm.source,
        category: editForm.category,
        paymentMethod: editForm.paymentMethod,
        description: editForm.description,
        receivedFrom: editForm.receivedFrom,
        reason: editForm.reason,
      };


      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/entries/${editingEntry._id}`,
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
        setMessage("Entrée mise à jour avec succès");
        await fetchEntries();
        closeEditModal();
      } else {
        const errorData = await response.json();
        console.error("Update error:", errorData);
        setError(errorData.error || `Échec de la mise à jour: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error updating entry:", error);
      setError("Échec de la mise à jour de l'entrée. Veuillez vérifier votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entry: Entry) => {
    if (entry.status === "deleted") {
      setError("L'entrée est déjà supprimée");
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'entrée ${entry.entryId}? Cette action ne peut pas être annulée.`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/entries/${entry._id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );

      if (response.ok) {
        setMessage("Entrée supprimée avec succès");
        await fetchEntries();
        setShowModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Échec de la suppression de l'entrée");
      }
    } catch (error) {
      setError("Échec de la suppression de l'entrée");
      console.error("Error deleting entry:", error);
    } finally {
      setLoading(false);
    }
  };

  // Display-only payment labels; stored values are untouched.
  const entryPaymentLabel: Record<string, string> = { cash: "Espèces", card: "Carte", transfer: "Transfert", other: "Autre", mpesa: "Mobile money", bank: "Banque" };

  // Summary statistics display component - ONLY VISIBLE TO ADMINS
  const SummaryStats = () => {
    if (!summary || !isAdmin) return null;

    return (
      <section aria-labelledby="entry-summary-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="entry-summary-title" className="ui-kicker flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Statistiques des entrées (vue administrateur)
          </h2>
          {currentUser && (
            <span className="ui-badge ui-badge-neutral max-w-full truncate">
              Connecté : {currentUser.name || currentUser.username} ({currentUser.role})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Total des entrées" value={summary.totalRecords} icon={FileText} />
          <MetricCard label="Montant total" value={formatCurrency(summary.totalAmount)} icon={DollarSign} tone="success" />
          <MetricCard label="Entrées actives" value={summary.active?.count || 0} hint={formatCurrency(summary.active?.amount || 0)} icon={FileText} />
          <MetricCard label="Méthodes de paiement" value={Object.keys(summary.paymentMethods || {}).length} icon={DollarSign} />
        </div>

        {(summary.paymentMethods && Object.keys(summary.paymentMethods).length > 0) || (summary.sources && Object.keys(summary.sources).length > 0) ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Detailed stats row */}
            {summary.paymentMethods && Object.keys(summary.paymentMethods).length > 0 && (
              <div className="ui-card p-4">
                <h3 className="ui-kicker mb-3">Par méthode de paiement</h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {Object.entries(summary.paymentMethods).map(([method, data]: [string, any]) => (
                    <li key={method} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-slate-700">{entryPaymentLabel[method] || method}</span>
                      <span className="text-right tabular-nums">
                        <span className="font-semibold text-slate-900">{formatCurrency(data.amount)}</span>
                        <span className="ml-2 text-xs text-slate-500">{data.count} entrée(s)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sources summary */}
            {summary.sources && Object.keys(summary.sources).length > 0 && (
              <div className="ui-card p-4">
                <h3 className="ui-kicker mb-3">Sources principales</h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {Object.entries(summary.sources)
                    .sort(([, a], [, b]) => (b as any).amount - (a as any).amount)
                    .slice(0, 3)
                    .map(([source, data]: [string, any]) => (
                      <li key={source} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate text-slate-700">{source}</span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="font-semibold text-emerald-700">{formatCurrency(data.amount)}</span>
                          <span className="ml-2 text-xs text-slate-500">{data.count} entrées</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="ui-page ui-page-wide">
      <PageHeader
        eyebrow="Caisse"
        title="Historique des entrées d'argent"
        description="Consultez, imprimez et corrigez les entrées de caisse enregistrées."
        actions={
          <button type="button" onClick={fetchEntries} disabled={loading} className="ui-btn ui-btn-secondary">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>
        }
      />

      {/* Toolbar */}
      <section className="ui-card" aria-label="Recherche et filtres">
        <div className="flex flex-col gap-3 p-4 sm:p-5 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="entry-search" className="sr-only">Rechercher une entrée</label>
            <Search className="ui-field-icon" aria-hidden="true" />
            <input
              id="entry-search"
              type="search"
              placeholder="Rechercher une entrée…"
              className="ui-input ui-input-icon"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Region Filter */}
            <RegionFilterPills value={regionFilter} onChange={(value) => { setRegionFilter(value); setCurrentPage(1); }} />

            {/* Edited Entries Filter Button */}
            <button
              type="button"
              onClick={() => { setShowEditedEntries(!showEditedEntries); setCurrentPage(1); }}
              aria-pressed={showEditedEntries}
              className={`ui-btn ${showEditedEntries ? "ui-btn-primary" : "ui-btn-secondary"}`}
            >
              <History />
              {showEditedEntries ? "Toutes les entrées" : "Entrées modifiées"}
              {showEditedEntries && (
                <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums">{editedEntries.length}</span>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">
              <span className="font-medium text-slate-900">{showEditedEntries ? "Entrées modifiées" : "Toutes les entrées"}</span>
              {" · "}<span className="capitalize">{getTimeframeLabel()}</span>
            </span>
          </p>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="ui-segmented w-full sm:w-auto" role="group" aria-label="Période">
              {(["day", "week", "month", "year"] as const).map((period) => (
                <button
                  type="button"
                  key={period}
                  onClick={() => handleTimeframeChange(period)}
                  aria-pressed={timeframe === period}
                  className="ui-segment"
                >
                  {period === "day" && "Jour"}
                  {period === "week" && "Semaine"}
                  {period === "month" && "Mois"}
                  {period === "year" && "Année"}
                </button>
              ))}
            </div>

            {/* Date Picker for Day View */}
            {timeframe === "day" && (
              <div className="relative sm:w-44">
                <label htmlFor="date-picker" className="sr-only">Date</label>
                <input
                  id="date-picker"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="ui-input"
                />
              </div>
            )}

            {timeframe === "year" && (
              <div className="flex min-h-11 items-center justify-between rounded-lg border border-slate-300 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => navigateYear('prev')}
                  disabled={getAvailableYears().indexOf(selectedYear) === getAvailableYears().length - 1}
                  className="ui-icon-btn"
                  aria-label="Année précédente"
                >
                  <ChevronLeft />
                </button>
                <span className="min-w-16 px-2 text-center text-sm font-semibold tabular-nums text-slate-900">{selectedYear}</span>
                <button
                  type="button"
                  onClick={() => navigateYear('next')}
                  disabled={getAvailableYears().indexOf(selectedYear) === 0}
                  className="ui-icon-btn"
                  aria-label="Année suivante"
                >
                  <ChevronRight />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Show summary statistics - Admin only */}
      <SummaryStats />

      {message && <Alert tone="success" onDismiss={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      <section className="ui-card overflow-hidden" aria-labelledby="entries-table-title">
        <div className="ui-card-header">
          <h2 id="entries-table-title" className="ui-section-title flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-700" />
            {showEditedEntries ? "Entrées modifiées" : "Entrées d'argent"}
            <span className="ui-badge ui-badge-neutral tabular-nums">{pagination.totalRecords}</span>
          </h2>
        </div>

        <div className="ui-table-wrap">
          {loading ? (
            <LoadingState label="Chargement des entrées…" />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={showEditedEntries ? "Aucune entrée modifiée trouvée" : "Aucune entrée trouvée"}
              description="Aucune entrée ne correspond à la période et aux filtres sélectionnés."
            />
          ) : (
            <table className="ui-table min-w-full">
              <thead>
                <tr>
                  <th scope="col">Entrée</th>
                  <th scope="col">Expéditeur</th>
                  <th scope="col">Source · Catégorie</th>
                  <th scope="col" className="text-right">Montant</th>
                  <th scope="col">Paiement</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Date</th>
                  {showEditedEntries && <th scope="col">Dernière modification</th>}
                  <th scope="col" className="ui-sticky-end text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry._id}>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-900">{entry.entryId}</span>
                        {entry.regionCode && <span className="ui-tag">{entry.regionCode}</span>}
                      </div>
                    </td>
                    <td className="min-w-[10rem]">
                      <div className="flex flex-col">
                        <span className="text-slate-900">{entry.receivedFrom.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{entry.receivedFrom.phone}</span>
                      </div>
                    </td>
                    <td className="min-w-[9rem]">
                      <div className="flex flex-col">
                        <span className="text-slate-900">{entry.source}</span>
                        <span className="text-xs text-slate-500">{entry.category}</span>
                      </div>
                    </td>
                    <td className="ui-num whitespace-nowrap font-semibold text-emerald-700">{formatCurrency(entry.amount)}</td>
                    <td>
                      <span className="ui-badge ui-badge-neutral">{entryPaymentLabel[entry.paymentMethod] || entry.paymentMethod}</span>
                    </td>
                    <td>
                      <span className={`ui-badge ${entry.status === "active" ? "ui-badge-success" : "ui-badge-danger"}`}>
                        {entry.status === "active" ? "Actif" : "Supprimé"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{formatDate(entry.createdAt)}</td>
                    {showEditedEntries && (
                      <td className="whitespace-nowrap text-slate-500">
                        {entry.editedAt ? formatDate(entry.editedAt) : "N/A"}
                      </td>
                    )}
                    <td className="ui-sticky-end">
                      <div className="ui-row-actions">
                        {showEditedEntries ? (
                          <button
                            type="button"
                            onClick={() => viewEditedEntryDetails(entry)}
                            className="ui-icon-btn ui-icon-btn-primary"
                            title="Voir les détails des modifications"
                            aria-label={`Voir les modifications de ${entry.entryId}`}
                          >
                            <History />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => viewEntryDetails(entry)}
                            className="ui-icon-btn ui-icon-btn-primary"
                            title="Voir les détails"
                            aria-label={`Voir l'entrée ${entry.entryId}`}
                          >
                            <Eye />
                          </button>
                        )}
                        {!showEditedEntries && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(entry)}
                              disabled={entry.status === "deleted"}
                              className="ui-icon-btn ui-icon-btn-warning"
                              title="Modifier l'entrée"
                              aria-label={`Modifier l'entrée ${entry.entryId}`}
                            >
                              <Edit />
                            </button>
                            <button
                              type="button"
                              onClick={() => generateEntryPDF(entry)}
                              className="ui-icon-btn ui-icon-btn-success"
                              title="Télécharger PDF"
                              aria-label={`Télécharger le PDF de ${entry.entryId}`}
                            >
                              <Download />
                            </button>
                            <button
                              type="button"
                              onClick={() => printEntryReceipt(entry)}
                              className="ui-icon-btn"
                              title="Imprimer le reçu"
                              aria-label={`Imprimer le reçu de ${entry.entryId}`}
                            >
                              <Printer />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry)}
                              disabled={entry.status === "deleted"}
                              className="ui-icon-btn ui-icon-btn-danger"
                              title="Supprimer l'entrée"
                              aria-label={`Supprimer l'entrée ${entry.entryId}`}
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
            <span className="text-sm tabular-nums text-slate-600">Page {pagination.currentPage} sur {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Précédent</button>
              <button type="button" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none">Suivant</button>
            </div>
          </div>
        )}
      </section>

      {/* Entry Details Modal */}
      {showModal && selectedEntry && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="entry-details-title">
          <div className="ui-dialog max-w-2xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="entry-details-title" className="ui-dialog-title">Détails de l'entrée</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{selectedEntry.entryId}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              <div className="ui-muted-panel">
                <p className="text-xs font-medium text-slate-500">Montant</p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-700">{formatCurrency(selectedEntry.amount)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-xs text-slate-500">Source</dt><dd className="text-slate-900">{selectedEntry.source}</dd></div>
                  <div><dt className="text-xs text-slate-500">Catégorie</dt><dd className="text-slate-900">{selectedEntry.category}</dd></div>
                </dl>
                {selectedEntry.description && (
                  <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-700">{selectedEntry.description}</p>
                )}
              </div>

              {/* Entry Info */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Date</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{formatDate(selectedEntry.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Statut</dt>
                  <dd className="mt-1">
                    <span className={`ui-badge ${selectedEntry.status === "active" ? "ui-badge-success" : "ui-badge-danger"}`}>
                      {selectedEntry.status === "active" ? "Actif" : "Supprimé"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Méthode de paiement</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{entryPaymentLabel[selectedEntry.paymentMethod] || selectedEntry.paymentMethod}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Enregistré par</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{selectedEntry.createdBy?.username || "Non spécifié"}</dd>
                </div>
                {selectedEntry.editedBy && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-slate-500">Dernière modification</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">
                      Par {selectedEntry.editedBy} le{" "}
                      {selectedEntry.editedAt
                        ? formatDate(selectedEntry.editedAt)
                        : "N/A"}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Received From Info */}
              <div>
                <h4 className="ui-kicker mb-2 flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Expéditeur</h4>
                <dl className="ui-muted-panel grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Nom</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-900">{selectedEntry.receivedFrom.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Téléphone</dt>
                    <dd className="mt-0.5 text-sm tabular-nums text-slate-900">{selectedEntry.receivedFrom.phone}</dd>
                  </div>
                  {selectedEntry.receivedFrom.email && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs font-medium text-slate-500">Email</dt>
                      <dd className="mt-0.5 break-words text-sm text-slate-900">{selectedEntry.receivedFrom.email}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Show edit history if available */}
              {selectedEntry.editHistory && selectedEntry.editHistory.length > 0 && (
                renderChangeComparison(selectedEntry)
              )}
            </div>

            {/* Actions */}
            <div className="ui-dialog-footer">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn ui-btn-ghost">
                Fermer
              </button>
              <button
                type="button"
                onClick={() => openEditModal(selectedEntry)}
                disabled={selectedEntry.status === "deleted"}
                className="ui-btn ui-btn-secondary"
              >
                <Edit />
                Modifier
              </button>
              <button type="button" onClick={() => generateEntryPDF(selectedEntry)} className="ui-btn ui-btn-secondary">
                <Download />
                Télécharger PDF
              </button>
              <button type="button" onClick={() => printEntryReceipt(selectedEntry)} className="ui-btn ui-btn-primary">
                <Printer />
                Imprimer le reçu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edited Entry Details Modal */}
      {showEditedDetailsModal && selectedEditedEntry && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edited-entry-title">
          <div className="ui-dialog max-w-3xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="edited-entry-title" className="ui-dialog-title">Détails des modifications</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{selectedEditedEntry.entryId}</p>
              </div>
              <button type="button" onClick={() => setShowEditedDetailsModal(false)} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              {/* Current Entry Info */}
              <div>
                <h4 className="ui-kicker mb-2">État actuel de l'entrée</h4>
                <dl className="ui-muted-panel grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">Expéditeur</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-900">
                      {selectedEditedEntry.receivedFrom.name} ({selectedEditedEntry.receivedFrom.phone})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Montant actuel</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(selectedEditedEntry.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Source</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{selectedEditedEntry.source}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Catégorie</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{selectedEditedEntry.category}</dd>
                  </div>
                </dl>
              </div>

              {/* Edit History */}
              <div>
                <h4 className="ui-kicker mb-2">Historique des modifications</h4>
                <div className="space-y-3">
                  {selectedEditedEntry.editHistory && selectedEditedEntry.editHistory.length > 0 ? (
                    selectedEditedEntry.editHistory.map((edit, index) => (
                      <div key={edit._id || index} className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-900">
                              Modification #{selectedEditedEntry.editHistory!.length - index}
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

      {/* Edit Entry Modal */}
      {showEditModal && editingEntry && (
        <div className="ui-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-entry-title">
          <div className="ui-dialog max-w-3xl">
            <div className="ui-dialog-header">
              <div className="min-w-0">
                <h3 id="edit-entry-title" className="ui-dialog-title">Modifier l'entrée</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{editingEntry.entryId}</p>
              </div>
              <button type="button" onClick={closeEditModal} className="ui-icon-btn -mr-2 -mt-1" aria-label="Fermer">
                <X />
              </button>
            </div>

            <div className="ui-dialog-body space-y-5">
              {error && <Alert tone="danger">{error}</Alert>}

              {/* Entry Information */}
              <fieldset>
                <legend className="ui-kicker mb-3">Entrée</legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="edit-entry-amount" className="ui-label">Montant (USD) <span className="ui-required">*</span></label>
                    <input
                      id="edit-entry-amount"
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          amount: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="ui-input tabular-nums"
                      inputMode="decimal"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-entry-payment" className="ui-label">Méthode de paiement <span className="ui-required">*</span></label>
                    <select
                      id="edit-entry-payment"
                      value={editForm.paymentMethod}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value as "cash" | "card" | "transfer" | "other",
                        }))
                      }
                      className="ui-input"
                      required
                    >
                      <option value="cash">Espèces</option>
                      <option value="card">Carte</option>
                      <option value="transfer">Transfert</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-entry-source" className="ui-label">Source <span className="ui-required">*</span></label>
                    <select
                      id="edit-entry-source"
                      value={editForm.source}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          source: e.target.value,
                        }))
                      }
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
                    <label htmlFor="edit-entry-category" className="ui-label">Catégorie <span className="ui-required">*</span></label>
                    <select
                      id="edit-entry-category"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          category: e.target.value,
                        }))
                      }
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
                  <div className="md:col-span-2">
                    <label htmlFor="edit-entry-description" className="ui-label">Description</label>
                    <textarea
                      id="edit-entry-description"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Description de l'entrée d'argent…"
                      className="ui-input min-h-20"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Received From Information */}
              <fieldset>
                <legend className="ui-kicker mb-3">Expéditeur</legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="edit-entry-name" className="ui-label">Nom <span className="ui-required">*</span></label>
                    <input
                      id="edit-entry-name"
                      type="text"
                      value={editForm.receivedFrom.name}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          receivedFrom: { ...prev.receivedFrom, name: e.target.value },
                        }))
                      }
                      className="ui-input"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-entry-phone" className="ui-label">Téléphone <span className="ui-required">*</span></label>
                    <input
                      id="edit-entry-phone"
                      type="tel"
                      value={editForm.receivedFrom.phone}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          receivedFrom: { ...prev.receivedFrom, phone: e.target.value },
                        }))
                      }
                      className="ui-input"
                      inputMode="tel"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="edit-entry-email" className="ui-label">Email</label>
                    <input
                      id="edit-entry-email"
                      type="email"
                      value={editForm.receivedFrom.email}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          receivedFrom: { ...prev.receivedFrom, email: e.target.value },
                        }))
                      }
                      className="ui-input"
                      inputMode="email"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Edit Reason */}
              <div>
                <label htmlFor="edit-entry-reason" className="ui-label">Raison de la modification <span className="ui-required">*</span></label>
                <textarea
                  id="edit-entry-reason"
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Veuillez indiquer une raison pour la modification de cette entrée…"
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
                onClick={handleEditEntry}
                disabled={loading}
                className="ui-btn ui-btn-primary"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" /> Mise à jour…
                  </>
                ) : (
                  <>
                    <Edit /> Mettre à jour l'entrée
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
