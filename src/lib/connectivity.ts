"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONNECTIVITY_RESTORED_EVENT, OUTBOX_CHANGED_EVENT, loadOutbox } from "@/lib/chatOutbox";

// One shared view of "can this device reach the chat right now?", for the
// status bar staff see and for re-sending queued messages the instant the
// connection is back rather than on the next timer tick.
//
//   offline       the device itself reports no network
//   reconnecting  network is up but the Realtime socket has been down >1.5s
//   online        socket connected
//
// onConnectivityRestored() fires on the browser's "online" event and on
// every return to "online" — callers re-send what's waiting right then.

export type ConnectivityState = "online" | "offline" | "reconnecting";

type Snapshot = {
  state: ConnectivityState;
  // Text messages not yet confirmed saved (the persisted outbox).
  pending: number;
  // When the connection last came back, and how many were waiting then —
  // lets the status bar say "đã gửi n tin" for a moment afterwards.
  restoredAt: number | null;
  pendingAtRestore: number;
};

const RECONNECTING_AFTER_MS = 1500;
const TICK_MS = 1000;
const KICK_MS = 2000;
let lastKickAt = 0;

let snapshot: Snapshot = { state: "online", pending: 0, restoredAt: null, pendingAtRestore: 0 };
let socketDownSince: number | null = null;
let started = false;
const listeners = new Set<() => void>();
const restoredListeners = new Set<() => void>();

function emitRestored() {
  // chatOutbox listens for this to cut a hung send attempt short.
  window.dispatchEvent(new Event(CONNECTIVITY_RESTORED_EVENT));
  for (const l of restoredListeners) {
    try {
      l();
    } catch {
      // one listener failing mustn't stop the others
    }
  }
}

function update() {
  let state: ConnectivityState;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    state = "offline";
  } else {
    let up = true;
    try {
      const realtime = createClient().realtime;
      up = realtime.isConnected();
      // The library backs off between reconnect attempts (up to 10s), so a
      // link that comes back mid-wait would sit idle until the next one.
      // While the device has network, nudge it every KICK_MS instead —
      // connect() is a no-op if it's already connecting.
      if (!up && Date.now() - lastKickAt > KICK_MS) {
        lastKickAt = Date.now();
        realtime.connect();
      }
    } catch {
      up = true;
    }
    if (up) {
      socketDownSince = null;
      state = "online";
    } else {
      if (socketDownSince === null) socketDownSince = Date.now();
      // Brief blips (and the first moments after page load) stay "online"
      // so the bar doesn't flicker; coming straight from offline shows
      // "reconnecting" right away.
      state = snapshot.state === "offline" || Date.now() - socketDownSince > RECONNECTING_AFTER_MS ? "reconnecting" : "online";
    }
  }
  const pending = loadOutbox().length;
  const cameBack = state === "online" && snapshot.state !== "online";
  const next: Snapshot = cameBack
    ? { state, pending, restoredAt: Date.now(), pendingAtRestore: snapshot.pending }
    : { ...snapshot, state, pending };
  const changed = next.state !== snapshot.state || next.pending !== snapshot.pending || next.restoredAt !== snapshot.restoredAt;
  snapshot = next;
  if (changed) for (const l of listeners) l();
  if (cameBack) emitRestored();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => {
    update();
    // The network is back even if the socket isn't yet — a REST re-send can
    // go now instead of waiting for Realtime.
    emitRestored();
  });
  window.addEventListener("offline", update);
  window.addEventListener(OUTBOX_CHANGED_EVENT, update);
  setInterval(update, TICK_MS);
  update();
}

export function onConnectivityRestored(listener: () => void): () => void {
  start();
  restoredListeners.add(listener);
  return () => restoredListeners.delete(listener);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: Snapshot = { state: "online", pending: 0, restoredAt: null, pendingAtRestore: 0 };

export function useConnectivity(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
}
