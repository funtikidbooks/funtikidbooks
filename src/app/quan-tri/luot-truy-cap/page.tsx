import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getAnalyticsOverview } from "@/lib/actions/analytics";

export const metadata: Metadata = { title: "Quản trị — Lượt truy cập web" };

function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

export default async function AdminAnalyticsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();

  if (profile?.access_role !== "director") {
    redirect("/quan-tri");
  }

  let overview: Awaited<ReturnType<typeof getAnalyticsOverview>> | null = null;
  let error: string | null = null;
  try {
    overview = await getAnalyticsOverview();
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được số liệu từ Google Analytics.";
  }

  const totalSessions7d = overview?.last7Days.reduce((sum, d) => sum + d.sessions, 0) ?? 0;
  const totalChannelSessions = overview?.channels.reduce((sum, c) => sum + c.sessions, 0) ?? 0;
  const maxSessionsInDay = Math.max(1, ...(overview?.last7Days.map((d) => d.sessions) ?? [1]));
  const maxPageViews = Math.max(1, ...(overview?.topPages.map((p) => p.views) ?? [1]));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex items-center justify-between gap-4 px-6 py-4 flex-none"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <h1 className="text-xl">Lượt truy cập web</h1>
        {overview && <span className="tag tag-neutral">{formatNumber(totalSessions7d)} lượt truy cập / 7 ngày</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5" style={{ maxWidth: 960 }}>
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
            {/* Đang online — con số này đổi liên tục ở Google, chỉ đúng tại
                thời điểm trang này được tải, không tự làm mới. */}
            <div className="card elev-sm p-5 flex items-center gap-4">
              <span className="rounded-full flex-none" style={{ width: 10, height: 10, background: "var(--status-green, #3f9e52)" }} />
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold">{formatNumber(overview.activeNow)}</span>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  người đang xem web ngay lúc này
                </span>
              </div>
            </div>

            <div className="card elev-sm p-5 flex flex-col gap-3">
              <span className="font-bold text-sm">7 ngày gần đây</span>
              {overview.last7Days.every((d) => d.sessions === 0) ? (
                <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có dữ liệu — property GA4 mới tạo có thể mất tới 24-48h để bắt đầu ghi nhận.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {overview.last7Days.map((d) => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="text-xs flex-none" style={{ width: 44, color: "var(--color-neutral-500)" }}>
                        {d.date}
                      </span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: "var(--color-surface)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(d.sessions / maxSessionsInDay) * 100}%`, background: "var(--color-accent-500)" }}
                        />
                      </div>
                      <span className="text-xs font-semibold flex-none" style={{ width: 100, textAlign: "right", color: "var(--color-neutral-600)" }}>
                        {formatNumber(d.sessions)} lượt · {formatNumber(d.pageViews)} trang
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
              <div className="card elev-sm p-5 flex flex-col gap-3">
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
                        <span className="font-semibold">
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

              <div className="card elev-sm p-5 flex flex-col gap-3">
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
                          <span className="font-semibold flex-none">{formatNumber(p.views)}</span>
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
              Số liệu 7 ngày gần nhất từ Google Analytics. Xem chi tiết hơn tại{" "}
              <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="font-semibold" style={{ color: "var(--color-accent-700)" }}>
                analytics.google.com
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
