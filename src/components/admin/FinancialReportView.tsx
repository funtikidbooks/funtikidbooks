"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  getMonthlySalaryTotal,
  getYearlySalaryTotals,
  listFinanceEntries,
  listFinanceEntriesForYear,
} from "@/lib/actions/finance";
import { MONTH_LABELS, addMonths } from "@/lib/constants/attendance";
import { TYPE_LABELS, computeFinanceSummary, costBreakdown, formatVnd } from "@/lib/financeSummary";
import type { FinanceEntry, HomeLoanInstallment, PersonalDebt } from "@/lib/types";

const COMPANY = {
  name: "Công ty TNHH Funti Kidbooks",
  taxCode: "0319688648",
  address: "40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM",
  phone: "0978 346 851",
  email: "funtikidbooks.studio@gmail.com",
};

type PeriodType = "month" | "year";

// null = "n/a" (kỳ trước bằng 0, không có gì để so sánh phần trăm) rather
// than a misleading "+∞%" or "-100%".
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function ChangeBadge({ pct, goodWhenUp = true }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct === null) {
    return (
      <span className="text-xs" style={{ color: "#9a938a" }}>
        Mới phát sinh
      </span>
    );
  }
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const good = flat ? null : up === goodWhenUp;
  const color = flat ? "#9a938a" : good ? "#3f9e52" : "#c0524f";
  return (
    <span className="text-xs font-bold" style={{ color }}>
      {flat ? "— 0%" : `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}

function formatDateVn(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN");
}

export function FinancialReportView({
  initialMonth,
  initialEntries,
  initialSalaryTotal,
  initialPrevEntries,
  initialPrevSalaryTotal,
  debts,
  homeLoanInstallments,
}: {
  initialMonth: string;
  initialEntries: FinanceEntry[];
  initialSalaryTotal: number;
  initialPrevEntries: FinanceEntry[];
  initialPrevSalaryTotal: number;
  debts: PersonalDebt[];
  homeLoanInstallments: HomeLoanInstallment[];
}) {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [monthStart, setMonthStart] = useState(initialMonth);
  const [year, setYear] = useState(() => new Date(`${initialMonth}T00:00:00`).getFullYear());
  const [entries, setEntries] = useState(initialEntries);
  const [salaryTotal, setSalaryTotal] = useState(initialSalaryTotal);
  const [prevEntries, setPrevEntries] = useState(initialPrevEntries);
  const [prevSalaryTotal, setPrevSalaryTotal] = useState(initialPrevSalaryTotal);
  const [loading, setLoading] = useState(false);

  async function loadMonth(newStart: string) {
    setLoading(true);
    try {
      const prevStart = addMonths(newStart, -1);
      const [e, s, pe, ps] = await Promise.all([
        listFinanceEntries(newStart),
        getMonthlySalaryTotal(newStart),
        listFinanceEntries(prevStart),
        getMonthlySalaryTotal(prevStart),
      ]);
      setMonthStart(newStart);
      setEntries(e);
      setSalaryTotal(s);
      setPrevEntries(pe);
      setPrevSalaryTotal(ps);
    } catch {
      setEntries([]);
      setPrevEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadYear(newYear: number) {
    setLoading(true);
    try {
      const [e, sTotals, pe, psTotals] = await Promise.all([
        listFinanceEntriesForYear(newYear),
        getYearlySalaryTotals(newYear),
        listFinanceEntriesForYear(newYear - 1),
        getYearlySalaryTotals(newYear - 1),
      ]);
      setYear(newYear);
      setEntries(e);
      setSalaryTotal(Object.values(sTotals).reduce((a, b) => a + b, 0));
      setPrevEntries(pe);
      setPrevSalaryTotal(Object.values(psTotals).reduce((a, b) => a + b, 0));
    } catch {
      setEntries([]);
      setPrevEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function switchPeriodType(next: PeriodType) {
    setPeriodType(next);
    if (next === "year") loadYear(year);
    else loadMonth(monthStart);
  }

  const summary = useMemo(() => computeFinanceSummary(entries, salaryTotal), [entries, salaryTotal]);
  const prevSummary = useMemo(() => computeFinanceSummary(prevEntries, prevSalaryTotal), [prevEntries, prevSalaryTotal]);
  const breakdown = useMemo(() => costBreakdown(entries), [entries]);
  const totalCosts = breakdown.reduce((s, c) => s + c.amount, 0);

  const d = new Date(`${monthStart}T00:00:00`);
  const periodLabel = periodType === "month" ? `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}` : `Năm ${year}`;
  const prevPeriodLabel = periodType === "month" ? "Tháng trước" : "Năm trước";
  const today = new Date().toLocaleDateString("vi-VN");

  const homeLoanPaid = homeLoanInstallments.filter((i) => i.is_paid);
  const homeLoanTotal = homeLoanInstallments[0]?.opening_balance ?? 0;
  const homeLoanRemaining = homeLoanPaid.length > 0 ? homeLoanPaid[homeLoanPaid.length - 1].closing_balance : homeLoanTotal;
  const homeLoanNext = homeLoanInstallments.find((i) => !i.is_paid);

  const ROWS: { label: string; get: (s: typeof summary) => number; goodWhenUp: boolean; bold?: boolean; ratio?: (s: typeof summary) => number }[] = [
    { label: "Doanh thu", get: (s) => s.revenue, goodWhenUp: true },
    { label: "Biến phí", get: (s) => s.variableCost, goodWhenUp: false },
    { label: "Định phí", get: (s) => s.fixedCost, goodWhenUp: false },
    { label: "Lương nhân viên", get: (s) => s.salaryTotal, goodWhenUp: false },
    { label: "Lợi nhuận gộp", get: (s) => s.grossProfit, goodWhenUp: true, bold: true, ratio: (s) => s.grossMarginRatio },
    { label: "Lợi nhuận ròng", get: (s) => s.netProfit, goodWhenUp: true, bold: true, ratio: (s) => s.netMarginRatio },
  ];

  return (
    <div className="flex-1 flex flex-col items-center py-8 px-4 gap-4" style={{ background: "var(--color-surface)" }}>
      <div className="no-print flex items-center justify-between w-full max-w-[800px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchPeriodType("month")}
            className="px-3 py-1.5 rounded-full text-sm font-semibold"
            style={{
              background: periodType === "month" ? "var(--color-accent-500)" : "var(--color-surface)",
              color: periodType === "month" ? "#fff" : "var(--color-text)",
              border: `1.5px solid ${periodType === "month" ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
            }}
          >
            Theo tháng
          </button>
          <button
            type="button"
            onClick={() => switchPeriodType("year")}
            className="px-3 py-1.5 rounded-full text-sm font-semibold"
            style={{
              background: periodType === "year" ? "var(--color-accent-500)" : "var(--color-surface)",
              color: periodType === "year" ? "#fff" : "var(--color-text)",
              border: `1.5px solid ${periodType === "year" ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
            }}
          >
            Theo năm
          </button>
        </div>
        <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
          🖨 In / Xuất PDF
        </button>
      </div>

      <div className="no-print flex items-center gap-3 w-full max-w-[800px]">
        {periodType === "month" ? (
          <>
            <button type="button" onClick={() => loadMonth(addMonths(monthStart, -1))} className="btn-icon" aria-label="Tháng trước">
              ←
            </button>
            <span className="text-sm font-bold">{periodLabel}</span>
            <button type="button" onClick={() => loadMonth(addMonths(monthStart, 1))} className="btn-icon" aria-label="Tháng sau">
              →
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => loadYear(year - 1)} className="btn-icon" aria-label="Năm trước">
              ←
            </button>
            <span className="text-sm font-bold">{periodLabel}</span>
            <button type="button" onClick={() => loadYear(year + 1)} className="btn-icon" aria-label="Năm sau">
              →
            </button>
          </>
        )}
      </div>

      <div
        className="card elev-sm w-full max-w-[800px] p-10 flex flex-col gap-8"
        style={{ background: "#fff", color: "#141211", opacity: loading ? 0.6 : 1 }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Image src="/brand/funti-logo.jpg" alt="" width={48} height={48} className="rounded-full object-cover flex-none" />
            <div>
              <div className="font-heading font-bold text-base">{COMPANY.name}</div>
              <div className="text-xs" style={{ color: "#6b6560" }}>
                {COMPANY.address}
              </div>
              <div className="text-xs" style={{ color: "#6b6560" }}>
                MST: {COMPANY.taxCode} · {COMPANY.phone} · {COMPANY.email}
              </div>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-heading font-bold" style={{ color: "#e26b1f" }}>
              BÁO CÁO TÀI CHÍNH
            </h1>
            <div className="text-sm font-bold">{periodLabel}</div>
            <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
              Ngày lập: {today}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-[0.08em]" style={{ color: "#6b6560" }}>
            I. KẾT QUẢ KINH DOANH
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1.5px solid #141211" }}>
                <th className="text-left py-2">Chỉ tiêu</th>
                <th className="text-right py-2">{periodLabel}</th>
                <th className="text-right py-2">{prevPeriodLabel}</th>
                <th className="text-right py-2">Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const value = row.get(summary);
                const prevValue = row.get(prevSummary);
                const ratio = row.ratio?.(summary);
                return (
                  <tr key={row.label} style={{ borderBottom: "1px solid #e5e0d8" }}>
                    <td className={`py-2 ${row.bold ? "font-bold" : ""}`}>{row.label}</td>
                    <td className={`py-2 text-right ${row.bold ? "font-bold" : ""}`}>
                      {formatVnd(value)}
                      {ratio !== undefined && <span style={{ color: "#9a938a" }}> ({(ratio * 100).toFixed(1)}%)</span>}
                    </td>
                    <td className="py-2 text-right" style={{ color: "#6b6560" }}>
                      {formatVnd(prevValue)}
                    </td>
                    <td className="py-2 text-right">
                      <ChangeBadge pct={pctChange(value, prevValue)} goodWhenUp={row.goodWhenUp} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold tracking-[0.08em]" style={{ color: "#6b6560" }}>
            II. ĐIỂM HOÀ VỐN
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm">Doanh thu cần đạt để không lời không lỗ</span>
            <span className="text-lg font-bold">
              {summary.breakEvenRevenue === null ? "Chưa xác định" : formatVnd(summary.breakEvenRevenue)}
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-[0.08em]" style={{ color: "#6b6560" }}>
            III. CƠ CẤU CHI PHÍ
          </h2>
          {breakdown.length === 0 ? (
            <p className="text-sm" style={{ color: "#9a938a" }}>
              Chưa có khoản chi nào trong kỳ này.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1.5px solid #141211" }}>
                  <th className="text-left py-2">Danh mục</th>
                  <th className="text-left py-2">Loại</th>
                  <th className="text-right py-2">Số tiền</th>
                  <th className="text-right py-2">Tỷ trọng</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((c) => (
                  <tr key={`${c.type}:${c.category}`} style={{ borderBottom: "1px solid #e5e0d8" }}>
                    <td className="py-2">{c.category}</td>
                    <td className="py-2" style={{ color: "#6b6560" }}>
                      {TYPE_LABELS[c.type]}
                    </td>
                    <td className="py-2 text-right">{formatVnd(c.amount)}</td>
                    <td className="py-2 text-right" style={{ color: "#6b6560" }}>
                      {totalCosts > 0 ? ((c.amount / totalCosts) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-[0.08em]" style={{ color: "#6b6560" }}>
            IV. TÌNH HÌNH CÔNG NỢ CÁ NHÂN
          </h2>
          <p className="text-xs" style={{ color: "#9a938a" }}>
            Tại thời điểm lập báo cáo — không thuộc P&L kinh doanh ở trên.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1.5px solid #141211" }}>
                <th className="text-left py-2">Khoản nợ</th>
                <th className="text-right py-2">Tổng nợ</th>
                <th className="text-right py-2">Còn nợ</th>
                <th className="text-right py-2">Đã trả</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((debt) => {
                const hasData = debt.total_amount !== null && debt.total_amount > 0;
                const total = debt.total_amount ?? 0;
                const remaining = debt.remaining_amount ?? 0;
                const pct = hasData ? Math.round(((total - remaining) / total) * 100) : null;
                return (
                  <tr key={debt.id} style={{ borderBottom: "1px solid #e5e0d8" }}>
                    <td className="py-2">{debt.label}</td>
                    <td className="py-2 text-right">{hasData ? formatVnd(total) : "—"}</td>
                    <td className="py-2 text-right">{hasData ? formatVnd(remaining) : "—"}</td>
                    <td className="py-2 text-right">{pct === null ? "Chưa nhập số liệu" : `${pct}%`}</td>
                  </tr>
                );
              })}
              {homeLoanInstallments.length > 0 && (
                <tr style={{ borderBottom: "1px solid #e5e0d8" }}>
                  <td className="py-2">
                    Nợ mua nhà
                    {homeLoanNext && (
                      <div className="text-xs" style={{ color: "#9a938a" }}>
                        Kỳ tiếp theo: {homeLoanNext.period_number} · {formatDateVn(homeLoanNext.due_date)}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right">{formatVnd(homeLoanTotal)}</td>
                  <td className="py-2 text-right">{formatVnd(homeLoanRemaining)}</td>
                  <td className="py-2 text-right">
                    {homeLoanPaid.length}/{homeLoanInstallments.length} kỳ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
