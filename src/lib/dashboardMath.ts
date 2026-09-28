// Pure number crunching for Quản trị → Tổng quan, kept free of imports so
// tests/calculations.test.mjs can load it directly. Same money rules as the
// Tài chính page — the test checks it against computeFinanceSummary — and
// luỹ kế starts at the month the caller passes (CUMULATIVE_START_MONTH).
import type { FinanceEntry } from "./types";

export type MonthPoint = {
  month: string; // "2026-09-01"
  revenue: number;
  cost: number; // định phí + biến phí + lương đã trả
  salary: number; // lương đã trả (part of cost)
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
    const salary = salaryByMonth[month] ?? 0;
    const cost = spent + salary;
    const net = revenue - cost;
    let cumulative: number | null = null;
    if (month >= cumulativeStartMonth) {
      running += net;
      cumulative = running;
    }
    return { month, revenue, cost, salary, net, cumulative };
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

// ---------------------------------------------------------------------------
// Thời gian trả lời khách — for each run of client messages in a project,
// the wait from the first one until staff next writes in that project.
// ---------------------------------------------------------------------------

export type ResponseStats = {
  answered: number;
  medianMinutes: number | null;
  withinHourPct: number | null; // share of answered waits under 60 min
  waitingNow: number; // projects whose latest client message has no reply yet
  oldestWaitingMinutes: number | null;
};

export function responseStats(
  messages: { project_id: string; sender_type: "client" | "staff"; created_at: string }[],
  nowMs: number,
): ResponseStats {
  const byProject = new Map<string, typeof messages>();
  for (const m of messages) {
    const list = byProject.get(m.project_id) ?? [];
    list.push(m);
    byProject.set(m.project_id, list);
  }
  const waits: number[] = [];
  let waitingNow = 0;
  let oldest: number | null = null;
  for (const list of byProject.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    let askedAt: number | null = null;
    for (const m of list) {
      const t = Date.parse(m.created_at);
      if (m.sender_type === "client") {
        if (askedAt === null) askedAt = t;
      } else if (askedAt !== null) {
        waits.push((t - askedAt) / 60_000);
        askedAt = null;
      }
    }
    if (askedAt !== null) {
      waitingNow++;
      const mins = (nowMs - askedAt) / 60_000;
      oldest = oldest === null ? mins : Math.max(oldest, mins);
    }
  }
  waits.sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor((waits.length - 1) / 2)] : null;
  return {
    answered: waits.length,
    medianMinutes: median,
    withinHourPct: waits.length ? waits.filter((w) => w <= 60).length / waits.length : null,
    waitingNow,
    oldestWaitingMinutes: oldest,
  };
}

// "45 phút", "3 giờ 10 phút", "2 ngày 4 giờ".
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} giờ ${m % 60} phút` : `${h} giờ`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} ngày ${h % 24} giờ` : `${d} ngày`;
}

// ---------------------------------------------------------------------------
// Lời/lỗ theo dự án — tiền thu (nhập tay) trừ chi phí công: giờ từng người
// báo × lương theo giờ của người đó (lương tháng ÷ ngày công chuẩn ÷ 8).
// ---------------------------------------------------------------------------

export const WORK_HOURS_PER_DAY = 8;

export function hourlyCost(monthlySalary: number, standardWorkDays: number): number {
  return standardWorkDays > 0 ? monthlySalary / (standardWorkDays * WORK_HOURS_PER_DAY) : 0;
}

export type ProjectProfitRow = {
  id: string;
  name: string;
  hours: number;
  laborCost: number;
  // Hours logged by someone with no salary set — not in laborCost.
  unpricedHours: number;
  revenue: number | null; // null = not entered yet
  profit: number | null;
};

export function projectProfit(
  projects: { id: string; name: string }[],
  hours: { project_channel_id: string | null; profile_id: string; hours: number; minutes: number }[],
  hourlyByProfile: Map<string, number>,
  revenueByProject: Map<string, number>,
): ProjectProfitRow[] {
  return projects
    .map((p) => {
      let total = 0;
      let cost = 0;
      let unpriced = 0;
      for (const h of hours) {
        if (h.project_channel_id !== p.id) continue;
        const hrs = h.hours + h.minutes / 60;
        total += hrs;
        const rate = hourlyByProfile.get(h.profile_id);
        if (rate) cost += hrs * rate;
        else unpriced += hrs;
      }
      const revenue = revenueByProject.has(p.id) ? (revenueByProject.get(p.id) as number) : null;
      return {
        id: p.id,
        name: p.name,
        hours: total,
        laborCost: cost,
        unpricedHours: unpriced,
        revenue,
        profit: revenue === null ? null : revenue - cost,
      };
    })
    .filter((r) => r.hours > 0 || r.revenue !== null);
}
