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
} from "lucide-react";

// Define interfaces for the data structures
interface SaleItem {
  productId?: string;
  name?: string;
  quantity?: number;
  price?: number;
  total?: number;
}

interface Sale {
  _id?: string;
  total: number;
  status?: string;
  createdAt?: string;
  date?: string;
  saleDate?: string;
  items?: SaleItem[];
  customerId?: string;
  customerName?: string;
  type?: string;
  saleId?: string;
  saleNumber?: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

interface Customer {
  _id?: string;
  id?: string;
  name?: string;
  totalSpent?: number;
  totalPurchases?: number;
  email?: string;
}

interface Expense {
  _id?: string;
  amount: number;
  status: string;
  createdAt?: string;
  date?: string;
  validatedAt?: string;
  reason?: string;
  expenseId?: string;
  recipientName?: string;
}

interface Entry {
  _id?: string;
  amount: number;
  status: string;
  createdAt?: string;
  date?: string;
  source?: string;
  category?: string;
  entryId?: string;
  receivedFrom?: {
    name?: string;
  };
}

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
  topProducts: { name: string; quantity: number; revenue: number }[];
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
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const today = new Date();
  
  switch (timeframe) {
    case "day":
      params.set("date", selectedDate || getTodayDate());
      break;
      
    case "week":
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      params.set("from", weekAgo.toISOString().split('T')[0]);
      params.set("to", today.toISOString().split('T')[0]);
      break;
      
    case "month":
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      params.set("from", firstDayOfMonth.toISOString().split('T')[0]);
      params.set("to", lastDayOfMonth.toISOString().split('T')[0]);
      break;
      
    case "year":
      const year = selectedYear || today.getFullYear();
      params.set("year", year.toString());
      break;
  }
  
  return params.toString();
};

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month" | "year">(
    "day"
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [timeframeData, setTimeframeData] = useState<TimeframeData | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Effect to automatically set to today's date when timeframe changes to "day"
  useEffect(() => {
    if (!initialLoad && timeframe === "day") {
      const today = getTodayDate();
      setSelectedDate(today);
    }
  }, [timeframe, initialLoad]);

  // Effect to mark initial load as complete
  useEffect(() => {
    if (analytics) {
      setInitialLoad(false);
    }
  }, [analytics]);

  // Effect to enforce day-only view for non-admin users
  useEffect(() => {
    if (shouldSeeOnlyTodayData() && timeframe !== "day") {
      setTimeframe("day");
      setSelectedDate(getTodayDate());
    }
  }, [timeframe]);

  // Main effect to fetch data when timeframe changes
  useEffect(() => {
    fetchAnalytics();
  }, [timeframe, selectedYear, selectedDate]);

  // Fetch analytics data with server-side timeframe filtering
  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // For non-admin users, only fetch today's data
      if (shouldSeeOnlyTodayData()) {
        await fetchTodayDataOnly();
        return;
      }

      // For admin, fetch data with timeframe filtering
      await fetchDataWithTimeframe();
    } catch (error) {
      console.error("Error fetching analytics:", error);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch only today's data for non-admin users
  const fetchTodayDataOnly = async () => {
    try {
      const today = getTodayDate();
      
      // Build query with today's date
      const timeframeParams = `date=${today}`;
      
      // Fetch sales, expenses, and entries for today
      const [salesResponse, expensesResponse, entriesResponse] = await Promise.all([
        fetch(`${serverUrl}/sales?${timeframeParams}`, {
          headers: getHeaders(),
        }),
        fetch(`${serverUrl}/expenses?${timeframeParams}`, {
          headers: getHeaders(),
        }),
        fetch(`${serverUrl}/entries?${timeframeParams}`, {
          headers: getHeaders(),
        })
      ]);

      if (!salesResponse.ok) {
        throw new Error(`Failed to fetch sales: ${salesResponse.status}`);
      }

      const salesData = await salesResponse.json();
      const expensesData = expensesResponse.ok ? await expensesResponse.json() : { data: [], summary: { totalAmount: 0 } };
      const entriesData = entriesResponse.ok ? await entriesResponse.json() : { data: [], summary: { totalAmount: 0 } };

      // Process the data for today
      const processedAnalytics = processTodayData(
        salesData,
        expensesData,
        entriesData
      );
      
      setAnalytics(processedAnalytics);
      setTimeframeData({ description: "Aujourd'hui", start: today, end: today });
      
    } catch (error) {
      console.error("Error fetching today's data:", error);
      throw error;
    }
  };

  // Fetch data with timeframe filtering for admin users
  const fetchDataWithTimeframe = async () => {
    try {
      // Build timeframe parameters
      const timeframeParams = getTimeframeParams(timeframe, selectedYear, selectedDate);
      
      // Fetch sales, expenses, and entries with timeframe filtering
      const [salesResponse, expensesResponse, entriesResponse, customersResponse] = await Promise.all([
        fetch(`${serverUrl}/sales?${timeframeParams}`, {
          headers: getHeaders(),
        }),
        fetch(`${serverUrl}/expenses?${timeframeParams}`, {
          headers: getHeaders(),
        }),
        fetch(`${serverUrl}/entries?${timeframeParams}`, {
          headers: getHeaders(),
        }),
        fetch(`${serverUrl}/customers?limit=0`, {
          headers: getHeaders(),
        })
      ]);

      if (!salesResponse.ok) {
        throw new Error(`Failed to fetch sales: ${salesResponse.status}`);
      }

      const salesData = await salesResponse.json();
      const expensesData = expensesResponse.ok ? await expensesResponse.json() : { data: [], summary: { totalAmount: 0 } };
      const entriesData = entriesResponse.ok ? await entriesResponse.json() : { data: [], summary: { totalAmount: 0 } };
      const customersData = customersResponse.ok ? await customersResponse.json() : [];

      // Extract customers from response
      const customers = Array.isArray(customersData) 
        ? customersData 
        : customersData.data || customersData.customers || [];

      // Process the data with timeframe
      const processedAnalytics = processAnalyticsData(
        salesData,
        expensesData,
        entriesData,
        customers
      );
      
      setAnalytics(processedAnalytics);
      setTimeframeData(salesData.timeframe);
      
      // Extract available years for year selection
      if (salesData.timeframe) {
        const years = extractAvailableYears();
        setAvailableYears(years);
        if (years.length > 0 && !years.includes(selectedYear)) {
          setSelectedYear(years[0]);
        }
      }
      
    } catch (error) {
      console.error("Error fetching analytics with timeframe:", error);
      throw error;
    }
  };

  // Process today's data for non-admin users
  const processTodayData = (
    salesData: any,
    expensesData: any,
    entriesData: any
  ): AnalyticsData => {
    const sales = salesData.data || [];
    const expenses = expensesData.data || [];
    const entries = entriesData.data || [];

    // Filter completed sales only (not voided, not corrected, not expense type)
    const completedSales = sales.filter((sale: Sale) => 
      sale.status !== "voided" && 
      sale.status !== "refunded" && 
      sale.status !== "corrected" &&
      sale.type !== "expense" &&
      (sale.status === "completed" || sale.status === "pending")
    );

    const totalSales = completedSales.length;
    const totalRevenue = completedSales.reduce((sum: number, sale: Sale) => sum + sale.total, 0);
    
    // Calculate entries (active entries only)
    const activeEntries = entries.filter((entry: Entry) => entry.status === "active");
    const totalEntries = activeEntries.reduce((sum: number, entry: Entry) => sum + entry.amount, 0);
    
    // Calculate validated expenses
    const validatedExpenses = expenses.filter((expense: Expense) => expense.status === "validated");
    const totalValidatedExpenses = validatedExpenses.reduce((sum: number, expense: Expense) => sum + expense.amount, 0);
    
    // Calculate net revenue
    const netRevenue = (totalRevenue + totalEntries) - totalValidatedExpenses;

    // Count unique products
    const productIds = new Set();
    completedSales.forEach((sale: Sale) => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: SaleItem) => {
          if (item.productId) {
            productIds.add(item.productId);
          }
        });
      }
    });
    const totalProducts = productIds.size;

    // Count unique customers
    const customerIds = new Set();
    completedSales.forEach((sale: Sale) => {
      if (sale.customerId) {
        customerIds.add(sale.customerId);
      } else if (sale.customer?.phone) {
        customerIds.add(sale.customer.phone);
      }
    });
    const totalCustomers = customerIds.size;

    // Today's chart data
    const today = new Date();
    const salesByDay = [
      {
        date: today.toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        }),
        dayName: today.toLocaleDateString("fr-FR", { weekday: "long" }),
        sales: totalSales,
        revenue: totalRevenue,
      },
    ];

    // Top products from today's sales
    const productStats = new Map();
    completedSales.forEach((sale: Sale) => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: SaleItem) => {
          const productName = item.name || "Unknown Product";
          if (productStats.has(productName)) {
            const existing = productStats.get(productName);
            productStats.set(productName, {
              quantity: existing.quantity + (item.quantity || 0),
              revenue: existing.revenue + (item.total || 0),
            });
          } else {
            productStats.set(productName, {
              quantity: item.quantity || 0,
              revenue: item.total || 0,
            });
          }
        });
      }
    });

    const topProducts = Array.from(productStats.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 50);

    // Top customers from today's sales
    const customerStats = new Map();
    completedSales.forEach((sale: Sale) => {
      const customerName = sale.customer?.name || sale.customerName || "Unknown Customer";
      const key = customerName;
      
      if (customerStats.has(key)) {
        const existing = customerStats.get(key);
        customerStats.set(key, {
          name: customerName,
          purchases: existing.purchases + 1,
          totalSpent: existing.totalSpent + sale.total,
        });
      } else {
        customerStats.set(key, {
          name: customerName,
          purchases: 1,
          totalSpent: sale.total,
        });
      }
    });

    const topCustomers = Array.from(customerStats.values())
      .filter(customer => customer.purchases > 0 && customer.name !== "Unknown Customer")
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    // Simple growth trends (0 for today view)
    const recentTrends = {
      salesGrowth: 0,
      revenueGrowth: 0,
      customerGrowth: 0,
    };

    return {
      totalSales,
      totalRevenue,
      totalCustomers,
      totalProducts,
      totalValidatedExpenses,
      totalEntries,
      netRevenue,
      salesByDay,
      salesByWeek: [],
      salesByMonth: [],
      salesByYear: [],
      topProducts,
      topCustomers,
      recentTrends,
    };
  };

  // Process analytics data with timeframe for admin users
  const processAnalyticsData = (
    salesData: any,
    expensesData: any,
    entriesData: any,
    customers: Customer[]
  ): AnalyticsData => {
    const sales = salesData.data || [];
    const expensesSummary = expensesData.summary || { totalAmount: 0 };
    const entriesSummary = entriesData.summary || { totalAmount: 0 };

    // Filter completed sales
    const completedSales = sales.filter((sale: Sale) => 
      sale.status !== "voided" && 
      sale.status !== "refunded" && 
      sale.status !== "corrected" &&
      sale.type !== "expense" &&
      (sale.status === "completed" || sale.status === "pending")
    );

    const totalSales = completedSales.length;
    const totalRevenue = completedSales.reduce((sum: number, sale: Sale) => sum + sale.total, 0);
    const totalEntries = entriesSummary.totalAmount || 0;
    const totalValidatedExpenses = expensesSummary.totalAmount || 0;
    const netRevenue = (totalRevenue + totalEntries) - totalValidatedExpenses;

    // Count unique products
    const productIds = new Set();
    completedSales.forEach((sale: Sale) => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: SaleItem) => {
          if (item.productId) {
            productIds.add(item.productId);
          }
        });
      }
    });
    const totalProducts = productIds.size;

    // Count unique customers
    const customerIds = new Set();
    completedSales.forEach((sale: Sale) => {
      if (sale.customerId) {
        customerIds.add(sale.customerId);
      } else if (sale.customer?.phone) {
        customerIds.add(sale.customer.phone);
      }
    });
    const totalCustomers = customerIds.size;

    // Generate chart data based on timeframe
    const chartData = generateChartData(completedSales);

    // Top products
    const productStats = new Map();
    completedSales.forEach((sale: Sale) => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: SaleItem) => {
          const productName = item.name || "Unknown Product";
          if (productStats.has(productName)) {
            const existing = productStats.get(productName);
            productStats.set(productName, {
              quantity: existing.quantity + (item.quantity || 0),
              revenue: existing.revenue + (item.total || 0),
            });
          } else {
            productStats.set(productName, {
              quantity: item.quantity || 0,
              revenue: item.total || 0,
            });
          }
        });
      }
    });

    const topProducts = Array.from(productStats.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 50);

    // Top customers
    const customerStats = new Map();
    completedSales.forEach((sale: Sale) => {
      const customerName = sale.customer?.name || sale.customerName || "Unknown Customer";
      const key = customerName;
      
      if (customerStats.has(key)) {
        const existing = customerStats.get(key);
        customerStats.set(key, {
          name: customerName,
          purchases: existing.purchases + 1,
          totalSpent: existing.totalSpent + sale.total,
        });
      } else {
        customerStats.set(key, {
          name: customerName,
          purchases: 1,
          totalSpent: sale.total,
        });
      }
    });

    // Also include customers from the customers list
    customers.forEach((customer: Customer) => {
      const key = customer.name || `Customer ${customer._id?.substring(0, 8)}...`;
      if (!customerStats.has(key) && customer.totalSpent && customer.totalSpent > 0) {
        customerStats.set(key, {
          name: customer.name || `Customer ${customer._id?.substring(0, 8)}...`,
          purchases: customer.totalPurchases || 0,
          totalSpent: customer.totalSpent || 0,
        });
      }
    });

    const topCustomers = Array.from(customerStats.values())
      .filter(customer => customer.purchases > 0 && customer.name !== "Unknown Customer")
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    // Calculate growth trends
    const recentTrends = calculateGrowthTrends(completedSales, chartData);

    return {
      totalSales,
      totalRevenue,
      totalCustomers,
      totalProducts,
      totalValidatedExpenses,
      totalEntries,
      netRevenue,
      ...chartData,
      topProducts,
      topCustomers,
      recentTrends,
    };
  };

  // Generate chart data based on timeframe
  const generateChartData = (sales: Sale[]) => {
    if (!sales.length) {
      return {
        salesByDay: [],
        salesByWeek: [],
        salesByMonth: [],
        salesByYear: [],
      };
    }

    const now = new Date();
    
    // For day view - last 7 days
    const salesByDay = getLast7Days().map((date: Date) => {
      const daySales = sales.filter((sale: Sale) => {
        try {
          const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate || "");
          return saleDate.toDateString() === date.toDateString();
        } catch (error) {
          return false;
        }
      });
      return {
        date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        dayName: date.toLocaleDateString("fr-FR", { weekday: "long" }),
        sales: daySales.length,
        revenue: daySales.reduce((sum: number, sale: Sale) => sum + sale.total, 0),
      };
    });

    // For week view - last 4 weeks
    const salesByWeek = getLast4Weeks().map((week: { start: Date; end: Date }, index: number) => {
      const weekSales = sales.filter((sale: Sale) => {
        try {
          const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate || "");
          return saleDate >= week.start && saleDate <= week.end;
        } catch (error) {
          return false;
        }
      });

      const startDateStr = week.start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      const endDateStr = week.end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

      return {
        week: `Semaine ${index + 1}`,
        startDate: startDateStr,
        endDate: endDateStr,
        sales: weekSales.length,
        revenue: weekSales.reduce((sum: number, sale: Sale) => sum + sale.total, 0),
      };
    });

    // For month view - last 6 months
    const salesByMonth = getLast6Months().map((month: any) => {
      const monthSales = sales.filter((sale: Sale) => {
        try {
          const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate || "");
          return saleDate.getMonth() === month.month && saleDate.getFullYear() === month.year;
        } catch (error) {
          return false;
        }
      });
      return {
        month: month.shortName,
        monthName: month.fullName,
        sales: monthSales.length,
        revenue: monthSales.reduce((sum: number, sale: Sale) => sum + sale.total, 0),
      };
    });

    // For year view - group by month for selected year
    const currentYear = selectedYear || now.getFullYear();
    const yearSales = sales.filter((sale: Sale) => {
      try {
        const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate || "");
        return saleDate.getFullYear() === currentYear;
      } catch (error) {
        return false;
      }
    });

    const monthsData = Array.from({ length: 12 }, (_, i) => {
      const monthSales = yearSales.filter((sale: Sale) => {
        try {
          const saleDate = new Date(sale.createdAt || sale.date || sale.saleDate || "");
          return saleDate.getMonth() === i;
        } catch (error) {
          return false;
        }
      });
      
      const monthDate = new Date(currentYear, i, 1);
      return {
        month: String(i),
        monthName: monthDate.toLocaleDateString("fr-FR", { month: "long" }),
        sales: monthSales.length,
        revenue: monthSales.reduce((sum: number, sale: Sale) => sum + sale.total, 0),
      };
    }).filter(month => month.sales > 0);

    const salesByYear = [{
      year: currentYear.toString(),
      months: monthsData,
    }];

    return {
      salesByDay,
      salesByWeek,
      salesByMonth,
      salesByYear,
    };
  };

  // Helper functions for chart data
  const getLast7Days = (): Date[] => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date);
    }
    return days;
  };

  const getLast4Weeks = (): { start: Date; end: Date }[] => {
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      weeks.push({ start, end });
    }
    return weeks;
  };

  const getLast6Months = (): any[] => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      months.push({
        month: date.getMonth(),
        year: date.getFullYear(),
        shortName: date.toLocaleDateString("fr-FR", { month: "short" }),
        fullName: date.toLocaleDateString("fr-FR", { month: "long" }),
      });
    }
    return months;
  };

  // Calculate growth trends
  const calculateGrowthTrends = (sales: Sale[], chartData: any) => {
    const salesByMonth = chartData.salesByMonth || [];
    
    if (salesByMonth.length < 2) {
      return {
        salesGrowth: sales.length > 0 ? 5 : 0,
        revenueGrowth: sales.length > 0 ? 8 : 0,
        customerGrowth: sales.length > 0 ? 3 : 0,
      };
    }

    const currentMonth = salesByMonth[salesByMonth.length - 1];
    const previousMonth = salesByMonth[salesByMonth.length - 2];

    const salesGrowth = previousMonth.sales > 0 
      ? Math.round(((currentMonth.sales - previousMonth.sales) / previousMonth.sales) * 100)
      : currentMonth.sales > 0 ? 100 : 0;

    const revenueGrowth = previousMonth.revenue > 0 
      ? Math.round(((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100)
      : currentMonth.revenue > 0 ? 100 : 0;

    return {
      salesGrowth,
      revenueGrowth,
      customerGrowth: Math.round(salesGrowth * 0.8), // Rough estimate
    };
  };

  // Extract available years from data
  const extractAvailableYears = (): number[] => {
    const yearsSet = new Set<number>();
    const now = new Date();
    
    // Add current year
    yearsSet.add(now.getFullYear());
    
    // Add previous 5 years as options
    for (let i = 1; i <= 5; i++) {
      yearsSet.add(now.getFullYear() - i);
    }
    
    // Sort descending
    return Array.from(yearsSet).sort((a, b) => b - a);
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
      case "year":
        const yearData = analytics.salesByYear.find(
          (y) => y.year === selectedYear.toString()
        );
        return yearData ? yearData.months : [];
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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

        {/* Top Products and Customers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              Articles Vendus ({getTimeframeLabel()})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {analytics.topProducts.length > 0 ? (
                analytics.topProducts.map((product, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                        {index + 1}. {product.name}
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
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium text-sm sm:text-base">
                    Aucun produit vendu
                  </p>
                  <p className="text-xs sm:text-sm">dans cette période</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Meilleurs Clients ({getTimeframeLabel()})
            </h3>
            <div className="space-y-3">
              {analytics.topCustomers.length > 0 ? (
                analytics.topCustomers.map((customer, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
                        <span className="text-xs sm:text-sm font-medium text-white">
                          {customer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                          {customer.name}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {customer.purchases} achats
                        </p>
                      </div>
                    </div>
                    <div className="text-right ml-2 flex-shrink-0">
                      <p className="font-medium text-gray-900 text-sm sm:text-base whitespace-nowrap">
                        {formatCurrency(customer.totalSpent)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium text-sm sm:text-base">
                    Aucun client
                  </p>
                  <p className="text-xs sm:text-sm">dans cette période</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}