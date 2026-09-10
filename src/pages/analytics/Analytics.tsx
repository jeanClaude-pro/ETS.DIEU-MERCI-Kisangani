/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Package,
  ArrowUp,
  ArrowDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Calculator,
  Shield,
  FileText,
  RefreshCw,
  Download,
} from "lucide-react";
import jsPDF from "jspdf";
import RegionFilterPills from "../../components/RegionFilterPills";
import type { RegionCodeFilter } from "../../types";


interface AnalyticsData {
  totalSales: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  totalValidatedExpenses: number;
  totalEntries: number;
  netRevenue: number;
  salesByDay: {
    date: string;
    dayName: string;
    sales: number;
    revenue: number;
  }[];
  salesByWeek: {
    week: string;
    startDate: string;
    endDate: string;
    sales: number;
    revenue: number;
  }[];
  salesByMonth: {
    month: string;
    monthName: string;
    sales: number;
    revenue: number;
  }[];
  salesByYear: {
    year: string;
    months: {
      month: string;
      monthName: string;
      sales: number;
      revenue: number;
    }[];
  }[];
  topProducts: { name: string; regionCode?: string; quantity: number; revenue: number }[];
  topCustomers: { name: string; purchases: number; totalSpent: number }[];
  recentTrends: {
    salesGrowth: number;
    revenueGrowth: number;
    customerGrowth: number;
  };
}

interface TimeframeData {
  description: string;
  start: string;
  end: string;
}

const serverUrl = import.meta.env.VITE_API_URL;

// Helper function to get today's date in correct format
const getTodayDate = (): string => {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

// Helper function to get user role from localStorage
const getUserRole = (): string => {
  if (typeof window === "undefined") return "user";

  try {
    const userData = localStorage.getItem("user");
    if (userData) {
      const user = JSON.parse(userData);
      return user.role || "user";
    }
  } catch (error) {
    console.error("Error parsing user data:", error);
  }

  return "user";
};

// Check if user is admin
const isAdmin = (): boolean => {
  return getUserRole() === "admin";
};

// Check if user should see only today's data (non-admin)
const shouldSeeOnlyTodayData = (): boolean => {
  return !isAdmin();
};

// Helper function to get headers
const getHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Helper function to get timeframe parameters based on selection
const getTimeframeParams = (
  timeframe: "day" | "week" | "month" | "year", 
  selectedYear?: number, 
  selectedDate?: string
) => {
  const params = new URLSearchParams();
  const today = new Date(`${getTodayDate()}T12:00:00.000Z`);
  
  switch (timeframe) {
    case "day":
      params.set("date", selectedDate || getTodayDate());
      break;
      
    case "week": {
      const weekStart = new Date(today);
      const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
      weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
      params.set("from", weekStart.toISOString().split('T')[0]);
      params.set("to", today.toISOString().split('T')[0]);
      break;
    }
      
    case "month": {
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      params.set("from", `${year}-${String(month).padStart(2, "0")}-01`);
      params.set("to", `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
      break;
    }
      
    case "year": {
      const year = selectedYear || today.getUTCFullYear();
      params.set("year", year.toString());
      break;
    }
  }
  
  return params.toString();
};

type RegionFilter = RegionCodeFilter;


export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month" | "year">(
    "day"
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    Number(getTodayDate().slice(0, 4))
  );
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [timeframeData, setTimeframeData] = useState<TimeframeData | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("");
  const [reservationsStats, setReservationsStats] = useState<{ count: number; value: number }>({ count: 0, value: 0 });

  useEffect(() => {
    if (shouldSeeOnlyTodayData() && timeframe !== "day") {
      setTimeframe("day");
      setSelectedDate(getTodayDate());
    }
  }, [timeframe]);

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, selectedYear, selectedDate, regionFilter]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(
        getTimeframeParams(
          shouldSeeOnlyTodayData() ? "day" : timeframe,
          selectedYear,
          shouldSeeOnlyTodayData() ? getTodayDate() : selectedDate,
        ),
      );
      if (regionFilter) params.set("region", regionFilter);
      const response = await fetch(`${serverUrl}/reports/analytics?${params}`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to fetch analytics report: ${response.status}`);
      const payload = await response.json();
      setAnalytics(payload.data);
      setReservationsStats({
        count: Number(payload.reservations?.count || 0),
        value: Number(payload.reservations?.value || 0),
      });
      setTimeframeData(payload.timeframe || null);
      const years = Array.isArray(payload.availableYears) ? payload.availableYears : [];
      setAvailableYears(years);
    } catch (error) {
      console.error("Error fetching analytics report:", error);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const navigateYear = (direction: "prev" | "next") => {
    const currentIndex = availableYears.indexOf(selectedYear);
    
    if (direction === "prev" && currentIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentIndex + 1]);
    } else if (direction === "next" && currentIndex > 0) {
      setSelectedYear(availableYears[currentIndex - 1]);
    }
  };

  const getTimeframeLabel = () => {
    if (timeframeData?.description) {
      return timeframeData.description;
    }
    
    switch (timeframe) {
      case "day":
        if (selectedDate) {
          const date = new Date(selectedDate);
          return date.toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
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
    // For non-admin users, only allow "day" timeframe
    if (shouldSeeOnlyTodayData() && period !== "day") {
      return;
    }

    setTimeframe(period);

    if (period === "year") {
      // Set to current year if available
      const currentYear = new Date().getFullYear();
      if (availableYears.length > 0 && availableYears.includes(currentYear)) {
        setSelectedYear(currentYear);
      } else if (availableYears.length > 0) {
        setSelectedYear(availableYears[0]);
      }
    }
  };

  const generatePDF = () => {
    if (!analytics) return;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;
    let y = 0;

    const COMPANY_NAME = "Boutique C'EST DIEU QUI PARTAGE";
    const COMPANY_ADDRESS = "Av du 1er Janvier N°13, C. Makiso, Kisangani";
    const COMPANY_PHONE = "+243 839 336 794";
    const COMPANY_RCCM = "RCCM/KIS : 22-A-267";

    const checkPage = (needed: number) => {
      if (y + needed > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }
    };

    // ── HEADER BAR ───────────────────────────────────────────────────────────
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageWidth, 48, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(COMPANY_NAME, pageWidth / 2, 14, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(COMPANY_ADDRESS, pageWidth / 2, 23, { align: 'center' });
    doc.text(`Tél : ${COMPANY_PHONE}     |     ${COMPANY_RCCM}`, pageWidth / 2, 31, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RAPPORT ANALYTIQUE', pageWidth / 2, 41, { align: 'center' });

    y = 57;

    // ── REPORT META ──────────────────────────────────────────────────────────
    const generatedAt = new Date().toLocaleString('fr-FR', {
      timeZone: 'Africa/Lubumbashi',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const regionLabel = regionFilter === "Bbbb" ? "Butembo (Bbbb)" : regionFilter === "Cnnn" ? "China (Cnnn)" : "Toutes régions";
    doc.text(`Période : ${getTimeframeLabel()}  |  Région : ${regionLabel}`, margin, y);
    doc.text(`Généré le : ${generatedAt} (GMT+2)`, pageWidth - margin, y, { align: 'right' });

    y += 5;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 9;

    // ── SECTION TITLE HELPER ─────────────────────────────────────────────────
    const drawSection = (title: string) => {
      checkPage(22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 64, 175);
      doc.text(title, margin, y);
      y += 4;
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(0.6);
      doc.line(margin, y, margin + 72, y);
      doc.setLineWidth(0.2);
      y += 7;
    };

    // ── KEY METRICS ──────────────────────────────────────────────────────────
    drawSection('INDICATEURS CLÉS');

    const metrics = [
      { label: 'Ventes Totales', value: analytics.totalSales.toString(), highlight: false },
      { label: 'Revenu Total (USD)', value: formatCurrency(analytics.totalRevenue), highlight: false },
      { label: "Entrées d'Argent (USD)", value: formatCurrency(analytics.totalEntries), highlight: false },
      { label: 'Dépenses Validées (USD)', value: formatCurrency(analytics.totalValidatedExpenses), highlight: false },
      { label: 'Revenu Net (USD)', value: formatCurrency(analytics.netRevenue), highlight: true },
      { label: 'Clients Servis', value: analytics.totalCustomers.toString(), highlight: false },
      { label: 'Produits Distincts', value: analytics.totalProducts.toString(), highlight: false },
      { label: 'Réservations', value: `${reservationsStats.count} (${formatCurrency(reservationsStats.value)})`, highlight: false },
    ];

    metrics.forEach((m, i) => {
      checkPage(9);
      if (i % 2 === 0) {
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, y - 5, contentWidth, 8, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      doc.text(m.label, margin + 3, y);
      doc.setFont('helvetica', 'bold');
      if (m.highlight) {
        doc.setTextColor(20, 110, 30);
      } else {
        doc.setTextColor(20, 20, 20);
      }
      doc.text(m.value, pageWidth - margin - 3, y, { align: 'right' });
      y += 8;
    });

    y += 6;

    // ── SALES TREND ──────────────────────────────────────────────────────────
    const trendData = getChartDataForTimeframe();
    drawSection('TENDANCES DES VENTES');

    if (trendData.length > 0) {
      doc.setFillColor(30, 64, 175);
      doc.rect(margin, y - 5, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('Période', margin + 3, y);
      doc.text('Ventes', margin + contentWidth * 0.62, y, { align: 'center' });
      doc.text('Revenu', pageWidth - margin - 3, y, { align: 'right' });
      y += 8;

      trendData.forEach((item: any, i: number) => {
        checkPage(8);
        let label = '';
        if (timeframe === 'day') {
          label = `${item.dayName || ''} ${item.date || ''}`.trim();
        } else if (timeframe === 'week') {
          label = `${item.week} (${item.startDate} – ${item.endDate})`;
        } else {
          label = item.monthName || '';
        }
        if (label.length > 50) label = label.substring(0, 50) + '…';

        if (i % 2 === 0) {
          doc.setFillColor(245, 247, 250);
          doc.rect(margin, y - 5, contentWidth, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(label, margin + 3, y);
        doc.setTextColor(30, 30, 30);
        doc.text(String(item.sales), margin + contentWidth * 0.62, y, { align: 'center' });
        doc.text(formatCurrency(item.revenue), pageWidth - margin - 3, y, { align: 'right' });
        y += 7;
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(140, 140, 140);
      doc.text('Aucune donnée de tendance disponible pour cette période.', margin + 3, y);
      y += 8;
    }

    y += 6;

    // ── TOP PRODUCTS ─────────────────────────────────────────────────────────
    drawSection('ARTICLES VENDUS');

    if (analytics.topProducts.length > 0) {
      doc.setFillColor(30, 64, 175);
      doc.rect(margin, y - 5, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('Article', margin + 3, y);
      doc.text('Qté', margin + contentWidth * 0.68, y, { align: 'center' });
      doc.text('Revenu', pageWidth - margin - 3, y, { align: 'right' });
      y += 8;

      analytics.topProducts.forEach((product, i) => {
        checkPage(8);
        let nameStr = `${i + 1}. ${product.name}${product.regionCode ? ` (${product.regionCode})` : ''}`;
        if (nameStr.length > 48) nameStr = nameStr.substring(0, 48) + '…';

        if (i % 2 === 0) {
          doc.setFillColor(245, 247, 250);
          doc.rect(margin, y - 5, contentWidth, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(nameStr, margin + 3, y);
        doc.setTextColor(30, 30, 30);
        doc.text(String(product.quantity), margin + contentWidth * 0.68, y, { align: 'center' });
        doc.text(formatCurrency(product.revenue), pageWidth - margin - 3, y, { align: 'right' });
        y += 7;
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(140, 140, 140);
      doc.text('Aucun article vendu dans cette période.', margin + 3, y);
      y += 8;
    }

    // ── FOOTER (all pages) ────────────────────────────────────────────────────
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const fy = pageHeight - 10;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, fy - 4, pageWidth - margin, fy - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(COMPANY_NAME, margin, fy);
      doc.text(`Page ${p} / ${totalPages}`, pageWidth / 2, fy, { align: 'center' });
      doc.text(COMPANY_RCCM, pageWidth - margin, fy, { align: 'right' });
    }

    // ── SAVE ─────────────────────────────────────────────────────────────────
    const safePeriod = getTimeframeLabel()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`Rapport_Analytique_${safePeriod}_${dateStr}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Analytiques
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-2">
              Analyse approfondie de la performance de votre entreprise
            </p>
          </div>
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2 text-sm sm:text-base">
              Chargement des analytiques...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Analytiques
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-2">
              Analyse approfondie de la performance de votre entreprise
            </p>
          </div>
          <div className="text-center py-12 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm sm:text-base">
              Aucune donnée disponible pour les analytiques
            </p>
          </div>
        </div>
      </div>
    );
  }

  const chartData = getChartDataForTimeframe();
  const maxRevenue = Math.max(...chartData.map((d: any) => d.revenue), 1);

  function getChartDataForTimeframe() {
    if (!analytics) return [];
    
    switch (timeframe) {
      case "day":
        return analytics.salesByDay;
      case "week":
        return analytics.salesByWeek;
      case "month":
        return analytics.salesByMonth;
      case "year": {
        const yearData = analytics.salesByYear.find(
          (y) => y.year === selectedYear.toString()
        );
        return yearData ? yearData.months : [];
      }
      default:
        return analytics.salesByWeek;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Analytiques
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-2">
                Analyse approfondie de la performance de votre entreprise
              </p>
            </div>
            <div className="flex items-center gap-3">
              {shouldSeeOnlyTodayData() && (
                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg border border-blue-200">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Vue limitée - Données du jour uniquement
                  </span>
                </div>
              )}
              <button
                onClick={fetchAnalytics}
                disabled={loading}
                className="px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="text-sm">Actualiser</span>
              </button>
              <button
                onClick={generatePDF}
                disabled={loading || !analytics}
                className="px-3 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg border border-green-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">Télécharger PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Timeframe Selection */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              Période d'analyse: {getTimeframeLabel()}
            </h3>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Date Picker for Day View */}
              {timeframe === "day" && (
                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 px-3 py-2 shadow-sm w-full sm:w-auto">
                  <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <label
                    htmlFor="date-picker"
                    className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap"
                  >
                    Date:
                  </label>
                  <input
                    id="date-picker"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="ml-2 px-2 py-1 border-none bg-transparent text-xs sm:text-sm focus:outline-none focus:ring-0 text-gray-900 font-medium w-full"
                    disabled={shouldSeeOnlyTodayData()}
                  />
                </div>
              )}

              {timeframe === "year" && availableYears.length > 1 && (
                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 px-3 py-2 shadow-sm w-full sm:w-auto">
                  <button
                    onClick={() => navigateYear("prev")}
                    disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                  <span className="text-xs sm:text-sm font-medium text-gray-900 px-2 min-w-[60px] sm:min-w-[80px] text-center">
                    {selectedYear}
                  </span>
                  <button
                    onClick={() => navigateYear("next")}
                    disabled={availableYears.indexOf(selectedYear) === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                </div>
              )}

              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                {(["day", "week", "month", "year"] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => handleTimeframeChange(period)}
                    className={`px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 flex-1 sm:flex-none ${
                      timeframe === period
                        ? "bg-blue-500 text-white shadow-sm"
                        : shouldSeeOnlyTodayData() && period !== "day"
                        ? "text-gray-400 cursor-not-allowed opacity-50"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                    disabled={shouldSeeOnlyTodayData() && period !== "day"}
                  >
                    {period === "day" && "Jour"}
                    {period === "week" && "Semaine"}
                    {period === "month" && "Mois"}
                    {period === "year" && "Année"}
                  </button>
                ))}
              </div>

              <RegionFilterPills value={regionFilter} onChange={setRegionFilter} />
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Ventes Totales
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {analytics.totalSales}
                </p>
                <div className="flex items-center mt-1">
                  {analytics.recentTrends.salesGrowth >= 0 ? (
                    <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                  ) : (
                    <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-500" />
                  )}
                  <span
                    className={`text-xs sm:text-sm ml-1 ${
                      analytics.recentTrends.salesGrowth >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {Math.abs(analytics.recentTrends.salesGrowth)}%
                  </span>
                </div>
              </div>
              <div className="p-2 sm:p-3 bg-blue-100 rounded-full">
                <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Revenu Total</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatCurrency(analytics.totalRevenue)}
                </p>
                <div className="flex items-center mt-1">
                  {analytics.recentTrends.revenueGrowth >= 0 ? (
                    <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                  ) : (
                    <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-500" />
                  )}
                  <span
                    className={`text-xs sm:text-sm ml-1 ${
                      analytics.recentTrends.revenueGrowth >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {Math.abs(analytics.recentTrends.revenueGrowth)}%
                  </span>
                </div>
              </div>
              <div className="p-2 sm:p-3 bg-green-100 rounded-full">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Entrées d'Argent
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatCurrency(analytics.totalEntries)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total reçu</p>
              </div>
              <div className="p-2 sm:p-3 bg-yellow-100 rounded-full">
                <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Dépenses Validées
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatCurrency(analytics.totalValidatedExpenses)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total validé</p>
              </div>
              <div className="p-2 sm:p-3 bg-red-100 rounded-full">
                <Receipt className="w-4 h-4 sm:w-6 sm:h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Revenu Net</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {formatCurrency(analytics.netRevenue)}
                </p>
                <p className="text-xs text-gray-500 mt-1">(Ventes + Entrées) - Dépenses</p>
              </div>
              <div className="p-2 sm:p-3 bg-purple-100 rounded-full">
                <Calculator className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Clients Totaux
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {analytics.totalCustomers}
                </p>
                <div className="flex items-center mt-1">
                  <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                  <span className="text-xs sm:text-sm ml-1 text-green-500">
                    {analytics.recentTrends.customerGrowth}%
                  </span>
                </div>
              </div>
              <div className="p-2 sm:p-3 bg-orange-100 rounded-full">
                <Users className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Produits Totaux
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {analytics.totalProducts}
                </p>
                <p className="text-xs text-gray-500 mt-1">Produits actifs</p>
              </div>
              <div className="p-2 sm:p-3 bg-indigo-100 rounded-full">
                <Package className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">
                  Réservations
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {reservationsStats.count}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatCurrency(reservationsStats.value)}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-teal-100 rounded-full">
                <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-teal-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Sales Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              Tendances des Ventes ({getTimeframeLabel()})
            </h3>
          </div>

          <div className="space-y-4 overflow-x-auto">
            {timeframe === "year" ? (
              // Yearly view with months for selected year
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Année {selectedYear}
                </h4>
                <div className="space-y-4 ml-0 sm:ml-4 min-w-[300px]">
                  {chartData.map((month: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 sm:gap-4"
                    >
                      <div className="w-28 sm:w-40 text-xs sm:text-sm text-gray-600 font-medium capitalize">
                        {month.monthName}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs sm:text-sm text-gray-700 truncate">
                            {month.sales} ventes
                          </span>
                          <span className="text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap ml-2">
                            {formatCurrency(month.revenue)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${(month.revenue / maxRevenue) * 100}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Daily, Weekly, Monthly view
              chartData.map((item: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center gap-3 sm:gap-4 min-w-[300px]"
                >
                  <div className="w-32 sm:w-48 text-xs sm:text-sm text-gray-600 font-medium">
                    {timeframe === "day" ? (
                      <div>
                        <div className="capitalize">
                          {item.dayName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.date}
                        </div>
                      </div>
                    ) : timeframe === "week" ? (
                      <div>
                        <div className="text-xs sm:text-sm">
                          {item.week}
                        </div>
                        <div className="text-xs text-gray-500">
                          Du {item.startDate} au {item.endDate}
                        </div>
                      </div>
                    ) : timeframe === "month" ? (
                      <div className="capitalize">
                        {item.monthName}
                      </div>
                    ) : (
                      item.monthName
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs sm:text-sm text-gray-700">
                        {item.sales} ventes
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap ml-2">
                        {formatCurrency(item.revenue)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${(item.revenue / maxRevenue) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            Articles Vendus ({getTimeframeLabel()})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[32rem] overflow-y-auto">
            {analytics.topProducts.length > 0 ? (
              analytics.topProducts.map((product, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                      {index + 1}. {product.name}
                      {product.regionCode && (
                        <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                          {product.regionCode}
                        </span>
                      )}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600">
                      {product.quantity} unités vendues
                    </p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-medium text-gray-900 text-sm sm:text-base whitespace-nowrap">
                      {formatCurrency(product.revenue)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                <Package className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium text-sm sm:text-base">
                  Aucun produit vendu
                </p>
                <p className="text-xs sm:text-sm">dans cette période</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
