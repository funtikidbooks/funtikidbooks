import type { SupabaseClient } from "@supabase/supabase-js";

type ChatTable = "meeting_messages" | "direct_messages";

// Posts one chat row with a client-chosen id. Up to `tries` attempts of 10s
// each for network-level failures only; a retry after a lost reply hits the
// unique key (23505) and is treated as success by fetching the row that
// already landed, so nothing is ever posted twice.
export async function insertWithRetry<T extends { id: string }>(
  supabase: SupabaseClient,
  table: ChatTable,
  row: { id: string } & Record<string, unknown>,
  tries = 3,
): Promise<{ data: T | null; code?: string; message?: string }> {
  let last: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await supabase.from(table).insert(row).select("*").abortSignal(controller.signal).single();
      if (!res.error && res.data) return { data: res.data as T };
      last = res.error ?? { message: "no data" };
      if (last.code === "23505") {
        const existing = await supabase.from(table).select("*").eq("id", row.id).maybeSingle();
        if (existing.data) return { data: existing.data as T };
        return { data: null, code: last.code, message: last.message };
      }
      // A real rejection (not a member, closed room...) won't improve on retry.
      if (last.code) return { data: null, code: last.code, message: last.message };
    } catch (err) {
      last = { message: err instanceof Error ? err.message : "network" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { data: null, code: last?.code, message: last?.message };
}

// Text-only messages that haven't been confirmed yet, kept in localStorage so
// closing/reloading the app (iOS kills background web apps freely) doesn't
// lose them — they are re-sent on the next start.
export type OutboxEntry =
  | { kind: "meeting"; tempId: string; serverId: string; channelId: string; content: string; replyId: string | null }
  | { kind: "dm"; tempId: string; serverId: string; recipientId: string; senderId: string; content: string };

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
}

export function addToOutbox(entry: OutboxEntry) {
  saveOutbox([...loadOutbox().filter((e) => e.serverId !== entry.serverId), entry]);
}

export function removeFromOutbox(serverId: string) {
  saveOutbox(loadOutbox().filter((e) => e.serverId !== serverId));
}
