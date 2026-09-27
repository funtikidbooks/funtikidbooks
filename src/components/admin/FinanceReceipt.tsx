"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatVnd, type FinanceSummary } from "@/lib/financeSummary";

// The month read as one sum, top to bottom like a receipt: revenue, minus
// each cost, minus salary actually paid = what's really left; then minus
// the payslips still unpaid = what's left once everyone's paid. Replaces a
// wall of separate figure cards that had to be added up by eye (sếp Phúc).

function Sign({ kind }: { kind: "+" | "−" }) {
  const plus = kind === "+";
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full text-[13px] font-bold flex-none"
      style={{
        width: 22,
        height: 22,
        background: plus ? "color-mix(in srgb, var(--status-green) 16%, transparent)" : "var(--color-neutral-100)",
        color: plus ? "var(--status-green)" : "var(--color-neutral-600)",
      }}
    >
      {kind}
    </span>
  );
}

function Row({
  sign,
  label,
  hint,
  amount,
  tone,
}: {
  sign: "+" | "−";
  label: string;
  hint?: ReactNode;
  amount: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px dashed var(--color-neutral-200)" }}>
      <Sign kind={sign} />
      <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 text-sm" style={{ color: tone ?? "var(--color-text)" }}>
        <span className="font-semibold">{label}</span>
        {hint && (
          <span className="text-[11px]" style={{ color: tone ?? "var(--color-neutral-500)" }}>
            {hint}
          </span>
        )}
      </span>
      <span className="text-sm font-bold tabular-nums text-right" style={{ color: tone ?? "var(--color-text)" }}>
        {sign === "+" ? "+" : "−"} {formatVnd(amount)}
      </span>
    </div>
  );
}

function Total({ label, caption, amount, palette }: { label: string; caption: string; amount: number; palette: "real" | "forecast" }) {
  const negative = amount < 0;
  const bg = negative
    ? "color-mix(in srgb, var(--status-red) 12%, transparent)"
    : palette === "real"
      ? "var(--color-accent-2-100)"
      : "var(--color-accent-100)";
  const fg = negative ? "var(--status-red)" : palette === "real" ? "var(--color-accent-2-800)" : "var(--color-accent-800)";
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-4 py-3 my-2" style={{ background: bg, color: fg }}>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-bold">= {label}</span>
        <span className="text-[11px] opacity-80">{caption}</span>
      </span>
      <span className="font-heading text-lg sm:text-xl font-bold tabular-nums text-right">{formatVnd(amount)}</span>
    </div>
  );
}

export function FinanceReceipt({
  monthLabel,
  summary,
  salary,
  cumulative,
  debts,
  loading,
}: {
  monthLabel: string;
  summary: FinanceSummary;
  salary: { pendingAmount: number; pendingCount: number; paidCount: number } | null;
  cumulative: { year: string; yearToDate: number; sinceStart: number; startLabel: string | null } | null;
  debts: { lines: { label: string; hint?: string; amount: number }[]; total: number };
  loading: boolean;
}) {
  const totalPayslips = salary ? salary.paidCount + salary.pendingCount : 0;
  const realLeft = summary.netProfit;
  const afterAllSalary = realLeft - (salary?.pendingAmount ?? 0);
  const breakEven = summary.breakEvenRevenue;
  const shortfall = breakEven === null ? null : breakEven - summary.revenue;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start" style={{ opacity: loading ? 0.6 : 1 }}>
      <section className="card elev-sm p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute left-0 top-0 h-1 w-full" style={{ background: "var(--color-accent-500)" }} aria-hidden />
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="font-heading text-lg">Phép tính {monthLabel}</h2>
          <span className="text-[11px] hidden sm:inline" style={{ color: "var(--color-neutral-500)" }}>
            đọc từ trên xuống
          </span>
        </div>

        <Row sign="+" label="Doanh thu" amount={summary.revenue} tone="var(--status-green)" />
        <Row sign="−" label="Biến phí" amount={summary.variableCost} />
        <Row sign="−" label="Định phí" amount={summary.fixedCost} />
        <Row
          sign="−"
          label="Lương đã trả"
          hint={totalPayslips > 0 ? `${salary?.paidCount}/${totalPayslips} phiếu` : "theo Bảng lương"}
          amount={summary.salaryTotal}
        />
        <Total label="Tiền còn lại thực tế" caption="Sau khi trừ các khoản đã chi thật" amount={realLeft} palette="real" />

        {salary && salary.pendingCount > 0 ? (
          <>
            <Row
              sign="−"
              label="Lương chưa trả"
              hint={
                <Link href="/quan-tri/bang-luong" className="underline underline-offset-2">
                  {salary.pendingCount} phiếu — xem Bảng lương
                </Link>
              }
              amount={salary.pendingAmount}
              tone="var(--status-yellow)"
            />
            <Total label="Dự kiến sau khi trả hết lương" caption="Con số để quyết định chi tiêu" amount={afterAllSalary} palette="forecast" />
          </>
        ) : (
          totalPayslips > 0 && (
            <p className="text-xs pt-1" style={{ color: "var(--status-green)" }}>
              ✓ Đã trả hết lương tháng này
            </p>
          )
        )}
      </section>

      <div className="flex flex-col gap-4">
        {/* Luỹ kế = "cộng dồn": each month's tiền còn lại thực tế added up. */}
        <section
          className="card elev-sm p-5 flex flex-col gap-1"
          style={{
            background:
              cumulative && cumulative.yearToDate < 0
                ? "color-mix(in srgb, var(--status-red) 12%, var(--color-bg))"
                : "var(--color-accent-2-100)",
          }}
        >
          <span
            className="text-[11px] font-bold tracking-[0.08em]"
            style={{ color: cumulative && cumulative.yearToDate < 0 ? "var(--status-red)" : "var(--color-accent-2-700)" }}
          >
            LUỸ KẾ TỪ ĐẦU NĂM {cumulative?.year ?? ""}
          </span>
          <span
            className="font-heading text-2xl font-bold tabular-nums"
            style={{ color: cumulative && cumulative.yearToDate < 0 ? "var(--status-red)" : "var(--color-accent-2-800)" }}
          >
            {cumulative ? formatVnd(cumulative.yearToDate) : "…"}
          </span>
          <span className="text-[11px]" style={{ color: "var(--color-accent-2-700)" }}>
            Cộng dồn &quot;tiền còn lại thực tế&quot; từ tháng 1 đến hết {monthLabel}
          </span>
          {cumulative?.startLabel && (
            <span
              className="text-xs flex justify-between gap-2 pt-2 mt-1"
              style={{ borderTop: "1px dashed var(--color-accent-2-300)", color: "var(--color-accent-2-800)" }}
            >
              <span>Từ {cumulative.startLabel} (bắt đầu ghi sổ)</span>
              <span className="font-bold tabular-nums">{formatVnd(cumulative.sinceStart)}</span>
            </span>
          )}
        </section>

        {debts.lines.length > 0 && (
          <section className="card elev-sm p-5 flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
              NỢ CÒN PHẢI TRẢ
            </span>
            {debts.lines.map((d) => (
              <div key={d.label} className="flex justify-between gap-3 text-sm">
                <span className="flex flex-col min-w-0">
                  <span style={{ color: "var(--color-neutral-600)" }}>{d.label}</span>
                  {d.hint && (
                    <span className="text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
                      {d.hint}
                    </span>
                  )}
                </span>
                <span className="font-semibold tabular-nums">{formatVnd(d.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 text-sm pt-2 mt-1" style={{ borderTop: "1px dashed var(--color-neutral-200)" }}>
              <span className="font-bold">Tổng nợ</span>
              <span className="font-bold tabular-nums" style={{ color: "var(--status-red)" }}>
                {formatVnd(debts.total)}
              </span>
            </div>
            <span className="text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
              Chỉ tính tiền gốc còn lại, chưa gồm lãi các kỳ sau.
            </span>
          </section>
        )}

        <section className="card elev-sm p-5 flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            CHỈ SỐ THAM KHẢO
          </span>
          <div className="flex justify-between gap-3 text-sm">
            <span style={{ color: "var(--color-neutral-600)" }}>Lợi nhuận gộp</span>
            <span className="font-semibold tabular-nums">{formatVnd(summary.grossProfit)}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span style={{ color: "var(--color-neutral-600)" }}>Biên lợi nhuận gộp</span>
            <span className="font-semibold tabular-nums">{(summary.grossMarginRatio * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span style={{ color: "var(--color-neutral-600)" }}>Điểm hoà vốn</span>
            <span className="font-semibold tabular-nums">{breakEven === null ? "Chưa xác định" : formatVnd(breakEven)}</span>
          </div>
          {shortfall !== null && (
            <div className="flex justify-between gap-3 text-sm">
              <span style={{ color: "var(--color-neutral-600)" }}>Doanh thu còn thiếu</span>
              <span className="font-semibold tabular-nums" style={{ color: shortfall <= 0 ? "var(--status-green)" : "var(--status-red)" }}>
                {shortfall <= 0 ? "Đã vượt hoà vốn" : formatVnd(shortfall)}
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
