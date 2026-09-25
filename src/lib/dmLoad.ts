"use client";

import { createClient, ensureBrowserSession } from "@/lib/supabase/client";
import type { DirectMessage, DirectMessageReaction } from "@/lib/types";

// Loads a DM conversation straight from the browser — the same two queries
// getConversation / getDirectReactionsSince ran, under the same RLS (you
// can only ever read your own DMs), but without the Server Action round
// trip. Server Actions from one browser run one at a time, so opening a
// conversation used to wait behind MeetingHub's background room syncs
// (a warm-up pass over every room right after the page opens, then one
// every 20s) — sếp Phúc: "vào phòng chat riêng thì nó load tin nhắn cực lâu".

const PAGE_SIZE = 200;

function pairFilter(meId: string, peerId: string) {
  return `and(sender_id.eq.${meId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${meId})`;
}

export async function fetchConversation(meId: string, peerId: string, afterCreatedAt?: string): Promise<DirectMessage[]> {
  await ensureBrowserSession();
  const supabase = createClient();
  if (afterCreatedAt) {
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(pairFilter(meId, peerId))
      .gt("created_at", afterCreatedAt)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw error;
    return (data ?? []) as DirectMessage[];
  }
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .or(pairFilter(meId, peerId))
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw error;
  return ((data ?? []) as DirectMessage[]).reverse();
}

export async function fetchDirectReactions(meId: string, peerId: string, afterCreatedAt?: string): Promise<DirectMessageReaction[]> {
  await ensureBrowserSession();
  const supabase = createClient();
  let query = supabase
    .from("direct_message_reactions")
    .select("message_id, profile_id, emoji, created_at, direct_messages!inner(sender_id, recipient_id)")
    .or(
      `and(direct_messages.sender_id.eq.${meId},direct_messages.recipient_id.eq.${peerId}),and(direct_messages.sender_id.eq.${peerId},direct_messages.recipient_id.eq.${meId})`,
    )
    .order("created_at", { ascending: true })
    .limit(500);
  if (afterCreatedAt) query = query.gt("created_at", afterCreatedAt);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    message_id: r.message_id as string,
    profile_id: r.profile_id as string,
    emoji: r.emoji as string,
    created_at: r.created_at as string,
  }));
}

// Last-seen copy of each conversation, so reopening someone you already
// looked at shows their messages instantly while a small "anything newer?"
// fetch runs underneath — instead of a blank panel until the full history
// arrives. Kept in memory for the session plus a trimmed copy in
// localStorage so it survives a reload.
type Snapshot = { messages: DirectMessage[]; reactions: DirectMessageReaction[] };
const memory = new Map<string, Snapshot>();
const STORAGE_PREFIX = "funti-dm-snapshot:";
const STORED_MESSAGES = 60;

export function readDmSnapshot(peerId: string): Snapshot | null {
  const hit = memory.get(peerId);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + peerId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    memory.set(peerId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeDmSnapshot(peerId: string, snapshot: Snapshot) {
  // Never cache optimistic/unsent bubbles — they carry this device's clock
  // and a temp id, and would come back as ghosts on the next open.
  const confirmed = snapshot.messages.filter((m) => !m.id.startsWith("temp-"));
  const clean = { messages: confirmed, reactions: snapshot.reactions };
  memory.set(peerId, clean);
  try {
    const trimmed = confirmed.slice(-STORED_MESSAGES);
    const ids = new Set(trimmed.map((m) => m.id));
    localStorage.setItem(
      STORAGE_PREFIX + peerId,
      JSON.stringify({ messages: trimmed, reactions: clean.reactions.filter((r) => ids.has(r.message_id)) }),
    );
  } catch {
    // Storage full/unavailable — the in-memory copy still covers this session.
  }
}
