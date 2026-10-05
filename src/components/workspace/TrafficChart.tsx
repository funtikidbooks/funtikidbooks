"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Grain } from "@/lib/analyticsRange";

type Bucket = { key: string; label: string; title: string; sessions: number; users: number; pageViews: number };

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Lượt truy cập per day / week / month. Each bar's height is a true share of
// the busiest one. With up to 8 bars every bar carries its number; with more,
// only the busiest does and the rest show theirs on hover (mouse), a tap
// (iPad/iPhone — tap again or anywhere else to close) or keyboard focus —
// and all of them are in "Xem dạng bảng" below.
export function TrafficChart({ buckets, grain }: { buckets: Bucket[]; grain: Grain }) {
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("");
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.sessions));
  const peak = buckets.findIndex((b) => b.sessions === max);
  const everyValue = n <= 8;
  // At most about 8 dates along the bottom.
  const labelStep = Math.max(1, Math.ceil(n / 8));
  const shown = active === null ? null : (buckets[active] ?? null);

  // A tap anywhere outside the chart closes the readout (touch screens have
  // no "pointer left" to do it).
  useEffect(() => {
    if (active === null) return;
    function onDown(e: PointerEvent) {
      if (!plotRef.current?.contains(e.target as Node)) setActive(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

  // Place the readout over its bar but never past the chart's sides (on a
  // phone it would push the page sideways), and below the bars instead of
  // above when the scrolled view has no room up there.
  useLayoutEffect(() => {
    const plot = plotRef.current;
    const tip = tipRef.current;
    if (!plot || !tip || active === null) return;
    const width = plot.clientWidth;
    const center = ((active + 0.5) / n) * width;
    tip.style.left = `${Math.min(Math.max(center - tip.offsetWidth / 2, 0), Math.max(width - tip.offsetWidth, 0))}px`;
    tip.style.top = "";
    tip.style.transform = "translateY(calc(-100% - 6px))";
    let scroller: HTMLElement | null = plot.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const visibleTop = scroller ? scroller.getBoundingClientRect().top : 0;
    if (tip.getBoundingClientRect().top < visibleTop) {
      tip.style.top = "100%";
      tip.style.transform = "translateY(6px)";
    }
  }, [active, n]);

  return (
    <div className="flex flex-col gap-3">
      <div ref={plotRef} className="relative" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
        <div className="flex items-stretch" style={{ height: 210, gap: n > 20 ? 2 : n > 10 ? 4 : 8 }}>
          {buckets.map((b, i) => {
            const pct = (b.sessions / max) * 100;
            const dim = shown !== null && active !== i;
            return (
              <button
                key={b.key}
                type="button"
                className="flex-1 min-w-0 flex flex-col items-center gap-1.5 rounded-[6px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-accent-700)]"
                // Hover is for a mouse only; a finger's tap is the click below,
                // which opens and closes it. A mouse click keeps it open (the
                // hover already did).
                onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
                onPointerDown={(e) => {
                  lastPointer.current = e.pointerType;
                }}
                onClick={() => {
                  const mouse = lastPointer.current === "mouse";
                  lastPointer.current = "";
                  setActive((a) => (mouse ? i : a === i ? null : i));
                }}
                // Keyboard focus shows it too; focus from a tap doesn't (it
                // would cancel the tap's own toggle on Android).
                onFocus={(e) => e.currentTarget.matches(":focus-visible") && setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${b.title}: ${fmt(b.sessions)} lượt truy cập, ${fmt(b.users)} người, ${fmt(b.pageViews)} lượt xem trang`}
              >
                <span className="text-xs font-bold whitespace-nowrap tabular-nums" style={{ color: "var(--color-text)", visibility: everyValue || i === peak ? "visible" : "hidden" }}>
                  {fmt(b.sessions)}
                </span>
                <span className="w-full flex-1 flex items-end justify-center" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                  {b.sessions > 0 && (
                    <span
                      className="w-full rounded-t-[4px]"
                      style={{
                        maxWidth: 56,
                        height: `${Math.max(pct, 2)}%`,
                        background: "var(--color-accent-500)",
                        opacity: dim ? 0.45 : 1,
                        outline: active === i ? "2px solid var(--color-accent-700)" : "none",
                        outlineOffset: 1,
                        transition: "opacity .12s",
                      }}
                    />
                  )}
                </span>
                <span className="text-[11px] whitespace-nowrap tabular-nums" style={{ color: "var(--color-neutral-500)", visibility: i % labelStep === 0 ? "visible" : "hidden" }}>
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>

        {shown && (
          <div
            ref={tipRef}
            role="status"
            className="card elev-lg absolute top-0 left-0 pointer-events-none px-3 py-2 flex flex-col gap-0.5 whitespace-nowrap"
            style={{ zIndex: 5 }}
          >
            <span className="text-[15px] font-extrabold tabular-nums">{fmt(shown.sessions)} lượt truy cập</span>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
              {fmt(shown.users)} người · {fmt(shown.pageViews)} lượt xem trang
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
              {shown.title}
            </span>
          </div>
        )}
      </div>

      <details className="text-[13px]">
        <summary className="cursor-pointer font-semibold w-fit" style={{ color: "var(--color-neutral-600)" }}>
          Xem dạng bảng
        </summary>
        <div className="overflow-x-auto mt-2 rounded-[10px]" style={{ border: "1px solid var(--color-neutral-100)" }}>
          <table className="w-full tabular-nums" style={{ borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr style={{ background: "var(--color-surface)" }}>
                {[grain === "day" ? "Ngày" : grain === "week" ? "Tuần" : "Tháng", "Lượt truy cập", "Người", "Lượt xem trang"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-bold whitespace-nowrap ${i ? "text-right" : "text-left"}`} style={{ color: "var(--color-neutral-500)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key} style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{b.title}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{fmt(b.sessions)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(b.users)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(b.pageViews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
