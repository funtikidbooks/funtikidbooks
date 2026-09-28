"use client";

import { useState, useTransition } from "react";
import { setProjectRevenue, type DashboardData } from "@/lib/actions/dashboard";
import { compactVnd, formatDuration, type ProjectProfitRow } from "@/lib/dashboardMath";
import { formatVnd } from "@/lib/financeSummary";
import {
  BarList,
  Card,
  COST,
  CumulativeChart,
  formatHours,
  Funnel,
  MonthColumns,
  REVENUE,
  RevenueCostChart,
  SectionTitle,
  signed,
  Tile,
} from "./charts";

// Quản trị → Tổng quan. Four sections — Tiền, Dự án, Đội ngũ, Khách hàng —
// each card answering one question, with a jump bar on top so a phone
// doesn't have to scroll through everything to reach one part.

const SECTIONS = [
  { id: "tien", label: "💰 Tiền" },
  { id: "du-an", label: "📁 Dự án" },
  { id: "doi-ngu", label: "👥 Đội ngũ" },
  { id: "khach-hang", label: "🤝 Khách hàng" },
];

// Salary above this share of revenue is squeezing profit (a service studio
// usually wants it under ~60%).
const SALARY_SHARE_CEILING = 0.6;
// One client over half of revenue is a concentration risk.
const CLIENT_SHARE_WARN = 0.5;

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
      {children}
    </p>
  );
}

function Pill({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: React.ReactNode }) {
  const c =
    tone === "good"
      ? "var(--status-green)"
      : tone === "bad"
        ? "var(--status-red)"
        : tone === "warn"
          ? "var(--status-yellow)"
          : "var(--color-neutral-400)";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid ${c}`, color: "var(--color-text)" }}
    >
      {children}
    </span>
  );
}

function ProjectProfitCard({ rows: initial, ready }: { rows: ProjectProfitRow[]; ready: boolean }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);

  function save(id: string) {
    const amount = Number(value.replace(/[^\d]/g, ""));
    setError(null);
    startTransition(async () => {
      try {
        await setProjectRevenue(id, amount);
        setRows((list) => list.map((r) => (r.id === id ? { ...r, revenue: amount, profit: amount - r.laborCost } : r)));
        setEditing(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không lưu được.");
      }
    });
  }

  const shown = showAll ? rows : rows.slice(0, 8);
  const unpriced = rows.reduce((s, r) => s + r.unpricedHours, 0);

  return (
    <Card title="Lời/lỗ theo từng dự án" href="/workspace/bao-cao-gio" hrefLabel="Báo cáo giờ">
      <Muted>
        Tiền thu − chi phí công (giờ từng người báo × lương theo giờ của người đó). Bấm <b>Nhập tiền</b> để ghi số tiền khách trả
        cho dự án.
      </Muted>
      {!ready && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          Cần chạy file SQL dashboard_extras.sql trên Supabase để lưu được tiền dự án.
        </p>
      )}
      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <Muted>Chưa có dự án nào được báo giờ.</Muted>
      ) : (
        <div className="flex flex-col">
          {shown.map((r) => {
            const margin = r.revenue && r.profit !== null ? r.profit / r.revenue : null;
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
                style={{ borderTop: "1px solid var(--color-neutral-200)" }}
              >
                <div className="flex flex-col min-w-0 flex-1 basis-[200px]">
                  <span className="text-[13px] font-bold truncate" title={r.name}>
                    {r.name}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--color-neutral-500)" }}>
                    {formatHours(r.hours)} · công {compactVnd(r.laborCost)}
                    {r.unpricedHours > 0 && ` · ${formatHours(r.unpricedHours)} chưa có lương`}
                  </span>
                </div>
                {editing === r.id ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(r.id);
                    }}
                  >
                    <input
                      autoFocus
                      inputMode="numeric"
                      className="input font-normal"
                      style={{ width: 140, padding: "6px 10px" }}
                      placeholder="Số tiền (đ)"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                      Lưu
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                      Huỷ
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {r.revenue === null ? (
                      <Pill tone="neutral">Chưa nhập tiền</Pill>
                    ) : (
                      <>
                        <span className="text-xs tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
                          thu {compactVnd(r.revenue)}
                        </span>
                        <Pill tone={(r.profit ?? 0) >= 0 ? "good" : "bad"}>
                          {(r.profit ?? 0) >= 0 ? "▲ lãi" : "▼ lỗ"} {compactVnd(Math.abs(r.profit ?? 0))}
                          {margin !== null && ` · ${Math.round(margin * 100)}%`}
                        </Pill>
                      </>
                    )}
                    <button
                      type="button"
                      className="text-xs font-semibold underline"
                      style={{ color: "var(--color-accent-700)" }}
                      onClick={() => {
                        setEditing(r.id);
                        setValue(r.revenue ? String(r.revenue) : "");
                      }}
                    >
                      {r.revenue === null ? "Nhập tiền" : "Sửa"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > 8 && (
            <button
              type="button"
              className="text-xs font-semibold pt-2 self-start"
              style={{ color: "var(--color-accent-700)" }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Thu gọn" : `Xem thêm ${rows.length - 8} dự án`}
            </button>
          )}
        </div>
      )}
      {unpriced > 0 && (
        <Muted>
          Có {formatHours(unpriced)} do người chưa có lương cố định báo — chưa tính vào chi phí công (nhập ở Bảng lương).
        </Muted>
      )}
    </Card>
  );
}

export function DashboardView({ data, cumulativeStartMonth }: { data: DashboardData; cumulativeStartMonth: string }) {
  const { months, attendance, hours, salaryPending, forecast, costs, revenueSources, lateness, people, work, upwork, response } =
    data;
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const [picked, setPicked] = useState(months.length - 1);
  const p = months[picked];

  const cumulativePoints = months
    .filter((m) => m.cumulative !== null)
    .map((m) => ({ month: m.month, value: m.cumulative as number }));
  const [y, mo, d] = data.today.split("-");
  const startLabel = `T${Number(cumulativeStartMonth.slice(5, 7))}/${cumulativeStartMonth.slice(0, 4)}`;
  const topSource = revenueSources.items[0];
  const topShare = topSource && revenueSources.total > 0 ? topSource.amount / revenueSources.total : 0;
  const salaryShare = current.revenue > 0 ? current.salary / current.revenue : null;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Jump bar — sticks under the top edge so any section is one tap away. */}
      <nav
        className="sticky top-0 z-10 flex gap-1 sm:gap-1.5 overflow-x-auto px-2 sm:px-6 py-2 [scrollbar-width:none]"
        style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-neutral-200)" }}
        aria-label="Các phần của trang Tổng quan"
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

      <div className="max-w-[1080px] flex flex-col gap-4 p-4 sm:p-6">
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

        {/* ------------------------------------------------------------ TIỀN */}
        <SectionTitle id="tien" icon="💰" title="Tiền" hint="tháng này lời hay lỗ, tiền đi đâu, đến từ đâu" />

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
                <b style={{ color: p.net >= 0 ? "var(--status-green)" : "var(--status-red)" }}>{formatVnd(p.net)}</b>
              </span>
              <span>
                Luỹ kế: <b>{p.cumulative === null ? "—" : formatVnd(p.cumulative)}</b>
              </span>
            </div>
          </Card>

          {/* (4) Dự kiến cuối tháng */}
          <Card title="Dự kiến cuối tháng">
            <Muted>Nếu từ giờ tới cuối tháng không có thêm khoản thu nào:</Muted>
            <div className="flex flex-col text-[13px] tabular-nums">
              <div className="flex justify-between py-1.5">
                <span>Lãi hiện tại</span>
                <b>{formatVnd(forecast.netNow)}</b>
              </div>
              <div className="flex justify-between py-1.5" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                <span>− Lương chưa trả ({salaryPending.count} phiếu)</span>
                <b>{formatVnd(forecast.unpaidSalary)}</b>
              </div>
              {forecast.missingFixed.map((m) => (
                <div
                  key={m.name}
                  className="flex justify-between gap-3 py-1.5"
                  style={{ borderTop: "1px solid var(--color-neutral-200)" }}
                >
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">− {m.name}</span>
                    <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                      tháng trước có, tháng này chưa nhập
                    </span>
                  </span>
                  <b className="whitespace-nowrap">{formatVnd(m.amount)}</b>
                </div>
              ))}
              <div
                className="flex justify-between items-baseline py-2 mt-1"
                style={{ borderTop: "2px solid var(--color-neutral-300)" }}
              >
                <span className="font-bold">= Dự kiến cuối tháng</span>
                <span
                  className="text-[20px] font-bold"
                  style={{ color: forecast.projected >= 0 ? "var(--status-green)" : "var(--status-red)" }}
                >
                  {forecast.projected >= 0 ? "▲ " : "▼ "}
                  {formatVnd(forecast.projected)}
                </span>
              </div>
            </div>
            {forecast.projected < 0 && (
              <Muted>
                Cần thêm khoảng <b>{formatVnd(-forecast.projected)}</b> doanh thu trong tháng để hoà vốn.
              </Muted>
            )}
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* (2) Chi phí lớn nhất */}
          <Card title={`Tiền chi vào đâu · tháng ${Number(mo)}`} href="/quan-tri/tai-chinh">
            <BarList
              emptyText="Tháng này chưa nhập khoản chi nào."
              color={COST}
              rows={costs.items.slice(0, 7).map((c) => ({
                key: `${c.type}-${c.name}`,
                label: c.name,
                value: c.amount,
                display: compactVnd(c.amount),
                sub: costs.total > 0 ? `${Math.round((c.amount / costs.total) * 100)}%` : undefined,
              }))}
            />
            {costs.items.length > 7 && <Muted>và {costs.items.length - 7} khoản nhỏ hơn.</Muted>}
          </Card>

          {/* (3) Doanh thu theo nguồn */}
          <Card title="Tiền đến từ đâu · 6 tháng" href="/quan-tri/tai-chinh">
            {topSource && topShare > CLIENT_SHARE_WARN && (
              <p
                className="text-xs font-semibold rounded-[8px] px-2.5 py-2"
                style={{ background: "color-mix(in srgb, var(--status-yellow) 16%, transparent)" }}
              >
                ⚠ &quot;{topSource.name}&quot; chiếm {Math.round(topShare * 100)}% doanh thu — nếu nguồn này dừng, studio mất hơn
                nửa thu nhập.
              </p>
            )}
            <BarList
              emptyText="6 tháng qua chưa có khoản thu nào."
              rows={revenueSources.items.slice(0, 7).map((r) => ({
                key: r.name,
                label: r.name,
                value: r.amount,
                display: compactVnd(r.amount),
                sub: revenueSources.total > 0 ? `${Math.round((r.amount / revenueSources.total) * 100)}%` : undefined,
              }))}
            />
            <Muted>Theo tên khoản thu nhập ở Tài chính — ghi tên khách/nguồn vào tên khoản để xem đúng từng khách.</Muted>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title={`Luỹ kế từ ${startLabel}`} href="/quan-tri/tai-chinh">
            {cumulativePoints.length === 0 ? (
              <Muted>Luỹ kế bắt đầu tính từ {startLabel}.</Muted>
            ) : (
              <>
                <CumulativeChart points={cumulativePoints} />
                <Muted>Cộng dồn tiền thực còn lại mỗi tháng. Đường đi lên là studio đang để dành được tiền.</Muted>
              </>
            )}
          </Card>

          {/* (7) Lương / doanh thu */}
          <Card title="Lương / doanh thu" href="/quan-tri/bang-luong" hrefLabel="Bảng lương">
            <MonthColumns
              ariaLabel="Tỉ lệ lương trên doanh thu theo tháng"
              points={months.map((m) => ({ month: m.month, value: m.revenue > 0 ? m.salary / m.revenue : null }))}
              color={(v) => (v > SALARY_SHARE_CEILING ? "var(--status-red)" : REVENUE)}
              reference={{ value: SALARY_SHARE_CEILING, text: "nên dưới 60%" }}
              label={(v) => `${Math.round(v * 100)}%`}
            />
            <Muted>
              {salaryShare === null
                ? "Tháng này chưa có doanh thu."
                : `Tháng này lương đã trả = ${Math.round(salaryShare * 100)}% doanh thu${salaryShare > SALARY_SHARE_CEILING ? " — đang cao, lợi nhuận bị ép." : " — ổn."}`}
              {salaryPending.count > 0 && ` Còn ${salaryPending.count} phiếu chưa trả chưa tính vào.`}
            </Muted>
          </Card>
        </div>

        {/* ---------------------------------------------------------- DỰ ÁN */}
        <SectionTitle id="du-an" icon="📁" title="Dự án" hint="dự án nào đáng làm, việc nào sắp trễ" />

        <ProjectProfitCard rows={data.projectProfit} ready={data.projectFinanceReady} />

        {/* (10) Dự án & hạn chót */}
        <Card title="Việc sắp tới hạn" href="/workspace" hrefLabel="Bảng công việc">
          <div className="flex flex-wrap gap-2">
            <Pill tone="neutral">{work.openProjects} dự án đang mở</Pill>
            <Pill tone={work.overdue.length > 0 ? "bad" : "good"}>
              {work.overdue.length > 0 ? `⚠ ${work.overdue.length} việc trễ hạn` : "Không có việc trễ hạn"}
            </Pill>
            <Pill tone={work.dueSoon.length > 0 ? "warn" : "neutral"}>{work.dueSoon.length} việc tới hạn trong 3 ngày</Pill>
          </div>
          {work.overdue.length + work.dueSoon.length > 0 && (
            <div className="flex flex-col">
              {[
                ...work.overdue.slice(0, 6).map((t) => ({ ...t, tag: `trễ ${t.daysLate} ngày`, bad: true })),
                ...work.dueSoon.slice(0, 6).map((t) => ({
                  ...t,
                  tag: t.dueIn === 0 ? "hạn hôm nay" : `còn ${t.dueIn} ngày`,
                  bad: false,
                })),
              ].map((t, i) => (
                <div
                  key={`${t.title}-${i}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]"
                  style={{ borderTop: "1px solid var(--color-neutral-200)" }}
                >
                  {/* Phone: the task gets its own line; who + deadline below. */}
                  <span className="basis-full sm:basis-0 sm:flex-1 min-w-0 font-semibold" title={t.title}>
                    {t.title}
                  </span>
                  <span
                    className="text-xs truncate flex-1 sm:flex-none sm:max-w-[140px]"
                    style={{ color: "var(--color-neutral-500)" }}
                  >
                    {t.who}
                  </span>
                  <Pill tone={t.bad ? "bad" : "warn"}>{t.tag}</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* -------------------------------------------------------- ĐỘI NGŨ */}
        <SectionTitle id="doi-ngu" icon="👥" title="Đội ngũ" hint="giờ làm tuần này, ai bận ai trống, đi trễ" />

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title={`Giờ theo dự án · ${formatHours(hours.totalHours)}`} href="/workspace/bao-cao-gio">
            <BarList
              emptyText="Tuần này chưa ai báo giờ."
              rows={hours.projects.slice(0, 8).map((pr) => {
                const over = pr.cap !== null && pr.hours > pr.cap;
                return {
                  key: pr.id ?? "none",
                  label: pr.name,
                  value: pr.hours,
                  display: formatHours(pr.hours),
                  sub: pr.cap !== null ? `/ ${pr.cap}h${over ? " ⚠" : ""}` : undefined,
                  color: over ? "var(--status-red)" : undefined,
                  marker: pr.cap ?? undefined,
                };
              })}
            />
          </Card>

          {/* (5) Giờ theo người */}
          <Card title="Giờ theo người" href="/workspace/bao-cao-gio">
            <BarList
              emptyText="Tuần này chưa ai báo giờ."
              rows={people.rows.map((r) => ({ key: r.name, label: r.name, value: r.hours, display: formatHours(r.hours) }))}
            />
            {people.notReported.length > 0 && (
              <Muted>
                Chưa báo giờ tuần này: <b>{people.notReported.join(", ")}</b>
              </Muted>
            )}
          </Card>
        </div>

        {/* (6) Đi trễ */}
        <Card title="Đi trễ theo tháng" href="/quan-tri/cham-cong">
          <div className="grid md:grid-cols-[3fr_2fr] gap-4 items-start">
            <MonthColumns
              ariaLabel="Số lần đi trễ theo tháng"
              points={lateness.months.map((m) => ({ month: m.month, value: m.days > 0 ? m.late : null }))}
              color={() => COST}
              label={(v) => String(v)}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                TRỄ NHIỀU NHẤT THÁNG NÀY
              </span>
              {lateness.topThisMonth.length === 0 ? (
                <Muted>Tháng này chưa ai đi trễ 🎉</Muted>
              ) : (
                lateness.topThisMonth.map((t) => (
                  <div key={t.name} className="flex justify-between text-[13px]">
                    <span className="truncate">{t.name}</span>
                    <b className="tabular-nums">{t.late} lần</b>
                  </div>
                ))
              )}
            </div>
          </div>
          <Muted>Số lần check-in sau giờ vào làm, không tính ngày tăng ca.</Muted>
        </Card>

        {/* ----------------------------------------------------- KHÁCH HÀNG */}
        <SectionTitle id="khach-hang" icon="🤝" title="Khách hàng" hint="có đủ việc cho tháng sau không, khách có phải chờ lâu" />

        <div className="grid lg:grid-cols-2 gap-4 pb-6">
          {/* (8) Phễu Upwork */}
          <Card title="Phễu Upwork · 30 ngày" href="/quan-tri/upwork">
            <Funnel
              stages={[
                { label: "Tìm thấy job", value: upwork.found },
                { label: "Soạn nháp", value: upwork.drafted },
                { label: "Đã duyệt", value: upwork.approved },
                { label: "Đã gửi", value: upwork.sent },
                { label: "Khách trả lời", value: upwork.replied },
                { label: "Chốt được", value: upwork.hired },
              ]}
            />
            <Muted>
              Số % là tỉ lệ đi tiếp từ bước trước. Trên trang Upwork, bấm &quot;Khách đã trả lời&quot; / &quot;Đã chốt&quot; để
              phễu đủ số.
            </Muted>
          </Card>

          {/* (9) Thời gian trả lời khách */}
          <Card title="Khách chờ bao lâu" href="/workspace/khach-hang" hrefLabel="Tin nhắn khách">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--color-neutral-500)" }}>
                  Thường trả lời sau
                </span>
                <span className="text-[22px] font-bold">
                  {response.medianMinutes === null ? "—" : formatDuration(response.medianMinutes)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--color-neutral-500)" }}>
                  Trả lời trong 1 giờ
                </span>
                <span
                  className="text-[22px] font-bold"
                  style={{
                    color:
                      response.withinHourPct === null
                        ? "var(--color-text)"
                        : response.withinHourPct >= 0.8
                          ? "var(--status-green)"
                          : "var(--color-accent-700)",
                  }}
                >
                  {response.withinHourPct === null ? "—" : `${Math.round(response.withinHourPct * 100)}%`}
                </span>
              </div>
            </div>
            {response.waitingNow > 0 ? (
              <p className="text-[13px] font-semibold" style={{ color: "var(--status-red)" }}>
                ⚠ {response.waitingNow} khách đang chờ trả lời
                {response.oldestWaitingMinutes !== null && ` — lâu nhất ${formatDuration(response.oldestWaitingMinutes)}`}
              </p>
            ) : (
              <Muted>Không có khách nào đang chờ.</Muted>
            )}
            <Muted>
              30 ngày qua, tính trên {response.answered} lần trả lời ở mục Công việc (khách nước ngoài). Khách thường mong được
              trả lời trong vài giờ.
            </Muted>
          </Card>
        </div>
      </div>
    </div>
  );
}
