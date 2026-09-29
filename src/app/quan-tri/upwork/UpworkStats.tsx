"use client";

import { useEffect, useMemo, useState } from "react";
import { listUpworkLeadStats } from "@/lib/actions/upwork";
import { upworkStats, type StatsLead } from "@/lib/upworkStats";
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

export function UpworkStats({ batches }: { batches: UpworkBatch[] }) {
  const [leads, setLeads] = useState<StatsLead[] | null>(null);
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

  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
          Mỗi giờ em đọc email báo job của Upwork, lọc theo SOP và soạn proposal; sếp/PM duyệt rồi tự gửi.
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
          label="Chạy đều mỗi giờ"
          value={pct(s.uptime)}
          tone={s.uptime !== null && s.uptime < 90 ? "warn" : s.uptime !== null ? "good" : undefined}
          sub={`${s.checks}/${s.expectedChecks} lượt kiểm tra`}
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
