"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarList, Card, SectionTitle, Tile } from "../tong-quan/charts";
import { thumbnailUrl } from "@/lib/imageTransform";
import { STATUS_LABELS, stageInfo, type PmData, type PmProject, type PmStaffStatus, type StageKey } from "@/lib/pmMath";

// Quản trị → Quản lý dự án: the PM's view of who is on what. Numbers first,
// then one column per artist (free people first), the projects by urgency,
// and three charts. Every project links straight to its room.

const STAGE_COLOR: Record<StageKey, string> = {
  sample: "#8a94a6",
  sketch: "var(--color-accent-2-500)",
  hourly: "#8b6fd6",
  color: "var(--color-accent-500)",
  final: "var(--status-green)",
  unknown: "var(--color-neutral-300)",
};

const STATUS_TONE: Record<PmStaffStatus, { bg: string; fg: string }> = {
  free: { bg: "color-mix(in srgb, var(--status-green) 16%, transparent)", fg: "var(--status-green)" },
  finishing: { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  normal: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-700)" },
  busy: { bg: "var(--badge-orange-bg)", fg: "var(--badge-orange-fg)" },
};

const SECTIONS = [
  { id: "nhan-vien", label: "👥 Nhân viên" },
  { id: "du-an", label: "📁 Dự án" },
  { id: "bieu-do", label: "📊 Biểu đồ" },
];

type Filter = "all" | "due" | "nearly" | "quiet" | "hourly";

function minutesText(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (!h && !min) return "0h";
  return min ? `${h}h${String(min).padStart(2, "0")}` : `${h}h`;
}

function ddmm(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function dueText(p: PmProject) {
  if (p.dueInDays === null || !p.dueDate) return null;
  if (p.dueDone) return { text: `✓ hạn ${ddmm(p.dueDate)}`, tone: "done" as const };
  if (p.dueInDays < 0) return { text: `Trễ ${-p.dueInDays} ngày`, tone: "bad" as const };
  if (p.dueInDays === 0) return { text: "Hạn hôm nay", tone: "bad" as const };
  if (p.dueInDays <= 7) return { text: `Còn ${p.dueInDays} ngày`, tone: "warn" as const };
  return { text: `Hạn ${ddmm(p.dueDate)}`, tone: "plain" as const };
}

function DueChip({ p }: { p: PmProject }) {
  const d = dueText(p);
  if (!d) return null;
  const style =
    d.tone === "bad"
      ? { background: "var(--badge-red-bg)", color: "var(--badge-red-fg)" }
      : d.tone === "warn"
        ? { background: "var(--badge-orange-bg)", color: "var(--badge-orange-fg)" }
        : d.tone === "done"
          ? { background: "color-mix(in srgb, var(--status-green) 16%, transparent)", color: "var(--status-green)" }
          : { background: "var(--color-neutral-100)", color: "var(--color-neutral-600)" };
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={style}>
      {d.text}
    </span>
  );
}

function StageChip({ stage }: { stage: StageKey }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--color-neutral-600)" }}>
      <span className="rounded-full flex-none" style={{ width: 8, height: 8, background: STAGE_COLOR[stage] }} aria-hidden />
      {stageInfo(stage).label}
    </span>
  );
}

function Avatar({ name, url, size = 32, ring }: { name: string; url: string | null; size?: number; ring?: boolean }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: "var(--color-accent-100)",
        color: "var(--color-accent-700)",
        boxShadow: ring ? "0 0 0 2px var(--color-accent-500)" : "0 0 0 2px var(--color-panel)",
      }}
      title={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl(url, size * 2)} alt="" className="w-full h-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

const roomHref = (id: string) => `/workspace/hop?room=${id}`;

// Projects shown on a person's card before "+ N dự án nữa".
const PREVIEW = 3;

export function PmView({ data }: { data: PmData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const allOpen = data.staff.filter((s) => s.projectIds.length > PREVIEW).every((s) => expanded.has(s.person.id));
  const projectsById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);
  const people = useMemo(() => new Map(data.staff.map((s) => [s.person.id, s.person])), [data.staff]);
  const [y, mo, d] = data.today.split("-");

  const filters: { id: Filter; label: string; test: (p: PmProject) => boolean }[] = [
    { id: "all", label: "Tất cả", test: () => true },
    { id: "due", label: "⏰ Sắp tới hạn / trễ", test: (p) => p.flags.dueSoon || p.flags.overdue },
    { id: "nearly", label: "🎨 Sắp xong (lên màu)", test: (p) => p.flags.nearlyDone },
    { id: "quiet", label: "💤 Im ắng ≥ 5 ngày", test: (p) => p.flags.quiet },
    { id: "hourly", label: "⏱ Theo giờ", test: (p) => p.billing === "hourly" },
  ];
  const active = filters.find((f) => f.id === filter) ?? filters[0];
  const shown = data.projects.filter(active.test);
  const overdue = data.projects.filter((p) => p.flags.overdue).length;
  const nearly = data.projects.filter((p) => p.flags.nearlyDone).length;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <nav
        className="sticky top-0 z-10 flex gap-1 sm:gap-1.5 overflow-x-auto px-2 sm:px-6 py-2 [scrollbar-width:none]"
        style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-neutral-200)" }}
        aria-label="Các phần của trang Quản lý dự án"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full px-2.5 sm:px-3 py-1.5 text-[12px] sm:text-[13px] font-semibold whitespace-nowrap"
            style={{ background: "var(--color-neutral-100)", color: "var(--color-text)" }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="w-full flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-xl">Quản lý dự án</h1>
          <span className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Hôm nay {d}/{mo}/{y} · giờ tính từ thứ Hai {ddmm(data.weekStart)}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Tile
            label="Dự án đang chạy"
            value={String(data.totals.projects)}
            sub={data.stageCounts.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(" · ")}
          />
          <Tile label="Nhân viên có việc" value={`${data.totals.busyPeople}/${data.totals.people}`} sub="đang ở ít nhất 1 phòng dự án" />
          <Tile
            label="Trống việc"
            value={String(data.totals.free)}
            tone={data.totals.free > 0 ? "good" : undefined}
            sub={data.totals.free > 0 ? "có thể giao dự án mới" : "ai cũng đang có dự án"}
          />
          <Tile
            label="Sắp tới hạn"
            value={String(data.totals.dueSoon)}
            tone={overdue > 0 ? "bad" : data.totals.dueSoon > 0 ? "warn" : undefined}
            sub={overdue > 0 ? `${overdue} dự án đã trễ hạn` : "trong 7 ngày tới"}
          />
          {/* The fifth tile takes the whole last row on a phone instead of sitting alone in half of it. */}
          <div className="col-span-2 lg:col-span-1 grid">
            <Tile label="Giờ làm tuần này" value={minutesText(data.totals.weekMinutes)} sub="từ Báo cáo giờ" href="/workspace/bao-cao-gio" />
          </div>
        </div>

        {/* ------------------------------------------------------ NHÂN VIÊN */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionTitle id="nhan-vien" icon="👥" title="Nhân viên" hint="mỗi thẻ một người · ai trống việc lên đầu · ★ = phụ trách chính" />
          {data.staff.some((s) => s.projectIds.length > PREVIEW) && (
            <button
              type="button"
              onClick={() => setExpanded(allOpen ? new Set() : new Set(data.staff.map((s) => s.person.id)))}
              className="text-[12.5px] font-semibold rounded-full px-3 py-1.5"
              style={{ background: "var(--color-neutral-100)" }}
            >
              {allOpen ? "Thu gọn tất cả" : "Mở rộng tất cả"}
            </button>
          )}
        </div>
        {/* Same-height cards in a row (grid stretch); each project one line;
            the first PREVIEW shown, the rest behind "+ N dự án nữa". */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
          {data.staff.map((s) => {
            const tone = STATUS_TONE[s.status];
            const mine = s.projectIds
              .map((id) => projectsById.get(id))
              .filter((p): p is PmProject => !!p)
              .sort((a, b) => Number(b.leadIds.includes(s.person.id)) - Number(a.leadIds.includes(s.person.id)));
            const open = expanded.has(s.person.id);
            const visible = open ? mine : mine.slice(0, PREVIEW);
            const more = mine.length - visible.length;
            return (
              <section key={s.person.id} className="card elev-sm p-3 flex flex-col gap-2 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={s.person.display_name} url={s.person.avatar_url} size={34} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-bold leading-tight truncate">{s.person.display_name}</span>
                    <span className="text-[11.5px] leading-tight truncate" style={{ color: "var(--color-neutral-500)" }}>
                      {s.person.role || "Nhân viên"}
                    </span>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap flex-none" style={{ background: tone.bg, color: tone.fg }}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </div>

                {/* One segment per project, coloured by its stage. */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex flex-1 h-1.5 gap-[2px] rounded-full overflow-hidden"
                    style={mine.length ? undefined : { background: "var(--color-neutral-100)" }}
                    aria-hidden
                  >
                    {mine.map((p) => (
                      <span key={p.id} className="flex-1" style={{ background: STAGE_COLOR[p.stage], opacity: p.leadIds.includes(s.person.id) ? 1 : 0.55 }} />
                    ))}
                  </div>
                  <span className="text-[11.5px] tabular-nums whitespace-nowrap" style={{ color: "var(--color-neutral-600)" }}>
                    <b style={{ color: "var(--color-text)" }}>{mine.length}</b> dự án{s.leadCount ? ` · ★${s.leadCount}` : ""} · ⏱ {minutesText(s.weekMinutes)}
                  </span>
                </div>

                {mine.length === 0 ? (
                  <p className="flex-1 text-[12.5px] rounded-[8px] px-2.5 py-2" style={{ background: "var(--color-surface)", color: "var(--color-neutral-600)" }}>
                    Chưa ở phòng dự án nào — có thể giao việc.
                  </p>
                ) : (
                  <div className="flex flex-col flex-1">
                    {visible.map((p) => (
                      <Link
                        key={p.id}
                        href={roomHref(p.id)}
                        className="ws-nav-link flex items-center gap-2 rounded-[6px] px-1.5 py-1.5 min-w-0"
                        title={`${p.name} · ${stageInfo(p.stage).label}`}
                      >
                        <span className="rounded-full flex-none" style={{ width: 8, height: 8, background: STAGE_COLOR[p.stage] }} aria-hidden />
                        <span className="text-[13px] truncate flex-1 min-w-0">
                          {p.leadIds.includes(s.person.id) && <span style={{ color: "var(--color-accent-600)" }}>★ </span>}
                          <span className={p.leadIds.includes(s.person.id) ? "font-semibold" : undefined}>{p.name}</span>
                        </span>
                        {dueText(p) && (p.flags.overdue || p.flags.dueSoon) ? (
                          <DueChip p={p} />
                        ) : (
                          <span className="text-[11px] whitespace-nowrap flex-none" style={{ color: "var(--color-neutral-500)" }}>
                            {stageInfo(p.stage).label}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}

                {(more > 0 || (open && mine.length > PREVIEW)) && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.person.id)) next.delete(s.person.id);
                        else next.add(s.person.id);
                        return next;
                      })
                    }
                    className="self-start text-[12px] font-semibold rounded-full px-2.5 py-1"
                    style={{ background: "var(--color-neutral-100)", color: "var(--color-accent-700)" }}
                  >
                    {open ? "Thu gọn" : `+ ${more} dự án nữa`}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {/* --------------------------------------------------------- DỰ ÁN */}
        <SectionTitle id="du-an" icon="📁" title="Dự án" hint="việc gấp lên đầu · bấm để mở phòng họp của dự án" />
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist">
          {filters.map((f) => {
            const n = data.projects.filter(f.test).length;
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f.id)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap flex-none"
                style={on ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)" } : { background: "var(--color-neutral-100)" }}
              >
                {f.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm py-4" style={{ color: "var(--color-neutral-500)" }}>
            Không có dự án nào ở mục này.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {shown.map((p) => {
              const hourly = p.billing === "hourly";
              const barPct = hourly ? (p.capMinutes ? Math.min(100, (p.weekMinutes / p.capMinutes) * 100) : null) : p.progress;
              return (
                <Link key={p.id} href={roomHref(p.id)} className="card elev-sm ws-nav-link p-3.5 flex flex-col gap-2 min-w-0">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-lg leading-none flex-none" aria-hidden>
                      {p.icon}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[14px] font-bold leading-snug break-words">{p.name}</span>
                      {p.task && (
                        <span className="text-[11.5px] truncate" style={{ color: "var(--color-neutral-500)" }} title={p.task.title}>
                          Thẻ {p.task.code} · {p.task.title}
                        </span>
                      )}
                    </div>
                    <DueChip p={p} />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <StageChip stage={p.stage} />
                    <div className="relative h-2 rounded-full flex-1" style={{ background: "var(--color-neutral-100)" }}>
                      {barPct !== null && (
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${barPct}%`, background: STAGE_COLOR[p.stage] }} />
                      )}
                    </div>
                    <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: "var(--color-neutral-600)" }}>
                      {hourly
                        ? `${minutesText(p.weekMinutes)}${p.capMinutes ? ` / ${minutesText(p.capMinutes)}` : ""} tuần này`
                        : p.progress !== null
                          ? `${p.progress}%`
                          : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center -space-x-1.5">
                      {p.memberIds.slice(0, 8).map((id) => {
                        const person = people.get(id);
                        return person ? <Avatar key={id} name={person.display_name} url={person.avatar_url} size={24} ring={p.leadIds.includes(id)} /> : null;
                      })}
                      {p.memberIds.length > 8 && (
                        <span className="text-[11px] pl-2.5" style={{ color: "var(--color-neutral-500)" }}>
                          +{p.memberIds.length - 8}
                        </span>
                      )}
                      {p.memberIds.length === 0 && (
                        <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                          Chưa có hoạ sĩ trong phòng
                        </span>
                      )}
                    </div>
                    <span className="text-[11.5px]" style={{ color: p.flags.quiet ? "var(--badge-orange-fg)" : "var(--color-neutral-500)" }}>
                      {p.quietDays === null ? "Chưa có tin nhắn" : p.quietDays <= 0 ? "Có tin nhắn hôm nay" : `Tin nhắn cuối ${p.quietDays} ngày trước`}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------------- BIỂU ĐỒ */}
        <SectionTitle id="bieu-do" icon="📊" title="Biểu đồ" hint="khối lượng việc, giờ làm, giai đoạn" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pb-6 items-start">
          <Card title="Số dự án mỗi người">
            <BarList
              rows={[...data.staff]
                .sort((a, b) => b.projectIds.length - a.projectIds.length)
                .map((s) => ({
                  key: s.person.id,
                  label: s.person.display_name,
                  value: s.projectIds.length,
                  display: String(s.projectIds.length),
                  sub: s.leadCount ? `(★ ${s.leadCount})` : undefined,
                  color: s.status === "busy" ? "var(--color-accent-500)" : "var(--color-accent-2-500)",
                }))}
              emptyText="Chưa có ai trong phòng dự án."
            />
          </Card>
          <Card title="Giờ tuần này theo dự án" href="/workspace/bao-cao-gio" hrefLabel="Báo cáo giờ">
            <BarList
              rows={data.projects
                .filter((p) => p.weekMinutes > 0 || p.capMinutes)
                .sort((a, b) => b.weekMinutes - a.weekMinutes)
                .map((p) => ({
                  key: p.id,
                  label: p.name,
                  value: p.weekMinutes,
                  display: minutesText(p.weekMinutes),
                  sub: p.capMinutes ? `/ ${minutesText(p.capMinutes)}` : undefined,
                  marker: p.capMinutes ?? undefined,
                  color: "#8b6fd6",
                }))}
              emptyText="Tuần này chưa ai báo giờ."
            />
            <p className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
              Vạch đứng = giới hạn giờ mỗi tuần của dự án.
            </p>
          </Card>
          <Card title="Dự án theo giai đoạn">
            <div className="flex h-3 rounded-full overflow-hidden" role="img" aria-label="Tỷ lệ dự án theo giai đoạn">
              {data.stageCounts.map((s) => (
                <div key={s.key} style={{ width: `${(s.value / Math.max(1, data.totals.projects)) * 100}%`, background: STAGE_COLOR[s.key] }} title={`${s.label}: ${s.value}`} />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              {data.stageCounts.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-[13px]">
                  <span className="rounded-full flex-none" style={{ width: 10, height: 10, background: STAGE_COLOR[s.key] }} aria-hidden />
                  <span className="flex-1">{s.label}</span>
                  <b className="tabular-nums">{s.value}</b>
                </div>
              ))}
            </div>
            <p className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
              Giai đoạn lấy theo cột của thẻ dự án trên Bảng công việc. {nearly > 0 ? `${nearly} dự án đang lên màu — sắp xong.` : ""}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
