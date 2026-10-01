"use client";

import { useMemo, useState } from "react";
import { listPushHealth, sendTestPushTo, type PushHealthPerson } from "@/lib/actions/push";

type Health = "none" | "error" | "slow" | "unknown" | "stale" | "ok";

const HEALTH: Record<Health, { label: string; color: string; bg: string; rank: number; advice: string }> = {
  none: {
    label: "Chưa bật thông báo",
    color: "var(--status-red)",
    bg: "rgba(192,82,79,.1)",
    rank: 0,
    advice: "Nhắc bạn mở workspace trên máy mình và bấm Bật thông báo (iPhone/iPad: thêm app ra màn hình chính trước).",
  },
  error: {
    label: "Gửi bị lỗi",
    color: "var(--status-red)",
    bg: "rgba(192,82,79,.1)",
    rank: 1,
    advice: "Nhắc bạn mở app Funti một lần — app sẽ tự đăng ký lại. Vẫn lỗi thì tắt/bật lại thông báo trong Cài đặt.",
  },
  slow: {
    label: "Nhận chậm",
    color: "var(--status-red)",
    bg: "rgba(192,82,79,.1)",
    rank: 2,
    advice:
      "Máy báo lại là thông báo tới trễ. iPhone/iPad: Cài đặt › Thông báo › Tóm tắt theo lịch — tắt cho Funti; tắt Nguồn điện thấp và cho Funti vượt qua Chế độ tập trung. Android: Cài đặt › Ứng dụng › Chrome › Pin › Không hạn chế. Máy tính: để Chrome/Edge chạy nền (Cài đặt › Hệ thống › Tiếp tục chạy ứng dụng nền khi đóng).",
  },
  stale: {
    label: "Lâu chưa mở app",
    color: "var(--status-yellow)",
    bg: "rgba(214,160,40,.12)",
    rank: 3,
    advice: "Có thể vẫn nhận được. Mở app một lần để máy xác nhận lại.",
  },
  unknown: {
    label: "Chờ mở app để kiểm tra",
    color: "var(--color-neutral-500)",
    bg: "var(--color-neutral-100)",
    rank: 4,
    advice: "Đã đăng ký từ trước — lần tới bạn mở app hoặc có tin nhắn gửi tới, trạng thái sẽ hiện ở đây.",
  },
  ok: { label: "Đang nhận", color: "var(--status-green)", bg: "rgba(72,160,110,.12)", rank: 5, advice: "" },
};

const DAY = 24 * 60 * 60 * 1000;
// A device showing a notification later than this after it was sent is "slow".
const SLOW_MS = 15_000;

function latest(values: (string | null | undefined)[]) {
  const t = values.filter(Boolean).map((v) => new Date(v!).getTime());
  return t.length ? Math.max(...t) : null;
}

function healthOf(p: PushHealthPerson, now: number): Health {
  if (p.devices.length === 0) return "none";
  const ok = latest(p.devices.map((d) => d.last_ok_at));
  const err = latest(p.devices.map((d) => d.last_error_at));
  const seen = latest(p.devices.map((d) => d.last_seen_at));
  if (err && (!ok || err > ok)) return "error";
  const last = lastDelivery(p);
  if (last && now - last.at < DAY && last.ms > SLOW_MS) return "slow";
  if (!ok && !seen) return "unknown";
  if (!seen || now - seen > 7 * DAY) return "stale";
  return "ok";
}

function ago(ms: number | null, now: number) {
  if (!ms) return "—";
  const d = now - ms;
  if (d < 60_000) return "vừa xong";
  if (d < 3_600_000) return `${Math.round(d / 60_000)} phút trước`;
  if (d < DAY) return `${Math.round(d / 3_600_000)} giờ trước`;
  return `${Math.round(d / DAY)} ngày trước`;
}

// The latest notification any of this person's devices reported showing.
function lastDelivery(p: PushHealthPerson) {
  const d = p.devices
    .filter((x) => x.last_delivered_at && x.last_delivery_ms != null)
    .sort((a, b) => (b.last_delivered_at ?? "").localeCompare(a.last_delivered_at ?? ""))[0];
  return d ? { at: new Date(d.last_delivered_at!).getTime(), ms: d.last_delivery_ms!, device: d.device ?? "Máy chưa rõ" } : null;
}

function seconds(ms: number) {
  return ms < 1000 ? "dưới 1 giây" : ms < 60_000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} giây` : `${Math.round(ms / 60_000)} phút`;
}

function deviceSummary(p: PushHealthPerson) {
  const counts = new Map<string, number>();
  for (const d of p.devices) counts.set(d.device ?? "Máy chưa rõ", (counts.get(d.device ?? "Máy chưa rõ") ?? 0) + 1);
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
}

export function PushHealthBoard({ initialPeople }: { initialPeople: PushHealthPerson[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [now, setNow] = useState(() => Date.now());
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(
    () =>
      people
        .map((p) => ({ p, h: healthOf(p, now) }))
        .sort((a, b) => HEALTH[a.h].rank - HEALTH[b.h].rank || a.p.name.localeCompare(b.p.name, "vi")),
    [people, now],
  );
  const counts = rows.reduce<Record<Health, number>>((acc, r) => ({ ...acc, [r.h]: acc[r.h] + 1 }), { none: 0, error: 0, slow: 0, stale: 0, unknown: 0, ok: 0 });

  async function refresh() {
    setRefreshing(true);
    try {
      setPeople(await listPushHealth());
      setNow(Date.now());
    } finally {
      setRefreshing(false);
    }
  }

  async function test(p: PushHealthPerson) {
    setTesting(p.id);
    try {
      const res = await sendTestPushTo(p.id);
      const ok = res.filter((r) => r.ok).length;
      const removed = res.filter((r) => r.removed).length;
      const failed = res.filter((r) => !r.ok && !r.removed);
      setResults((prev) => ({
        ...prev,
        [p.id]:
          res.length === 0
            ? "Không có máy nào để gửi."
            : `Đã gửi tới ${ok}/${res.length} máy` +
              (removed ? ` · gỡ ${removed} máy đã huỷ` : "") +
              (failed.length ? ` · lỗi: ${failed[0].error}` : "") +
              (ok ? " — hỏi bạn xem có hiện không." : ""),
      }));
      await refresh();
    } catch (err) {
      setResults((prev) => ({ ...prev, [p.id]: err instanceof Error ? err.message : "Không gửi được" }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 sm:py-4"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <h1 className="text-lg sm:text-xl whitespace-nowrap">Thông báo trên máy</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(["none", "error", "slow", "stale", "unknown", "ok"] as Health[])
            .filter((h) => counts[h] > 0)
            .map((h) => (
              <span key={h} className="rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap" style={{ background: HEALTH[h].bg, color: HEALTH[h].color }}>
                {counts[h]} {HEALTH[h].label.toLowerCase()}
              </span>
            ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Đang tải…" : "↻ Tải lại"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
        <p className="text-sm max-w-[110ch]" style={{ color: "var(--color-neutral-600)" }}>
          Mỗi nhân viên, từng máy: máy đó mở app lần cuối lúc nào, Apple/Google nhận thông báo lần cuối lúc nào, máy hiện thông báo sau bao
          lâu (máy tự báo lại), và lỗi nếu có. Thông báo là
          bắt buộc — ai chưa bật sẽ thấy thanh nhắc không tắt được trong workspace. Bấm <b>Gửi thử</b> để gửi một thông báo kiểm tra tới
          các máy của người đó.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {rows.map(({ p, h }) => {
            const hs = HEALTH[h];
            const seen = latest(p.devices.map((d) => d.last_seen_at));
            const ok = latest(p.devices.map((d) => d.last_ok_at));
            const shown = lastDelivery(p);
            const lastErr = p.devices
              .filter((d) => d.last_error_at)
              .sort((a, b) => (b.last_error_at ?? "").localeCompare(a.last_error_at ?? ""))[0];
            return (
              <div key={p.id} className="card p-4 flex flex-col gap-2.5 min-w-0" style={{ borderLeft: `4px solid ${hs.color}` }}>
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="flex-none inline-flex items-center justify-center rounded-full overflow-hidden text-[13px] font-bold"
                      style={{ width: 36, height: 36, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                    >
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-[15px] truncate">{p.name}</span>
                      <span className="block text-[12px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                        {p.role ?? ""}
                      </span>
                    </span>
                  </div>
                  <span className="flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap" style={{ background: hs.bg, color: hs.color }}>
                    {hs.label}
                  </span>
                </div>

                {p.devices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {deviceSummary(p).map((d) => (
                      <span key={d} className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--color-neutral-100)", color: "var(--color-neutral-700)" }}>
                        {d}
                      </span>
                    ))}
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                  <dt style={{ color: "var(--color-neutral-500)" }}>Mở app lần cuối</dt>
                  <dd className="font-semibold">{ago(seen, now)}</dd>
                  <dt style={{ color: "var(--color-neutral-500)" }}>Nhận lần cuối</dt>
                  <dd className="font-semibold">{ago(ok, now)}</dd>
                  <dt style={{ color: "var(--color-neutral-500)" }}>Hiện trên máy sau</dt>
                  <dd className="font-semibold" style={{ color: shown && shown.ms > SLOW_MS ? "var(--status-red)" : undefined }}>
                    {shown ? `${seconds(shown.ms)} · ${ago(shown.at, now)}` : "—"}
                  </dd>
                </dl>
                {p.devices.some((d) => d.last_delivered_at) && (
                  <ul className="flex flex-col gap-0.5 text-[12px]" style={{ color: "var(--color-neutral-600)" }}>
                    {p.devices
                      .filter((d) => d.last_delivered_at && d.last_delivery_ms != null)
                      .sort((a, b) => (b.last_delivered_at ?? "").localeCompare(a.last_delivered_at ?? ""))
                      .slice(0, 4)
                      .map((d) => (
                        <li key={d.id} className="flex justify-between gap-2 min-w-0">
                          <span className="truncate">{d.device ?? "Máy chưa rõ"}</span>
                          <span className="flex-none font-semibold" style={{ color: d.last_delivery_ms! > SLOW_MS ? "var(--status-red)" : "var(--status-green)" }}>
                            {seconds(d.last_delivery_ms!)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}

                {h === "error" && lastErr?.last_error && (
                  <p className="text-[12px] break-words" style={{ color: "var(--status-red)" }}>
                    Lỗi: {lastErr.last_error}
                  </p>
                )}
                {hs.advice && (
                  <p className="text-[12.5px] leading-snug" style={{ color: "var(--color-neutral-600)" }}>
                    {hs.advice}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => test(p)} disabled={testing === p.id || p.devices.length === 0}>
                    {testing === p.id ? "Đang gửi…" : "🔔 Gửi thử"}
                  </button>
                  {results[p.id] && (
                    <span className="text-[12px] leading-snug" style={{ color: "var(--color-neutral-700)" }}>
                      {results[p.id]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
