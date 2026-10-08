"use client";

import { createClient, ensureBrowserSession } from "@/lib/supabase/client";
import type { DmPreview } from "@/lib/actions/messages";

// Chat bookkeeping straight from the browser — the same queries the Server
// Actions ran (getUnreadCounts, getUnreadMeetingCounts, getRecentDmPreviews,
// markConversationRead, markDirectMessagesRead, markRoomSeen), under the
// same RLS, since those ran with the signed-in person's own session anyway.
// Each one used to be a Vercel function call — the unread counts on every
// window focus, which staff switching between Photoshop and the browser
// trigger all day — and the free plan's CPU allowance ran out (10/2026).

async function client() {
  await ensureBrowserSession();
  return createClient();
}

// Unread 1:1 messages per sender: anything newer than when this person last
// opened that conversation (dm_reads).
export async function loadDmUnreadCounts(meId: string): Promise<Record<string, number>> {
  const supabase = await client();
  const [{ data: reads, error: e1 }, { data: incoming, error: e2 }] = await Promise.all([
    supabase.from("dm_reads").select("peer_id, last_read_at").eq("user_id", meId),
    supabase.from("direct_messages").select("sender_id, created_at").eq("recipient_id", meId),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  const lastReadByPeer = new Map((reads ?? []).map((r) => [r.peer_id as string, r.last_read_at as string]));
  const counts: Record<string, number> = {};
  for (const m of incoming ?? []) {
    const lastRead = lastReadByPeer.get(m.sender_id as string);
    if (!lastRead || new Date(m.created_at as string) > new Date(lastRead)) {
      counts[m.sender_id as string] = (counts[m.sender_id as string] ?? 0) + 1;
    }
  }
  return counts;
}

// Unread messages per open room the person belongs to (or #Chung / the food
// room), counted after the last message they read there.
export async function loadMeetingUnreadCounts(meId: string): Promise<Record<string, number>> {
  const supabase = await client();
  const [{ data: memberChannels, error: e1 }, { data: generalChannels, error: e2 }, { data: closedRows, error: e3 }] = await Promise.all([
    supabase.from("meeting_channel_members").select("channel_id").eq("profile_id", meId),
    supabase.from("meeting_channels").select("id").or("is_general.eq.true,is_food_room.eq.true"),
    supabase.from("meeting_channels").select("id").not("closed_at", "is", null),
  ]);
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
  const closedIds = new Set((closedRows ?? []).map((c) => c.id as string));
  const openChannelIds = [
    ...new Set([...(memberChannels ?? []).map((m) => m.channel_id as string), ...(generalChannels ?? []).map((c) => c.id as string)]),
  ].filter((id) => !closedIds.has(id));
  if (openChannelIds.length === 0) return {};

  const { data: reads, error: e4 } = await supabase
    .from("meeting_channel_reads")
    .select("channel_id, last_read_message_id")
    .eq("profile_id", meId)
    .in("channel_id", openChannelIds);
  if (e4) throw e4;
  // The read message's own time, looked up by id (see getUnreadMeetingCounts).
  const readMessageIds = (reads ?? []).map((r) => r.last_read_message_id as string | null).filter((id): id is string => !!id);
  const { data: readMessages } =
    readMessageIds.length > 0 ? await supabase.from("meeting_messages").select("id, created_at").in("id", readMessageIds) : { data: [] };
  const readCreatedAtById = new Map((readMessages ?? []).map((m) => [m.id as string, m.created_at as string]));
  const lastReadAtByChannel = new Map(
    (reads ?? []).map((r) => [r.channel_id as string, r.last_read_message_id ? readCreatedAtById.get(r.last_read_message_id as string) : undefined]),
  );

  const counts: Record<string, number> = {};
  await Promise.all(
    openChannelIds.map(async (channelId) => {
      let query = supabase.from("meeting_messages").select("id", { count: "exact", head: true }).eq("channel_id", channelId).neq("sender_id", meId);
      const lastReadAt = lastReadAtByChannel.get(channelId);
      if (lastReadAt) query = query.gt("created_at", lastReadAt);
      const { count } = await query;
      if (count) counts[channelId] = count;
    }),
  );
  return counts;
}

// The latest message with each person, for the "Riêng" list's preview line.
export async function loadRecentDmPreviews(meId: string): Promise<Record<string, DmPreview>> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("direct_messages")
    .select("sender_id, recipient_id, content, attachment_filename, created_at")
    .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const previews: Record<string, DmPreview> = {};
  for (const m of data ?? []) {
    const peerId = (m.sender_id === meId ? m.recipient_id : m.sender_id) as string;
    if (previews[peerId]) continue;
    previews[peerId] = {
      peer_id: peerId,
      content: m.content as string,
      created_at: m.created_at as string,
      sender_id: m.sender_id as string,
      attachment_filename: m.attachment_filename as string | null,
    };
  }
  return previews;
}

// Opening a conversation clears its badge (dm_reads).
export async function saveConversationRead(meId: string, peerId: string) {
  const supabase = await client();
  await supabase.from("dm_reads").upsert({ user_id: meId, peer_id: peerId, last_read_at: new Date().toISOString() });
}

// "Đã xem" on the peer's side: every still-unread message from them.
export async function saveDirectMessagesRead(meId: string, peerId: string) {
  const supabase = await client();
  await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", peerId)
    .eq("recipient_id", meId)
    .is("read_at", null);
}

// A room you were just added to stops showing as new.
export async function saveRoomSeen(meId: string, channelId: string) {
  const supabase = await client();
  await supabase
    .from("meeting_channel_members")
    .update({ seen_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("profile_id", meId)
    .is("seen_at", null);
}
