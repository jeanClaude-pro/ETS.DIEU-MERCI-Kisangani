import type { RegionCodeFilter } from "../types/index.ts";
import { getItemSubtotal, getItemRegionCode, isReportableSale, projectSalesToRegion, roundCurrency } from "../utils/regionalSales.ts";
import type { BusinessSale } from "./localBusinessReadModel.ts";

const OFFSET_MS = 2 * 60 * 60 * 1000;

export interface LocalReportRange {
  start: Date;
  end: Date;
  description: string;
}

export interface LocalAnalyticsData {
  totalSales: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  totalValidatedExpenses: number;
  totalValidatedExpenseCount: number;
  validatedExpenses: Array<{
    _id: string;
    expenseId: string;
    reason: string;
    amount: number;
    recipientName?: string;
    paymentMethod?: string;
    regionCode?: string;
    validatedAt?: string;
    createdAt: string;
  }>;
  totalEntries: number;
  netRevenue: number;
  averageSale: number;
  salesByDay: Array<{ date: string; dayName: string; sales: number; revenue: number }>;
  salesByWeek: Array<{ week: string; startDate: string; endDate: string; sales: number; revenue: number }>;
  salesByMonth: Array<{ month: string; monthName: string; sales: number; revenue: number }>;
  salesByYear: Array<{ year: string; months: Array<{ month: string; monthName: string; sales: number; revenue: number }> }>;
  topProducts: Array<{ productId?: string; name: string; regionCode?: string; quantity: number; revenue: number }>;
  topCustomers: Array<{ name: string; purchases: number; totalSpent: number; lastPurchase?: string; averagePurchase?: number }>;
  recentTrends: { salesGrowth: number; revenueGrowth: number; customerGrowth: number };
}

export function businessDate(now = new Date()): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function parseBusinessDate(value: string, endOfDay = false): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+02:00`);
  if (Number.isNaN(parsed.getTime()) || businessDate(parsed) !== value) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

export function localReportRange(query: { from?: string; to?: string; date?: string; year?: string | number; month?: string | number } = {}, now = new Date()): LocalReportRange {
  if (query.from || query.to) {
    const start = query.from ? parseBusinessDate(String(query.from)) : new Date(0);
    const end = query.to ? parseBusinessDate(String(query.to), true) : now;
    if (start > end) throw new Error("Start date must precede end date");
    return { start, end, description: `Custom range: ${query.from || "Beginning"} to ${query.to || "Now"}` };
  }
  if (query.date) {
    return { start: parseBusinessDate(query.date), end: parseBusinessDate(query.date, true), description: `Day: ${query.date}` };
  }
  const year = Number(query.year);
  if (Number.isInteger(year) && query.month) {
    const month = Number(query.month);
    if (month < 1 || month > 12) throw new Error("Invalid month");
    const label = `${year}-${String(month).padStart(2, "0")}`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
      start: parseBusinessDate(`${label}-01`),
      end: new Date(parseBusinessDate(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`).getTime() - 1),
      description: `Month: ${label}`,
    };
  }
  if (Number.isInteger(year)) {
    return { start: parseBusinessDate(`${year}-01-01`), end: parseBusinessDate(`${year}-12-31`, true), description: `Year: ${year}` };
  }
  const today = businessDate(now);
  return { start: parseBusinessDate(today), end: parseBusinessDate(today, true), description: "Today (default)" };
}

const inRange = (sale: BusinessSale, range: LocalReportRange): boolean => {
  const time = new Date(sale.createdAt).getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
};

function localParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

function dayKey(iso: string): string {
  const p = localParts(iso);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  const p = localParts(iso);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function isoWeekKey(iso: string): string {
  const date = new Date(`${dayKey(iso)}T12:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const percentChange = (current: number, previous: number): number =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;

function customerKey(sale: BusinessSale): string {
  return sale.customer.phone || sale.customer.name;
}

function reportable(sales: readonly BusinessSale[], range: LocalReportRange, region: RegionCodeFilter): BusinessSale[] {
  return projectSalesToRegion(sales.filter((sale) => isReportableSale(sale) && inRange(sale, range)), region);
}

function totals(sales: readonly BusinessSale[]) {
  return {
    count: sales.length,
    revenue: roundCurrency(sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
    customers: new Set(sales.filter((sale) => sale.customer.isWalkIn !== true).map(customerKey)).size,
  };
}

export function buildLocalAnalytics(
  allSales: readonly BusinessSale[],
  range: LocalReportRange,
  region: RegionCodeFilter = "",
  extras: {
    totalEntries?: number;
    totalValidatedExpenses?: number;
    totalValidatedExpenseCount?: number;
    validatedExpenses?: LocalAnalyticsData["validatedExpenses"];
  } = {},
): { data: LocalAnalyticsData; reservations: { count: number; value: number; pendingCount: number; pendingValue: number } } {
  const sales = reportable(allSales, range, region);
  const duration = range.end.getTime() - range.start.getTime() + 1;
  const previousRange = {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime() - 1),
    description: "Previous period",
  };
  const previous = reportable(allSales, previousRange, region);
  const currentTotals = totals(sales);
  const previousTotals = totals(previous);
  const products = new Map<string, LocalAnalyticsData["topProducts"][number]>();
  const customers = new Map<string, LocalAnalyticsData["topCustomers"][number]>();
  const days = new Map<string, { sales: number; revenue: number }>();
  const weeks = new Map<string, { sales: number; revenue: number }>();
  const months = new Map<string, { sales: number; revenue: number }>();

  for (const sale of sales) {
    for (const item of sale.items) {
      const key = `${item.productId || item.name}:${getItemRegionCode(item)}`;
      const existing = products.get(key) || { productId: item.productId, name: item.name, regionCode: getItemRegionCode(item), quantity: 0, revenue: 0 };
      existing.quantity += Number(item.quantity || 0);
      existing.revenue = roundCurrency(existing.revenue + Number(item.netTotal ?? getItemSubtotal(item)));
      products.set(key, existing);
    }
    if (sale.customer.isWalkIn !== true) {
      const key = customerKey(sale);
      const existing = customers.get(key) || { name: sale.customer.name, purchases: 0, totalSpent: 0, lastPurchase: sale.createdAt, averagePurchase: 0 };
      existing.purchases += 1;
      existing.totalSpent = roundCurrency(existing.totalSpent + sale.total);
      if (sale.createdAt > String(existing.lastPurchase)) existing.lastPurchase = sale.createdAt;
      existing.averagePurchase = roundCurrency(existing.totalSpent / existing.purchases);
      customers.set(key, existing);
    }
    for (const [map, key] of [[days, dayKey(sale.createdAt)], [weeks, isoWeekKey(sale.createdAt)], [months, monthKey(sale.createdAt)]] as const) {
      const existing = map.get(key) || { sales: 0, revenue: 0 };
      existing.sales += 1;
      existing.revenue = roundCurrency(existing.revenue + sale.total);
      map.set(key, existing);
    }
  }

  const totalEntries = roundCurrency(extras.totalEntries || 0);
  const totalValidatedExpenses = roundCurrency(extras.totalValidatedExpenses || 0);
  const monthRows = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, monthName: month, ...value }));
  const selectedYear = String(localParts(range.start.toISOString()).year);
  const reservations = sales.filter((sale) => sale.type === "reservation");
  const pendingReservations = reservations.filter((sale) => sale.status === "pending");

  return {
    data: {
      totalSales: currentTotals.count,
      totalRevenue: currentTotals.revenue,
      totalCustomers: currentTotals.customers,
      totalProducts: products.size,
      totalValidatedExpenses,
      totalValidatedExpenseCount: Number(extras.totalValidatedExpenseCount || extras.validatedExpenses?.length || 0),
      validatedExpenses: extras.validatedExpenses || [],
      totalEntries,
      netRevenue: roundCurrency(currentTotals.revenue + totalEntries - totalValidatedExpenses),
      averageSale: currentTotals.count ? roundCurrency(currentTotals.revenue / currentTotals.count) : 0,
      salesByDay: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, dayName: date, ...value })),
      salesByWeek: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, value]) => ({ week, startDate: week, endDate: week, ...value })),
      salesByMonth: monthRows,
      salesByYear: [{ year: selectedYear, months: monthRows.filter((row) => row.month.startsWith(selectedYear)).map((row) => ({ ...row, month: row.month.slice(5) })) }],
      topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, 50),
      topCustomers: [...customers.values()].sort((a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name)).slice(0, 5),
      recentTrends: {
        salesGrowth: percentChange(currentTotals.count, previousTotals.count),
        revenueGrowth: percentChange(currentTotals.revenue, previousTotals.revenue),
        customerGrowth: percentChange(currentTotals.customers, previousTotals.customers),
      },
    },
    reservations: {
      count: reservations.length,
      value: roundCurrency(reservations.reduce((sum, sale) => sum + sale.total, 0)),
      pendingCount: pendingReservations.length,
      pendingValue: roundCurrency(pendingReservations.reduce((sum, sale) => sum + sale.total, 0)),
    },
  };
}

export function isRangeCovered(range: LocalReportRange, coverage: { start: string | null; end: string | null }): boolean {
  return Boolean(coverage.start && coverage.end && range.start.getTime() >= new Date(coverage.start).getTime() && range.end.getTime() <= new Date(coverage.end).getTime());
}
