import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCashflowInsights,
  bucketLabel,
  formatPercent,
  grossMargin,
  percentChange,
  salesExtremes,
  share,
  seriesStats,
  bucketChange,
  axisTickLabel,
  type CashflowBucket,
  type CashflowReport,
} from "./cashflowInsights.ts";

const bucket = (key: string, sales: number, extra: Partial<CashflowBucket> = {}): CashflowBucket => ({
  key, sales, salesCount: sales > 0 ? 1 : 0, entries: 0, entriesCount: 0, expenses: 0, expensesCount: 0,
  net: sales, elapsed: true, ...extra,
});

function report(overrides: Partial<CashflowReport> = {}): CashflowReport {
  const series = overrides.series ?? [
    bucket("2026-10-05", 100), bucket("2026-10-06", 40), bucket("2026-10-07", 250),
    bucket("2026-10-08", 0, { elapsed: false }),
  ];
  const sales = series.reduce((sum, row) => sum + row.sales, 0);
  return {
    granularity: "day",
    isPartial: false,
    series,
    totals: { sales, salesCount: 3, entries: 50, entriesCount: 1, expenses: 39, expensesCount: 2 },
    comparison: {
      current: { start: "2026-10-04T22:00:00.000Z", end: "2026-10-08T21:59:59.999Z", sales, salesCount: 3, entries: 50, entriesCount: 1, expenses: 39, expensesCount: 2 },
      previous: { start: "2026-09-30T22:00:00.000Z", end: "2026-10-04T21:59:59.999Z", sales: 300, salesCount: 4, entries: 0, entriesCount: 0, expenses: 30, expensesCount: 1 },
    },
    profit: null,
    categories: [],
    topProducts: [],
    stock: { lowStockCount: 0, activeProducts: 10, unsoldProducts: 0 },
    ...overrides,
  };
}

test("percent change and share refuse zero or missing denominators", () => {
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(50, 0), null);
  assert.equal(percentChange(0, 0), null);
  assert.equal(share(62, 100), 62);
  assert.equal(share(1, 0), null);
});

test("highest and lowest periods ignore buckets that have not happened yet", () => {
  const extremes = salesExtremes(report().series);
  assert.equal(extremes?.highest.key, "2026-10-07");
  assert.equal(extremes?.lowest.key, "2026-10-06");
  assert.equal(extremes?.elapsedCount, 3);
  // A single elapsed bucket, or all-equal buckets, supports no extreme claim.
  assert.equal(salesExtremes([bucket("2026-10-05", 10)]), null);
  assert.equal(salesExtremes([bucket("2026-10-05", 0), bucket("2026-10-06", 0)]), null);
});

test("sales comparison states the real change against the previous period", () => {
  const insights = buildCashflowInsights(report(), "fr");
  const change = insights.find((insight) => insight.id === "sales-change");
  // 390 vs 300 → +30 %
  assert.equal(change?.value, "+30 %");
  assert.equal(change?.tone, "positive");
  assert.match(change?.text ?? "", /progressent de 30 %/);
  assert.match(change?.period ?? "", /05\/10\/2026 – 08\/10\/2026 vs 01\/10\/2026 – 04\/10\/2026/);
});

test("no percentage is invented when the previous period had no sales", () => {
  const base = report();
  const insights = buildCashflowInsights(report({
    comparison: { ...base.comparison, previous: { ...base.comparison.previous, sales: 0, salesCount: 0 } },
  }));
  assert.equal(insights.some((insight) => insight.id === "sales-change"), false);
  assert.ok(insights.some((insight) => insight.id === "sales-no-baseline"));
});

test("an empty period produces no misleading insight", () => {
  const empty = report({
    series: [bucket("2026-10-05", 0), bucket("2026-10-06", 0)],
    totals: { sales: 0, salesCount: 0, entries: 0, entriesCount: 0, expenses: 0, expensesCount: 0 },
    comparison: {
      current: { start: "2026-10-04T22:00:00.000Z", end: "2026-10-06T21:59:59.999Z", sales: 0, salesCount: 0, entries: 0, entriesCount: 0, expenses: 0, expensesCount: 0 },
      previous: { start: "2026-10-02T22:00:00.000Z", end: "2026-10-04T21:59:59.999Z", sales: 0, salesCount: 0, entries: 0, entriesCount: 0, expenses: 0, expensesCount: 0 },
    },
  });
  assert.deepEqual(buildCashflowInsights(empty), []);
});

test("days without sales are reported as a count instead of a 'lowest day'", () => {
  const insights = buildCashflowInsights(report({
    series: [bucket("2026-10-05", 100), bucket("2026-10-06", 0), bucket("2026-10-07", 0)],
  }));
  const empty = insights.find((insight) => insight.id === "empty-periods");
  assert.equal(empty?.value, "2/3");
  assert.equal(insights.some((insight) => insight.id === "worst-period"), false);
});

test("expense share, expense change and negative net use validated expenses", () => {
  const insights = buildCashflowInsights(report(), "en");
  assert.equal(insights.find((insight) => insight.id === "expense-share")?.text, "Validated expenses amount to 10% of sales.");
  assert.equal(insights.find((insight) => insight.id === "expenses-change")?.value, "+30%");
  assert.equal(insights.find((insight) => insight.id === "expenses-change")?.tone, "neutral");

  const negative = buildCashflowInsights(report({ totals: { sales: 10, salesCount: 1, entries: 0, entriesCount: 0, expenses: 25, expensesCount: 1 } }), "en");
  const warning = negative.find((insight) => insight.id === "negative-net");
  assert.equal(warning?.tone, "warning");
  assert.equal(warning?.value, "-$15.00");
});

test("gross margin needs complete cost snapshots; partial coverage is flagged instead", () => {
  assert.equal(grossMargin({ grossProfit: 40, coveredRevenue: 160, itemCount: 4, coverage: 1 }), 25);
  assert.equal(grossMargin({ grossProfit: 40, coveredRevenue: 160, itemCount: 4, coverage: 0.75 }), null);

  const complete = buildCashflowInsights(report({ profit: {
    current: { grossProfit: 100, coveredRevenue: 400, itemCount: 5, coverage: 1 },
    previous: { grossProfit: 87, coveredRevenue: 300, itemCount: 4, coverage: 1 },
  } }), "fr");
  assert.match(complete.find((insight) => insight.id === "gross-margin")?.text ?? "", /Marge brute de 25 %/);
  // 25 % vs 29 % → −4 points, never revenue treated as profit.
  assert.equal(complete.find((insight) => insight.id === "margin-change")?.value, "−4 pts");

  const partial = buildCashflowInsights(report({ profit: {
    current: { grossProfit: 100, coveredRevenue: 400, itemCount: 4, coverage: 0.75 },
    previous: { grossProfit: 87, coveredRevenue: 300, itemCount: 4, coverage: 1 },
  } }), "fr");
  assert.equal(partial.some((insight) => insight.id === "gross-margin"), false);
  assert.match(partial.find((insight) => insight.id === "partial-cost")?.text ?? "", /25 %/);
});

test("category contribution percentages add up from the category rows", () => {
  const insights = buildCashflowInsights(report({
    categories: [
      { category: "SHOES", revenue: 310, quantity: 5, grossProfit: 62, profitCoverage: 1 },
      { category: "CLOTHES", revenue: 190, quantity: 3, grossProfit: 38, profitCoverage: 1 },
    ],
  }), "en");
  assert.equal(insights.find((insight) => insight.id === "top-category")?.text, "SHOES accounts for 62% of revenue.");
  assert.equal(insights.find((insight) => insight.id === "top-profit-category")?.text, "SHOES contributes 62% of gross profit.");
});

test("category profit share is withheld when any category lacks cost data", () => {
  const insights = buildCashflowInsights(report({
    categories: [
      { category: "SHOES", revenue: 310, quantity: 5, grossProfit: 62, profitCoverage: 1 },
      { category: null, revenue: 190, quantity: 3, grossProfit: 0, profitCoverage: 0 },
    ],
  }), "fr");
  assert.equal(insights.some((insight) => insight.id === "top-profit-category"), false);
});

test("stock insights: low stock and unsold products", () => {
  const insights = buildCashflowInsights(report({ stock: { lowStockCount: 5, activeProducts: 40, unsoldProducts: 3 } }), "fr");
  assert.equal(insights.find((insight) => insight.id === "low-stock")?.text, "5 produits sont au niveau ou sous le stock minimum.");
  assert.equal(insights.find((insight) => insight.id === "unsold")?.value, "3/40");
});

test("French and English produce the same insights with the same numbers", () => {
  const data = report({ categories: [
    { category: "SHOES", revenue: 310, quantity: 5 }, { category: "CLOTHES", revenue: 190, quantity: 3 },
  ], topProducts: [{ productId: "p1", name: "SANDALE", quantity: 12, revenue: 96 }] });
  const fr = buildCashflowInsights(data, "fr");
  const en = buildCashflowInsights(data, "en");
  assert.deepEqual(fr.map((insight) => insight.id), en.map((insight) => insight.id));
  assert.match(fr.find((insight) => insight.id === "top-product")?.text ?? "", /SANDALE est le produit le plus vendu \(12 unités\)/);
  assert.match(en.find((insight) => insight.id === "top-product")?.text ?? "", /SANDALE is the best-selling product \(12 units\)/);
});

test("bucket labels are rendered in business time and the chosen language", () => {
  assert.equal(bucketLabel("2026-10-10T09", "hour", "fr"), "09 h");
  assert.equal(bucketLabel("2026-10-10T15", "hour", "en"), "3 PM");
  assert.equal(bucketLabel("2026-10-10", "day", "fr", "long"), "samedi 10 octobre");
  assert.equal(bucketLabel("2026-10-10", "day", "en", "long"), "Saturday, October 10");
  assert.equal(bucketLabel("2026-02", "month", "fr", "long"), "février 2026");
  assert.equal(formatPercent(18.5, "fr", true), "+18,5 %");
  assert.equal(formatPercent(-4, "en", true), "−4%");
});

test("insights are ordered by relevance and stay deterministic", () => {
  const data = report({ stock: { lowStockCount: 2, activeProducts: 10, unsoldProducts: 1 } });
  const first = buildCashflowInsights(data).map((insight) => insight.id);
  const second = buildCashflowInsights(data).map((insight) => insight.id);
  assert.deepEqual(first, second);
  assert.equal(first[0], "sales-change");
});

test("single-series view: total, average, highest and lowest over elapsed periods", () => {
  const series = [bucket("2026-10-05", 100), bucket("2026-10-06", 40), bucket("2026-10-07", 250), bucket("2026-10-08", 0, { elapsed: false })];
  const stats = seriesStats(series, "sales");
  assert.equal(stats.total, 390);
  assert.equal(stats.average, 130);
  assert.deepEqual(stats.highest, { key: "2026-10-07", value: 250 });
  assert.deepEqual(stats.lowest, { key: "2026-10-06", value: 40 });
  assert.equal(stats.elapsedCount, 3);
  // A flat series has no meaningful high/low.
  assert.equal(seriesStats([bucket("2026-10-05", 0), bucket("2026-10-06", 0)], "sales").highest, null);
});

test("period-to-period change in the tooltip", () => {
  const series = [bucket("2026-10-05", 100), bucket("2026-10-06", 150), bucket("2026-10-07", 0), bucket("2026-10-08", 30)];
  assert.equal(bucketChange(series, 1, "sales"), 50);
  assert.equal(bucketChange(series, 2, "sales"), -100);
  assert.equal(bucketChange(series, 3, "sales"), null); // from zero: no percentage
  assert.equal(bucketChange(series, 0, "sales"), null);
});

test("every bucket gets a short, readable axis label", () => {
  assert.equal(axisTickLabel("2026-10-20T08", "hour", 24, "fr"), "08");
  assert.equal(axisTickLabel("2026-10-20", "day", 7, "fr"), "mar. 20");
  assert.equal(axisTickLabel("2026-10-20", "day", 31, "fr"), "20");
  assert.equal(axisTickLabel("2026-10", "month", 12, "fr"), "oct.");
  assert.equal(axisTickLabel("2026-10-19", "day", 7, "en"), "Mon 19");
});
