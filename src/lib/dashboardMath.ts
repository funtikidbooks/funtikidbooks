// Pure number crunching for Quản trị → Tổng quan, kept free of imports so
// tests/calculations.test.mjs can load it directly. Same money rules as the
// Tài chính page — the test checks it against computeFinanceSummary — and
// luỹ kế starts at the month the caller passes (CUMULATIVE_START_MONTH).
import type { FinanceEntry } from "./types";

export type MonthPoint = {
  month: string; // "2026-09-01"
  revenue: number;
  cost: number; // định phí + biến phí + lương đã trả
  net: number;
  // Running total since the luỹ kế start month; null before it.
  cumulative: number | null;
};

export function monthlySeries(
  months: string[],
  entries: Pick<FinanceEntry, "entry_month" | "type" | "amount">[],
  salaryByMonth: Record<string, number>,
  cumulativeStartMonth: string,
  cumulativeBeforeFirst = 0,
): MonthPoint[] {
  let running = cumulativeBeforeFirst;
  return months.map((month) => {
    let revenue = 0;
    let spent = 0;
    for (const e of entries) {
      if (e.entry_month !== month) continue;
      if (e.type === "revenue") revenue += Number(e.amount);
      else spent += Number(e.amount);
    }
    const cost = spent + (salaryByMonth[month] ?? 0);
    const net = revenue - cost;
    let cumulative: number | null = null;
    if (month >= cumulativeStartMonth) {
      running += net;
      cumulative = running;
    }
    return { month, revenue, cost, net, cumulative };
  });
}

// "T9"; adds the year in January so a series crossing New Year stays clear.
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `T1/${String(y).slice(2)}` : `T${m}`;
}

// 12_500_000 → "12,5tr"; 850_000 → "850k". For chart labels, where the
// full "12.500.000 ₫" doesn't fit.
export function compactVnd(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}${trimZero((a / 1_000_000_000).toFixed(1))} tỷ`;
  if (a >= 1_000_000) return `${sign}${trimZero((a / 1_000_000).toFixed(1))}tr`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`;
  return `${sign}${a}`;
}

function trimZero(s: string) {
  return s.replace(/\.0$/, "").replace(".", ",");
}
