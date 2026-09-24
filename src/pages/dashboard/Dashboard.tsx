/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  DollarSign,
  Package,
  Users,
  TrendingUp,
  ShoppingCart,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { EmptyState, MetricCard, PageHeader } from "../../components/ui";
import RegionFilterPills from "../../components/RegionFilterPills";
import type { RegionCodeFilter } from "../../types";
import { useConnectivity } from "../../context/ConnectivityContext";
import { offlineDb } from "../../lib/offlineDb";
import { buildLocalAnalytics, localReportRange } from "../../services/localReportService";
import { cacheReport, getCachedReport, getMergedBusinessSales, refreshBusinessSalesSnapshot, subscribeMergedBusinessSales } from "../../services/localBusinessReadModel";

interface DashboardStats {
  totalRevenue: number;
  totalSales: number;
  totalProducts: number;
  totalCustomers: number;
  recentSales: any[];
  lowStockProducts: any[];
  revenueGrowth: number;
  salesGrowth: number;
  customerGrowth: number;
}

const serverUrl = import.meta.env.VITE_API_URL;

type RegionFilter = RegionCodeFilter;

export default function Dashboard() {
  const connectivity = useConnectivity();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usingLocalData, setUsingLocalData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("");

  useEffect(() => {
    fetchDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, connectivity.status]);

  useEffect(() => {
    const range = localReportRange();
    const subscription = subscribeMergedBusinessSales(() => {
      if (connectivity.status !== "online") void loadLocalDashboard();
    }, undefined, range);
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity.status, regionFilter]);

  const loadLocalDashboard = async () => {
    const dashboardKey = `dashboard:${regionFilter || "all"}`;
    const range = localReportRange();
    const [sales, products, cachedDashboard] = await Promise.all([
      getMergedBusinessSales(range),
      offlineDb.products.toArray(),
      getCachedReport(dashboardKey),
    ]);
    const cachedStats = cachedDashboard?.payload?.data as Partial<DashboardStats> | undefined;
    const report = buildLocalAnalytics(sales, localReportRange(), regionFilter).data;
    const scopedProducts = regionFilter ? products.filter((product) => product.regionCode === regionFilter) : products;
    setStats({
      totalRevenue: report.totalRevenue,
      totalSales: report.totalSales,
      totalProducts: scopedProducts.length,
      totalCustomers: Number(cachedStats?.totalCustomers ?? report.totalCustomers),
      recentSales: sales.filter((sale) => {
        const time = new Date(sale.createdAt).getTime();
        return time >= range.start.getTime() && time <= range.end.getTime() &&
          (!regionFilter || sale.items.some((item) => item.regionCode === regionFilter));
      }).slice(0, 5),
      lowStockProducts: scopedProducts.filter((product) => product.stock < 100).sort((a, b) => a.stock - b.stock).slice(0, 5),
      revenueGrowth: report.recentTrends.revenueGrowth,
      salesGrowth: report.recentTrends.salesGrowth,
      customerGrowth: report.recentTrends.customerGrowth,
    });
    setUsingLocalData(true);
  };

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      await loadLocalDashboard();
      if (connectivity.status !== "online") return;
      await refreshBusinessSalesSnapshot(localStorage.getItem("token") || "").catch(() => undefined);
      const params = new URLSearchParams();
      if (regionFilter) params.set("region", regionFilter);
      const response = await fetch(`${serverUrl}/reports/dashboard?${params}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch dashboard report: ${response.status}`);
      const payload = await response.json();
      await cacheReport(`dashboard:${regionFilter || "all"}`, payload, localReportRange().start.toISOString(), localReportRange().end.toISOString());
      setStats(payload.data);
      setUsingLocalData(false);
    } catch (error) {
      console.error("Error fetching dashboard report:", error);
      await loadLocalDashboard();
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("fr-FR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Display-only: the arrow and colour follow the sign of the value.
  const renderGrowth = (value: number, suffix: string) => {
    const positive = Number(value) >= 0;
    return (
      <span className={`inline-flex items-center gap-1 font-medium ${positive ? "text-emerald-700" : "text-red-700"}`}>
        {positive ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="tabular-nums">{positive ? "+" : "−"}{Math.abs(Number(value) || 0)}%</span>
        <span className="font-normal text-slate-500">{suffix}</span>
      </span>
    );
  };

  const header = (
    <PageHeader
      eyebrow="Aperçu"
      title="Tableau de bord"
      description="Aperçu de la performance de votre entreprise."
      meta={usingLocalData ? <span className="ui-badge ui-badge-info">Hors ligne · données locales incluant les ventes en attente</span> : undefined}
      actions={<RegionFilterPills value={regionFilter} onChange={setRegionFilter} />}
    />
  );

  if (loading) {
    return (
      <div className="ui-page" aria-busy="true">
        {header}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="ui-skeleton h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="ui-skeleton h-72 rounded-xl" />
          <div className="ui-skeleton h-72 rounded-xl" />
        </div>
        <span className="sr-only" role="status">Chargement du tableau de bord…</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="ui-page">
        {header}
        <div className="ui-card">
          <EmptyState icon={BarChart3} title="Impossible de charger le tableau de bord" description="Vérifiez la connexion puis réessayez." />
        </div>
      </div>
    );
  }

  return (
    <div className="ui-page">
      {header}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Revenu total" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} tone="primary" hint={renderGrowth(stats.revenueGrowth, "vs mois dernier")} />
        <MetricCard label="Ventes totales" value={stats.totalSales} icon={ShoppingCart} hint={renderGrowth(stats.salesGrowth, "vs mois dernier")} />
        <MetricCard label="Produits" value={stats.totalProducts} icon={Package} hint="Produits actifs" />
        <MetricCard label="Clients" value={stats.totalCustomers} icon={Users} hint={renderGrowth(stats.customerGrowth, "croissance")} />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="ui-card overflow-hidden" aria-labelledby="recent-sales-title">
          <div className="ui-card-header">
            <h2 id="recent-sales-title" className="ui-section-title flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-700" />
              Ventes récentes
            </h2>
          </div>
          {stats.recentSales.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Pas de ventes récentes" description="Les dernières ventes apparaîtront ici." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentSales.map((sale, index) => (
                <li key={sale._id || index} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700" aria-hidden="true">
                      <ShoppingCart className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        Vente #{sale.saleId?.slice(-6) || sale._id?.slice(-6) || "N/A"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {sale.customer?.name || "Inconnu"} · {formatDate(sale.createdAt || sale.date || sale.saleDate)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(sale.total || 0)}</p>
                    <p className="text-xs text-slate-500">{sale.items?.length || 0} article(s)</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ui-card overflow-hidden" aria-labelledby="low-stock-title">
          <div className="ui-card-header">
            <h2 id="low-stock-title" className="ui-section-title flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-600" />
              Alertes de stock faible
            </h2>
            {stats.lowStockProducts.length > 0 && <span className="ui-badge ui-badge-warning tabular-nums">{stats.lowStockProducts.length}</span>}
          </div>
          {stats.lowStockProducts.length === 0 ? (
            <EmptyState icon={Package} title="Tous les produits sont bien stockés" description="Aucun article sous le seuil d'alerte." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.lowStockProducts.map((product, index) => (
                <li key={product._id || index} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700" aria-hidden="true">
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-900">
                        <span className="truncate">{product.name || "Produit inconnu"}</span>
                        {product.regionCode && <span className="ui-tag">{product.regionCode}</span>}
                      </p>
                      <p className="text-xs text-slate-500">{formatCurrency(product.price || 0)}</p>
                    </div>
                  </div>
                  <span className={`ui-badge shrink-0 tabular-nums ${(product.stock || 0) === 0 ? "ui-badge-danger" : "ui-badge-warning"}`}>
                    {product.stock || 0} restant(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
