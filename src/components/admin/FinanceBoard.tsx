"use client";

import { useMemo, useState } from "react";
import {
  deleteFinanceEntry,
  getMonthlySalaryTotal,
  getYearlySalaryTotals,
  listFinanceEntries,
  listFinanceEntriesForYear,
  setHomeLoanInstallmentPaid,
} from "@/lib/actions/finance";
import { FinanceEntryModal } from "@/components/admin/FinanceEntryModal";
import { FinanceYearChart } from "@/components/admin/FinanceYearChart";
import { DebtEditModal } from "@/components/admin/DebtEditModal";
import { MONTH_LABELS, addMonths, firstOfMonth, vnToday } from "@/lib/constants/attendance";
import { TYPE_LABELS, TYPE_ORDER, computeFinanceSummary, formatVnd } from "@/lib/financeSummary";
import type { FinanceEntry, FinanceEntryType, HomeLoanInstallment, PersonalDebt } from "@/lib/types";

function monthKey(year: number, monthIndex0: number) {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
}

// A filling progress bar, like a game's energy/HP meter — "nhích lên" as
// each payment brings remaining_amount down. Falls back to a plain "+
// Nhập số liệu" prompt while total_amount is still null (a debt created
// before its numbers were known), instead of a misleading 0%-full bar.
function DebtCard({ debt, onEdit }: { debt: PersonalDebt; onEdit: () => void }) {
  const hasData = debt.total_amount !== null && debt.total_amount > 0;
  const total = debt.total_amount ?? 0;
  const remaining = debt.remaining_amount ?? 0;
  const paid = hasData ? Math.max(0, total - remaining) : 0;
  const pct = hasData ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <div className="card p-4 flex flex-col gap-3" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{debt.label}</span>
        <button type="button" onClick={onEdit} className="btn-icon" style={{ width: 28, height: 28, padding: 0 }} aria-label="Sửa">
          ✏️
        </button>
      </div>
      {hasData ? (
        <>
          <div className="rounded-full overflow-hidden" style={{ height: 14, background: "var(--color-neutral-100)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--status-green)", transition: "width 0.4s ease" }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--color-neutral-500)" }}>Đã trả {formatVnd(paid)}</span>
            <span className="font-bold" style={{ color: "var(--status-green)" }}>
              {pct}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--color-neutral-500)" }}>Còn nợ</span>
            <span className="font-bold" style={{ color: "var(--status-red)" }}>
              {formatVnd(remaining)}
            </span>
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
            Tổng nợ: {formatVnd(total)}
          </div>
        </>
      ) : (
        <button type="button" onClick={onEdit} className="btn btn-ghost btn-sm w-fit">
          + Nhập số liệu
        </button>
      )}
    </div>
  );
}

function formatDateVn(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN");
}

// The full amortization schedule as an energy-bar summary (same idea as
// DebtCard, computed from the schedule instead of two typed-in numbers) plus
// a kỳ-by-kỳ table. Defaults to a window around the first unpaid kỳ rather
// than the very start, since with ~240 rows "now" is what's actually useful
// to see without expanding.
function HomeLoanSection({
  installments,
  onToggle,
}: {
  installments: HomeLoanInstallment[];
  onToggle: (id: string, paid: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (installments.length === 0) return null;

  const total = installments.length;
  const paidCount = installments.filter((i) => i.is_paid).length;
  const loanAmount = installments[0]?.opening_balance ?? 0;
  const lastPaid = [...installments].reverse().find((i) => i.is_paid);
  const remaining = lastPaid ? lastPaid.closing_balance : loanAmount;
  const paidAmount = Math.max(0, loanAmount - remaining);
  const pct = loanAmount > 0 ? Math.min(100, Math.round((paidAmount / loanAmount) * 100)) : 0;
  const nextDue = installments.find((i) => !i.is_paid);

  const currentIdx = installments.findIndex((i) => !i.is_paid);
  const windowStart = currentIdx === -1 ? Math.max(0, total - 6) : Math.max(0, currentIdx - 3);
  const windowEnd = currentIdx === -1 ? total : Math.min(total, currentIdx + 5);
  const visibleRows = expanded ? installments : installments.slice(windowStart, windowEnd);

  return (
    <div className="flex flex-col gap-3 mt-4">
      <span className="text-sm font-bold">Nợ mua nhà</span>

      <div className="card p-4 flex flex-col gap-3" style={{ background: "var(--color-surface)" }}>
        <div className="rounded-full overflow-hidden" style={{ height: 16, background: "var(--color-neutral-100)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--status-green)", transition: "width 0.4s ease" }}
          />
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <div>
            <div className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              Đã trả
            </div>
            <div className="text-sm font-bold" style={{ color: "var(--status-green)" }}>
              {formatVnd(paidAmount)} ({pct}%)
            </div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              Còn nợ
            </div>
            <div className="text-sm font-bold" style={{ color: "var(--status-red)" }}>
              {formatVnd(remaining)}
            </div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              Kỳ đã trả
            </div>
            <div className="text-sm font-bold">
              {paidCount}/{total}
            </div>
          </div>
          {nextDue && (
            <div>
              <div className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                Kỳ tiếp theo
              </div>
              <div className="text-sm font-bold">
                Kỳ {nextDue.period_number} · {formatDateVn(nextDue.due_date)}
              </div>
            </div>
          )}
        </div>
        <div className="text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
          Tổng vay: {formatVnd(loanAmount)}
        </div>
      </div>

      <div className="card elev-sm overflow-hidden flex flex-col">
        <div className="overflow-auto" style={{ maxHeight: 420 }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                {["Kỳ", "Ngày", "Dư nợ đầu kỳ", "Trả gốc", "Lãi", "Tổng cộng", "Dư nợ cuối kỳ", "Đã trả"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 text-[11px] font-bold"
                    style={{ color: "var(--color-neutral-500)", background: "var(--color-panel)", position: "sticky", top: 0 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--color-neutral-100)", opacity: row.is_paid ? 0.55 : 1 }}>
                  <td className="px-3 py-2 font-semibold">{row.period_number}</td>
                  <td className="px-3 py-2">{formatDateVn(row.due_date)}</td>
                  <td className="px-3 py-2">{formatVnd(row.opening_balance)}</td>
                  <td className="px-3 py-2">{formatVnd(row.principal_payment)}</td>
                  <td className="px-3 py-2">{formatVnd(row.interest_amount)}</td>
                  <td className="px-3 py-2 font-bold">{formatVnd(row.total_payment)}</td>
                  <td className="px-3 py-2">{formatVnd(row.closing_balance)}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={row.is_paid} onChange={(e) => onToggle(row.id, e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="btn btn-ghost btn-sm w-full">
          {expanded ? "Thu gọn" : `Xem toàn bộ ${total} kỳ`}
        </button>
      </div>
    </div>
  );
}

export function FinanceBoard({
  initialMonth,
  initialEntries,
  initialSalaryTotal,
  initialYear,
  initialYearEntries,
  initialYearSalaryTotals,
  initialDebts,
  initialHomeLoanInstallments,
}: {
  initialMonth: string;
  initialEntries: FinanceEntry[];
  initialSalaryTotal: number;
  initialYear: number;
  initialYearEntries: FinanceEntry[];
  initialYearSalaryTotals: Record<string, number>;
  initialDebts: PersonalDebt[];
  initialHomeLoanInstallments: HomeLoanInstallment[];
}) {
  const [monthStart, setMonthStart] = useState(initialMonth);
  const [entries, setEntries] = useState(initialEntries);
  const [salaryTotal, setSalaryTotal] = useState(initialSalaryTotal);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ entry?: FinanceEntry; type: FinanceEntryType } | null>(null);
  const [debts, setDebts] = useState(initialDebts);
  const [editingDebt, setEditingDebt] = useState<PersonalDebt | null>(null);
  const [homeLoanInstallments, setHomeLoanInstallments] = useState(initialHomeLoanInstallments);

  async function handleToggleInstallment(id: string, paid: boolean) {
    // Optimistic — a director unchecking a box expects it to flip
    // immediately, not wait on a round-trip for a single boolean.
    setHomeLoanInstallments((prev) => prev.map((i) => (i.id === id ? { ...i, is_paid: paid } : i)));
    try {
      await setHomeLoanInstallmentPaid(id, paid);
    } catch {
      setHomeLoanInstallments((prev) => prev.map((i) => (i.id === id ? { ...i, is_paid: !paid } : i)));
    }
  }

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

  const summary = useMemo(() => computeFinanceSummary(entries, salaryTotal), [entries, salaryTotal]);

  const yearRows = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const key = monthKey(year, i);
        const monthEntries = yearEntries.filter((e) => e.entry_month === key);
        const salary = yearSalaryTotals[key] ?? 0;
        const s = computeFinanceSummary(monthEntries, salary);
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

        <div style={{ opacity: yearLoading ? 0.6 : 1 }}>
          <FinanceYearChart rows={yearRows} />
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

      {/* Nợ cá nhân — separate from the business P&L above, just kept on
          the same director-only page. */}
      <div className="flex flex-col gap-3 mt-4">
        <span className="text-sm font-bold">Nợ cá nhân</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {debts.map((debt) => (
            <DebtCard key={debt.id} debt={debt} onEdit={() => setEditingDebt(debt)} />
          ))}
        </div>
      </div>

      <HomeLoanSection installments={homeLoanInstallments} onToggle={handleToggleInstallment} />

      {editing && (
        <FinanceEntryModal
          entryMonth={monthStart}
          entry={editing.entry}
          defaultType={editing.type}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {editingDebt && (
        <DebtEditModal
          debt={editingDebt}
          onClose={() => setEditingDebt(null)}
          onSaved={(saved) => setDebts((prev) => prev.map((d) => (d.id === saved.id ? saved : d)))}
        />
      )}
    </div>
  );
}
