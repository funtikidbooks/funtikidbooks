import type { SupabaseClient } from "@supabase/supabase-js";

type ChatTable = "meeting_messages" | "direct_messages";

// Signals shared with lib/connectivity.ts (plain window events, so this
// module never has to import that one).
export const CONNECTIVITY_RESTORED_EVENT = "funti-connectivity-restored";
export const OUTBOX_CHANGED_EVENT = "funti-outbox-changed";

const ATTEMPT_TIMEOUT_MS = 10000;

// Posts one chat row with a client-chosen id. Up to `tries` attempts of 10s
// each for network-level failures only; a retry after a lost reply hits the
// unique key (23505) and is treated as success by fetching the row that
// already landed, so nothing is ever posted twice.
//
// Lag-aware: with no network at all it fails at once (the message is queued
// and re-sent the moment the connection is back — see connectivity.ts)
// instead of hanging for ~30s; and if the connection comes back while an
// attempt is stuck on a dead request, that attempt is cut short and the next
// one goes immediately, without the usual backoff.
export async function insertWithRetry<T extends { id: string }>(
  supabase: SupabaseClient,
  table: ChatTable,
  row: { id: string } & Record<string, unknown>,
  tries = 3,
): Promise<{ data: T | null; code?: string; message?: string }> {
  let last: { code?: string; message: string } | null = null;
  let cutShort = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (typeof navigator !== "undefined" && !navigator.onLine) return { data: null, message: "offline" };
    let restored = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    const onRestored = () => {
      restored = true;
      controller.abort();
    };
    if (typeof window !== "undefined") window.addEventListener(CONNECTIVITY_RESTORED_EVENT, onRestored);
    try {
      const res = await supabase.from(table).insert(row).select("*").abortSignal(controller.signal).single();
      if (!res.error && res.data) return { data: res.data as T };
      last = res.error ?? { message: "no data" };
      if (last.code === "23505") {
        const existing = await supabase.from(table).select("*").eq("id", row.id).maybeSingle();
        if (existing.data) return { data: existing.data as T };
        return { data: null, code: last.code, message: last.message };
      }
      // A real rejection (not a member, closed room...) won't improve on
      // retry. An aborted request is a network problem, not a rejection.
      if (last.code && !controller.signal.aborted) return { data: null, code: last.code, message: last.message };
    } catch (err) {
      last = { message: err instanceof Error ? err.message : "network" };
    } finally {
      clearTimeout(timer);
      if (typeof window !== "undefined") window.removeEventListener(CONNECTIVITY_RESTORED_EVENT, onRestored);
    }
    if (restored && cutShort < 3) {
      // Cut short by the connection coming back: retry right away, and don't
      // count it as one of the tries (capped, so a flapping link can't spin).
      cutShort++;
      attempt--;
      continue;
    }
    if (attempt < tries - 1) await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
  }
  return { data: null, message: last?.message };
}

// A rejected insert because a column the app now sends hasn't been added to
// the database yet (a migration not run) — PostgREST's "not in the schema
// cache" (PGRST204) or Postgres's "column does not exist" (42703).
export function isMissingColumn(res: { code?: string; message?: string }) {
  return res.code === "PGRST204" || res.code === "42703" || /column/i.test(res.message ?? "");
}

// Text-only messages that haven't been confirmed yet, kept in localStorage so
// closing/reloading the app (iOS kills background web apps freely) doesn't
// lose them — they are re-sent on the next start.
export type OutboxEntry =
  | { kind: "meeting"; tempId: string; serverId: string; channelId: string; content: string; replyId: string | null }
  | { kind: "dm"; tempId: string; serverId: string; recipientId: string; senderId: string; content: string; replyId?: string | null };

const KEY = "funti-chat-outbox";

export function loadOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function saveOutbox(list: OutboxEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — in-session retry still works
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
}

// Entries queued by THIS tab are re-sent by the chat view that queued them
// (it also owns their on-screen bubble); resendStoredOutbox() below only
// picks up ones left over from an earlier session.
const queuedThisSession = new Set<string>();

export function isQueuedThisSession(serverId: string) {
  return queuedThisSession.has(serverId);
}

export function addToOutbox(entry: OutboxEntry) {
  queuedThisSession.add(entry.serverId);
  saveOutbox([...loadOutbox().filter((e) => e.serverId !== entry.serverId), entry]);
}

export function removeFromOutbox(serverId: string) {
  saveOutbox(loadOutbox().filter((e) => e.serverId !== serverId));
}
