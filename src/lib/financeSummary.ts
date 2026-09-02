import type { FinanceEntry, FinanceEntryType } from "@/lib/types";

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

export const TYPE_LABELS: Record<FinanceEntryType, string> = {
  revenue: "Doanh thu",
  fixed_cost: "Định phí",
  variable_cost: "Biến phí",
};

export const TYPE_ORDER: FinanceEntryType[] = ["revenue", "fixed_cost", "variable_cost"];

export function sumByType(entries: FinanceEntry[], type: FinanceEntryType) {
  return entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
}

// Standard CVP (cost-volume-profit) math for a service business: gross
// profit only nets out variable costs (the ones that scale with each
// project), fixed costs and salary come out after that to reach net — and
// the break-even revenue is however much top-line it takes for gross
// profit to cover those fixed obligations exactly. Shared by FinanceBoard
// (the monthly/yearly working view) and the Báo cáo tài chính report, so
// the two can never quietly drift apart on what "lợi nhuận" means.
export function computeFinanceSummary(entries: FinanceEntry[], salaryTotal: number) {
  const revenue = sumByType(entries, "revenue");
  const variableCost = sumByType(entries, "variable_cost");
  const fixedCost = sumByType(entries, "fixed_cost");
  const grossProfit = revenue - variableCost;
  const grossMarginRatio = revenue > 0 ? grossProfit / revenue : 0;
  const totalCost = fixedCost + variableCost + salaryTotal;
  const netProfit = revenue - totalCost;
  const netMarginRatio = revenue > 0 ? netProfit / revenue : 0;
  const breakEvenRevenue = grossMarginRatio > 0 ? (fixedCost + salaryTotal) / grossMarginRatio : null;
  return {
    revenue,
    variableCost,
    fixedCost,
    salaryTotal,
    grossProfit,
    grossMarginRatio,
    netMarginRatio,
    totalCost,
    netProfit,
    breakEvenRevenue,
  };
}

export type FinanceSummary = ReturnType<typeof computeFinanceSummary>;

// Grouped + sorted for the report's "Cơ cấu chi phí" table — biggest
// expense categories first, across both fixed_cost and variable_cost.
export function costBreakdown(entries: FinanceEntry[]) {
  const byCategory = new Map<string, { category: string; type: FinanceEntryType; amount: number }>();
  for (const e of entries) {
    if (e.type === "revenue") continue;
    const key = `${e.type}:${e.category}`;
    const existing = byCategory.get(key);
    if (existing) existing.amount += e.amount;
    else byCategory.set(key, { category: e.category, type: e.type, amount: e.amount });
  }
  return [...byCategory.values()].sort((a, b) => b.amount - a.amount);
}
