"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ANALYTICS_START, RANGE_PRESETS, type ResolvedRange } from "@/lib/analyticsRange";

// Lượt truy cập web: the span everything below shows — 7 ngày … 12 tháng,
// Tất cả, or two chosen dates. It lives in the address (?ky= / ?tu=&den=),
// so a span can be bookmarked or sent. While the next span loads, the
// numbers on screen stay put, dimmed, instead of blanking.
export function AnalyticsRangePicker({ current, today, children }: { current: ResolvedRange; today: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(current.key === "tu-chon");

  function go(query: string) {
    startTransition(() => router.push(`${pathname}?${query}`, { scroll: false }));
  }

  const chip = (selected: boolean) => ({
    background: selected ? "var(--color-accent-500)" : "var(--color-surface)",
    color: selected ? "#fff" : "var(--color-text)",
  });

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Khoảng thời gian">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setCustomOpen(false);
                go(`ky=${p.key}`);
              }}
              aria-pressed={current.key === p.key}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap"
              style={chip(current.key === p.key)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            aria-pressed={current.key === "tu-chon"}
            aria-expanded={customOpen}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap"
            style={chip(current.key === "tu-chon")}
          >
            📅 Chọn ngày
          </button>
          {pending && (
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
              Đang tải…
            </span>
          )}
        </div>

        {customOpen && <CustomRange key={`${current.start}|${current.end}`} start={current.start} end={current.end} today={today} onApply={(tu, den) => go(`tu=${tu}&den=${den}`)} />}

        {current.clipped && (
          <p className="text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
            Google Analytics bắt đầu ghi từ 23/09/2026, nên số liệu tính từ ngày đó.
          </p>
        )}
      </div>

      <div aria-busy={pending} className="flex flex-col gap-5" style={{ opacity: pending ? 0.5 : 1, transition: "opacity .15s" }}>
        {children}
      </div>
    </>
  );
}

function CustomRange({ start, end, today, onApply }: { start: string; end: string; today: string; onApply: (tu: string, den: string) => void }) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const valid = !!from && !!to && from <= to;
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply(from, to);
      }}
    >
      <div className="field min-w-0 w-[calc(50%-6px)] sm:w-44">
        <label htmlFor="ga-from">Từ ngày</label>
        <input id="ga-from" type="date" className="input" min={ANALYTICS_START} max={today} value={from} onChange={(e) => setFrom(e.target.value)} required />
      </div>
      <div className="field min-w-0 w-[calc(50%-6px)] sm:w-44">
        <label htmlFor="ga-to">Đến ngày</label>
        <input id="ga-to" type="date" className="input" min={from || ANALYTICS_START} max={today} value={to} onChange={(e) => setTo(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={!valid}>
        Xem
      </button>
    </form>
  );
}
