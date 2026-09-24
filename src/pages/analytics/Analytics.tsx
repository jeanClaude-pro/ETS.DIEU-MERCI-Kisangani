/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
  ArrowRight,
} from "lucide-react";
import jsPDF from "jspdf";
import RegionFilterPills from "../../components/RegionFilterPills";
import { PageHeader } from "../../components/ui";
import type { RegionCodeFilter } from "../../types";
import { useConnectivity } from "../../context/ConnectivityContext";
import { buildLocalAnalytics, isRangeCovered, localReportRange } from "../../services/localReportService";
import {
  cacheReport,
  getCachedReport,
  getSalesCoverage,
  getMergedBusinessSales,
  refreshBusinessSalesSnapshot,
  subscribeMergedBusinessSales,
} from "../../services/localBusinessReadModel";


interface AnalyticsData {
  totalSales: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  totalValidatedExpenses: number;
  totalValidatedExpenseCount: number;
  validatedExpenses: {
    _id: string;
    expenseId: string;
    reason: string;
    amount: number;
    recipientName?: string;
    paymentMethod?: string;
    regionCode?: string;
    validatedAt?: string;
    createdAt: string;
  }[];
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
  const connectivity = useConnectivity();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [usingLocalData, setUsingLocalData] = useState(false);
  const [localNotice, setLocalNotice] = useState("");
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
  }, [timeframe, selectedYear, selectedDate, regionFilter, connectivity.status]);

  useEffect(() => {
    const params = reportParams();
    const range = localReportRange(Object.fromEntries(params.entries()));
    const subscription = subscribeMergedBusinessSales(() => {
      if (connectivity.status !== "online") void loadLocalAnalytics();
    }, undefined, range);
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity.status, timeframe, selectedYear, selectedDate, regionFilter]);

  const reportParams = () => {
    const params = new URLSearchParams(getTimeframeParams(
      shouldSeeOnlyTodayData() ? "day" : timeframe,
      selectedYear,
      shouldSeeOnlyTodayData() ? getTodayDate() : selectedDate,
    ));
    if (regionFilter) params.set("region", regionFilter);
    return params;
  };

  const loadLocalAnalytics = async () => {
    const params = reportParams();
    const query = Object.fromEntries(params.entries());
    const range = localReportRange(query);
    const [sales, cached, coverage] = await Promise.all([
      getMergedBusinessSales(range),
      getCachedReport(`analytics:${params.toString()}`),
      getSalesCoverage(),
    ]);
    const cachedData = cached?.payload?.data as Partial<AnalyticsData> | undefined;
    const local = buildLocalAnalytics(sales, range, regionFilter, {
      totalEntries: cachedData?.totalEntries,
      totalValidatedExpenses: cachedData?.totalValidatedExpenses,
      totalValidatedExpenseCount: cachedData?.totalValidatedExpenseCount,
      validatedExpenses: cachedData?.validatedExpenses,
    });
    setAnalytics(local.data);
    setReservationsStats({ count: local.reservations.count, value: local.reservations.value });
    setTimeframeData({ description: range.description, start: range.start.toISOString(), end: range.end.toISOString() });
    setAvailableYears([...new Set(sales.map((sale) => Number(new Date(new Date(sale.createdAt).getTime() + 7_200_000).toISOString().slice(0, 4))))].sort((a, b) => b - a));
    setUsingLocalData(true);
    const covered = isRangeCovered(range, coverage);
    setLocalNotice(covered
      ? `Rapport local · base serveur mise à jour à ${new Date(coverage.updatedAt || cached?.cachedAt || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
      : "Rapport local · période partiellement mise en cache; toutes les ventes locales connues sont incluses");
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      await loadLocalAnalytics();
      if (connectivity.status !== "online") return;
      const params = reportParams();
      await refreshBusinessSalesSnapshot(localStorage.getItem("token") || "");
      const response = await fetch(`${serverUrl}/reports/analytics?${params}`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to fetch analytics report: ${response.status}`);
      const payload = await response.json();
      await cacheReport(`analytics:${params.toString()}`, payload, payload.timeframe?.start || "", payload.timeframe?.end || "");
      setAnalytics(payload.data);
      setUsingLocalData(false);
      setLocalNotice("");
      setReservationsStats({
        count: Number(payload.reservations?.count || 0),
        value: Number(payload.reservations?.value || 0),
      });
      setTimeframeData(payload.timeframe || null);
      const years = Array.isArray(payload.availableYears) ? payload.availableYears : [];
      setAvailableYears(years);
    } catch (error) {
      console.error("Error fetching analytics report:", error);
      await loadLocalAnalytics();
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
    // Keep the report view concise: each validated expense is identified by
    // its amount and reason, while editing remains in expense history.
    if (timeframe === "day" || timeframe === "week") {
      drawSection(`DETAIL DES DEPENSES VALIDEES (${analytics.totalValidatedExpenseCount})`);
      if (analytics.validatedExpenses.length > 0) {
      doc.setFillColor(185, 28, 28);
      doc.rect(margin, y - 5, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('Depense / raison', margin + 3, y);
      doc.text('Montant', pageWidth - margin - 3, y, { align: 'right' });
      y += 8;

        analytics.validatedExpenses.forEach((expense, i) => {
          checkPage(8);
          const reason = expense.reason.length > 68 ? `${expense.reason.slice(0, 68)}...` : expense.reason;
          if (i % 2 === 0) {
            doc.setFillColor(254, 242, 242);
            doc.rect(margin, y - 5, contentWidth, 7, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
          doc.text(`Depense - ${reason}`, margin + 3, y);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(153, 27, 27);
          doc.text(formatCurrency(expense.amount), pageWidth - margin - 3, y, { align: 'right' });
          y += 7;
        });
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(140, 140, 140);
        doc.text('Aucune depense validee pour cette periode.', margin + 3, y);
        y += 8;
      }

      y += 6;
    }
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
      <div aria-busy="true">
        <div className="ui-page animate-pulse">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="h-8 w-44 rounded-lg bg-slate-200" />
              <div className="h-4 w-72 max-w-full rounded bg-slate-200" />
            </div>
            <div className="flex gap-2"><div className="h-11 w-28 rounded-lg bg-slate-200" /><div className="h-11 w-40 rounded-lg bg-slate-200" /></div>
          </div>
          <div className="h-28 rounded-xl border border-slate-200 bg-white" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 rounded-xl border border-slate-200 bg-white" />)}
          </div>
          <div className="h-72 rounded-xl border border-slate-200 bg-white" />
          <div className="sr-only" role="status">Chargement des analytiques...</div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div>
        <div className="ui-page">
          <PageHeader eyebrow="Rapports" title="Analytiques" description="Vue d'ensemble des performances et opérations." />
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-500">
              <BarChart3 className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-slate-900">Aucune donnée disponible</h2>
            <p className="mt-1 text-sm text-slate-500">Les indicateurs apparaîtront ici dès que des opérations seront disponibles.</p>
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
    <div>
      <div className="ui-page">
        {/* Header */}
        <PageHeader
          eyebrow="Rapports"
          title="Analytiques"
          description="Vue d'ensemble des performances et opérations."
          meta={(usingLocalData || shouldSeeOnlyTodayData()) ? (
            <>
              {usingLocalData && (
                <span className="ui-badge ui-badge-info max-w-full">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                  <span className="truncate">{localNotice}</span>
                </span>
              )}
              {shouldSeeOnlyTodayData() && (
                <span className="ui-badge ui-badge-neutral">
                  <Shield className="h-3 w-3" aria-hidden="true" /> Vue du jour uniquement
                </span>
              )}
            </>
          ) : undefined}
          actions={
            <>
              <button type="button" onClick={fetchAnalytics} disabled={loading} className="ui-btn ui-btn-secondary">
                <RefreshCw className={loading ? "animate-spin" : ""} /> Actualiser
              </button>
              <button type="button" onClick={generatePDF} disabled={loading || !analytics} className="ui-btn ui-btn-primary">
                <Download /> Télécharger PDF
              </button>
            </>
          }
        />

        {/* Timeframe Selection */}
        <section className="ui-card p-4 sm:p-5" aria-label="Filtres du rapport">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Période du rapport</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{getTimeframeLabel()}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">Période</span>
                <div className="ui-segmented w-full sm:w-auto" role="group" aria-label="Choisir la période">
                  {(["day", "week", "month", "year"] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => handleTimeframeChange(period)}
                      className="ui-segment"
                      disabled={shouldSeeOnlyTodayData() && period !== "day"}
                      aria-pressed={timeframe === period}
                    >
                      {period === "day" && "Jour"}
                      {period === "week" && "Semaine"}
                      {period === "month" && "Mois"}
                      {period === "year" && "Année"}
                    </button>
                  ))}
                </div>
              </div>

              {timeframe === "day" && (
                <div className="min-w-0 sm:w-44">
                  <label htmlFor="date-picker" className="mb-1.5 block text-xs font-medium text-slate-500">Date</label>
                  <div className="relative">
                    <input
                      id="date-picker"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="ui-input"
                      disabled={shouldSeeOnlyTodayData()}
                    />
                  </div>
                </div>
              )}

              {timeframe === "year" && availableYears.length > 1 && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-500">Année</span>
                  <div className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white">
                    <button type="button" aria-label="Année précédente" onClick={() => navigateYear("prev")} disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1} className="ui-icon-btn"><ChevronLeft /></button>
                    <span className="min-w-16 px-2 text-center text-sm font-semibold tabular-nums text-slate-900">{selectedYear}</span>
                    <button type="button" aria-label="Année suivante" onClick={() => navigateYear("next")} disabled={availableYears.indexOf(selectedYear) === 0} className="ui-icon-btn"><ChevronRight /></button>
                  </div>
                </div>
              )}

              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">Région</span>
                <RegionFilterPills value={regionFilter} onChange={setRegionFilter} />
              </div>
            </div>
          </div>
        </section>

        {/* Key Metrics */}
        <section aria-labelledby="financial-overview-title">
          <h2 id="financial-overview-title" className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Aperçu financier</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/sales" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Ventes Totales
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {analytics.totalSales}
                </p>
                <div className="mt-2 flex items-center">
                  {analytics.recentTrends.salesGrowth >= 0 ? (
                    <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-red-600" />
                  )}
                  <span
                    className={`ml-1 text-xs font-semibold tabular-nums ${
                      analytics.recentTrends.salesGrowth >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {Math.abs(analytics.recentTrends.salesGrowth)}%
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                <BarChart3 className="h-5 w-5" />
              </div>
            </div>
          </Link>

          <Link to="/sales" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Revenu Total</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {formatCurrency(analytics.totalRevenue)}
                </p>
                <div className="mt-2 flex items-center">
                  {analytics.recentTrends.revenueGrowth >= 0 ? (
                    <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-red-600" />
                  )}
                  <span
                    className={`ml-1 text-xs font-semibold tabular-nums ${
                      analytics.recentTrends.revenueGrowth >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {Math.abs(analytics.recentTrends.revenueGrowth)}%
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </Link>

          <Link to="/entryhistory" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Entrées d'Argent
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {formatCurrency(analytics.totalEntries)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total reçu</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </Link>

          <Link to="/sortiehistory" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-red-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Dépenses Validées
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-red-700 lg:text-3xl">
                  {formatCurrency(analytics.totalValidatedExpenses)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {analytics.totalValidatedExpenseCount} dépense{analytics.totalValidatedExpenseCount === 1 ? "" : "s"} dans ce rapport
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-2 text-red-700">
                <Receipt className="h-5 w-5" />
              </div>
            </div>
          </Link>
        </div>
        </section>

        {/* Additional Metrics */}
        <section aria-labelledby="operational-indicators-title">
          <h2 id="operational-indicators-title" className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Indicateurs opérationnels</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Revenu Net</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {formatCurrency(analytics.netRevenue)}
                </p>
                <p className="text-xs text-gray-500 mt-1">(Ventes + Entrées) - Dépenses</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                <Calculator className="h-5 w-5" />
              </div>
            </div>
          </div>

          <Link to="/customers" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Clients Totaux
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {analytics.totalCustomers}
                </p>
                <div className="mt-2 flex items-center">
                  {analytics.recentTrends.customerGrowth >= 0 ? (
                    <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-red-600" />
                  )}
                  <span className={`ml-1 text-xs font-semibold tabular-nums ${analytics.recentTrends.customerGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {Math.abs(analytics.recentTrends.customerGrowth)}%
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </Link>

          <Link to="/products" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Produits Totaux
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {analytics.totalProducts}
                </p>
                <p className="text-xs text-gray-500 mt-1">Produits actifs</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <Package className="h-5 w-5" />
              </div>
            </div>
          </Link>

          <Link to="/reservationhistory" className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Réservations
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 lg:text-3xl">
                  {reservationsStats.count}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatCurrency(reservationsStats.value)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
          </Link>
        </div>
        </section>

        {/* Daily/weekly report-only detail; editing and validation stay in SortieHistory. */}
        {(timeframe === "day" || timeframe === "week") && (
        <section className="order-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="validated-expenses-title">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Dépenses validées</p>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2">
                  <Receipt className="h-5 w-5 text-red-700" />
                </span>
                <h2 id="validated-expenses-title" className="text-base font-semibold text-slate-950">
                  Sorties approuvées <span className="tabular-nums text-slate-500">({analytics.totalValidatedExpenseCount})</span>
                </h2>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Montant et raison des dépenses incluses dans ce rapport.
              </p>
            </div>
            <Link
              to="/sortiehistory"
              className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:self-auto"
            >
              Ouvrir l'historique <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {analytics.validatedExpenses.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {analytics.validatedExpenses.map((expense) => (
                <li
                  key={expense._id}
                  className="flex min-w-0 flex-col gap-3 px-4 py-4 transition-colors hover:bg-red-50/40 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700">
                        Dépense
                      </span>
                      <span className="text-xs font-medium text-slate-400">{expense.expenseId}</span>
                      {expense.regionCode && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {expense.regionCode}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 break-words text-sm font-semibold text-slate-900">{expense.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(expense.validatedAt || expense.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 self-end text-base font-semibold tabular-nums text-red-700 min-[430px]:self-auto">
                    − {formatCurrency(expense.amount)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400"><Receipt className="h-5 w-5" /></span>
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Aucune dépense validée pour cette période.
              </p>
            </div>
          )}
        </section>
        )}

        {/* Sales Chart */}
        <section className="order-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="sales-performance-title">
          <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Performance des ventes</p>
              <h2 id="sales-performance-title" className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-950">
                <TrendingUp className="h-4 w-4 text-blue-700" /> Tendances des ventes
              </h2>
            </div>
            <span className="text-sm font-medium text-slate-500">{getTimeframeLabel()}</span>
          </div>

          <div className="overflow-x-auto">
            {chartData.length === 0 ? (
              <div className="py-10 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400"><TrendingUp className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold text-slate-700">Aucune vente sur cette période</p>
                <p className="mt-1 text-xs text-slate-500">Les tendances apparaîtront dès qu'une vente sera enregistrée.</p>
              </div>
            ) : timeframe === "year" ? (
              // Yearly view with months for selected year
              <div className="mb-2">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  Année {selectedYear}
                </h3>
                <div className="min-w-[300px] space-y-4">
                  {chartData.map((month: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 sm:gap-4"
                    >
                      <div className="w-28 text-xs font-medium capitalize text-slate-600 sm:w-40 sm:text-sm">
                        {month.monthName}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="truncate text-xs text-slate-700 sm:text-sm">
                            {month.sales} ventes
                          </span>
                          <span className="ml-2 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-900 sm:text-sm">
                            {formatCurrency(month.revenue)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100">
                          <div
                            className="h-1.5 rounded-full bg-blue-700 transition-[width] duration-300"
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
                  className="flex min-w-[300px] items-center gap-3 border-b border-slate-100 py-3 last:border-b-0 sm:gap-4"
                >
                  <div className="w-32 text-xs font-medium text-slate-600 sm:w-48 sm:text-sm">
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
                          <span className="text-xs text-slate-700 sm:text-sm">
                        {item.sales} ventes
                      </span>
                      <span className="ml-2 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-900 sm:text-sm">
                        {formatCurrency(item.revenue)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-blue-700 transition-[width] duration-300"
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
        </section>

        {/* Top Products */}
        <section className="order-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="sold-items-title">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Articles vendus</p>
              <h2 id="sold-items-title" className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-950">
                <Package className="h-4 w-4 text-blue-700" /> Détail des produits
              </h2>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{analytics.topProducts.length} article{analytics.topProducts.length === 1 ? "" : "s"}</span>
              <span className="hidden sm:inline">{getTimeframeLabel()}</span>
            </div>
          </div>

          {analytics.topProducts.length > 0 ? (
            <>
              <div className="hidden max-h-[34rem] overflow-auto md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-14 px-5 py-3">#</th>
                      <th className="px-3 py-3">Article</th>
                      <th className="w-28 px-3 py-3">Région</th>
                      <th className="w-28 px-3 py-3 text-right">Quantité</th>
                      <th className="w-36 px-5 py-3 text-right">Revenu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.topProducts.map((product, index) => (
                      <tr key={`${product.name}-${product.regionCode || "all"}-${index}`} className="transition-colors hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-400 tabular-nums">{index + 1}</td>
                        <td className="truncate px-3 py-3 font-medium text-slate-900" title={product.name}>{product.name}</td>
                        <td className="px-3 py-3">
                          {product.regionCode ? <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{product.regionCode}</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">{product.quantity}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-950">{formatCurrency(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-slate-100 md:hidden">
                {analytics.topProducts.map((product, index) => (
                  <li key={`${product.name}-${product.regionCode || "all"}-${index}`} className="px-4 py-4 transition-colors hover:bg-slate-50">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium tabular-nums text-slate-400">#{index + 1}</span>
                          {product.regionCode && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{product.regionCode}</span>}
                        </div>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-900">{product.name}</p>
                        <p className="mt-1 text-xs text-slate-500"><span className="font-semibold tabular-nums text-slate-700">{product.quantity}</span> unités vendues</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-950">{formatCurrency(product.revenue)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400"><Package className="h-5 w-5" /></span>
              <p className="mt-3 text-sm font-semibold text-slate-700">Aucun article vendu</p>
              <p className="mt-1 text-xs text-slate-500">Aucun produit ne correspond à la période et à la région sélectionnées.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
