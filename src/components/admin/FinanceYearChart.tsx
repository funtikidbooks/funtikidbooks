"use client";

import { MONTH_LABELS } from "@/lib/constants/attendance";

export type FinanceYearChartRow = {
  monthIndex: number; // 0 = Tháng 1
  revenue: number;
  fixedCost: number;
  variableCost: number;
  salaryTotal: number;
  netProfit: number;
};

const WIDTH = 900;
const HEIGHT = 260;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

// Abbreviates a VNĐ amount for axis labels — "12,5tr" instead of
// "12.500.000 ₫", since the full currency format is too wide to fit
// several of them along an axis without crowding.
function abbreviateVnd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${sign}${millions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  }
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1000)}k`;
  return `${sign}${abs}`;
}

const SERIES: { key: "revenue" | "totalCost" | "netProfit"; label: string; color: string }[] = [
  { key: "revenue", label: "Doanh thu", color: "var(--status-green)" },
  { key: "totalCost", label: "Chi phí (định phí + biến phí + lương)", color: "var(--status-red)" },
  { key: "netProfit", label: "Lợi nhuận ròng", color: "var(--status-blue)" },
];

export function FinanceYearChart({ rows }: { rows: FinanceYearChartRow[] }) {
  const withTotals = rows.map((r) => ({
    ...r,
    totalCost: r.fixedCost + r.variableCost + r.salaryTotal,
  }));

  const allValues = withTotals.flatMap((r) => [r.revenue, r.totalCost, r.netProfit]);
  const maxValue = Math.max(0, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  function x(monthIndex: number) {
    return PAD_LEFT + (monthIndex / 11) * plotWidth;
  }
  function y(value: number) {
    return PAD_TOP + (1 - (value - minValue) / range) * plotHeight;
  }

  const gridValues = [maxValue, maxValue / 2, 0, minValue / 2, minValue].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  return (
    <div className="card elev-sm p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="rounded-full flex-none" style={{ width: 10, height: 10, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: "auto" }}>
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? "var(--color-neutral-300)" : "var(--color-neutral-100)"}
              strokeWidth={v === 0 ? 1.5 : 1}
            />
            <text x={PAD_LEFT - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-neutral-500)">
              {abbreviateVnd(v)}
            </text>
          </g>
        ))}

        {MONTH_LABELS.map((_, i) => (
          <text key={i} x={x(i)} y={HEIGHT - PAD_BOTTOM + 16} textAnchor="middle" fontSize={10} fill="var(--color-neutral-500)">
            T{i + 1}
          </text>
        ))}

        {SERIES.map((s) => {
          const points = withTotals.map((r) => `${x(r.monthIndex)},${y(r[s.key])}`).join(" ");
          return (
            <g key={s.key}>
              <polyline points={points} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {withTotals.map((r) => (
                <circle key={r.monthIndex} cx={x(r.monthIndex)} cy={y(r[s.key])} r={3} fill={s.color}>
                  <title>
                    {MONTH_LABELS[r.monthIndex]}: {s.label} {new Intl.NumberFormat("vi-VN").format(r[s.key])} đ
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
