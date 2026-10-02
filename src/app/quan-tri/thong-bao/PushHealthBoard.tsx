"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPushProbe, listPushHealth, sendTestPushTo, type PushHealthPerson } from "@/lib/actions/push";
import { inboxTopic, listenChatTopic, sendChatBroadcast } from "@/lib/chatBroadcast";
import type { NotifyTestAck } from "@/lib/pageNotify";

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
    advice:
      "Máy đã đăng ký thông báo lâu rồi không mở app — có thể đã xoá app hoặc tắt thông báo, nên tin nhắn không tới. Nhắc bạn mở app Funti (hoặc workspace) trên máy đang dùng: thấy thanh 🔔 thì bấm Bật thông báo / Thử lại, rồi bấm Đo tín hiệu ở đây để kiểm tra.",
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

function sortedIds(people: PushHealthPerson[], now: number) {
  return people
    .map((p) => ({ p, h: healthOf(p, now) }))
    .sort((a, b) => HEALTH[a.h].rank - HEALTH[b.h].rank || a.p.name.localeCompare(b.p.name, "vi"))
    .map((r) => r.p.id);
}

function deviceSummary(p: PushHealthPerson) {
  const counts = new Map<string, number>();
  for (const d of p.devices) counts.set(d.device ?? "Máy chưa rõ", (counts.get(d.device ?? "Máy chưa rõ") ?? 0) + 1);
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
}

// ---------------------------------------------------------------------------
// Đo tín hiệu: a test notification to one person's devices, then each
// device's own "I showed it" report (sw.js → /api/push/ack) is watched for
// live — the delay is measured on the server's clock from the moment it
// was sent, so nobody has to be asked "did it show up?".
// ---------------------------------------------------------------------------

// No report after this long = that device didn't show it (asleep with
// delivery held back, notifications off, or an app that hasn't updated).
const PROBE_TIMEOUT_MS = 60_000;

type ProbeDevice = {
  id: string;
  name: string;
  state: "waiting" | "ok" | "silent" | "failed" | "removed";
  ms?: number;
  error?: string | null;
};
type Probe = { probeId: string; sentAt: string; startedAt: number; devices: ProbeDevice[] };
// An open workspace's answer to the same test (lib/pageNotify.ts): it can
// raise notifications itself, whatever the push service does.
type PageAck = NotifyTestAck & { ms: number };
// How long to wait for an open workspace to answer.
const PAGE_TIMEOUT_MS = 15_000;

function pageAckText(a: PageAck) {
  if (a.shown) return `hiện thông báo sau ${exactSeconds(a.ms)}`;
  if (a.reason === "denied") return "đã chặn thông báo trên trình duyệt";
  if (a.reason === "default") return "chưa cho phép thông báo";
  return "không bật được thông báo";
}

const probeDone = (p: Probe) => p.devices.every((d) => d.state !== "waiting");

// 4 bars under 2 s, 3 under 5 s, 2 under 15 s, 1 slower, 0 never.
function barsFor(d: ProbeDevice) {
  if (d.state !== "ok" || d.ms == null) return 0;
  return d.ms < 2000 ? 4 : d.ms < 5000 ? 3 : d.ms < SLOW_MS ? 2 : 1;
}
const BAR_COLOR = ["var(--color-neutral-300)", "var(--status-red)", "var(--status-yellow)", "var(--status-green)", "var(--status-green)"];

function SignalBars({ level }: { level: number }) {
  return (
    <span aria-hidden className="inline-flex flex-none items-end gap-[2px]" style={{ height: 14 }}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} style={{ width: 3.5, height: 2 + i * 3, borderRadius: 1, background: i <= level ? BAR_COLOR[level] : "var(--color-neutral-200)" }} />
      ))}
    </span>
  );
}

const exactSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} giây`;
const vnTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

function ProbeResult({ probe, now, pageAcks }: { probe: Probe; now: number; pageAcks: PageAck[] }) {
  const done = probeDone(probe);
  const sent = probe.devices.filter((d) => d.state !== "failed" && d.state !== "removed");
  const got = probe.devices.filter((d) => d.state === "ok");
  const slowest = Math.max(0, ...got.map((d) => d.ms ?? 0));
  const pageWaiting = pageAcks.length === 0 && now - probe.startedAt < PAGE_TIMEOUT_MS;
  const pageShown = pageAcks.some((a) => a.shown);
  let verdict: { text: string; color: string } | null = null;
  if (done) {
    if (got.length < probe.devices.length && pageShown)
      verdict = {
        text: "Đường thông báo của trình duyệt chưa tới, nhưng Workspace đang mở trên máy vẫn tự hiện thông báo — bạn ấy vẫn nhận được trong lúc mở Workspace.",
        color: "var(--status-yellow)",
      };
    else if (got.length === 0) verdict = { text: "Không máy nào báo đã nhận — xem hướng dẫn trên thẻ, rồi đo lại.", color: "var(--status-red)" };
    else if (got.length < probe.devices.length)
      verdict = {
        text: "Có máy chưa nhận: máy đó có thể đang tắt nguồn/mất mạng, chưa cho phép thông báo, hoặc app trên máy chưa cập nhật (nhắc bạn mở app Funti một lần rồi đo lại).",
        color: "var(--status-red)",
      };
    else if (slowest >= SLOW_MS) verdict = { text: "Nhận được nhưng chậm — làm theo hướng dẫn chỉnh máy, rồi đo lại.", color: "var(--status-red)" };
    else if (slowest >= 5000) verdict = { text: "Nhận được, hơi chậm một chút.", color: "var(--status-yellow)" };
    else verdict = { text: "✓ Tín hiệu tốt — máy nhận thông báo ngay.", color: "var(--status-green)" };
  }
  return (
    <div className="rounded-[10px] p-2.5 flex flex-col gap-1.5" style={{ background: "var(--color-surface)" }}>
      <span className="text-[12px] font-bold">
        Đo lúc {vnTime(probe.sentAt)} · {done ? `${got.length}/${probe.devices.length} máy nhận được` : `đang chờ máy báo lại… ${Math.round((now - probe.startedAt) / 1000)} giây`}
      </span>
      <ul className="flex flex-col gap-1">
        {probe.devices.map((d) => (
          <li key={d.id} className="flex items-center gap-2 min-w-0 text-[12.5px]">
            <SignalBars level={barsFor(d)} />
            <span className="truncate">{d.name}</span>
            <span
              className="ml-auto flex-none font-semibold tabular-nums"
              style={{
                color:
                  d.state === "ok"
                    ? BAR_COLOR[barsFor(d)]
                    : d.state === "waiting"
                      ? "var(--color-neutral-500)"
                      : "var(--status-red)",
              }}
            >
              {d.state === "ok"
                ? `nhận sau ${exactSeconds(d.ms ?? 0)}`
                : d.state === "waiting"
                  ? "đang chờ…"
                  : d.state === "silent"
                    ? "không báo lại"
                    : d.state === "removed"
                      ? "đã huỷ đăng ký"
                      : "gửi lỗi"}
            </span>
          </li>
        ))}
      </ul>
      {probe.devices
        .filter((d) => d.state === "failed" && d.error)
        .slice(0, 1)
        .map((d) => (
          <span key={d.id} className="text-[11.5px] break-words" style={{ color: "var(--status-red)" }}>
            Lỗi: {d.error}
          </span>
        ))}
      <div className="flex flex-col gap-1 pt-1.5" style={{ borderTop: "1px dashed var(--color-neutral-200)" }}>
        <span className="text-[11.5px] font-bold" style={{ color: "var(--color-neutral-600)" }}>
          Qua Workspace đang mở trên máy
        </span>
        {pageAcks.length === 0 ? (
          <span className="text-[12.5px]" style={{ color: pageWaiting ? "var(--color-neutral-500)" : "var(--status-red)" }}>
            {pageWaiting ? "đang chờ…" : "Không có Workspace nào đang mở (Chrome đã tắt, hoặc tab bị trình duyệt cho ngủ)."}
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {pageAcks.map((a, i) => (
              <li key={`${a.device}-${i}`} className="flex items-center gap-2 min-w-0 text-[12.5px]">
                <span aria-hidden>🖥</span>
                <span className="truncate">
                  {a.device}
                  {a.looking ? " · đang xem trang" : ""}
                </span>
                <span className="ml-auto flex-none font-semibold tabular-nums" style={{ color: a.shown ? "var(--status-green)" : "var(--status-red)" }}>
                  {pageAckText(a)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sent.length === 0 && probe.devices.length > 0 && (
        <span className="text-[12px]" style={{ color: "var(--status-red)" }}>
          Không gửi được tới máy nào.
        </span>
      )}
      {verdict && (
        <span className="text-[12px] font-semibold leading-snug" style={{ color: verdict.color }}>
          {verdict.text}
        </span>
      )}
    </div>
  );
}

export function PushHealthBoard({ initialPeople, currentUserId }: { initialPeople: PushHealthPerson[]; currentUserId: string }) {
  const [people, setPeople] = useState(initialPeople);
  const [now, setNow] = useState(() => Date.now());
  const [testing, setTesting] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  // Open workspaces answering a test, by probe id — kept apart from probes
  // because an answer (~0.1s) can arrive before the push send has returned.
  const [pageAcks, setPageAcks] = useState<Record<string, PageAck[]>>({});
  const probeStartRef = useRef(new Map<string, number>());
  useEffect(
    () =>
      listenChatTopic(inboxTopic(currentUserId), (event, payload) => {
        if (event !== "notify-test-ack") return;
        const ack = payload as NotifyTestAck;
        const start = probeStartRef.current.get(ack?.probeId);
        if (start === undefined) return;
        setPageAcks((prev) => ({ ...prev, [ack.probeId]: [...(prev[ack.probeId] ?? []), { ...ack, ms: Date.now() - start }] }));
      }),
    [currentUserId],
  );
  const [refreshing, setRefreshing] = useState(false);

  // Worst first — but only re-sorted on open and on ↻ Tải lại, so a card
  // doesn't jump away (into "Đang nhận") the moment its measurement ends.
  const [order, setOrder] = useState(() => sortedIds(initialPeople, Date.now()));
  const rows = useMemo(() => {
    const pos = new Map(order.map((id, i) => [id, i]));
    return people
      .map((p) => ({ p, h: healthOf(p, now) }))
      .sort((a, b) => (pos.get(a.p.id) ?? 1e9) - (pos.get(b.p.id) ?? 1e9) || a.p.name.localeCompare(b.p.name, "vi"));
  }, [people, now, order]);
  const counts = rows.reduce<Record<Health, number>>((acc, r) => ({ ...acc, [r.h]: acc[r.h] + 1 }), { none: 0, error: 0, slow: 0, stale: 0, unknown: 0, ok: 0 });

  async function refresh(resort: boolean) {
    setRefreshing(true);
    try {
      const fresh = await listPushHealth();
      const t = Date.now();
      setPeople(fresh);
      setNow(t);
      if (resort) setOrder(sortedIds(fresh, t));
    } finally {
      setRefreshing(false);
    }
  }

  async function test(p: PushHealthPerson) {
    setTesting(p.id);
    setSendErrors((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    try {
      // Both ways at once: the push service, and their open workspaces.
      const probeId = crypto.randomUUID();
      probeStartRef.current.set(probeId, Date.now());
      sendChatBroadcast(inboxTopic(p.id), "notify-test", { probeId, from: currentUserId });
      setTimeout(() => setNow(Date.now()), PAGE_TIMEOUT_MS + 300);
      const { sentAt, results } = await sendTestPushTo(p.id, probeId);
      // Same-named devices ("Máy chưa rõ" ×3) get a number each.
      const seen = new Map<string, number>();
      const devices: ProbeDevice[] = results.map((r) => {
        const base = r.device ?? "Máy chưa rõ";
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const name = results.filter((x) => (x.device ?? "Máy chưa rõ") === base).length > 1 ? `${base} (${n})` : base;
        return { id: r.id, name, state: r.ok ? "waiting" : r.removed ? "removed" : "failed", error: r.error };
      });
      if (devices.length === 0) setSendErrors((prev) => ({ ...prev, [p.id]: "Không có máy nào để gửi." }));
      else setProbes((prev) => ({ ...prev, [p.id]: { probeId, sentAt, startedAt: Date.now(), devices } }));
    } catch (err) {
      setSendErrors((prev) => ({ ...prev, [p.id]: err instanceof Error ? err.message : "Không gửi được" }));
    } finally {
      setTesting(null);
    }
  }

  // Watches every measurement still waiting, all in one request per tick
  // (server actions run one at a time per page anyway).
  const probesRef = useRef(probes);
  useEffect(() => {
    probesRef.current = probes;
  }, [probes]);
  const waitingKey = Object.entries(probes)
    .filter(([, pr]) => !probeDone(pr))
    .map(([id, pr]) => `${id}@${pr.sentAt}`)
    .join(",");
  useEffect(() => {
    if (!waitingKey) return;
    let stopped = false;
    let busy = false;
    const timer = setInterval(async () => {
      setNow(Date.now());
      if (busy) return;
      busy = true;
      try {
        const active = Object.entries(probesRef.current).filter(([, pr]) => !probeDone(pr));
        if (active.length === 0) return;
        const since = active.map(([, pr]) => pr.sentAt).sort()[0];
        const reports = await getPushProbe(
          active.map(([id]) => id),
          since,
        );
        if (stopped) return;
        const deliveredAt = new Map(reports.map((r) => [r.id, r.deliveredAt]));
        let finished = false;
        setProbes((prev) => {
          const next = { ...prev };
          for (const [id, pr] of Object.entries(prev)) {
            if (probeDone(pr)) continue;
            const sentMs = Date.parse(pr.sentAt);
            const timedOut = Date.now() - pr.startedAt > PROBE_TIMEOUT_MS;
            const devices = pr.devices.map((d): ProbeDevice => {
              if (d.state !== "waiting") return d;
              const at = deliveredAt.get(d.id);
              if (at && Date.parse(at) >= sentMs) return { ...d, state: "ok", ms: Math.max(0, Date.parse(at) - sentMs) };
              return timedOut ? { ...d, state: "silent" } : d;
            });
            next[id] = { ...pr, devices };
            if (probeDone(next[id])) finished = true;
          }
          return next;
        });
        // The card's own numbers ("Hiện trên máy sau") catch up once a measurement ends.
        if (finished) void refresh(false);
      } catch {
        // a missed tick — the next one tries again
      } finally {
        busy = false;
      }
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // Restarts only when the set of waiting measurements changes.
  }, [waitingKey]);

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
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => refresh(true)} disabled={refreshing}>
            {refreshing ? "Đang tải…" : "↻ Tải lại"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
        <p className="text-sm max-w-[110ch]" style={{ color: "var(--color-neutral-600)" }}>
          Mỗi nhân viên, từng máy: máy đó mở app lần cuối lúc nào, Apple/Google nhận thông báo lần cuối lúc nào, máy hiện thông báo sau bao
          lâu (máy tự báo lại), và lỗi nếu có. Thông báo là
          bắt buộc — ai chưa bật sẽ thấy thanh nhắc không tắt được trong workspace. Bấm <b>📶 Đo tín hiệu</b> để gửi một thông báo kiểm tra
          tới các máy của người đó: từng máy tự báo lại khi đã hiện, và thẻ cho thấy ngay máy nào nhận được, sau bao nhiêu giây, máy nào
          chưa nhận — không cần hỏi lại bạn.
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

                {probes[p.id] && <ProbeResult probe={probes[p.id]} now={now} pageAcks={pageAcks[probes[p.id].probeId] ?? []} />}

                <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => test(p)}
                    disabled={testing === p.id || p.devices.length === 0 || (probes[p.id] && !probeDone(probes[p.id]))}
                  >
                    {testing === p.id
                      ? "Đang gửi…"
                      : probes[p.id] && !probeDone(probes[p.id])
                        ? "Đang đo…"
                        : probes[p.id]
                          ? "📶 Đo lại"
                          : "📶 Đo tín hiệu"}
                  </button>
                  {sendErrors[p.id] && (
                    <span className="text-[12px] leading-snug" style={{ color: "var(--status-red)" }}>
                      {sendErrors[p.id]}
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
