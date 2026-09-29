"use client";

import { useEffect, useMemo, useState } from "react";
import { listUpworkLeadStats, saveUpworkFilters } from "@/lib/actions/upwork";
import { upworkStats, type StatsLead } from "@/lib/upworkStats";
import { previewFilters, type FilterJob, type UpworkFilters } from "@/lib/upworkFilters";
import type { UpworkBatch } from "@/lib/types";
import { BarList, Card, Funnel, REVENUE, Tile, useWidth } from "../tong-quan/charts";

// Tìm khách (Upwork) → Hiệu quả: is the hourly job hunt worth it? Did it
// run every hour, how many emailed jobs were worth a proposal, how many of
// those sếp kept, and how far they got — sent, answered, hired.

const RANGES = [
  { days: 7, label: "7 ngày" },
  { days: 30, label: "30 ngày" },
  { days: null, label: "Tất cả" },
] as const;

const FOUND = "var(--color-neutral-300)";

function DayColumns({ days }: { days: { key: string; found: number; drafted: number; checks: number }[] }) {
  const [box, W] = useWidth<HTMLDivElement>(320);
  const H = 170;
  const pad = { l: 8, r: 8, t: 18, b: 24 };
  const top = Math.max(1, ...days.map((d) => Math.max(d.found, d.drafted)));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const slot = (W - pad.l - pad.r) / days.length;
  const barW = Math.max(3, Math.min(14, slot * 0.3));
  const labelEvery = slot < 34 ? 2 : 1;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Job mới và proposal theo ngày">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-neutral-300)" strokeWidth={1} />
        {days.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const label = `${d.key.slice(8, 10)}/${d.key.slice(5, 7)}`;
          return (
            <g key={d.key}>
              <title>{`${label}: ${d.found} job mới · ${d.drafted} proposal · ${d.checks} lượt kiểm tra`}</title>
              {/* A wider invisible target than the bars, for the hover. */}
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              <rect x={cx - barW - 1} y={y(d.found)} width={barW} height={Math.max(0, y(0) - y(d.found))} rx={3} fill={FOUND} />
              <rect x={cx + 1} y={y(d.drafted)} width={barW} height={Math.max(0, y(0) - y(d.drafted))} rx={3} fill={REVENUE} />
              {d.drafted > 0 && (
                <text x={cx + 1 + barW / 2} y={y(d.drafted) - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-text)">
                  {d.drafted}
                </text>
              )}
              {i % labelEvery === (days.length - 1) % labelEvery && (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-neutral-600)">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Yêu cầu đầu vào: sếp's numbers for which jobs are worth a proposal —
// saved for the next hourly check, and tried on past jobs as he types.
function FiltersCard({ initial, jobs }: { initial: UpworkFilters; jobs: FilterJob[] | null }) {
  const [saved, setSaved] = useState(initial);
  const [f, setF] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const preview = useMemo(() => (jobs ? previewFilters(jobs, f) : null), [jobs, f]);
  const set = (patch: Partial<UpworkFilters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setState("idle");
  };

  async function save() {
    setState("saving");
    try {
      const next = await saveUpworkFilters(f);
      setSaved(next);
      setF(next);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const label = (text: string) => (
    <span className="text-[12.5px] font-bold" style={{ color: "var(--color-neutral-700)" }}>
      {text}
    </span>
  );
  const seg = <T extends string | number>(value: T, options: readonly (readonly [T, string])[], onChange: (v: T) => void) => (
    <div className="inline-flex rounded-[10px] p-0.5 self-start" style={{ background: "var(--color-neutral-100)" }} role="radiogroup">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className="rounded-[8px] px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap"
          style={value === v ? { background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" } : { color: "var(--color-neutral-600)" }}
        >
          {text}
        </button>
      ))}
    </div>
  );
  const dollar = (value: string, onChange: (v: string) => void, suffix: string, ariaLabel: string, placeholder: string) => (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold" style={{ color: "var(--color-neutral-500)" }} aria-hidden>
        $
      </span>
      <input
        className="input tabular-nums"
        style={{ paddingLeft: 24, paddingRight: suffix ? 56 : undefined }}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px]" style={{ color: "var(--color-neutral-500)" }} aria-hidden>
          {suffix}
        </span>
      )}
    </div>
  );

  return (
    <Card title="⚙️ Yêu cầu đầu vào">
      <p className="text-[12.5px] -mt-1" style={{ color: "var(--color-neutral-600)" }}>
        Sếp nhập số — mỗi giờ em chỉ soạn proposal cho job đạt đủ các yêu cầu này. Để trống ô tiền = không đặt mức.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1.5 min-w-0">
          {label("Dự án giá cố định, tối thiểu")}
          {dollar(f.minFixedBudget, (v) => set({ minFixedBudget: v }), "", "Ngân sách tối thiểu cho job giá cố định (USD)", "VD: 300")}
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          {label("Job theo giờ, tối thiểu")}
          {dollar(f.minHourlyRate, (v) => set({ minHourlyRate: v }), "/giờ", "Giá theo giờ tối thiểu (USD)", "VD: 15")}
        </label>
        <div className="flex flex-col gap-1.5 min-w-0">
          {label("Chỉ lấy job em chấm từ")}
          {seg(
            f.minFitScore,
            [
              [3, "3★"],
              [4, "4★"],
              [5, "5★"],
            ] as const,
            (v) => set({ minFitScore: v }),
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          {label("Job không ghi ngân sách")}
          {seg(
            f.noBudget,
            [
              ["keep", "Vẫn lấy"],
              ["skip", "Bỏ qua"],
            ] as const,
            (v) => set({ noBudget: v }),
          )}
        </div>
        <label className="flex flex-col gap-1.5 min-w-0 sm:col-span-2 xl:col-span-4">
          {label("Bỏ job có từ khoá (cách nhau bằng dấu phẩy)")}
          <input
            className="input"
            value={f.excludeKeywords}
            placeholder="VD: logo, NFT, tattoo, AI art"
            aria-label="Từ khoá loại bỏ"
            onChange={(e) => set({ excludeKeywords: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] px-3 py-2.5" style={{ background: "var(--color-surface)" }}>
        <span className="text-[13px] flex-1 min-w-[220px]">
          {!preview ? (
            "Đang tính thử…"
          ) : preview.total === 0 ? (
            "Chưa có job nào để thử."
          ) : (
            <>
              Thử với <b>{preview.total}</b> job em đã soạn: giữ <b style={{ color: "var(--status-green)" }}>{preview.kept}</b>, bỏ{" "}
              <b style={{ color: preview.dropped ? "var(--status-red)" : undefined }}>{preview.dropped}</b>
              {preview.reasons.length > 0 && (
                <span style={{ color: "var(--color-neutral-500)" }}> — {preview.reasons.map((r) => `${r.count} ${r.reason}`).join(" · ")}</span>
              )}
            </>
          )}
        </span>
        <div className="flex items-center gap-2 flex-none">
          {dirty && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(saved)}>
              Hoàn tác
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || state === "saving"} onClick={() => void save()}>
            {state === "saving" ? "Đang lưu…" : "Lưu yêu cầu"}
          </button>
        </div>
        {(state === "saved" || state === "error") && !dirty && (
          <span className="text-[12.5px] basis-full font-semibold" style={{ color: state === "saved" ? "var(--status-green)" : "var(--status-red)" }}>
            {state === "saved" ? "✓ Đã lưu — áp dụng từ lượt kiểm tra kế tiếp (phút 20 mỗi giờ). Job đã soạn trước đó giữ nguyên." : "Chưa lưu được — thử lại."}
          </span>
        )}
      </div>
    </Card>
  );
}

export function UpworkStats({ batches, initialFilters }: { batches: UpworkBatch[]; initialFilters: UpworkFilters }) {
  const [leads, setLeads] = useState<(StatsLead & FilterJob)[] | null>(null);
  const [range, setRange] = useState<number | null>(30);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    listUpworkLeadStats()
      .then((rows) => {
        if (!alive) return;
        setLeads(rows);
        setNow(Date.now());
      })
      .catch(() => alive && setLeads([]));
    return () => {
      alive = false;
    };
  }, [batches]);

  const s = useMemo(() => (leads && now ? upworkStats(batches, leads, range, now) : null), [batches, leads, range, now]);

  if (!s) return <p style={{ color: "var(--color-neutral-500)" }}>Đang tính…</p>;
  const filters = <FiltersCard initial={initialFilters} jobs={leads} />;

  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  return (
    <div className="flex flex-col gap-4">
      {filters}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
          Mỗi 15 phút (7h–24h) em đọc email báo job của Upwork, lọc theo SOP và yêu cầu của sếp, soạn proposal; sếp/PM duyệt rồi tự gửi.
        </p>
        <div className="inline-flex rounded-[10px] p-0.5" style={{ background: "var(--color-neutral-100)" }} role="radiogroup" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={range === r.days}
              onClick={() => setRange(r.days)}
              className="rounded-[8px] px-3 py-1 text-[13px] font-semibold whitespace-nowrap"
              style={range === r.days ? { background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" } : { color: "var(--color-neutral-600)" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Canh job đều"
          value={pct(s.uptime)}
          tone={s.uptime !== null && s.uptime < 90 ? "warn" : s.uptime !== null ? "good" : undefined}
          sub={`${s.coveredHours}/${s.expectedHours} giờ (7h–24h) có kiểm tra · ${s.checks} lượt`}
        />
        <Tile label="Job hợp SOP" value={pct(s.fitRate)} sub={`${s.drafted} proposal / ${s.found} job trong email`} />
        <Tile
          label="Sếp giữ lại"
          value={pct(s.keptRate)}
          // Judged only once there are a handful of decisions to judge by.
          tone={s.keptRate === null || s.kept + s.rejected < 5 ? undefined : s.keptRate >= 60 ? "good" : s.keptRate < 35 ? "bad" : "warn"}
          sub={s.kept + s.rejected ? `${s.kept} duyệt · ${s.rejected} bỏ qua${s.pending ? ` · ${s.pending} chưa xem` : ""}` : "chưa duyệt job nào"}
        />
        <Tile label="Khách trả lời" value={pct(s.replyRate)} tone={s.hired > 0 ? "good" : undefined} sub={`${s.replied}/${s.sent} proposal đã gửi · ${s.hired} chốt`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card title="Phễu khách hàng">
          <Funnel stages={s.funnel} />
          <p className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
            % bên phải = so với bước ngay trên. &quot;Đã gửi&quot;, &quot;Khách trả lời&quot;, &quot;Chốt&quot; tính theo nút sếp/PM bấm trên từng job.
          </p>
        </Card>

        <Card title={s.byDay.length > 1 ? `Theo ngày · ${s.byDay.length} ngày gần nhất` : "Hôm nay"}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: "var(--color-neutral-600)" }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block rounded-[3px]" style={{ width: 10, height: 10, background: FOUND }} aria-hidden />
              Job mới trong email
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block rounded-[3px]" style={{ width: 10, height: 10, background: REVENUE }} aria-hidden />
              Proposal đã soạn
            </span>
          </div>
          <DayColumns days={s.byDay} />
          <p className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
            Rê chuột / chạm vào một ngày để xem số lượt kiểm tra hôm đó.
          </p>
        </Card>

        <Card title="Em chấm điểm có đúng không?">
          <BarList
            rows={s.byScore
              .filter((r) => r.drafted > 0)
              .map((r) => ({
                key: String(r.score),
                label: `${"★".repeat(r.score)} (${r.drafted} job)`,
                value: r.keptRate ?? 0,
                display: r.keptRate === null ? "chưa duyệt" : `${r.keptRate}% giữ`,
                sub: r.reviewed ? `${r.kept}/${r.reviewed}` : undefined,
              }))}
            max={100}
            emptyText="Chưa có job nào được chấm điểm."
          />
          <p className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
            Job em chấm nhiều sao hơn nên được sếp giữ lại nhiều hơn — nếu không, em cần chỉnh lại cách chấm.
          </p>
        </Card>

        <Card title="Mẫu proposal nào được trả lời">
          <BarList
            rows={s.templates.map((t) => ({
              key: t.name,
              label: t.name,
              value: t.sent ? (t.replied / t.sent) * 100 : 0,
              display: `${t.replied}/${t.sent}`,
              sub: "trả lời",
            }))}
            max={100}
            emptyText="Chưa gửi proposal nào — bấm “Đánh dấu đã gửi trên Upwork” sau khi gửi để đo được."
          />
        </Card>
      </div>
    </div>
  );
}
