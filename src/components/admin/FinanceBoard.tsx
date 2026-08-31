"use client";

import { useMemo, useState } from "react";
import {
  deleteFinanceEntry,
  getMonthlySalaryTotal,
  getYearlySalaryTotals,
  listFinanceEntries,
  listFinanceEntriesForYear,
} from "@/lib/actions/finance";
import { FinanceEntryModal } from "@/components/admin/FinanceEntryModal";
import { MONTH_LABELS, addMonths, firstOfMonth, vnToday } from "@/lib/constants/attendance";
import type { FinanceEntry, FinanceEntryType } from "@/lib/types";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

const TYPE_LABELS: Record<FinanceEntryType, string> = {
  revenue: "Doanh thu",
  fixed_cost: "Định phí",
  variable_cost: "Biến phí",
};

const TYPE_ORDER: FinanceEntryType[] = ["revenue", "fixed_cost", "variable_cost"];

function sumByType(entries: FinanceEntry[], type: FinanceEntryType) {
  return entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
}

// Standard CVP (cost-volume-profit) math for a service business: gross
// profit only nets out variable costs (the ones that scale with each
// project), fixed costs and salary come out after that to reach net —
// and the break-even revenue is however much top-line it takes for gross
// profit to cover those fixed obligations exactly.
function computeSummary(entries: FinanceEntry[], salaryTotal: number) {
  const revenue = sumByType(entries, "revenue");
  const variableCost = sumByType(entries, "variable_cost");
  const fixedCost = sumByType(entries, "fixed_cost");
  const grossProfit = revenue - variableCost;
  const grossMarginRatio = revenue > 0 ? grossProfit / revenue : 0;
  const totalCost = fixedCost + variableCost + salaryTotal;
  const netProfit = revenue - totalCost;
  const breakEvenRevenue = grossMarginRatio > 0 ? (fixedCost + salaryTotal) / grossMarginRatio : null;
  return { revenue, variableCost, fixedCost, salaryTotal, grossProfit, grossMarginRatio, totalCost, netProfit, breakEvenRevenue };
}

function monthKey(year: number, monthIndex0: number) {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
}

export function FinanceBoard({
  initialMonth,
  initialEntries,
  initialSalaryTotal,
  initialYear,
  initialYearEntries,
  initialYearSalaryTotals,
}: {
  initialMonth: string;
  initialEntries: FinanceEntry[];
  initialSalaryTotal: number;
  initialYear: number;
  initialYearEntries: FinanceEntry[];
  initialYearSalaryTotals: Record<string, number>;
}) {
  const [monthStart, setMonthStart] = useState(initialMonth);
  const [entries, setEntries] = useState(initialEntries);
  const [salaryTotal, setSalaryTotal] = useState(initialSalaryTotal);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ entry?: FinanceEntry; type: FinanceEntryType } | null>(null);

  const [year, setYear] = useState(initialYear);
  const [yearEntries, setYearEntries] = useState(initialYearEntries);
  const [yearSalaryTotals, setYearSalaryTotals] = useState(initialYearSalaryTotals);
  const [yearLoading, setYearLoading] = useState(false);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    setLoading(true);
    try {
      const [e, s] = await Promise.all([listFinanceEntries(newStart), getMonthlySalaryTotal(newStart)]);
      setEntries(e);
      setSalaryTotal(s);
    } catch {
      setEntries([]);
      setSalaryTotal(0);
    } finally {
      setLoading(false);
    }
  }

  async function goToYear(newYear: number) {
    setYear(newYear);
    setYearLoading(true);
    try {
      const [e, s] = await Promise.all([listFinanceEntriesForYear(newYear), getYearlySalaryTotals(newYear)]);
      setYearEntries(e);
      setYearSalaryTotals(s);
    } catch {
      setYearEntries([]);
      setYearSalaryTotals({});
    } finally {
      setYearLoading(false);
    }
  }

  function handleSaved(entry: FinanceEntry) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      return idx === -1 ? [...prev, entry] : prev.map((e, i) => (i === idx ? entry : e));
    });
    // The saved entry's month is always the currently-open month here, but
    // the year table only refetches when the director actually looks at
    // it again (goToYear) — cheap to keep in sync now rather than serve a
    // stale total if they scroll down right after saving.
    if (firstOfMonth(entry.entry_month) === firstOfMonth(monthStart) && entry.entry_month.startsWith(`${year}-`)) {
      setYearEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id);
        return idx === -1 ? [...prev, entry] : prev.map((e, i) => (i === idx ? entry : e));
      });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá khoản này?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setYearEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteFinanceEntry(id).catch(() => {});
  }

  const summary = useMemo(() => computeSummary(entries, salaryTotal), [entries, salaryTotal]);

  const yearRows = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const key = monthKey(year, i);
        const monthEntries = yearEntries.filter((e) => e.entry_month === key);
        const salary = yearSalaryTotals[key] ?? 0;
        const s = computeSummary(monthEntries, salary);
        return { key, monthIndex: i, ...s };
      }),
    [year, yearEntries, yearSalaryTotals],
  );

  const yearTotals = useMemo(
    () =>
      yearRows.reduce(
        (acc, r) => ({
          revenue: acc.revenue + r.revenue,
          fixedCost: acc.fixedCost + r.fixedCost,
          variableCost: acc.variableCost + r.variableCost,
          salaryTotal: acc.salaryTotal + r.salaryTotal,
          netProfit: acc.netProfit + r.netProfit,
        }),
        { revenue: 0, fixedCost: 0, variableCost: 0, salaryTotal: 0, netProfit: 0 },
      ),
    [yearRows],
  );

  const d = new Date(`${monthStart}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  const isCurrentMonth = monthStart === firstOfMonth(vnToday());

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
      <div>
        <h1 className="text-xl">Tài chính kinh doanh</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Chỉ Giám đốc xem được. Lương nhân viên lấy tự động từ Bảng lương của tháng — không cần nhập lại ở đây.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => goToMonth(addMonths(monthStart, -1))} className="btn-icon" aria-label="Tháng trước">
          ←
        </button>
        <span className="text-sm font-bold">{monthLabel}</span>
        <button type="button" onClick={() => goToMonth(addMonths(monthStart, 1))} className="btn-icon" aria-label="Tháng sau">
          →
        </button>
        {!isCurrentMonth && (
          <button type="button" onClick={() => goToMonth(firstOfMonth(vnToday()))} className="btn btn-ghost btn-sm">
            Tháng này
          </button>
        )}
      </div>

      <div style={{ opacity: loading ? 0.6 : 1 }} className="flex flex-col gap-6">
        {/* Summary */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          <div className="card p-4 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
              DOANH THU
            </span>
            <span className="text-lg font-bold" style={{ color: "var(--status-green)" }}>
              {formatVnd(summary.revenue)}
            </span>
          </div>
          <div className="card p-4 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
              BIẾN PHÍ
            </span>
            <span className="text-lg font-bold">{formatVnd(summary.variableCost)}</span>
          </div>
          <div className="card p-4 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
              ĐỊNH PHÍ
            </span>
            <span className="text-lg font-bold">{formatVnd(summary.fixedCost)}</span>
          </div>
          <div className="card p-4 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
              LƯƠNG NHÂN VIÊN
            </span>
            <span className="text-lg font-bold">{formatVnd(summary.salaryTotal)}</span>
            <span className="text-[10px]" style={{ color: "var(--color-neutral-400)" }}>
              tự động từ Bảng lương
            </span>
          </div>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <div className="card p-4 flex flex-col gap-1" style={{ background: "var(--color-accent-100)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-700)" }}>
              LỢI NHUẬN GỘP
            </span>
            <span className="text-xl font-bold" style={{ color: "var(--color-accent-800)" }}>
              {formatVnd(summary.grossProfit)}
            </span>
            <span className="text-[11px]" style={{ color: "var(--color-accent-700)" }}>
              Biên lợi nhuận gộp: {(summary.grossMarginRatio * 100).toFixed(1)}%
            </span>
          </div>
          <div
            className="card p-4 flex flex-col gap-1"
            style={{ background: summary.netProfit >= 0 ? "var(--color-accent-2-100)" : "rgba(192,82,79,0.1)" }}
          >
            <span className="text-[11px] font-bold" style={{ color: summary.netProfit >= 0 ? "var(--color-accent-2-800)" : "var(--status-red)" }}>
              LỢI NHUẬN RÒNG
            </span>
            <span className="text-xl font-bold" style={{ color: summary.netProfit >= 0 ? "var(--color-accent-2-800)" : "var(--status-red)" }}>
              {formatVnd(summary.netProfit)}
            </span>
            <span className="text-[11px]" style={{ color: summary.netProfit >= 0 ? "var(--color-accent-2-700)" : "var(--status-red)" }}>
              Sau khi trừ toàn bộ chi phí + lương
            </span>
          </div>
          <div className="card p-4 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
              ĐIỂM HOÀ VỐN (DOANH THU)
            </span>
            <span className="text-xl font-bold">
              {summary.breakEvenRevenue === null ? "Chưa xác định" : formatVnd(summary.breakEvenRevenue)}
            </span>
            <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              {summary.breakEvenRevenue === null
                ? "Cần có doanh thu và biên lợi nhuận gộp dương"
                : "Doanh thu cần đạt để không lời không lỗ"}
            </span>
          </div>
        </div>

        {/* Entries by type */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {TYPE_ORDER.map((type) => {
            const typeEntries = entries.filter((e) => e.type === type);
            return (
              <div key={type} className="card elev-sm p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">{TYPE_LABELS[type]}</h3>
                  <button type="button" onClick={() => setEditing({ type })} className="btn btn-secondary btn-sm">
                    + Thêm khoản
                  </button>
                </div>
                {typeEntries.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
                    Chưa có khoản nào tháng này.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {typeEntries.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{e.category}</div>
                          {e.note && (
                            <div className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                              {e.note}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-bold flex-none">{formatVnd(e.amount)}</span>
                        <button
                          type="button"
                          onClick={() => setEditing({ entry: e, type })}
                          className="btn-icon flex-none"
                          style={{ width: 28, height: 28, padding: 0 }}
                          aria-label="Sửa"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="btn-icon flex-none"
                          style={{ width: 28, height: 28, padding: 0 }}
                          aria-label="Xoá"
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Yearly summary */}
      <div className="flex flex-col gap-3 mt-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => goToYear(year - 1)} className="btn-icon" aria-label="Năm trước">
            ←
          </button>
          <span className="text-sm font-bold">Cả năm {year}</span>
          <button type="button" onClick={() => goToYear(year + 1)} className="btn-icon" aria-label="Năm sau">
            →
          </button>
        </div>

        <div className="card elev-sm overflow-x-auto" style={{ opacity: yearLoading ? 0.6 : 1 }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                {["Tháng", "Doanh thu", "Định phí", "Biến phí", "Lương", "Lợi nhuận ròng"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearRows.map((r) => (
                <tr
                  key={r.key}
                  className="cursor-pointer"
                  style={{ borderBottom: "1px solid var(--color-neutral-100)" }}
                  onClick={() => goToMonth(r.key)}
                >
                  <td className="px-3 py-2 font-semibold">{MONTH_LABELS[r.monthIndex]}</td>
                  <td className="px-3 py-2">{formatVnd(r.revenue)}</td>
                  <td className="px-3 py-2">{formatVnd(r.fixedCost)}</td>
                  <td className="px-3 py-2">{formatVnd(r.variableCost)}</td>
                  <td className="px-3 py-2">{formatVnd(r.salaryTotal)}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: r.netProfit >= 0 ? "var(--status-green)" : "var(--status-red)" }}>
                    {formatVnd(r.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--color-neutral-200)" }}>
                <td className="px-3 py-2 font-bold">Tổng cộng</td>
                <td className="px-3 py-2 font-bold">{formatVnd(yearTotals.revenue)}</td>
                <td className="px-3 py-2 font-bold">{formatVnd(yearTotals.fixedCost)}</td>
                <td className="px-3 py-2 font-bold">{formatVnd(yearTotals.variableCost)}</td>
                <td className="px-3 py-2 font-bold">{formatVnd(yearTotals.salaryTotal)}</td>
                <td className="px-3 py-2 font-bold" style={{ color: yearTotals.netProfit >= 0 ? "var(--status-green)" : "var(--status-red)" }}>
                  {formatVnd(yearTotals.netProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {editing && (
        <FinanceEntryModal
          entryMonth={monthStart}
          entry={editing.entry}
          defaultType={editing.type}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
