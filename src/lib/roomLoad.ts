"use client";

import { createClient, ensureBrowserSession } from "@/lib/supabase/client";
import type { MeetingChannelRead, MeetingMessage, MeetingReaction } from "@/lib/types";

// Browser-side twin of the old getRoomSync Server Action — same four
// queries, same RLS (a room's messages/reactions/reads are only readable by
// its members), but fetched straight from Supabase instead of through a
// Server Action. Server Actions from one browser run one at a time, so
// opening a room used to queue behind MeetingHub's own background warm-up
// pass (every joined room, one after another, right after the page opens)
// — close to 20s on a big room list before an uncached room could load.

const INITIAL_MESSAGE_PAGE_SIZE = 60;

export type RoomSync = {
  messages: MeetingMessage[];
  reactions: MeetingReaction[];
  reads: MeetingChannelRead[];
  pinnedMessages: MeetingMessage[];
};

export async function fetchRoomSync(
  channelId: string,
  opts: { messagesAfter?: string; reactionsAfter?: string } = {},
): Promise<RoomSync> {
  await ensureBrowserSession();
  const supabase = createClient();

  const messagesQuery = opts.messagesAfter
    ? supabase
        .from("meeting_messages")
        .select("*")
        .eq("channel_id", channelId)
        .gt("created_at", opts.messagesAfter)
        .order("created_at", { ascending: true })
        .limit(300)
    : supabase
        .from("meeting_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(INITIAL_MESSAGE_PAGE_SIZE);

  const reactionsQuery = opts.reactionsAfter
    ? supabase
        .from("meeting_message_reactions")
        .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
        .eq("meeting_messages.channel_id", channelId)
        .gt("created_at", opts.reactionsAfter)
        .order("created_at", { ascending: true })
        .limit(500)
    : supabase
        .from("meeting_message_reactions")
        .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
        .eq("meeting_messages.channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(200);

  const readsQuery = supabase.from("meeting_channel_reads").select("*").eq("channel_id", channelId);

  const pinnedQuery = supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false });

  const [messagesRes, reactionsRes, readsRes, pinnedRes] = await Promise.all([
    messagesQuery,
    reactionsQuery,
    readsQuery,
    pinnedQuery,
  ]);

  // A failed fetch must throw, not look like an empty room — callers keep
  // what's on screen on a rejection, but would happily replace a whole
  // room's history with [] on a "successful" empty result. (The Server
  // Action version threw on its own when the network dropped.)
  if (messagesRes.error) throw messagesRes.error;

  const messages = (opts.messagesAfter ? (messagesRes.data ?? []) : (messagesRes.data ?? []).reverse()) as MeetingMessage[];

  const reactionRows = (reactionsRes.data ?? []) as unknown as {
    message_id: string;
    profile_id: string;
    emoji: string;
    created_at: string;
  }[];
  const mappedReactions = reactionRows.map((r) => ({
    message_id: r.message_id,
    profile_id: r.profile_id,
    emoji: r.emoji,
    created_at: r.created_at,
  }));
  const reactions = opts.reactionsAfter ? mappedReactions : mappedReactions.reverse();

  return {
    messages,
    reactions,
    reads: (readsRes.data ?? []) as MeetingChannelRead[],
    pinnedMessages: (pinnedRes.data ?? []) as MeetingMessage[],
  };
}
