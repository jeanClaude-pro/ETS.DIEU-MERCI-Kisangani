import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarArrowDown,
  CalendarArrowUp,
  ChevronDown,
  Info,
  LineChart as LineChartIcon,
  Minus,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  axisTickLabel,
  buildCashflowInsights,
  bucketChange,
  bucketLabel,
  seriesStats,
  formatPercent,
  formatUsd,
  grossMargin,
  percentChange,
  windowLabel,
  type AnalyticsLocale,
  type CashflowReport,
  type Insight,
  type InsightIcon,
  type SeriesKey,
} from "../../services/cashflowInsights";
import { cacheReport, getCachedReport } from "../../services/localBusinessReadModel";
import { cx } from "../ui";

const serverUrl = import.meta.env.VITE_API_URL;
const LOCALE_KEY = "reports.locale";

// Fixed semantic colours requested for this chart.
export const CASHFLOW_COLORS = Object.freeze({
  sales: { stroke: "#16a34a", fill: "#22c55e" },
  entries: { stroke: "#eab308", fill: "#facc15" },
  expenses: { stroke: "#dc2626", fill: "#ef4444" },
});

const ui = {
  fr: {
    eyebrow: "Flux de trésorerie",
    title: "Ventes, entrées et dépenses",
    sales: "Ventes",
    entries: "Entrées d'argent",
    expenses: "Dépenses validées",
    net: "Solde net",
    netHint: "Ventes + entrées − dépenses",
    grossProfit: "Marge brute",
    grossProfitHint: (pct: string) => `${pct} des ventes`,
    grossProfitPartial: (pct: string) => `Coûts connus pour ${pct} des articles`,
    vsPrevious: "vs période précédente",
    noBaseline: "Pas de base de comparaison",
    count: (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`,
    salesUnit: ["vente", "ventes"] as const,
    entriesUnit: ["entrée", "entrées"] as const,
    expensesUnit: ["dépense", "dépenses"] as const,
    insights: "Observations",
    insightsHint: "Calculées automatiquement à partir des données de cette période.",
    showMore: (count: number) => `Voir ${count} observation${count > 1 ? "s" : ""} de plus`,
    showLess: "Réduire",
    insufficient: "Pas assez de données sur cette période pour produire des observations fiables.",
    loading: "Chargement du graphique…",
    error: "Impossible de charger le graphique.",
    retry: "Réessayer",
    offlineCached: (time: string) => `Hors ligne · données du ${time}`,
    offlineNone: "Le graphique sera disponible dès le retour de la connexion.",
    empty: "Aucune vente, entrée ou dépense validée sur cette période.",
    partial: "Période en cours : la comparaison porte sur la même durée écoulée.",
    language: "Langue",
    chartLabel: "Graphique des ventes, entrées d'argent et dépenses validées",
    view: "Afficher",
    viewAll: "Tout",
    total: "Total",
    average: { hour: "Moyenne par heure", day: "Moyenne par jour", month: "Moyenne par mois" },
    highest: "Plus haut",
    lowest: "Plus bas",
    averageLine: "Moyenne",
    previousBucket: { hour: "vs heure précédente", day: "vs jour précédent", month: "vs mois précédent" },
    showSeries: (name: string) => `Afficher seulement : ${name}`,
  },
  en: {
    eyebrow: "Cash flow",
    title: "Sales, entries and expenses",
    sales: "Sales",
    entries: "Money entries",
    expenses: "Validated expenses",
    net: "Net balance",
    netHint: "Sales + entries − expenses",
    grossProfit: "Gross profit",
    grossProfitHint: (pct: string) => `${pct} of sales`,
    grossProfitPartial: (pct: string) => `Costs known for ${pct} of items`,
    vsPrevious: "vs previous period",
    noBaseline: "No comparison baseline",
    count: (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`,
    salesUnit: ["sale", "sales"] as const,
    entriesUnit: ["entry", "entries"] as const,
    expensesUnit: ["expense", "expenses"] as const,
    insights: "Insights",
    insightsHint: "Generated automatically from this period's data.",
    showMore: (count: number) => `Show ${count} more insight${count > 1 ? "s" : ""}`,
    showLess: "Show less",
    insufficient: "Not enough data in this period to produce reliable observations.",
    loading: "Loading chart…",
    error: "The chart could not be loaded.",
    retry: "Retry",
    offlineCached: (time: string) => `Offline · data from ${time}`,
    offlineNone: "The chart will be available as soon as you are back online.",
    empty: "No sales, money entries or validated expenses in this period.",
    partial: "Period in progress: the comparison uses the same elapsed time.",
    language: "Language",
    chartLabel: "Chart of sales, money entries and validated expenses",
    view: "Show",
    viewAll: "All",
    total: "Total",
    average: { hour: "Average per hour", day: "Average per day", month: "Average per month" },
    highest: "Highest",
    lowest: "Lowest",
    averageLine: "Average",
    previousBucket: { hour: "vs previous hour", day: "vs previous day", month: "vs previous month" },
    showSeries: (name: string) => `Show only: ${name}`,
  },
} as const;

function readLocale(): AnalyticsLocale {
  try { return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "fr"; } catch { return "fr"; }
}

const iconFor: Record<InsightIcon, React.ComponentType<{ className?: string }>> = {
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  "calendar-high": CalendarArrowUp,
  "calendar-low": CalendarArrowDown,
  wallet: Wallet,
  receipt: Receipt,
  percent: Percent,
  tag: Tag,
  package: Package,
  alert: AlertTriangle,
  info: Info,
};

const toneStyles: Record<Insight["tone"], string> = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  negative: "bg-red-50 text-red-700 ring-red-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

const compactUsd = (value: number, locale: AnalyticsLocale) => {
  const compact = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return locale === "fr" ? `${compact} $` : `$${compact}`;
};

type Props = {
  /** Same query string the analytics report uses (date/from/to/year + region). */
  params: string;
  online: boolean;
  /** Bumped by the page's refresh button. */
  refreshKey: number;
};

type LoadState =
  | { status: "loading"; report: CashflowReport | null }
  | { status: "ready"; report: CashflowReport; cachedAt?: string }
  | { status: "error"; report: CashflowReport | null; cachedAt?: string };

export default function CashflowOverview({ params, online, refreshKey }: Props) {
  const [locale, setLocale] = useState<AnalyticsLocale>(readLocale);
  const [state, setState] = useState<LoadState>({ status: "loading", report: null });
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // "all" shows the three operations together (default); a single series
  // can be studied on its own with its average, highest and lowest points.
  const [view, setView] = useState<"all" | SeriesKey>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = ui[locale];

  useEffect(() => {
    try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* storage unavailable */ }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `cashflow:${params}`;
    setState((previous) => ({ status: "loading", report: previous.report }));
    (async () => {
      const cached = await getCachedReport(cacheKey).catch(() => undefined);
      const cachedReport = cached?.payload as unknown as CashflowReport | undefined;
      if (!online) {
        if (cancelled) return;
        setState(cachedReport
          ? { status: "ready", report: cachedReport, cachedAt: cached?.cachedAt }
          : { status: "error", report: null });
        return;
      }
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${serverUrl}/reports/cashflow?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as CashflowReport & { timeframe?: { start?: string; end?: string } };
        await cacheReport(cacheKey, payload as unknown as Record<string, unknown>, payload.timeframe?.start || "", payload.timeframe?.end || "").catch(() => undefined);
        if (!cancelled) setState({ status: "ready", report: payload });
      } catch (error) {
        console.error("Cash-flow chart failed to load", error);
        if (!cancelled) setState({ status: "error", report: cachedReport ?? null, cachedAt: cached?.cachedAt });
      }
    })();
    return () => { cancelled = true; };
  }, [params, online, refreshKey, attempt]);

  const report = state.report;
  const insights = useMemo(() => (report ? buildCashflowInsights(report, locale) : []), [report, locale]);
  const chartData = useMemo(() => (report?.series ?? []).map((bucket) => ({
    key: bucket.key,
    // Future buckets are left empty so the curves stop at "now" instead of
    // drawing invented zero values.
    sales: bucket.elapsed ? bucket.sales : null,
    entries: bucket.elapsed ? bucket.entries : null,
    expenses: bucket.elapsed ? bucket.expenses : null,
  })), [report]);
  const bucketsByKey = useMemo(() => new Map((report?.series ?? []).map((bucket) => [bucket.key, bucket])), [report]);

  // On a narrow screen the chart scrolls; open it on the latest period
  // (today, this hour) instead of the first day of the month.
  useEffect(() => {
    const element = scrollRef.current;
    const series = report?.series ?? [];
    if (!element || element.scrollWidth <= element.clientWidth || !series.length) return;
    const lastElapsed = series.reduce((last, bucket, index) => (bucket.elapsed ? index : last), 0);
    const position = ((lastElapsed + 0.5) / series.length) * element.scrollWidth - element.clientWidth * 0.7;
    element.scrollLeft = Math.max(0, position);
  }, [report, view]);

  const header = (
    <div className="flex min-w-0 flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t.eyebrow}</p>
        <h2 id="cashflow-title" className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-950">
          <LineChartIcon className="h-4 w-4 text-blue-700" aria-hidden="true" /> {t.title}
        </h2>
        {report && (
          <p className="mt-1 text-xs text-slate-500">
            {windowLabel(report.comparison.current, locale, report.granularity === "hour" && report.isPartial)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {state.status === "ready" && state.cachedAt && (
          <span className="ui-badge ui-badge-info">{t.offlineCached(new Date(state.cachedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span>
        )}
        <div className="ui-segmented" role="group" aria-label={t.language}>
          {(["fr", "en"] as const).map((code) => (
            <button key={code} type="button" className="ui-segment" aria-pressed={locale === code} onClick={() => setLocale(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (!report) {
    return (
      <section className="ui-card overflow-hidden" aria-labelledby="cashflow-title" aria-busy={state.status === "loading"}>
        {header}
        {state.status === "loading" ? (
          <div className="animate-pulse space-y-4 p-4 sm:p-5" role="status">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 rounded-lg bg-slate-100" />)}
            </div>
            <div className="h-[clamp(15rem,38vh,24rem)] rounded-lg bg-slate-100" />
            <span className="sr-only">{t.loading}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-500"><LineChartIcon className="h-5 w-5" /></span>
            <p className="text-sm font-semibold text-slate-700">{online ? t.error : t.offlineNone}</p>
            {online && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw /> {t.retry}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  const { current, previous } = report.comparison;
  const net = current.sales + current.entries - current.expenses;
  const previousNet = previous.sales + previous.entries - previous.expenses;
  const margin = report.profit ? grossMargin(report.profit.current) : null;
  const hasActivity = report.series.some((bucket) => bucket.sales || bucket.entries || bucket.expenses);
  const visibleInsights = expanded ? insights : insights.slice(0, 4);

  const kpis = [
    { id: "sales", label: t.sales, value: report.totals.sales, change: percentChange(current.sales, previous.sales), detail: t.count(report.totals.salesCount, t.salesUnit[0], t.salesUnit[1]), color: CASHFLOW_COLORS.sales.stroke },
    { id: "entries", label: t.entries, value: report.totals.entries, change: percentChange(current.entries, previous.entries), detail: t.count(report.totals.entriesCount, t.entriesUnit[0], t.entriesUnit[1]), color: CASHFLOW_COLORS.entries.stroke },
    { id: "expenses", label: t.expenses, value: report.totals.expenses, change: percentChange(current.expenses, previous.expenses), detail: t.count(report.totals.expensesCount, t.expensesUnit[0], t.expensesUnit[1]), color: CASHFLOW_COLORS.expenses.stroke },
    { id: "net", label: t.net, value: report.totals.sales + report.totals.entries - report.totals.expenses, change: percentChange(net, previousNet), detail: t.netHint, color: "#1d4ed8" },
  ];

  const SERIES: SeriesKey[] = ["sales", "entries", "expenses"];
  const shown = view === "all" ? SERIES : [view];
  const seriesIndex = new Map(report.series.map((bucket, index) => [bucket.key, index]));
  const single = view === "all" ? null : seriesStats(report.series, view);
  const bucketCount = report.series.length;
  // Every hour/day/month gets its own tick; narrow screens scroll sideways
  // rather than skip any label.
  const pxPerBucket = report.granularity === "hour" ? 28 : report.granularity === "month" ? 46 : bucketCount <= 7 ? 64 : 24;
  const chartMinWidth = bucketCount * pxPerBucket + 80;

  const renderTooltip = ({ active, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || label == null) return null;
    const bucket = bucketsByKey.get(String(label));
    if (!bucket) return null;
    const index = seriesIndex.get(bucket.key) ?? 0;
    const counts: Record<SeriesKey, number> = { sales: bucket.salesCount, entries: bucket.entriesCount, expenses: bucket.expensesCount };
    return (
      <div className="min-w-56 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
        <p className="mb-2 font-semibold capitalize text-slate-900">
          {bucketLabel(bucket.key, report.granularity, locale, "long")}
          {report.granularity === "hour" && <span className="font-normal text-slate-500"> · {bucketLabel(`${bucket.key.slice(0, 10)}`, "day", locale, "short")}</span>}
        </p>
        <ul className="space-y-1.5">
          {shown.map((key) => {
            const change = bucketChange(report.series, index, key);
            return (
              <li key={key}>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CASHFLOW_COLORS[key].stroke }} aria-hidden="true" />
                    {t[key]} <span className="text-slate-400">({counts[key]})</span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{formatUsd(bucket[key], locale)}</span>
                </div>
                {change !== null && (
                  <p className="mt-0.5 text-right text-[11px] tabular-nums text-slate-500">
                    {change > 0 ? "↗" : change < 0 ? "↘" : "→"} {formatPercent(change, locale, true)} {t.previousBucket[report.granularity]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {view === "all" && (
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 pt-2">
            <span className="text-slate-500">{t.net}</span>
            <span className={cx("font-semibold tabular-nums", bucket.net < 0 ? "text-red-700" : "text-slate-900")}>{formatUsd(bucket.net, locale)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="ui-card overflow-hidden" aria-labelledby="cashflow-title">
      {header}

      {/* Headline figures; each operation card also opens that operation on its own. */}
      <dl className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const selectable = kpi.id !== "net";
          const selected = view === kpi.id;
          const body = (
            <>
              <dt className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: kpi.color }} aria-hidden="true" />
                {kpi.label}
              </dt>
              <dd className={cx("mt-1 truncate text-lg font-semibold tabular-nums tracking-tight sm:text-xl xl:text-2xl", kpi.id === "net" && kpi.value < 0 ? "text-red-700" : "text-slate-950")}>
                {formatUsd(kpi.value, locale)}
              </dd>
              <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 sm:text-xs">
                <ChangeChip change={kpi.change} locale={locale} label={t.vsPrevious} emptyLabel={t.noBaseline} />
                <span className="truncate">{kpi.detail}</span>
              </dd>
            </>
          );
          return selectable ? (
            <button
              key={kpi.id}
              type="button"
              onClick={() => setView(selected ? "all" : (kpi.id as SeriesKey))}
              aria-pressed={selected}
              title={t.showSeries(kpi.label)}
              className={cx("min-w-0 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5 sm:py-4", selected && "bg-slate-50 shadow-[inset_0_-3px_0_0]")}
              style={selected ? { color: kpi.color } : undefined}
            >
              <div className="text-slate-950">{body}</div>
            </button>
          ) : (
            <div key={kpi.id} className="min-w-0 bg-white px-4 py-3 sm:px-5 sm:py-4">{body}</div>
          );
        })}
      </dl>

      {report.profit && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs sm:px-5">
          <span className="flex items-center gap-1.5 font-medium text-slate-600"><Percent className="h-3.5 w-3.5" aria-hidden="true" /> {t.grossProfit}</span>
          {margin !== null ? (
            <>
              <span className="font-semibold tabular-nums text-slate-900">{formatUsd(report.profit.current.grossProfit, locale)}</span>
              <span className="text-slate-500">{t.grossProfitHint(formatPercent(margin, locale))}</span>
            </>
          ) : report.profit.current.itemCount > 0 ? (
            <span className="text-amber-800">{t.grossProfitPartial(formatPercent(Math.round(report.profit.current.coverage * 1000) / 10, locale))}</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 px-2 pb-2 pt-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
          <div className="ui-segmented grid w-full grid-cols-2 sm:inline-flex sm:w-auto" role="group" aria-label={t.view}>
            <button type="button" className="ui-segment" aria-pressed={view === "all"} onClick={() => setView("all")}>{t.viewAll}</button>
            {SERIES.map((key) => (
              <button key={key} type="button" className="ui-segment" aria-pressed={view === key} onClick={() => setView(key)}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CASHFLOW_COLORS[key].stroke }} aria-hidden="true" />
                {t[key]}
              </button>
            ))}
          </div>
          {single && (
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <div className="flex gap-1"><dt className="text-slate-500">{t.total} :</dt><dd className="font-semibold tabular-nums text-slate-900">{formatUsd(single.total, locale)}</dd></div>
              <div className="flex gap-1"><dt className="text-slate-500">{t.average[report.granularity]} :</dt><dd className="font-semibold tabular-nums text-slate-900">{formatUsd(single.average, locale)}</dd></div>
            </dl>
          )}
        </div>

        {hasActivity ? (
          <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
            <div className="h-[clamp(16rem,42vh,27rem)]" style={{ minWidth: chartMinWidth }} role="img" aria-label={t.chartLabel}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 22, right: 16, bottom: 0, left: 4 }}>
                  <defs>
                    {SERIES.map((series) => (
                      <linearGradient key={series} id={`cashflow-${series}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CASHFLOW_COLORS[series].fill} stopOpacity={view === "all" ? 0.24 : 0.34} />
                        <stop offset="100%" stopColor={CASHFLOW_COLORS[series].fill} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tickFormatter={(key: string) => axisTickLabel(key, report.granularity, bucketCount, locale)}
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickLine={{ stroke: "#cbd5e1" }}
                    axisLine={{ stroke: "#cbd5e1" }}
                    interval={0}
                    minTickGap={0}
                    padding={{ left: 6, right: 6 }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => compactUsd(value, locale)}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    domain={[0, "auto"]}
                    allowDecimals={false}
                  />
                  <Tooltip content={renderTooltip} cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} />
                  {shown.map((key) => (
                    <Area
                      key={key}
                      name={t[key]}
                      type="monotone"
                      dataKey={key}
                      stroke={CASHFLOW_COLORS[key].stroke}
                      strokeWidth={view === "all" ? 2.25 : 2.75}
                      fill={`url(#cashflow-${key})`}
                      isAnimationActive={false}
                      connectNulls={false}
                      dot={{ r: view === "all" ? 2.25 : 3.25, strokeWidth: 0, fill: CASHFLOW_COLORS[key].stroke }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                  {single && view !== "all" && single.elapsedCount > 1 && (
                    <ReferenceLine
                      y={single.average}
                      stroke="#64748b"
                      strokeDasharray="5 4"
                      label={{ value: `${t.averageLine} ${compactUsd(single.average, locale)}`, position: "insideTopRight", fill: "#475569", fontSize: 11 }}
                    />
                  )}
                  {single?.highest && view !== "all" && (
                    <ReferenceDot
                      x={single.highest.key}
                      y={single.highest.value}
                      r={5.5}
                      fill="#fff"
                      stroke={CASHFLOW_COLORS[view].stroke}
                      strokeWidth={2.5}
                      label={{ value: `▲ ${compactUsd(single.highest.value, locale)}`, position: "top", fill: "#0f172a", fontSize: 11, fontWeight: 700 }}
                    />
                  )}
                  {single?.lowest && view !== "all" && (
                    <ReferenceDot
                      x={single.lowest.key}
                      y={single.lowest.value}
                      r={5.5}
                      fill="#fff"
                      stroke={CASHFLOW_COLORS[view].stroke}
                      strokeWidth={2.5}
                      label={{ value: `▼ ${compactUsd(single.lowest.value, locale)}`, position: "top", fill: "#0f172a", fontSize: 11, fontWeight: 700 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400"><LineChartIcon className="h-5 w-5" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-700">{t.empty}</p>
          </div>
        )}
        {single && (single.highest || single.lowest) && (
          <dl className="mx-2 mt-2 grid gap-2 sm:grid-cols-2">
            {single.highest && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <dt className="text-slate-500">▲ {t.highest} · <span className="capitalize text-slate-700">{bucketLabel(single.highest.key, report.granularity, locale, "long")}</span></dt>
                <dd className="font-semibold tabular-nums text-slate-900">{formatUsd(single.highest.value, locale)}</dd>
              </div>
            )}
            {single.lowest && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <dt className="text-slate-500">▼ {t.lowest} · <span className="capitalize text-slate-700">{bucketLabel(single.lowest.key, report.granularity, locale, "long")}</span></dt>
                <dd className="font-semibold tabular-nums text-slate-900">{formatUsd(single.lowest.value, locale)}</dd>
              </div>
            )}
          </dl>
        )}
        {view === "all" && (
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-2 pb-1 pt-2 text-xs text-slate-600" aria-hidden={!hasActivity}>
            {SERIES.map((series) => (
              <li key={series} className="flex items-center gap-1.5">
                <span className="w-4 rounded-full" style={{ backgroundColor: CASHFLOW_COLORS[series].stroke, height: 3 }} aria-hidden="true" />
                {t[series]}
              </li>
            ))}
          </ul>
        )}
        {report.isPartial && <p className="px-2 pb-1 pt-1 text-center text-[11px] text-slate-400">{t.partial}</p>}
      </div>

      {/* Insights directly beneath the chart they explain. */}
      <div className="border-t border-slate-100 px-4 py-4 sm:px-5" aria-labelledby="cashflow-insights-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id="cashflow-insights-title" className="text-sm font-semibold text-slate-900">{t.insights}</h3>
          <p className="text-xs text-slate-500">{t.insightsHint}</p>
        </div>
        {insights.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">{t.insufficient}</p>
        ) : (
          <>
            <ul className="grid gap-2 md:grid-cols-2">
              {visibleInsights.map((insight) => {
                const Icon = iconFor[insight.icon];
                return (
                  <li key={insight.id} className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                    <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-md ring-1 ring-inset", toneStyles[insight.tone])}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-slate-800">{insight.text}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{insight.period}</p>
                    </div>
                    {insight.value && <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-slate-900">{insight.value}</span>}
                  </li>
                );
              })}
            </ul>
            {insights.length > 4 && (
              <button type="button" onClick={() => setExpanded((value) => !value)} className="ui-btn ui-btn-ghost ui-btn-sm mt-2" aria-expanded={expanded}>
                <ChevronDown className={cx("transition-transform", expanded && "rotate-180")} />
                {expanded ? t.showLess : t.showMore(insights.length - 4)}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ChangeChip({ change, locale, label, emptyLabel }: { change: number | null; locale: AnalyticsLocale; label: string; emptyLabel: string }) {
  if (change === null) return <span className="text-slate-400">{emptyLabel}</span>;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-slate-700" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {formatPercent(change, locale, true)}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
