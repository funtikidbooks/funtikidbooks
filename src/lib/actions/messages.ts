"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { pushDirectMessage } from "@/lib/chatPush";
import type { DirectMessage, DirectMessageReaction, DirectMessageSearchResult } from "@/lib/types";

// One "scroll up for more" page older than whatever's currently loaded —
// the DM counterpart to getOlderMeetingMessages in meetings.ts (see its own
// comment). Reactions for this specific batch come along too, or they'd
// render with none until a reload.
export async function getOlderDirectMessages(
  otherUserId: string,
  beforeCreatedAt: string,
): Promise<{ messages: DirectMessage[]; reactions: DirectMessageReaction[] }> {
  const { supabase, user } = await requireUser();
  const orFilter = `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`;

  const { data: msgData } = await supabase
    .from("direct_messages")
    .select("*")
    .or(orFilter)
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(40);
  const messages = ((msgData ?? []) as DirectMessage[]).reverse();
  if (messages.length === 0) return { messages: [], reactions: [] };

  const { data: rxData } = await supabase
    .from("direct_message_reactions")
    .select("message_id, profile_id, emoji, created_at")
    .in(
      "message_id",
      messages.map((m) => m.id),
    );
  return { messages, reactions: (rxData ?? []) as DirectMessageReaction[] };
}

export async function addDirectReaction(messageId: string, emoji: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("direct_message_reactions")
    .upsert({ message_id: messageId, profile_id: user.id, emoji }, { onConflict: "message_id,profile_id,emoji" });
  if (error) throw new Error("Không thể thả cảm xúc");

  after(async () => {
    const { data: message } = await supabase.from("direct_messages").select("sender_id").eq("id", messageId).maybeSingle();
    if (!message || message.sender_id === user.id) return;
    const { data: reactor } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await sendPushToUser(message.sender_id as string, {
      title: reactor?.display_name ?? "Ai đó",
      body: `Đã thả ${emoji} vào tin nhắn của bạn`,
      senderId: user.id,
      url: `/workspace/hop?dm=${user.id}`,
      tag: `funti-dm-reaction-${messageId}`,
    }).catch(() => {});
  });
}

export async function removeDirectReaction(messageId: string, emoji: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("direct_message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("profile_id", user.id)
    .eq("emoji", emoji);
}

// Stamps read_at on every unread message the peer sent me — the recipient
// is the only one allowed to set this (see the "recipient can mark messages
// read" RLS policy), so the sender's own open window can show a Messenger-
// style "Đã xem" under the last message that's actually been seen. Safe to
// call anytime the conversation is open/updates: the .is("read_at", null)
// filter makes it a no-op once everything's already marked.
export async function markDirectMessagesRead(peerId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", peerId)
    .eq("recipient_id", user.id)
    .is("read_at", null);
}

export async function searchDirectMessages(query: string): Promise<DirectMessageSearchResult[]> {
  const { supabase, user } = await requireUser();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data } = await supabase
    .from("direct_messages")
    .select("*")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .ilike("content", `%${trimmed}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((m) => ({
    ...(m as DirectMessage),
    peer_id: (m.sender_id === user.id ? m.recipient_id : m.sender_id) as string,
  }));
}


// Forwards a message someone already has on screen into a 1:1 conversation
// — same idea as forwardMeetingMessage in meetings.ts, reusing the existing
// attachment URL instead of re-uploading the file.
export async function forwardDirectMessage(
  recipientId: string,
  content: string,
  attachment: { url: string; filename: string | null; mime: string | null; size: number | null } | null,
) {
  const { supabase, user } = await requireUser();
  const trimmed = content.trim();
  if (!trimmed && !attachment) return null;

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: user.id,
      recipient_id: recipientId,
      content: trimmed,
      attachment_url: attachment?.url ?? null,
      attachment_filename: attachment?.filename ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể chuyển tiếp tin nhắn");

  const sent = data as DirectMessage;
  after(() => pushDirectMessage(sent).catch(() => {}));

  return sent;
}

// One unread count per teammate who has sent me a message since I last read
// that conversation — powers the badge shown next to their name in the
// workspace sidebar.
export async function getUnreadCounts(): Promise<Record<string, number>> {
  const { supabase, user } = await requireUser();
  const [{ data: reads }, { data: incoming }] = await Promise.all([
    supabase.from("dm_reads").select("peer_id, last_read_at").eq("user_id", user.id),
    supabase.from("direct_messages").select("sender_id, created_at").eq("recipient_id", user.id),
  ]);

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

export type DmPreview = {
  peer_id: string;
  content: string;
  created_at: string;
  sender_id: string;
  attachment_filename: string | null;
};

// One row per conversation partner — whichever message (sent or received)
// is most recent — for the "Riêng" rail's Zalo-style preview line and
// most-recent-first ordering. That rail used to only ever sort by incoming
// messages (recentSenderOrder in ChatManager) and show a person's role/
// online status instead of what was actually said, so a conversation you'd
// just messaged (but hadn't gotten a reply to yet) sat wherever it already
// was instead of bubbling up, and there was no way to tell what any
// conversation was about without opening it. Capped at the 500 most recent
// messages across every conversation rather than queried per-peer — plenty
// to cover every conversation with any real recent activity, and one query
// instead of one per teammate.
export async function getRecentDmPreviews(): Promise<Record<string, DmPreview>> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("direct_messages")
    .select("sender_id, recipient_id, content, attachment_filename, created_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(500);

  const previews: Record<string, DmPreview> = {};
  for (const m of data ?? []) {
    const peerId = (m.sender_id === user.id ? m.recipient_id : m.sender_id) as string;
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

export async function markConversationRead(peerId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("dm_reads")
    .upsert({ user_id: user.id, peer_id: peerId, last_read_at: new Date().toISOString() });
}
