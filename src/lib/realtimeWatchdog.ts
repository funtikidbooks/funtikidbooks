"use client";

import { createClient } from "@/lib/supabase/client";

// A phone waking from sleep (or a laptop lid opening) often comes back with
// a Realtime socket that still looks open but is dead. The library only
// notices when a later heartbeat goes unanswered — up to one full heartbeat
// interval — and chat messages sent in that window only show up via the
// 20s safety-net poll.
//
// On every return to the app this probes the socket right away: send a
// heartbeat; if no "ok" has come back PROBE_TIMEOUT_MS later, send another.
// Phoenix treats a heartbeat sent while the previous one is still pending
// as a timeout — it tears the socket down, reconnects (first try after
// 0.25s, see lib/supabase/client.ts) and every channel rejoins on its own;
// each chat view then catches up on "SUBSCRIBED". A socket that's already
// closed is simply told to connect now instead of waiting out its backoff.
//
// Acks are tracked through onHeartbeat() — RealtimeClient's own
// `pendingHeartbeatRef` getter always reads null in this library version.

// A healthy heartbeat round trip measured ~0.05s from Vietnam; 1.5s leaves
// room for a phone radio still waking up without waiting on a dead socket.
const PROBE_TIMEOUT_MS = 1500;
const MIN_GAP_MS = 2000;

let started = false;
let lastProbeAt = 0;
let lastAckAt = 0;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

function probe() {
  const now = Date.now();
  if (now - lastProbeAt < MIN_GAP_MS) return;
  lastProbeAt = now;
  const realtime = createClient().realtime;
  try {
    if (!realtime.isConnected()) {
      realtime.connect();
      return;
    }
    const sentAt = Date.now();
    realtime.sendHeartbeat();
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(() => {
      probeTimer = null;
      // No answer to that heartbeat → dead socket; this second one makes
      // the library reconnect immediately.
      if (lastAckAt < sentAt && realtime.isConnected()) realtime.sendHeartbeat();
    }, PROBE_TIMEOUT_MS);
  } catch {
    // Never let a health check break the page.
  }
}

export function startRealtimeWatchdog() {
  if (started || typeof window === "undefined") return;
  started = true;
  createClient().realtime.onHeartbeat((status) => {
    if (status === "ok") lastAckAt = Date.now();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") probe();
  });
  window.addEventListener("pageshow", probe);
  window.addEventListener("online", probe);
  window.addEventListener("focus", probe);
}
