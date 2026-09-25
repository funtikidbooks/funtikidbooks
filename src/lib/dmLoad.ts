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

const DELTA_MESSAGE_LIMIT = 300;
const REACTION_LIMIT = 500;

// `replaced`: a catch-up that hit its row limit can't be merged (there'd be
// a hole between what it returned and now), so the latest page comes back
// instead and the caller must replace what it holds.
export async function fetchConversation(
  meId: string,
  peerId: string,
  afterCreatedAt?: string,
): Promise<{ messages: DirectMessage[]; replaced: boolean }> {
  await ensureBrowserSession();
  const supabase = createClient();
  if (afterCreatedAt) {
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(pairFilter(meId, peerId))
      .gt("created_at", afterCreatedAt)
      .order("created_at", { ascending: true })
      .limit(DELTA_MESSAGE_LIMIT);
    if (error) throw error;
    if ((data ?? []).length < DELTA_MESSAGE_LIMIT) return { messages: (data ?? []) as DirectMessage[], replaced: false };
  }
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .or(pairFilter(meId, peerId))
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw error;
  return { messages: ((data ?? []) as DirectMessage[]).reverse(), replaced: !!afterCreatedAt };
}

export async function fetchDirectReactions(
  meId: string,
  peerId: string,
  afterCreatedAt?: string,
): Promise<{ reactions: DirectMessageReaction[]; replaced: boolean }> {
  await ensureBrowserSession();
  const supabase = createClient();
  const base = () =>
    supabase
      .from("direct_message_reactions")
      .select("message_id, profile_id, emoji, created_at, direct_messages!inner(sender_id, recipient_id)")
      .or(
        `and(direct_messages.sender_id.eq.${meId},direct_messages.recipient_id.eq.${peerId}),and(direct_messages.sender_id.eq.${peerId},direct_messages.recipient_id.eq.${meId})`,
      );
  const map = (rows: { message_id: unknown; profile_id: unknown; emoji: unknown; created_at: unknown }[]) =>
    rows.map((r) => ({
      message_id: r.message_id as string,
      profile_id: r.profile_id as string,
      emoji: r.emoji as string,
      created_at: r.created_at as string,
    }));

  if (afterCreatedAt) {
    const { data, error } = await base()
      .gt("created_at", afterCreatedAt)
      .order("created_at", { ascending: true })
      .limit(REACTION_LIMIT);
    if (error) throw error;
    if ((data ?? []).length < REACTION_LIMIT) return { reactions: map(data ?? []), replaced: false };
  }
  // Newest first, then flipped — ascending with a limit returned the
  // *oldest* 500, so a long conversation's recent reactions never loaded.
  const { data, error } = await base().order("created_at", { ascending: false }).limit(REACTION_LIMIT);
  if (error) throw error;
  return { reactions: map(data ?? []).reverse(), replaced: !!afterCreatedAt };
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
