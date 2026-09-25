"use client";

import { useSyncExternalStore } from "react";
import { SessionLostError } from "@/lib/supabase/client";

// Whether chat is actually keeping up, so a failing sync shows a banner
// instead of leaving a room silently hours behind. Fed by every resync()
// (rooms and DMs); read by ChatSyncBanner.

export type ChatSyncProblem = "session" | "offline" | null;

// A single dropped request on a flaky phone connection shouldn't flash a
// warning — only a failure that's lasted past one 20s safety-net poll.
const OFFLINE_AFTER_MS = 15000;

let problem: ChatSyncProblem = null;
let failingSince: number | null = null;
const listeners = new Set<() => void>();

function set(next: ChatSyncProblem) {
  if (next === problem) return;
  problem = next;
  for (const l of listeners) l();
}

export function reportChatSyncOk() {
  failingSince = null;
  set(null);
}

export function reportChatSyncFailure(err: unknown) {
  if (err instanceof SessionLostError) {
    set("session");
    return;
  }
  const now = Date.now();
  if (failingSince === null) failingSince = now;
  if (now - failingSince >= OFFLINE_AFTER_MS) set("offline");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatSyncProblem(): ChatSyncProblem {
  return useSyncExternalStore(
    subscribe,
    () => problem,
    () => null,
  );
}
