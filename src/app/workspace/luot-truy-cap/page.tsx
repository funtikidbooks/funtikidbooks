import type { Metadata } from "next";
import { getAnalyticsOverview } from "@/lib/actions/analytics";
import { resolveRange } from "@/lib/analyticsRange";
import { vnToday } from "@/lib/constants/attendance";
import { AnalyticsRangePicker } from "@/components/workspace/AnalyticsRangePicker";
import { TrafficChart } from "@/components/workspace/TrafficChart";

export const metadata: Metadata = { title: "Lượt truy cập web" };

function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = vnToday();
  // ?ky=7|30|90|365|tat-ca or ?tu=YYYY-MM-DD&den=YYYY-MM-DD (AnalyticsRangePicker).
  const range = resolveRange({ ky: one(params.ky), tu: one(params.tu), den: one(params.den) }, today);

  let overview: Awaited<ReturnType<typeof getAnalyticsOverview>> | null = null;
  let error: string | null = null;
  try {
    overview = await getAnalyticsOverview({ start: range.start, end: range.end });
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được số liệu từ Google Analytics.";
  }

  const totalChannelSessions = overview?.channels.reduce((sum, c) => sum + c.sessions, 0) ?? 0;
  const maxPageViews = Math.max(1, ...(overview?.topPages.map((p) => p.views) ?? [1]));
  const per = overview?.grain === "week" ? "tuần" : overview?.grain === "month" ? "tháng" : "ngày";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-4 flex-none"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <h1 className="text-xl">Lượt truy cập web</h1>
        {overview && (
          <span className="tag tag-neutral">
            {formatNumber(overview.totals.sessions)} lượt truy cập · {range.label}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Keyed by the span: changing it (or going Back) starts the picker
            and chart fresh — no selected bar or open date form carried over. */}
        <AnalyticsRangePicker key={`${range.key}|${range.start}|${range.end}`} current={range} today={today}>
          {error && (
            <div className="card elev-sm p-5">
              <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
                {error}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
                Kiểm tra lại GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY trong .env.local,
                và tài khoản dịch vụ đã được cấp quyền &quot;Người xem&quot; trên tài sản GA4 chưa.
              </p>
            </div>
          )}

          {overview && (
            <>
              {/* 2 × 2 on phones and iPads, one row of 4 from lg — never 3 + 1. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Đang online — con số này đổi liên tục ở Google, chỉ đúng tại
                    thời điểm trang này được tải, không tự làm mới. */}
                <div className="card elev-sm p-4 sm:p-5 flex flex-col gap-1">
                  <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--color-neutral-500)" }}>
                    <span className="rounded-full flex-none" style={{ width: 8, height: 8, background: "var(--status-green, #3f9e52)" }} />
                    Đang xem web lúc này
                  </span>
                  <span className="text-2xl font-extrabold tabular-nums">{formatNumber(overview.activeNow)}</span>
                </div>
                <StatTile label="Lượt truy cập" value={overview.totals.sessions} now={overview.comparison?.now.sessions} before={overview.comparison?.before.sessions} />
                <StatTile label="Người xem" value={overview.totals.users} now={overview.comparison?.now.users} before={overview.comparison?.before.users} />
                <StatTile label="Lượt xem trang" value={overview.totals.pageViews} now={overview.comparison?.now.pageViews} before={overview.comparison?.before.pageViews} />
              </div>
              {overview.comparison && (
                <p className="text-[12px] -mt-2" style={{ color: "var(--color-neutral-500)" }}>
                  “Kỳ trước” là cùng số ngày ngay trước đó{overview.comparison.withoutToday ? "; hôm nay chưa hết ngày nên chưa đem ra so" : ""}.
                </p>
              )}

              <div className="card elev-sm p-4 sm:p-5 flex flex-col gap-4">
                <span className="font-bold text-sm">Lượt truy cập theo {per}</span>
                {overview.totals.sessions === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
                    Chưa có lượt truy cập nào trong khoảng này.
                  </p>
                ) : (
                  <TrafficChart buckets={overview.buckets} grain={overview.grain} />
                )}
              </div>

              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
                <div className="card elev-sm p-4 sm:p-5 flex flex-col gap-3">
                  <span className="font-bold text-sm">Khách đến từ đâu</span>
                  {overview.channels.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
                      Chưa có dữ liệu.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {overview.channels.map((c) => (
                        <div key={c.channel} className="flex items-center justify-between gap-3 text-sm">
                          <span style={{ color: "var(--color-neutral-700)" }}>{c.channel}</span>
                          <span className="font-semibold tabular-nums whitespace-nowrap">
                            {formatNumber(c.sessions)}
                            {totalChannelSessions > 0 && (
                              <span className="text-xs ml-1.5" style={{ color: "var(--color-neutral-500)" }}>
                                ({Math.round((c.sessions / totalChannelSessions) * 100)}%)
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card elev-sm p-4 sm:p-5 flex flex-col gap-3">
                  <span className="font-bold text-sm">Trang được xem nhiều nhất</span>
                  {overview.topPages.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
                      Chưa có dữ liệu.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {overview.topPages.map((p) => (
                        <div key={p.path} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate" style={{ color: "var(--color-neutral-700)" }}>
                              {p.path}
                            </span>
                            <span className="flex-none flex items-baseline gap-1.5 tabular-nums">
                              <span className="font-semibold">{formatNumber(p.views)}</span>
                              <span className="text-[11px]" style={{ color: p.users > 0 && p.views / p.users > 50 ? "var(--status-red)" : "var(--color-neutral-500)" }}>
                                · {formatNumber(p.users)} người
                              </span>
                            </span>
                          </div>
                          <div className="rounded-full overflow-hidden" style={{ height: 5, background: "var(--color-surface)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(p.views / maxPageViews) * 100}%`, background: "var(--color-accent-2-500, var(--color-accent-500))" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                Số liệu từ Google Analytics (bắt đầu ghi từ 23/09/2026). Xem chi tiết hơn tại{" "}
                <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="font-semibold" style={{ color: "var(--color-accent-700)" }}>
                  analytics.google.com
                </a>
                .
              </p>
            </>
          )}
        </AnalyticsRangePicker>
      </div>
    </div>
  );
}

// A total for the span, and how it moved against the span before — only
// when Google Analytics has that earlier span in full.
function StatTile({ label, value, now, before }: { label: string; value: number; now: number | undefined; before: number | undefined }) {
  const change = now !== undefined && before ? Math.round(((now - before) / before) * 100) : null;
  return (
    <div className="card elev-sm p-4 sm:p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-500)" }}>
        {label}
      </span>
      <span className="text-2xl font-extrabold tabular-nums">{formatNumber(value)}</span>
      {change !== null && (
        <span className="text-[12px] tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
          <span className="font-bold" style={{ color: change > 0 ? "var(--status-green)" : change < 0 ? "var(--status-red)" : "var(--color-neutral-600)" }}>
            {change > 0 ? "↑" : change < 0 ? "↓" : "→"} {Math.abs(change)}%
          </span>{" "}
          so với kỳ trước
        </span>
      )}
    </div>
  );
}
