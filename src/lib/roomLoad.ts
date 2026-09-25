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

const DELTA_MESSAGE_LIMIT = 300;
const DELTA_REACTION_LIMIT = 500;

export type RoomSync = {
  messages: MeetingMessage[];
  reactions: MeetingReaction[];
  reads: MeetingChannelRead[];
  pinnedMessages: MeetingMessage[];
  // A catch-up that hit its row limit can't be merged — there'd be a hole
  // between what it returned and now. It's swapped for the latest page, and
  // the caller must replace what it holds instead of merging.
  messagesReplaced: boolean;
  reactionsReplaced: boolean;
};

export async function fetchRoomSync(
  channelId: string,
  opts: { messagesAfter?: string; reactionsAfter?: string } = {},
): Promise<RoomSync> {
  await ensureBrowserSession();
  const supabase = createClient();

  const latestMessages = () =>
    supabase
      .from("meeting_messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(INITIAL_MESSAGE_PAGE_SIZE);

  const latestReactions = () =>
    supabase
      .from("meeting_message_reactions")
      .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
      .eq("meeting_messages.channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(200);

  const messagesQuery = opts.messagesAfter
    ? supabase
        .from("meeting_messages")
        .select("*")
        .eq("channel_id", channelId)
        .gt("created_at", opts.messagesAfter)
        .order("created_at", { ascending: true })
        .limit(DELTA_MESSAGE_LIMIT)
    : latestMessages();

  const reactionsQuery = opts.reactionsAfter
    ? supabase
        .from("meeting_message_reactions")
        .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
        .eq("meeting_messages.channel_id", channelId)
        .gt("created_at", opts.reactionsAfter)
        .order("created_at", { ascending: true })
        .limit(DELTA_REACTION_LIMIT)
    : latestReactions();

  const readsQuery = supabase.from("meeting_channel_reads").select("*").eq("channel_id", channelId);

  const pinnedQuery = supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false });

  const [firstMessagesRes, firstReactionsRes, readsRes, pinnedRes] = await Promise.all([
    messagesQuery,
    reactionsQuery,
    readsQuery,
    pinnedQuery,
  ]);
  let messagesRes = firstMessagesRes;
  let reactionsRes = firstReactionsRes;

  // A failed fetch must throw, not look like an empty room — callers keep
  // what's on screen on a rejection, but would happily replace a whole
  // room's history with [] on a "successful" empty result. (The Server
  // Action version threw on its own when the network dropped.)
  if (messagesRes.error) throw messagesRes.error;
  // A reactions failure just returns none this round — the cursor only
  // advances on rows actually returned, so the next sync re-asks for them.

  const messagesReplaced = !!opts.messagesAfter && (messagesRes.data?.length ?? 0) >= DELTA_MESSAGE_LIMIT;
  const reactionsReplaced = !!opts.reactionsAfter && (reactionsRes.data?.length ?? 0) >= DELTA_REACTION_LIMIT;
  if (messagesReplaced) {
    messagesRes = await latestMessages();
    if (messagesRes.error) throw messagesRes.error;
  }
  if (reactionsReplaced) {
    reactionsRes = await latestReactions();
  }
  const messagesAscending = !!opts.messagesAfter && !messagesReplaced;
  const reactionsAscending = !!opts.reactionsAfter && !reactionsReplaced;

  const messages = (messagesAscending ? (messagesRes.data ?? []) : (messagesRes.data ?? []).reverse()) as MeetingMessage[];

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
  const reactions = reactionsAscending ? mappedReactions : mappedReactions.reverse();

  return {
    messages,
    reactions,
    reads: (readsRes.data ?? []) as MeetingChannelRead[],
    pinnedMessages: (pinnedRes.data ?? []) as MeetingMessage[],
    messagesReplaced,
    reactionsReplaced,
  };
}
