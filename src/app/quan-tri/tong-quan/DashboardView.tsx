"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DashboardData } from "@/lib/actions/dashboard";
import { compactVnd, shortMonthLabel, type MonthPoint } from "@/lib/dashboardMath";
import { formatVnd } from "@/lib/financeSummary";

// Quản trị → Tổng quan. The numbers come from the same actions as Tài chính,
// Chấm công and Báo cáo giờ; this page only draws them.
//
// Colours: thu = accent-2 blue, chi = accent orange (the site's two brand
// ramps, far apart for colour-blind readers too); green/red only ever mean
// lãi/lỗ and always come with a sign and ▲/▼.

const REVENUE = "var(--color-accent-2-600)";
const COST = "var(--color-accent-400)";

function Card({
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

function Tile({
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
function useWidth<T extends HTMLElement>(fallback: number) {
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

function signed(n: number) {
  return `${n > 0 ? "+" : ""}${compactVnd(n)}`;
}

// A max that lands on a round number, so the three gridlines read cleanly.
function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= v) ?? 10;
  return step * pow;
}

function RevenueCostChart({ months, onPick, picked }: { months: MonthPoint[]; onPick: (i: number) => void; picked: number }) {
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

function CumulativeChart({ points }: { points: { month: string; value: number }[] }) {
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

function formatHours(h: number) {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, "0")}` : `${whole}h`;
}

export function DashboardView({ data, cumulativeStartMonth }: { data: DashboardData; cumulativeStartMonth: string }) {
  const { months, attendance, hours, salaryPending } = data;
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const [picked, setPicked] = useState(months.length - 1);
  const p = months[picked];

  const cumulativePoints = months
    .filter((m) => m.cumulative !== null)
    .map((m) => ({ month: m.month, value: m.cumulative as number }));
  const [y, mo, d] = data.today.split("-");
  const startLabel = `T${Number(cumulativeStartMonth.slice(5, 7))}/${cumulativeStartMonth.slice(0, 4)}`;
  const maxHours = Math.max(1, ...hours.projects.map((pr) => Math.max(pr.hours, pr.cap ?? 0)));

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1080px] flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-xl">Tổng quan</h1>
          <span className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Hôm nay {d}/{mo}/{y}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label={`Lãi tháng ${Number(mo)}`}
            value={signed(current.net)}
            tone={current.net >= 0 ? "good" : "bad"}
            sub={previous ? `Tháng trước ${signed(previous.net)}` : undefined}
            href="/quan-tri/tai-chinh"
          />
          <Tile
            label={`Luỹ kế từ ${startLabel}`}
            value={current.cumulative === null ? "—" : signed(current.cumulative)}
            tone={current.cumulative === null ? undefined : current.cumulative >= 0 ? "good" : "bad"}
            sub="Tiền thực còn lại cộng dồn"
            href="/quan-tri/tai-chinh"
          />
          <Tile
            label="Hôm nay đi làm"
            value={attendance.isOffDay ? "Nghỉ" : `${attendance.present}/${attendance.staffTotal}`}
            tone={!attendance.isOffDay && attendance.late > 0 ? "warn" : undefined}
            sub={
              attendance.isOffDay
                ? "Ngày nghỉ theo lịch"
                : attendance.late > 0
                  ? `${attendance.late} người đi trễ`
                  : "Không ai đi trễ"
            }
            href="/quan-tri/cham-cong"
          />
          <Tile
            label="Khách chờ trả lời"
            value={String(data.unreadClientMessages)}
            tone={data.unreadClientMessages > 0 ? "warn" : undefined}
            sub={data.unreadClientMessages > 0 ? "Tin nhắn chưa đọc" : "Đã trả lời hết"}
            href="/workspace/khach-hang"
          />
        </div>

        <div className="grid lg:grid-cols-[3fr_2fr] gap-4">
          <Card title="Thu – chi 6 tháng" href="/quan-tri/tai-chinh">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--color-neutral-600)" }}>
              <span className="flex items-center gap-1.5">
                <span className="rounded-[3px]" style={{ width: 10, height: 10, background: REVENUE }} /> Thu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="rounded-[3px]" style={{ width: 10, height: 10, background: COST }} /> Chi (gồm lương đã trả)
              </span>
              <span>▲▼ lãi/lỗ</span>
            </div>
            <RevenueCostChart months={months} picked={picked} onPick={setPicked} />
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-[10px] p-2.5 text-xs tabular-nums"
              style={{ background: "var(--color-neutral-100)" }}
            >
              <span className="col-span-2 sm:col-span-4 font-bold text-[13px]">
                Tháng {Number(p.month.slice(5, 7))}/{p.month.slice(0, 4)}
                {picked === months.length - 1 ? " (đang chạy)" : ""}
              </span>
              <span>
                Thu: <b>{formatVnd(p.revenue)}</b>
              </span>
              <span>
                Chi: <b>{formatVnd(p.cost)}</b>
              </span>
              <span>
                {p.net >= 0 ? "Lãi" : "Lỗ"}:{" "}
                <b
                  style={{
                    color: p.net >= 0 ? "var(--status-green)" : "var(--status-red)",
                  }}
                >
                  {formatVnd(p.net)}
                </b>
              </span>
              <span>
                Luỹ kế: <b>{p.cumulative === null ? "—" : formatVnd(p.cumulative)}</b>
              </span>
            </div>
            {salaryPending.count > 0 && (
              <p className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
                Lương tháng này còn <b>{salaryPending.count} phiếu chưa trả</b> ({formatVnd(salaryPending.amount)}) — chưa tính
                vào chi cho tới khi bấm &quot;Đã trả&quot;.
              </p>
            )}
          </Card>

          <Card title={`Luỹ kế từ ${startLabel}`} href="/quan-tri/tai-chinh">
            {cumulativePoints.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
                Luỹ kế bắt đầu tính từ {startLabel}.
              </p>
            ) : (
              <>
                <CumulativeChart points={cumulativePoints} />
                <p className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
                  Cộng dồn tiền thực còn lại mỗi tháng (thu − chi − lương đã trả). Đường đi lên là studio đang để dành được tiền.
                </p>
              </>
            )}
          </Card>
        </div>

        <Card title={`Giờ làm tuần này · ${formatHours(hours.totalHours)}`} href="/workspace/bao-cao-gio">
          {hours.projects.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Tuần này chưa ai báo giờ.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {hours.projects.slice(0, 8).map((pr) => {
                const over = pr.cap !== null && pr.hours > pr.cap;
                return (
                  <div
                    key={pr.id ?? "none"}
                    className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                  >
                    <span className="text-[13px] font-semibold truncate" title={pr.name}>
                      {pr.name}
                    </span>
                    <span className="text-[13px] tabular-nums text-right sm:order-3 whitespace-nowrap">
                      <b>{formatHours(pr.hours)}</b>
                      {pr.cap !== null && (
                        <span
                          style={{
                            color: over ? "var(--status-red)" : "var(--color-neutral-500)",
                          }}
                        >
                          {" "}
                          / {pr.cap}h{over ? " ⚠" : ""}
                        </span>
                      )}
                    </span>
                    <div
                      className="relative h-2.5 rounded-full col-span-2 sm:col-span-1 sm:order-2"
                      style={{ background: "var(--color-neutral-100)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${(pr.hours / maxHours) * 100}%`,
                          background: over ? "var(--status-red)" : REVENUE,
                        }}
                      />
                      {pr.cap !== null && (
                        <div
                          className="absolute -inset-y-1"
                          style={{
                            left: `${(pr.cap / maxHours) * 100}%`,
                            width: 2,
                            background: "var(--color-neutral-700)",
                          }}
                          title={`Giới hạn ${pr.cap}h/tuần`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {hours.projects.length > 8 && (
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  và {hours.projects.length - 8} dự án khác
                </span>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
