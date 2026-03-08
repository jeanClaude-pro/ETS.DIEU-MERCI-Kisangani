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
} from "lucide-react";

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

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);

      // Fetch ALL sales data without pagination limits
      const salesResponse = await fetch(`${serverUrl}/sales?limit=0`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      
      if (!salesResponse.ok) {
        throw new Error(`Failed to fetch sales: ${salesResponse.status}`);
      }
      
      const salesData = await salesResponse.json();
      
      // Check if the API returns an array directly or wrapped in an object
      let allSales = [];
      if (Array.isArray(salesData)) {
        allSales = salesData;
      } else if (salesData.sales && Array.isArray(salesData.sales)) {
        allSales = salesData.sales;
      } else if (salesData.data && Array.isArray(salesData.data)) {
        allSales = salesData.data;
      } else {
        console.warn("Unexpected sales data structure:", salesData);
        allSales = [];
      }

      console.log(`Dashboard: Fetched ${allSales.length} sales from API`);

      // Fetch customers and products data
      const [customersResponse, productsResponse] = await Promise.all([
        fetch(`${serverUrl}/customers?limit=0`),
        fetch(`${serverUrl}/products?limit=0`),
      ]);

      const customersData = await customersResponse.json();
      const productsData = await productsResponse.json();

      console.log("Fetched products data:", productsData);

      // Process the data
      const processedStats = processDashboardData(
        allSales,
        Array.isArray(customersData) ? customersData : customersData.customers || customersData.data || [],
        Array.isArray(productsData) ? productsData : productsData.products || productsData.data || []
      );

      setStats(processedStats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      // Try alternative fetch method
      await tryAlternativeFetch();
    } finally {
      setLoading(false);
    }
  };

  // Alternative fetch method if the main one fails
  const tryAlternativeFetch = async () => {
    try {
      console.log("Dashboard: Trying alternative fetch method...");
      
      // Try to fetch sales with different endpoints
      const endpoints = [
        `${serverUrl}/sales?limit=1000`,
        `${serverUrl}/sales/all`,
        `${serverUrl}/sales?status=completed`
      ];
      
      let allSales = [];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              allSales = data;
              break;
            } else if (data.sales && Array.isArray(data.sales)) {
              allSales = data.sales;
              break;
            } else if (data.data && Array.isArray(data.data)) {
              allSales = data.data;
              break;
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch from ${endpoint}:`, error);
          continue;
        }
      }
      
      console.log(`Dashboard: Alternative fetch got ${allSales.length} sales`);
      
      if (allSales.length > 0) {
        // Fetch customers and products
        let allCustomers = [];
        let allProducts = [];
        
        try {
          const customersResponse = await fetch(`${serverUrl}/customers?limit=0`);
          if (customersResponse.ok) {
            const customersData = await customersResponse.json();
            allCustomers = Array.isArray(customersData) ? customersData : 
                          customersData.customers || customersData.data || [];
          }
        } catch (error) {
          console.error("Error fetching customers:", error);
        }
        
        try {
          const productsResponse = await fetch(`${serverUrl}/products?limit=0`);
          if (productsResponse.ok) {
            const productsData = await productsResponse.json();
            allProducts = Array.isArray(productsData) ? productsData : 
                         productsData.products || productsData.data || [];
          }
        } catch (error) {
          console.error("Error fetching products:", error);
        }
        
        const processedStats = processDashboardData(allSales, allCustomers, allProducts);
        setStats(processedStats);
      } else {
        // Set default stats if no data
        setStats({
          totalRevenue: 0,
          totalSales: 0,
          totalProducts: 0,
          totalCustomers: 0,
          recentSales: [],
          lowStockProducts: [],
          revenueGrowth: 0,
          salesGrowth: 0,
          customerGrowth: 0,
        });
      }
    } catch (error) {
      console.error("Dashboard: Alternative fetch also failed:", error);
      // Set default stats if API fails completely
      setStats({
        totalRevenue: 0,
        totalSales: 0,
        totalProducts: 0,
        totalCustomers: 0,
        recentSales: [],
        lowStockProducts: [],
        revenueGrowth: 0,
        salesGrowth: 0,
        customerGrowth: 0,
      });
    }
  };

  const processDashboardData = (
    sales: any[],
    customers: any[],
    products: any[]
  ): DashboardStats => {
    // FILTER OUT VOIDED AND CORRECTED SALES - ONLY COUNT COMPLETED SALES
    const validSales = sales.filter(sale => 
      sale.status !== 'voided' && 
      sale.status !== 'cancelled' && 
      sale.status !== 'refunded' &&
      sale.status !== 'deleted'
    );

    console.log(`Dashboard: Filtered sales: ${validSales.length} valid out of ${sales.length} total`);

    // Filter out invalid sales (ensure they have required properties)
    const cleanSales = validSales.filter(sale => 
      sale && typeof sale.total === 'number'
    );

    console.log(`Dashboard: Clean sales for processing: ${cleanSales.length}`);

    const totalRevenue = cleanSales.reduce(
      (sum, sale) => sum + (sale.total || 0),
      0
    );
    const totalSales = cleanSales.length;
    const totalProducts = products.length;
    const totalCustomers = customers.length;

    // Get recent VALID sales (last 5)
    const recentSales = cleanSales
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.date || b.saleDate).getTime() - 
          new Date(a.createdAt || a.date || a.saleDate).getTime()
      )
      .slice(0, 5);

    // Get low stock products (stock < 100)
    const lowStockProducts = products
      .filter((product) => (product.stock || 0) < 100)
      .slice(0, 5);

    // Calculate actual growth trends based on recent data
    const growthTrends = calculateGrowthTrends(cleanSales, customers);

    return {
      totalRevenue,
      totalSales,
      totalProducts,
      totalCustomers,
      recentSales,
      lowStockProducts,
      revenueGrowth: growthTrends.revenueGrowth,
      salesGrowth: growthTrends.salesGrowth,
      customerGrowth: growthTrends.customerGrowth,
    };
  };

  // Calculate actual growth trends instead of random numbers
  const calculateGrowthTrends = (sales: any[], customers: any[]) => {
    if (sales.length === 0) {
      return {
        revenueGrowth: 0,
        salesGrowth: 0,
        customerGrowth: 0,
      };
    }

    // Calculate monthly trends
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Current month sales
    const currentMonthSales = sales.filter(sale => {
      try {
        const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate);
        return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
      } catch (error) {
        return false;
      }
    });

    // Previous month sales
    const previousMonthSales = sales.filter(sale => {
      try {
        const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate);
        return saleDate.getMonth() === lastMonth && saleDate.getFullYear() === lastMonthYear;
      } catch (error) {
        return false;
      }
    });

    const currentMonthRevenue = currentMonthSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const previousMonthRevenue = previousMonthSales.reduce((sum, sale) => sum + (sale.total || 0), 0);

    const revenueGrowth = previousMonthRevenue > 0 
      ? Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)
      : currentMonthRevenue > 0 ? 100 : 0;

    const salesGrowth = previousMonthSales.length > 0
      ? Math.round(((currentMonthSales.length - previousMonthSales.length) / previousMonthSales.length) * 100)
      : currentMonthSales.length > 0 ? 100 : 0;

    // Customer growth (simple calculation)
    const recentCustomers = customers.filter(customer => {
      try {
        const customerDate = new Date(customer.createdAt || customer.date);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return customerDate > oneMonthAgo;
      } catch (error) {
        return false;
      }
    });

    const customerGrowth = customers.length > 0
      ? Math.round((recentCustomers.length / customers.length) * 100)
      : 0;

    return {
      revenueGrowth,
      salesGrowth,
      customerGrowth,
    };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600">
            Aperçu de la performance de votre entreprise
          </p>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-2">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600">
            Aperçu de la performance de votre entreprise
          </p>
        </div>
        <div className="text-center py-12 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Unable to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-600">
          Aperçu de la performance de votre entreprise
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Revenue Totale
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(stats.totalRevenue)}
              </p>
              <div className="flex items-center mt-1">
                <ArrowUp className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-500 ml-1">
                  +{stats.revenueGrowth}% par rapport au mois dernier
                </span>
              </div>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Ventes Totales
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalSales}
              </p>
              <div className="flex items-center mt-1">
                <ArrowUp className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-500 ml-1">
                  +{stats.salesGrowth}% par rapport au mois dernier
                </span>
              </div>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Produits</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalProducts}
              </p>
              <p className="text-xs text-gray-500 mt-1">Products Actifs</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Clients</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalCustomers}
              </p>
              <div className="flex items-center mt-1">
                <ArrowUp className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-500 ml-1">
                  +{stats.customerGrowth}% Croissance
                </span>
              </div>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Users className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Ventes Récentes
          </h3>
          <div className="space-y-4">
            {stats.recentSales.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Pas de Ventes Récentes</p>
              </div>
            ) : (
              stats.recentSales.map((sale, index) => (
                <div
                  key={sale._id || index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Vente #{sale.saleId?.slice(-6) || sale._id?.slice(-6) || "N/A"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {sale.customer?.name || "Unknown"} •{" "}
                        {formatDate(sale.createdAt || sale.date || sale.saleDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(sale.total || 0)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {sale.items?.length || 0} Articles
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Alertes de stock faible
          </h3>
          <div className="space-y-4">
            {stats.lowStockProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Tous les produits Bien Stockés</p>
              </div>
            ) : (
              stats.lowStockProducts.map((product, index) => (
                <div
                  key={product._id || index}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {product.name || "Unknown Product"}
                      </p>
                      <p className="text-xs text-red-600">
                        Avertissement De Stock Faible
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-700">
                      {product.stock || 0} Restant
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatCurrency(product.price || 0)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}