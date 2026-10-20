// Deterministic, rule-based insights for the /reports cash-flow chart.
// Every statement is derived from the report payload only; when the data
// cannot support a claim (zero denominators, missing cost snapshots, too few
// periods) the rule stays silent instead of guessing.

export type Granularity = "hour" | "day" | "month";
export type AnalyticsLocale = "fr" | "en";

export interface CashflowBucket {
  key: string;
  sales: number;
  salesCount: number;
  entries: number;
  entriesCount: number;
  expenses: number;
  expensesCount: number;
  net: number;
  elapsed: boolean;
}

export interface CashflowTotals {
  start: string;
  end: string;
  sales: number;
  salesCount: number;
  entries: number;
  entriesCount: number;
  expenses: number;
  expensesCount: number;
}

export interface ProfitWindow {
  grossProfit: number;
  coveredRevenue: number;
  itemCount: number;
  coverage: number;
}

export interface CashflowReport {
  granularity: Granularity;
  isPartial: boolean;
  series: CashflowBucket[];
  totals: Omit<CashflowTotals, "start" | "end">;
  comparison: { current: CashflowTotals; previous: CashflowTotals };
  profit: { current: ProfitWindow; previous: ProfitWindow } | null;
  categories: { category: string | null; revenue: number; quantity: number; grossProfit?: number; profitCoverage?: number }[];
  topProducts: { productId: string | null; name: string; quantity: number; revenue: number }[];
  stock: { lowStockCount: number; activeProducts: number; unsoldProducts: number };
}

export type InsightTone = "positive" | "negative" | "neutral" | "warning";
export type InsightIcon =
  | "trend-up" | "trend-down" | "calendar-high" | "calendar-low" | "wallet" | "receipt"
  | "percent" | "tag" | "package" | "alert" | "info";

export interface Insight {
  id: string;
  icon: InsightIcon;
  tone: InsightTone;
  text: string;
  period: string;
  /** Headline figure (amount or percentage) shown beside the text. */
  value?: string;
  /** Higher shows first. */
  priority: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Percent change, or null when the previous value cannot be a denominator. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return round1(((current - previous) / previous) * 100);
}

/** Share of a part in a whole, or null for an empty whole. */
export function share(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return round1((part / whole) * 100);
}

/** Gross margin in %, only when every sold item had a cost snapshot. */
export function grossMargin(window: ProfitWindow | undefined | null): number | null {
  if (!window || window.itemCount === 0 || window.coverage < 1) return null;
  return share(window.grossProfit, window.coveredRevenue);
}

/** Highest and lowest elapsed buckets by sales; null unless they truly differ. */
export function salesExtremes(series: CashflowBucket[]) {
  const elapsed = series.filter((bucket) => bucket.elapsed);
  if (elapsed.length < 2) return null;
  let highest = elapsed[0];
  let lowest = elapsed[0];
  for (const bucket of elapsed) {
    if (bucket.sales > highest.sales) highest = bucket;
    if (bucket.sales < lowest.sales) lowest = bucket;
  }
  if (highest.sales <= 0 || highest.sales === lowest.sales) return null;
  const emptyCount = elapsed.filter((bucket) => bucket.sales === 0).length;
  return { highest, lowest, emptyCount, elapsedCount: elapsed.length };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const intlLocale = (locale: AnalyticsLocale) => (locale === "fr" ? "fr-FR" : "en-US");

/** "1 234,50 USD" in French (as on receipts), "$1,234.50" in English. */
export function formatUsd(amount: number, locale: AnalyticsLocale): string {
  if (locale === "fr") {
    const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount));
    return `${amount < 0 ? "−" : ""}${formatted} USD`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatPercent(value: number, locale: AnalyticsLocale, signed = false): string {
  const formatted = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(Math.abs(value));
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  return locale === "fr" ? `${sign}${formatted} %` : `${sign}${formatted}%`;
}

/** Human label for a bucket key, always rendered in business (UTC+2) time. */
export function bucketLabel(key: string, granularity: Granularity, locale: AnalyticsLocale, style: "short" | "long" = "short"): string {
  const lang = intlLocale(locale);
  if (granularity === "hour") {
    const hour = Number(key.slice(11, 13));
    return locale === "fr" ? `${String(hour).padStart(2, "0")} h` : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
  }
  if (granularity === "month") {
    const date = new Date(`${key}-15T12:00:00Z`);
    return date.toLocaleDateString(lang, { month: style === "long" ? "long" : "short", year: "numeric", timeZone: "UTC" });
  }
  const date = new Date(`${key}T12:00:00Z`);
  return style === "long"
    ? date.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : date.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const businessDate = (iso: string, locale: AnalyticsLocale, withTime: boolean) =>
  new Date(iso).toLocaleString(intlLocale(locale), {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Africa/Lubumbashi",
  });

/** "01/10/2026 – 20/10/2026" style label for a comparison window. */
export function windowLabel(window: { start: string; end: string }, locale: AnalyticsLocale, withTime = false): string {
  const start = businessDate(window.start, locale, withTime);
  const end = businessDate(window.end, locale, withTime);
  return start === end ? start : `${start} – ${end}`;
}

// ── Copy (FR default, EN alternative) ───────────────────────────────────────

const copy = {
  fr: {
    period: (current: string, previous: string) => `${current} vs ${previous}`,
    selected: "Période sélectionnée",
    salesUp: (pct: string) => `Les ventes progressent de ${pct} par rapport à la période précédente équivalente.`,
    salesDown: (pct: string) => `Les ventes reculent de ${pct} par rapport à la période précédente équivalente.`,
    salesFlat: "Les ventes sont stables par rapport à la période précédente équivalente.",
    salesNoBaseline: "Aucune vente sur la période précédente : la comparaison en pourcentage n'est pas possible.",
    best: (label: string) => `${label} a généré le plus de ventes.`,
    worst: (label: string) => `${label} a enregistré les ventes les plus faibles.`,
    emptyBuckets: (count: number, unit: string) => `${count} ${unit} sans aucune vente.`,
    units: { hour: ["heure", "heures"], day: ["jour", "jours"], month: ["mois", "mois"] },
    expenseShare: (pct: string) => `Les dépenses validées représentent ${pct} des ventes.`,
    expensesChange: (pct: string, up: boolean) => `Les dépenses validées ${up ? "augmentent" : "diminuent"} de ${pct} par rapport à la période précédente.`,
    negativeNet: "Les dépenses validées dépassent les ventes et les entrées d'argent de la période.",
    entriesChange: (pct: string, up: boolean) => `Les entrées d'argent ${up ? "augmentent" : "diminuent"} de ${pct} par rapport à la période précédente.`,
    margin: (pct: string) => `Marge brute de ${pct} sur les ventes de la période.`,
    marginChange: (points: string, up: boolean) => `La marge brute ${up ? "gagne" : "perd"} ${points} par rapport à la période précédente.`,
    points: (value: string) => `${value} pt${value === "1" ? "" : "s"}`,
    partialCost: (pct: string) => `Marge brute non calculée : ${pct} des articles vendus n'ont pas de coût enregistré.`,
    topCategory: (name: string, pct: string) => `${name} représente ${pct} du chiffre d'affaires.`,
    topProfitCategory: (name: string, pct: string) => `${name} apporte ${pct} de la marge brute.`,
    uncategorized: "Sans catégorie",
    topProduct: (name: string, qty: string) => `${name} est le produit le plus vendu (${qty} unités).`,
    lowStock: (count: number) => `${count} produit${count > 1 ? "s sont" : " est"} au niveau ou sous le stock minimum.`,
    unsold: (count: number) => `${count} produit${count > 1 ? "s actifs n'ont" : " actif n'a"} enregistré aucune vente sur la période.`,
    currentStock: "Stock actuel",
    insufficient: "Pas assez de données sur cette période pour produire des observations fiables.",
  },
  en: {
    period: (current: string, previous: string) => `${current} vs ${previous}`,
    selected: "Selected period",
    salesUp: (pct: string) => `Sales are up ${pct} compared with the previous equivalent period.`,
    salesDown: (pct: string) => `Sales are down ${pct} compared with the previous equivalent period.`,
    salesFlat: "Sales are flat compared with the previous equivalent period.",
    salesNoBaseline: "No sales in the previous period, so a percentage comparison is not possible.",
    best: (label: string) => `${label} generated the highest sales.`,
    worst: (label: string) => `${label} recorded the lowest sales.`,
    emptyBuckets: (count: number, unit: string) => `${count} ${unit} with no sales at all.`,
    units: { hour: ["hour", "hours"], day: ["day", "days"], month: ["month", "months"] },
    expenseShare: (pct: string) => `Validated expenses amount to ${pct} of sales.`,
    expensesChange: (pct: string, up: boolean) => `Validated expenses ${up ? "rose" : "fell"} ${pct} compared with the previous period.`,
    negativeNet: "Validated expenses exceed sales and money entries for this period.",
    entriesChange: (pct: string, up: boolean) => `Money entries ${up ? "rose" : "fell"} ${pct} compared with the previous period.`,
    margin: (pct: string) => `Gross margin of ${pct} on this period's sales.`,
    marginChange: (points: string, up: boolean) => `Gross margin ${up ? "gained" : "lost"} ${points} compared with the previous period.`,
    points: (value: string) => `${value} pt${value === "1" ? "" : "s"}`,
    partialCost: (pct: string) => `Gross margin not calculated: ${pct} of items sold have no recorded cost.`,
    topCategory: (name: string, pct: string) => `${name} accounts for ${pct} of revenue.`,
    topProfitCategory: (name: string, pct: string) => `${name} contributes ${pct} of gross profit.`,
    uncategorized: "Uncategorised",
    topProduct: (name: string, qty: string) => `${name} is the best-selling product (${qty} units).`,
    lowStock: (count: number) => `${count} product${count > 1 ? "s are" : " is"} at or below minimum stock.`,
    unsold: (count: number) => `${count} active product${count > 1 ? "s" : ""} recorded no sales in this period.`,
    currentStock: "Current stock",
    insufficient: "Not enough data in this period to produce reliable observations.",
  },
} as const;

export const insightMessages = copy;

/** Builds every supported insight, most relevant first. */
export function buildCashflowInsights(report: CashflowReport, locale: AnalyticsLocale = "fr"): Insight[] {
  const t = copy[locale];
  const insights: Insight[] = [];
  const { current, previous } = report.comparison;
  const withTime = report.granularity === "hour" && report.isPartial;
  const comparisonPeriod = t.period(windowLabel(current, locale, withTime), windowLabel(previous, locale, withTime));
  const selectedPeriod = t.selected;
  const number = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value);

  // Sales vs the previous equivalent (elapsed-matched) period.
  const salesChange = percentChange(current.sales, previous.sales);
  if (salesChange !== null) {
    const pct = formatPercent(Math.abs(salesChange), locale);
    insights.push({
      id: "sales-change",
      icon: salesChange >= 0 ? "trend-up" : "trend-down",
      tone: salesChange > 0 ? "positive" : salesChange < 0 ? "negative" : "neutral",
      text: salesChange > 0 ? t.salesUp(pct) : salesChange < 0 ? t.salesDown(pct) : t.salesFlat,
      period: comparisonPeriod,
      value: formatPercent(salesChange, locale, true),
      priority: 100,
    });
  } else if (current.sales > 0 && previous.sales === 0) {
    insights.push({ id: "sales-no-baseline", icon: "info", tone: "neutral", text: t.salesNoBaseline, period: comparisonPeriod, priority: 40 });
  }

  // Highest / lowest elapsed periods.
  const extremes = salesExtremes(report.series);
  if (extremes) {
    insights.push({
      id: "best-period",
      icon: "calendar-high",
      tone: "neutral",
      text: t.best(bucketLabel(extremes.highest.key, report.granularity, locale, "long")),
      period: selectedPeriod,
      value: formatUsd(extremes.highest.sales, locale),
      priority: 90,
    });
    if (report.granularity !== "hour") {
      if (extremes.lowest.sales > 0) {
        insights.push({
          id: "worst-period",
          icon: "calendar-low",
          tone: "neutral",
          text: t.worst(bucketLabel(extremes.lowest.key, report.granularity, locale, "long")),
          period: selectedPeriod,
          value: formatUsd(extremes.lowest.sales, locale),
          priority: 60,
        });
      } else {
        const [one, many] = t.units[report.granularity];
        insights.push({
          id: "empty-periods",
          icon: "calendar-low",
          tone: "neutral",
          text: t.emptyBuckets(extremes.emptyCount, extremes.emptyCount > 1 ? many : one),
          period: selectedPeriod,
          value: `${extremes.emptyCount}/${extremes.elapsedCount}`,
          priority: 55,
        });
      }
    }
  }

  // Cash position and expenses.
  const net = report.totals.sales + report.totals.entries - report.totals.expenses;
  if (report.totals.expenses > 0 && net < 0) {
    insights.push({ id: "negative-net", icon: "alert", tone: "warning", text: t.negativeNet, period: selectedPeriod, value: formatUsd(net, locale), priority: 95 });
  }
  const expenseShare = share(report.totals.expenses, report.totals.sales);
  if (expenseShare !== null && report.totals.expenses > 0) {
    insights.push({ id: "expense-share", icon: "receipt", tone: "neutral", text: t.expenseShare(formatPercent(expenseShare, locale)), period: selectedPeriod, value: formatUsd(report.totals.expenses, locale), priority: 70 });
  }
  const expensesChange = percentChange(current.expenses, previous.expenses);
  if (expensesChange !== null && expensesChange !== 0) {
    insights.push({ id: "expenses-change", icon: "receipt", tone: "neutral", text: t.expensesChange(formatPercent(Math.abs(expensesChange), locale), expensesChange > 0), period: comparisonPeriod, value: formatPercent(expensesChange, locale, true), priority: 65 });
  }
  const entriesChange = percentChange(current.entries, previous.entries);
  if (entriesChange !== null && entriesChange !== 0) {
    insights.push({ id: "entries-change", icon: "wallet", tone: "neutral", text: t.entriesChange(formatPercent(Math.abs(entriesChange), locale), entriesChange > 0), period: comparisonPeriod, value: formatPercent(entriesChange, locale, true), priority: 45 });
  }

  // Gross profit (only present for roles allowed to see costs).
  if (report.profit) {
    const currentMargin = grossMargin(report.profit.current);
    const previousMargin = grossMargin(report.profit.previous);
    if (currentMargin !== null) {
      insights.push({ id: "gross-margin", icon: "percent", tone: "neutral", text: t.margin(formatPercent(currentMargin, locale)), period: selectedPeriod, value: formatUsd(report.profit.current.grossProfit, locale), priority: 85 });
      if (previousMargin !== null) {
        const points = round1(currentMargin - previousMargin);
        if (points !== 0) {
          const label = t.points(new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(Math.abs(points)));
          insights.push({ id: "margin-change", icon: points > 0 ? "trend-up" : "trend-down", tone: "neutral", text: t.marginChange(label, points > 0), period: comparisonPeriod, value: `${points > 0 ? "+" : "−"}${label}`, priority: 75 });
        }
      }
    } else if (report.profit.current.itemCount > 0 && report.profit.current.coverage < 1) {
      const missing = round1((1 - report.profit.current.coverage) * 100);
      insights.push({ id: "partial-cost", icon: "info", tone: "warning", text: t.partialCost(formatPercent(missing, locale)), period: selectedPeriod, priority: 50 });
    }
  }

  // Categories (current product category) and products.
  const categoryRevenue = report.categories.reduce((sum, row) => sum + row.revenue, 0);
  const named = (name: string | null) => name || t.uncategorized;
  if (report.categories.length >= 2) {
    const top = report.categories[0];
    const pct = share(top.revenue, categoryRevenue);
    if (pct !== null) insights.push({ id: "top-category", icon: "tag", tone: "neutral", text: t.topCategory(named(top.category), formatPercent(pct, locale)), period: selectedPeriod, value: formatUsd(top.revenue, locale), priority: 72 });
    const profitRows = report.categories.filter((row) => typeof row.grossProfit === "number");
    const fullyCosted = profitRows.length === report.categories.length && profitRows.every((row) => (row.profitCoverage ?? 0) >= 1);
    const totalProfit = profitRows.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0);
    if (fullyCosted && totalProfit > 0) {
      const best = [...profitRows].sort((a, b) => (b.grossProfit ?? 0) - (a.grossProfit ?? 0))[0];
      const profitShare = share(best.grossProfit ?? 0, totalProfit);
      if (profitShare !== null && (best.grossProfit ?? 0) > 0) {
        insights.push({ id: "top-profit-category", icon: "tag", tone: "neutral", text: t.topProfitCategory(named(best.category), formatPercent(profitShare, locale)), period: selectedPeriod, value: formatUsd(best.grossProfit ?? 0, locale), priority: 74 });
      }
    }
  }
  const [topProduct] = report.topProducts;
  if (topProduct && topProduct.quantity > 0) {
    insights.push({ id: "top-product", icon: "package", tone: "neutral", text: t.topProduct(topProduct.name, number(topProduct.quantity)), period: selectedPeriod, value: formatUsd(topProduct.revenue, locale), priority: 68 });
  }
  if (report.stock.lowStockCount > 0) {
    insights.push({ id: "low-stock", icon: "alert", tone: "warning", text: t.lowStock(report.stock.lowStockCount), period: t.currentStock, value: number(report.stock.lowStockCount), priority: 80 });
  }
  if (report.stock.unsoldProducts > 0 && report.stock.activeProducts > 0 && current.salesCount > 0) {
    insights.push({ id: "unsold", icon: "package", tone: "neutral", text: t.unsold(report.stock.unsoldProducts), period: selectedPeriod, value: `${number(report.stock.unsoldProducts)}/${number(report.stock.activeProducts)}`, priority: 42 });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

// ── Per-series analysis (single-series chart view) ───────────────────────────

export type SeriesKey = "sales" | "entries" | "expenses";

export interface SeriesStats {
  total: number;
  /** Average per elapsed bucket (per hour, day or month). */
  average: number;
  highest: { key: string; value: number } | null;
  lowest: { key: string; value: number } | null;
  elapsedCount: number;
  activeCount: number;
}

/** Totals, average and extremes of one series over the buckets that have started. */
export function seriesStats(series: CashflowBucket[], key: SeriesKey): SeriesStats {
  const elapsed = series.filter((bucket) => bucket.elapsed);
  const total = Math.round(elapsed.reduce((sum, bucket) => sum + bucket[key], 0) * 100) / 100;
  let highest: SeriesStats["highest"] = null;
  let lowest: SeriesStats["lowest"] = null;
  for (const bucket of elapsed) {
    if (!highest || bucket[key] > highest.value) highest = { key: bucket.key, value: bucket[key] };
    if (!lowest || bucket[key] < lowest.value) lowest = { key: bucket.key, value: bucket[key] };
  }
  const hasSpread = highest !== null && lowest !== null && highest.value !== lowest.value;
  return {
    total,
    average: elapsed.length ? Math.round((total / elapsed.length) * 100) / 100 : 0,
    highest: hasSpread ? highest : null,
    lowest: hasSpread ? lowest : null,
    elapsedCount: elapsed.length,
    activeCount: elapsed.filter((bucket) => bucket[key] > 0).length,
  };
}

/** Change of one series from the previous bucket, or null when not comparable. */
export function bucketChange(series: CashflowBucket[], index: number, key: SeriesKey): number | null {
  if (index <= 0 || !series[index]?.elapsed) return null;
  return percentChange(series[index][key], series[index - 1][key]);
}

/**
 * Axis label that stays readable when every bucket gets a tick:
 * hours "08", a week "lun. 20", a month "20", a year "oct.".
 */
export function axisTickLabel(key: string, granularity: Granularity, bucketCount: number, locale: AnalyticsLocale): string {
  if (granularity === "hour") return key.slice(11, 13);
  if (granularity === "month") {
    return new Date(`${key}-15T12:00:00Z`).toLocaleDateString(intlLocale(locale), { month: "short", timeZone: "UTC" });
  }
  const date = new Date(`${key}T12:00:00Z`);
  if (bucketCount > 7) return String(date.getUTCDate());
  const weekday = date.toLocaleDateString(intlLocale(locale), { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${date.getUTCDate()}`;
}
