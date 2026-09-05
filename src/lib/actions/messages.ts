"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { DirectMessage, DirectMessageReaction, DirectMessageSearchResult } from "@/lib/types";

const DM_PAGE_SIZE = 200;

// `afterCreatedAt` (exclusive) lets a caller that already has a page of
// messages ask for only what's new since the last one it holds, instead of
// re-fetching the whole capped 200 every time — see DirectConversation's
// resync().
//
// The *initial* fetch (no afterCreatedAt) has to sort descending and
// re-reverse rather than just sorting ascending with the same limit — a
// plain ascending-order LIMIT 200 returns the OLDEST 200 messages in the
// conversation, not the newest. That's invisible for any conversation still
// under 200 messages total (every row comes back either way), but the
// busiest conversation in this app is already most of the way there — once
// it crosses 200, resync()'s delta fetch anchors off "the newest message
// already loaded", which would have been permanently stuck 200-messages-old
// with the wrong-end fetch, silently hiding every message since.
export async function getConversation(otherUserId: string, afterCreatedAt?: string): Promise<DirectMessage[]> {
  const { supabase, user } = await requireUser();
  const orFilter = `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`;

  if (afterCreatedAt) {
    const { data } = await supabase
      .from("direct_messages")
      .select("*")
      .or(orFilter)
      .gt("created_at", afterCreatedAt)
      .order("created_at", { ascending: true })
      .limit(300);
    return (data ?? []) as DirectMessage[];
  }

  const { data } = await supabase
    .from("direct_messages")
    .select("*")
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(DM_PAGE_SIZE);
  return ((data ?? []) as DirectMessage[]).reverse();
}

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

// Every reaction in this conversation created after `afterCreatedAt` (or all
// of them, for the initial load) — same delta-fetch shape as
// getReactionsSince() in meetings.ts, and for the same reason: a reaction
// added to a message already on screen needs to be caught up on too, not
// just reactions on brand-new messages.
export async function getDirectReactionsSince(otherUserId: string, afterCreatedAt?: string): Promise<DirectMessageReaction[]> {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("direct_message_reactions")
    .select("message_id, profile_id, emoji, created_at, direct_messages!inner(sender_id, recipient_id)")
    .or(
      `and(direct_messages.sender_id.eq.${user.id},direct_messages.recipient_id.eq.${otherUserId}),and(direct_messages.sender_id.eq.${otherUserId},direct_messages.recipient_id.eq.${user.id})`,
    )
    .order("created_at", { ascending: true })
    .limit(500);
  if (afterCreatedAt) query = query.gt("created_at", afterCreatedAt);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    message_id: r.message_id as string,
    profile_id: r.profile_id as string,
    emoji: r.emoji as string,
    created_at: r.created_at as string,
  }));
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

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const MAX_SIZE = 50 * 1024 * 1024;

// The file itself is uploaded to Supabase Storage client-side (see
// DirectConversation's attemptSend) rather than routed through this action
// as FormData — Vercel caps a serverless function's own request body at
// 4.5MB regardless of Next.js's own (much larger) bodySizeLimit config, a
// platform limit no app-level setting can raise. A staff illustration file
// clears that in one photo. This action only ever receives the already-
// uploaded object's metadata, which is JSON-small no matter the file size.
// The type/size checks below are still worth keeping as a sanity guard even
// though they now trust client-reported metadata instead of the real
// bytes — this is an internal staff tool, not a public upload endpoint.
export async function sendDirectMessage(
  recipientId: string,
  content: string,
  attachment?: { url: string; filename: string; mime: string; size: number } | null,
) {
  const { supabase, user } = await requireUser();
  const trimmed = content.trim();

  if (attachment) {
    if (!ALLOWED_TYPES.has(attachment.mime)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP hoặc PDF");
    if (attachment.size > MAX_SIZE) throw new Error("Tệp vượt quá 50MB");
  }

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

  if (error || !data) {
    if (attachment) {
      const path = storagePathFromPublicUrl(attachment.url, "task-attachments");
      if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
    }
    throw new Error("Không thể gửi tin nhắn");
  }

  // Scheduled with after() rather than fired-and-forgotten inline — on
  // Vercel's serverless runtime, a plain un-awaited promise can get cut off
  // the moment the response is sent, which showed up to staff as push
  // notifications arriving late or not at all. after() guarantees this runs
  // to completion without delaying the response itself.
  after(async () => {
    const { data: senderProfile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await sendPushToUser(recipientId, {
      title: senderProfile?.display_name ?? "Tin nhắn mới",
      body: trimmed || (attachment ? "📎 Đã gửi một tệp đính kèm" : ""),
      senderId: user.id,
      url: `/workspace/hop?dm=${user.id}`,
    }).catch(() => {});
  });

  return data as DirectMessage;
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

  after(async () => {
    const { data: senderProfile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await sendPushToUser(recipientId, {
      title: senderProfile?.display_name ?? "Tin nhắn mới",
      body: trimmed || (attachment ? "📎 Đã gửi một tệp đính kèm" : ""),
      senderId: user.id,
      url: `/workspace/hop?dm=${user.id}`,
    }).catch(() => {});
  });

  return data as DirectMessage;
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

export async function markConversationRead(peerId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("dm_reads")
    .upsert({ user_id: user.id, peer_id: peerId, last_read_at: new Date().toISOString() });
}
