"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inboxTopic, listenChatTopic, sendChatBroadcast } from "@/lib/chatBroadcast";

// Measures the real chat path, not a synthetic one: pings travel over the
// same private Realtime inbox topic and the same send/listen helpers the
// chat itself uses. Open this page on two devices signed in to the same
// account; either one can start — the other answers every ping, and the
// round trip ÷ 2 is the one-way delivery time a chat message sees.

type Stats = { p50: number; p95: number; min: number; max: number; n: number };
const TARGET_MS = 100;
const PINGS = 20;

function stats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: at(0.5), p95: at(0.95), min: s[0], max: s[s.length - 1], n: s.length };
}

function StatCard({ label, caption, value }: { label: string; caption: string; value: Stats | null }) {
  const good = value !== null && value.p50 <= TARGET_MS;
  return (
    <section className="card elev-sm p-5 flex flex-col gap-2">
      <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
        {label}
      </span>
      {value ? (
        <>
          <span className="font-heading text-3xl font-bold tabular-nums" style={{ color: good ? "var(--status-green)" : "var(--status-yellow)" }}>
            {Math.round(value.p50)} ms
          </span>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
            Chậm nhất 95%: {Math.round(value.p95)} ms · nhanh nhất {Math.round(value.min)} ms · {value.n} lần đo
          </span>
        </>
      ) : (
        <span className="text-sm" style={{ color: "var(--color-neutral-400)" }}>
          Chưa đo
        </span>
      )}
      <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
        {caption}
      </span>
    </section>
  );
}

export function LatencyTest({ userId }: { userId: string }) {
  // One id per open page, so a device ignores its own pings.
  const [deviceId] = useState(() => crypto.randomUUID());
  const pending = useRef(new Map<string, number>());
  const [peers, setPeers] = useState(0);
  const [running, setRunning] = useState(false);
  const [oneWay, setOneWay] = useState<number[]>([]);
  const [dbTimes, setDbTimes] = useState<number[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const lastSeen = useRef(new Map<string, number>());

  useEffect(() => {
    const topic = inboxTopic(userId);
    const stop = listenChatTopic(topic, (event, payload) => {
      const p = payload as { id?: string; from?: string; to?: string; t0?: number };
      if (!p?.from || p.from === deviceId) return;
      lastSeen.current.set(p.from, Date.now());
      if (event === "latency-ping" && p.id) {
        sendChatBroadcast(topic, "latency-pong", { id: p.id, from: deviceId, to: p.from, t0: p.t0 });
      } else if (event === "latency-pong" && p.to === deviceId && p.id) {
        const sent = pending.current.get(p.id);
        if (sent !== undefined) {
          pending.current.delete(p.id);
          setOneWay((prev) => [...prev, (performance.now() - sent) / 2]);
        }
      }
    });
    // Presence of the other device(s): each page says hello every 2s.
    const hello = setInterval(() => {
      sendChatBroadcast(topic, "latency-hello", { from: deviceId });
      const now = Date.now();
      let alive = 0;
      for (const t of lastSeen.current.values()) if (now - t < 5000) alive++;
      setPeers(alive);
    }, 2000);
    return () => {
      stop();
      clearInterval(hello);
    };
  }, [userId, deviceId]);

  async function run() {
    setRunning(true);
    setNote(null);
    setOneWay([]);
    setDbTimes([]);
    const topic = inboxTopic(userId);

    // How long saving a message takes: a small read on the same database,
    // straight from this browser (the chat's own save path).
    const supabase = createClient();
    for (let i = 0; i < 8; i++) {
      const t = performance.now();
      await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
      setDbTimes((prev) => [...prev, performance.now() - t]);
    }

    if (peers === 0) {
      setNote("Chưa thấy thiết bị thứ hai — mở trang này trên máy khác (cùng tài khoản) để đo độ trễ nhận tin.");
    } else {
      for (let i = 0; i < PINGS; i++) {
        const id = `${deviceId}-${i}`;
        pending.current.set(id, performance.now());
        sendChatBroadcast(topic, "latency-ping", { id, from: deviceId, t0: Date.now() });
        await new Promise((r) => setTimeout(r, 300));
      }
      await new Promise((r) => setTimeout(r, 1500));
      const lost = pending.current.size;
      pending.current.clear();
      if (lost > 0) setNote(`${lost}/${PINGS} lần đo không nhận được phản hồi (mạng chập chờn hoặc máy kia đang ngủ).`);
    }
    setRunning(false);
  }

  const oneWayStats = stats(oneWay);
  const dbStats = stats(dbTimes);

  return (
    <div className="flex-1 flex flex-col gap-5 p-4 sm:p-6 overflow-y-auto max-w-[900px]">
      <div>
        <h1 className="text-xl">Đo tốc độ chat</h1>
        <p className="text-sm mt-1 max-w-[65ch]" style={{ color: "var(--color-neutral-500)" }}>
          Mở trang này trên <b>2 thiết bị cùng tài khoản</b> (VD máy tính và điện thoại), rồi bấm &quot;Bắt đầu đo&quot; ở một
          máy. Đo bằng đúng đường truyền mà chat đang dùng. Mục tiêu: dưới {TARGET_MS} ms.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={running} onClick={run}>
          {running ? "Đang đo…" : "Bắt đầu đo"}
        </button>
        <span
          className="text-xs font-semibold rounded-full px-3 py-1"
          style={{
            background: peers > 0 ? "color-mix(in srgb, var(--status-green) 14%, transparent)" : "var(--color-neutral-100)",
            color: peers > 0 ? "var(--status-green)" : "var(--color-neutral-500)",
          }}
        >
          {peers > 0 ? `✓ Đã thấy ${peers} thiết bị khác` : "Đang chờ thiết bị thứ hai…"}
        </span>
      </div>

      {note && (
        <p className="text-sm" style={{ color: "var(--status-yellow)" }}>
          {note}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="THỜI GIAN NHẬN TIN"
          caption="Từ lúc một máy gửi đến lúc máy kia nhận (khứ hồi ÷ 2). Đây là độ trễ nhân viên thấy khi chat."
          value={oneWayStats}
        />
        <StatCard
          label="THỜI GIAN LƯU VÀO DATABASE"
          caption="Một lượt hỏi–đáp với database từ máy này. Tin nhắn được lưu song song, không làm chậm việc nhận tin."
          value={dbStats}
        />
      </div>
    </div>
  );
}
