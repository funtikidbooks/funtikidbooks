"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { compactVnd, shortMonthLabel, type MonthPoint } from "@/lib/dashboardMath";

// Drawing pieces for Quản trị → Tổng quan (DashboardView.tsx lays them out).
//
// Colours: thu = accent-2 blue, chi = accent orange (the site's two brand
// ramps, far apart for colour-blind readers too); green/red only ever mean
// lãi/lỗ or good/bad and always come with a sign, ▲/▼ or ⚠.

export const REVENUE = "var(--color-accent-2-600)";
export const COST = "var(--color-accent-400)";

export function Card({
  title,
  href,
  hrefLabel = "Xem chi tiết",
  children,
  className = "",
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card elev-sm p-4 flex flex-col gap-3 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px]">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--color-accent-700)" }}>
            {hrefLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "good" | "bad" | "warn";
  href?: string;
}) {
  const color =
    tone === "good"
      ? "var(--status-green)"
      : tone === "bad"
        ? "var(--status-red)"
        : tone === "warn"
          ? "var(--color-accent-700)"
          : "var(--color-text)";
  const body = (
    <>
      <span className="text-[11px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
        {label}
      </span>
      <span className="text-[22px] sm:text-[26px] font-bold leading-tight tabular-nums" style={{ color }}>
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
          {sub}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="card elev-sm p-3.5 flex flex-col gap-1 min-w-0">
      {body}
    </Link>
  ) : (
    <div className="card elev-sm p-3.5 flex flex-col gap-1 min-w-0">{body}</div>
  );
}

// Charts draw at the box's real pixel width, so text stays 11–12px on a
// phone and on a wide screen alike instead of scaling with a fixed viewBox.
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function signed(n: number) {
  return `${n > 0 ? "+" : ""}${compactVnd(n)}`;
}

// A max that lands on a round number, so the three gridlines read cleanly.
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= v) ?? 10;
  return step * pow;
}

export function RevenueCostChart({
  months,
  onPick,
  picked,
}: {
  months: MonthPoint[];
  onPick: (i: number) => void;
  picked: number;
}) {
  const [box, W] = useWidth<HTMLDivElement>(420);
  const H = 220;
  const pad = { l: 44, r: 8, t: 12, b: 44 };
  const max = niceMax(Math.max(...months.flatMap((m) => [m.revenue, m.cost])));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const slot = (W - pad.l - pad.r) / months.length;
  const barW = Math.min(22, slot * 0.28);
  const ticks = [0, max / 2, max];

  return (
    <div ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
        role="img"
        aria-label="Biểu đồ thu và chi 6 tháng"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-neutral-200)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-neutral-500)">
              {compactVnd(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const active = i === picked;
          return (
            <g key={m.month} onMouseEnter={() => onPick(i)} onClick={() => onPick(i)} style={{ cursor: "pointer" }}>
              <rect
                x={cx - slot / 2}
                y={pad.t}
                width={slot}
                height={H - pad.t - pad.b}
                fill={active ? "var(--color-neutral-100)" : "transparent"}
              />
              <rect
                x={cx - barW - 1}
                y={y(m.revenue)}
                width={barW}
                height={Math.max(0, y(0) - y(m.revenue))}
                rx={4}
                fill={REVENUE}
              />
              <rect x={cx + 1} y={y(m.cost)} width={barW} height={Math.max(0, y(0) - y(m.cost))} rx={4} fill={COST} />
              <text
                x={cx}
                y={H - pad.b + 16}
                textAnchor="middle"
                fontSize={12}
                fontWeight={active ? 700 : 500}
                fill="var(--color-text)"
              >
                {shortMonthLabel(m.month)}
              </text>
              <text
                x={cx}
                y={H - pad.b + 33}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={m.net >= 0 ? "var(--status-green)" : "var(--status-red)"}
              >
                {m.revenue === 0 && m.cost === 0 ? "—" : `${m.net >= 0 ? "▲" : "▼"} ${compactVnd(Math.abs(m.net))}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CumulativeChart({ points }: { points: { month: string; value: number }[] }) {
  const [box, W] = useWidth<HTMLDivElement>(320);
  const H = 170;
  const pad = { l: 44, r: 56, t: 16, b: 26 };
  const vals = points.map((p) => p.value);
  const hi = Math.max(0, ...vals);
  const lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / span);
  const x = (i: number) =>
    points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + ((W - pad.l - pad.r) * i) / (points.length - 1);
  const last = points[points.length - 1];
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Biểu đồ luỹ kế">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-neutral-300)" strokeWidth={1} />
        <text x={pad.l - 6} y={y(0) + 4} textAnchor="end" fontSize={11} fill="var(--color-neutral-500)">
          0
        </text>
        <path d={area} fill="var(--color-accent-2-500)" opacity={0.12} />
        <path d={path} fill="none" stroke="var(--color-accent-2-700)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.month}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={4}
              fill="var(--color-panel)"
              stroke="var(--color-accent-2-700)"
              strokeWidth={2}
            />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--color-text)">
              {shortMonthLabel(p.month)}
            </text>
          </g>
        ))}
        {last && (
          <text x={x(points.length - 1) + 8} y={y(last.value) + 4} fontSize={12} fontWeight={700} fill="var(--color-text)">
            {compactVnd(last.value)}
          </text>
        )}
      </svg>
    </div>
  );
}

export function formatHours(h: number) {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, "0")}` : `${whole}h`;
}

// Horizontal bars, one row per item: name · bar · value. The workhorse for
// "biggest first" lists (chi phí, nguồn thu, giờ theo người).
export function BarList({
  rows,
  color = REVENUE,
  max,
  emptyText,
}: {
  rows: { key: string; label: string; value: number; display: string; sub?: string; color?: string; marker?: number }[];
  color?: string;
  max?: number;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
        {emptyText}
      </p>
    );
  }
  const top = max ?? Math.max(1, ...rows.map((r) => Math.max(r.value, r.marker ?? 0)));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div
          key={r.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
        >
          <span className="text-[13px] font-semibold truncate" title={r.label}>
            {r.label}
          </span>
          <span className="text-[13px] tabular-nums text-right sm:order-3 whitespace-nowrap">
            <b>{r.display}</b>
            {r.sub && <span style={{ color: "var(--color-neutral-500)" }}> {r.sub}</span>}
          </span>
          <div
            className="relative h-2.5 rounded-full col-span-2 sm:col-span-1 sm:order-2"
            style={{ background: "var(--color-neutral-100)" }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, (Math.max(0, r.value) / top) * 100)}%`, background: r.color ?? color }}
            />
            {r.marker !== undefined && (
              <div
                className="absolute -inset-y-1"
                style={{ left: `${Math.min(100, (r.marker / top) * 100)}%`, width: 2, background: "var(--color-neutral-700)" }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Single-series columns per month, optional dashed reference line (e.g. the
// 60% lương/doanh thu ceiling). Value labels sit above each column.
export function MonthColumns({
  points,
  color,
  reference,
  label,
  ariaLabel,
}: {
  points: { month: string; value: number | null }[];
  color: (v: number) => string;
  reference?: { value: number; text: string };
  label: (v: number) => string;
  ariaLabel: string;
}) {
  const [box, W] = useWidth<HTMLDivElement>(320);
  const H = 150;
  const pad = { l: 8, r: 8, t: 20, b: 22 };
  const max = Math.max(1e-9, ...points.map((p) => p.value ?? 0), reference ? reference.value * 1.15 : 0);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const slot = (W - pad.l - pad.r) / points.length;
  const barW = Math.min(28, slot * 0.5);
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={ariaLabel}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-neutral-300)" strokeWidth={1} />
        {reference && (
          <g>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke="var(--color-neutral-600)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={W - pad.r} y={y(reference.value) - 4} textAnchor="end" fontSize={11} fill="var(--color-neutral-600)">
              {reference.text}
            </text>
          </g>
        )}
        {points.map((p, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={p.month}>
              {p.value !== null && (
                <>
                  <rect
                    x={cx - barW / 2}
                    y={y(p.value)}
                    width={barW}
                    height={Math.max(0, y(0) - y(p.value))}
                    rx={4}
                    fill={color(p.value)}
                  />
                  <text x={cx} y={y(p.value) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-text)">
                    {label(p.value)}
                  </text>
                </>
              )}
              <text x={cx} y={H - 5} textAnchor="middle" fontSize={12} fill="var(--color-text)">
                {shortMonthLabel(p.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Step-down funnel: each stage's bar is its share of the first stage, with
// the step-to-step conversion beside it.
export function Funnel({ stages }: { stages: { label: string; value: number }[] }) {
  const first = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const rate = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto] items-center gap-3">
            <span className="text-[13px] font-semibold truncate">{s.label}</span>
            <div className="h-6 rounded-[6px] relative" style={{ background: "var(--color-neutral-100)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded-[6px] flex items-center"
                style={{ width: `${Math.max(s.value > 0 ? 6 : 0, (s.value / first) * 100)}%`, background: REVENUE }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[12px] font-bold tabular-nums">{s.value}</span>
            </div>
            <span className="text-[11px] tabular-nums w-[44px] text-right" style={{ color: "var(--color-neutral-500)" }}>
              {rate === null ? "" : `${rate}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// A small heading that splits the page into Tiền / Dự án / Đội ngũ /
// Khách hàng; the id is what the jump bar scrolls to.
export function SectionTitle({ id, icon, title, hint }: { id: string; icon: string; title: string; hint: string }) {
  return (
    <div id={id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-3 scroll-mt-16">
      <h2 className="text-[17px] whitespace-nowrap">
        <span aria-hidden>{icon}</span> {title}
      </h2>
      <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
        {hint}
      </span>
    </div>
  );
}
