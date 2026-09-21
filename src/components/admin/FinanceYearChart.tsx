"use client";

import { useState } from "react";
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
  // Hover on a mouse, tap on touch (iPad/phone have no hover, so the old
  // native <title> tooltip never showed there).
  const [active, setActive] = useState<{ monthIndex: number; key: (typeof SERIES)[number]["key"] } | null>(null);
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

  const activeSeries = active ? SERIES.find((s) => s.key === active.key) : null;
  const activeRow = active ? withTotals.find((r) => r.monthIndex === active.monthIndex) : null;
  const activeTip =
    active && activeSeries && activeRow
      ? {
          monthIndex: active.monthIndex,
          label: activeSeries.label,
          color: activeSeries.color,
          value: activeRow[active.key],
          px: x(active.monthIndex),
          py: y(activeRow[active.key]),
        }
      : null;

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

      <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: "auto" }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setActive(null);
        }}
      >
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
              {withTotals.map((r) => {
                const isActive = active?.monthIndex === r.monthIndex && active.key === s.key;
                return (
                  <g key={r.monthIndex}>
                    <circle cx={x(r.monthIndex)} cy={y(r[s.key])} r={isActive ? 5.5 : 3} fill={s.color} />
                    <circle
                      cx={x(r.monthIndex)}
                      cy={y(r[s.key])}
                      r={14}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onPointerEnter={(e) => {
                        if (e.pointerType === "mouse") setActive({ monthIndex: r.monthIndex, key: s.key });
                      }}
                      onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setActive(null);
                      }}
                      onPointerDown={(e) => {
                        if (e.pointerType === "mouse") return;
                        setActive((cur) => (cur?.monthIndex === r.monthIndex && cur.key === s.key ? null : { monthIndex: r.monthIndex, key: s.key }));
                      }}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {activeTip && (
        <div
          className="absolute pointer-events-none rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap"
          style={{
            left: `${Math.min(88, Math.max(12, (activeTip.px / WIDTH) * 100))}%`,
            top: `${(activeTip.py / HEIGHT) * 100}%`,
            transform: activeTip.py < 70 ? "translate(-50%, 14px)" : "translate(-50%, calc(-100% - 12px))",
            background: "var(--color-neutral-900)",
            color: "#fff",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div style={{ opacity: 0.75 }}>{MONTH_LABELS[activeTip.monthIndex]}</div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full flex-none" style={{ width: 8, height: 8, background: activeTip.color }} />
            {activeTip.label}: {new Intl.NumberFormat("vi-VN").format(activeTip.value)} đ
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
