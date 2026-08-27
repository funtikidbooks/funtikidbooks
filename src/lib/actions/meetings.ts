"use server";

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { MeetingChannel, MeetingChannelPublic, MeetingChannelRead, MeetingMessage, MeetingReaction, MeetingSearchResult } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function listChannels(): Promise<MeetingChannelPublic[]> {
  const { supabase, user } = await requireUser();
  const [channelsResult, { data: memberships }] = await Promise.all([
    supabase
      .from("meeting_channels")
      .select("id, name, icon, is_general, created_by, created_at, password_hash, parent_channel_id")
      .order("is_general", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase.from("meeting_channel_members").select("channel_id").eq("profile_id", user.id),
  ]);

  // parent_channel_id might not exist yet if supabase/schema.sql's sub-room
  // migration hasn't been re-run in Supabase — fall back to the same query
  // without it so the whole room list doesn't break in the meantime.
  let channels: Array<Record<string, unknown>> | null = channelsResult.data;
  if (channelsResult.error) {
    const fallback = await supabase
      .from("meeting_channels")
      .select("id, name, icon, is_general, created_by, created_at, password_hash")
      .order("is_general", { ascending: false })
      .order("created_at", { ascending: true });
    channels = fallback.data;
  }

  const joinedIds = new Set((memberships ?? []).map((m) => m.channel_id as string));

  return (channels ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    icon: c.icon as string,
    is_general: c.is_general as boolean,
    created_by: c.created_by as string | null,
    created_at: c.created_at as string,
    parent_channel_id: (c.parent_channel_id as string | null | undefined) ?? null,
    has_password: !!c.password_hash,
    joined: (c.is_general as boolean) || joinedIds.has(c.id as string),
  }));
}

export async function createChannel(name: string, password: string, icon: string, parentChannelId?: string | null) {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Thiếu tên phòng");

  // parent_channel_id is only ever included when actually nesting under a
  // room, so a director who hasn't re-run supabase/schema.sql yet (adding
  // that column) can still create ordinary top-level rooms without erroring
  // — only the sub-room feature itself needs that migration.
  const insertRow: Partial<MeetingChannel> & { name: string; icon: string; is_general: boolean; created_by: string } = {
    name: trimmed,
    icon: icon.trim() || "💬",
    is_general: false,
    password_hash: password.trim() ? hashPassword(password.trim()) : null,
    created_by: user.id,
  };
  if (parentChannelId) insertRow.parent_channel_id = parentChannelId;

  const { data, error } = await supabase.from("meeting_channels").insert(insertRow).select("id").single();

  if (error || !data) throw new Error("Không thể tạo phòng");

  await supabase.from("meeting_channel_members").insert({ channel_id: data.id, profile_id: user.id });

  // "Tự động giống hệt phòng cha" — copy every current member of the parent
  // room into this sub-room too, so nobody has to be re-invited by hand.
  // A one-time copy, not a live link: someone who joins the parent later
  // isn't retroactively added to sub-rooms created before they joined.
  if (parentChannelId) {
    const { data: parentMembers } = await supabase
      .from("meeting_channel_members")
      .select("profile_id")
      .eq("channel_id", parentChannelId);
    const others = (parentMembers ?? [])
      .map((m) => m.profile_id as string)
      .filter((id) => id !== user.id);
    if (others.length > 0) {
      await supabase
        .from("meeting_channel_members")
        .upsert(
          others.map((profile_id) => ({ channel_id: data.id, profile_id })),
          { onConflict: "channel_id,profile_id" },
        );
    }
  }

  revalidatePath("/workspace/hop");
  return data.id as string;
}

export async function joinChannel(channelId: string, password: string) {
  const { supabase, user } = await requireUser();

  const { data: channel } = await supabase
    .from("meeting_channels")
    .select("id, is_general, password_hash")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel) throw new Error("Không tìm thấy phòng");

  if (!channel.is_general && channel.password_hash) {
    if (!verifyPassword(password.trim(), channel.password_hash as string)) {
      throw new Error("Sai mật khẩu");
    }
  }

  const { error } = await supabase
    .from("meeting_channel_members")
    .upsert({ channel_id: channelId, profile_id: user.id }, { onConflict: "channel_id,profile_id" });
  if (error) throw new Error("Không thể tham gia phòng");

  revalidatePath("/workspace/hop");
}

export async function leaveChannel(channelId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("meeting_channel_members").delete().eq("channel_id", channelId).eq("profile_id", user.id);
  revalidatePath("/workspace/hop");
}

export async function deleteChannel(channelId: string) {
  const { supabase } = await requireUser();

  // A room's own sub-rooms cascade-delete with it at the DB level (see
  // parent_channel_id's "on delete cascade"), so their messages' attachments
  // need cleaning up here too, or they'd sit there orphaned forever — the
  // cascade never touches Supabase Storage either way.
  const { data: childChannels } = await supabase.from("meeting_channels").select("id").eq("parent_channel_id", channelId);
  const channelIds = [channelId, ...(childChannels ?? []).map((c) => c.id as string)];

  const { data: messagesWithFiles } = await supabase
    .from("meeting_messages")
    .select("attachment_url")
    .in("channel_id", channelIds)
    .not("attachment_url", "is", null);
  const paths = (messagesWithFiles ?? [])
    .map((m) => storagePathFromPublicUrl(m.attachment_url as string, "task-attachments"))
    .filter((p): p is string => !!p);
  if (paths.length > 0) await supabase.storage.from("task-attachments").remove(paths).catch(() => {});

  await supabase.from("meeting_channels").delete().eq("id", channelId);
  revalidatePath("/workspace/hop");
}

export async function getMeetingMessages(channelId: string): Promise<MeetingMessage[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(300);
  return (data ?? []) as MeetingMessage[];
}

// Searches message content across every room the caller is in (#Chung plus
// any project/password room they've joined) rather than just whichever
// room happens to be open — finding every time someone mentioned "Phúc" is
// more useful across the whole workspace than one room at a time.
export async function searchMeetingMessages(query: string): Promise<MeetingSearchResult[]> {
  const { supabase, user } = await requireUser();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const [{ data: memberChannels }, { data: generalChannels }] = await Promise.all([
    supabase.from("meeting_channel_members").select("channel_id").eq("profile_id", user.id),
    supabase.from("meeting_channels").select("id").eq("is_general", true),
  ]);
  const channelIds = Array.from(
    new Set([
      ...(memberChannels ?? []).map((m) => m.channel_id as string),
      ...(generalChannels ?? []).map((c) => c.id as string),
    ]),
  );
  if (channelIds.length === 0) return [];

  const [{ data: messages }, { data: channels }] = await Promise.all([
    supabase
      .from("meeting_messages")
      .select("*")
      .in("channel_id", channelIds)
      .eq("is_recalled", false)
      .ilike("content", `%${trimmed}%`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("meeting_channels").select("id, name, icon").in("id", channelIds),
  ]);

  const channelById = new Map((channels ?? []).map((c) => [c.id as string, c]));
  return (messages ?? []).map((m) => ({
    ...(m as MeetingMessage),
    channel_name: (channelById.get(m.channel_id as string)?.name as string) ?? "",
    channel_icon: (channelById.get(m.channel_id as string)?.icon as string) ?? "💬",
  }));
}

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const MAX_SIZE = 20 * 1024 * 1024;

export async function sendMeetingMessage(
  channelId: string,
  content: string,
  formData?: FormData,
  replyToMessageId?: string | null,
) {
  const { supabase, user } = await requireUser();
  const trimmed = content.trim();

  let attachment: { url: string; filename: string; mime: string; size: number } | null = null;
  const file = formData?.get("file");
  if (file instanceof File) {
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP hoặc PDF");
    if (file.size > MAX_SIZE) throw new Error("Tệp vượt quá 20MB");

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const storagePath = `meetings/${channelId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) throw new Error("Không thể tải tệp lên");

    const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);
    attachment = { url: publicUrlData.publicUrl, filename: file.name, mime: file.type, size: file.size };
  }

  if (!trimmed && !attachment) return null;

  // reply_to_message_id is only included when actually replying, so a
  // director who hasn't re-run supabase/schema.sql yet (adding that
  // column) can still send ordinary messages without erroring — only the
  // reply feature itself needs that migration.
  const insertRow: Partial<MeetingMessage> & { channel_id: string; sender_id: string } = {
    channel_id: channelId,
    sender_id: user.id,
    content: trimmed,
    attachment_url: attachment?.url ?? null,
    attachment_filename: attachment?.filename ?? null,
    attachment_mime: attachment?.mime ?? null,
    attachment_size: attachment?.size ?? null,
  };
  if (replyToMessageId) insertRow.reply_to_message_id = replyToMessageId;

  const { data, error } = await supabase.from("meeting_messages").insert(insertRow).select("*").single();

  if (error || !data) {
    // The file already made it to storage — don't leave it orphaned just
    // because the row it was meant to belong to never got created.
    if (attachment) {
      const path = storagePathFromPublicUrl(attachment.url, "task-attachments");
      if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
    }
    throw new Error("Không thể gửi tin nhắn — bạn cần tham gia phòng trước.");
  }

  // Scheduled with after() rather than fired-and-forgotten inline — on
  // Vercel's serverless runtime, a plain un-awaited promise can get cut off
  // the moment the response is sent, which showed up to staff as push
  // notifications arriving late or not at all. after() guarantees this runs
  // to completion without delaying the response itself.
  after(() => notifyChannelMembers(supabase, channelId, user.id, trimmed, !!attachment).catch(() => {}));

  return data as MeetingMessage;
}

// Fire-and-forget: pushes a real OS notification to everyone who should
// hear about this message — every staff member for the always-open
// "Chung" channel, or just that room's members for a private one — the
// same way sendDirectMessage() already notifies a DM recipient.
async function notifyChannelMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  channelId: string,
  senderId: string,
  content: string,
  hasAttachment: boolean,
) {
  const [{ data: channel }, { data: sender }] = await Promise.all([
    supabase.from("meeting_channels").select("name, is_general").eq("id", channelId).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", senderId).maybeSingle(),
  ]);
  if (!channel) return;

  let recipientIds: string[];
  if (channel.is_general) {
    const { data: everyone } = await supabase.from("profiles").select("id");
    recipientIds = (everyone ?? []).map((p) => p.id as string);
  } else {
    const { data: members } = await supabase.from("meeting_channel_members").select("profile_id").eq("channel_id", channelId);
    recipientIds = (members ?? []).map((m) => m.profile_id as string);
  }

  const body = content || (hasAttachment ? "📎 Đã gửi một tệp đính kèm" : "");
  // "@all" makes the push impossible to miss — everyone in the room already
  // gets notified for every message, this just makes clear the message was
  // specifically meant for all of them.
  const taggedAll = /(^|\s)@all\b/.test(content);
  const title = taggedAll
    ? `📢 #${channel.name} · ${sender?.display_name ?? "Ai đó"} đã nhắc tất cả mọi người`
    : `#${channel.name} · ${sender?.display_name ?? "Tin nhắn mới"}`;
  await Promise.all(
    recipientIds
      .filter((id) => id !== senderId)
      .map((id) =>
        sendPushToUser(id, {
          title,
          body,
          senderId,
          url: "/workspace/hop",
          tag: `funti-channel-${channelId}`,
        }).catch(() => {}),
      ),
  );
}

// "Thu hồi" keeps the row so an "Đã thu hồi" placeholder still shows where
// the message was, instead of it silently vanishing for everyone else —
// but the attachment file itself (if any) is actually deleted from storage,
// not just unlinked, so recalling really does free up the space.
export async function recallMeetingMessage(messageId: string) {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("meeting_messages")
    .select("attachment_url")
    .eq("id", messageId)
    .eq("sender_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("meeting_messages")
    .update({
      is_recalled: true,
      content: "",
      attachment_url: null,
      attachment_filename: null,
      attachment_mime: null,
      attachment_size: null,
    })
    .eq("id", messageId)
    .eq("sender_id", user.id);
  if (error) throw new Error("Không thể thu hồi tin nhắn");

  if (existing?.attachment_url) {
    const path = storagePathFromPublicUrl(existing.attachment_url as string, "task-attachments");
    if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
  }
}

export async function getReactions(messageIds: string[]): Promise<MeetingReaction[]> {
  const { supabase } = await requireUser();
  if (messageIds.length === 0) return [];
  const { data } = await supabase.from("meeting_message_reactions").select("*").in("message_id", messageIds);
  return (data ?? []) as MeetingReaction[];
}

export async function addReaction(messageId: string, emoji: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("meeting_message_reactions")
    .upsert({ message_id: messageId, profile_id: user.id, emoji }, { onConflict: "message_id,profile_id,emoji" });
  if (error) throw new Error("Không thể thả cảm xúc");
}

export async function removeReaction(messageId: string, emoji: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("meeting_message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("profile_id", user.id)
    .eq("emoji", emoji);
}

// Server-computed source of truth for the global "Riêng"/tab-badge unread
// counts (ChatManager.tsx) — the live realtime subscription that normally
// keeps those counts current can silently miss messages sent while the
// websocket was disconnected (phone screen locked, tab backgrounded...),
// which showed up to staff as "only see the notification after reloading".
// Called on reconnect/tab-focus to catch up on whatever was missed.
export async function getUnreadMeetingCounts(): Promise<Record<string, number>> {
  const { supabase, user } = await requireUser();

  const [{ data: memberChannels }, { data: generalChannels }] = await Promise.all([
    supabase.from("meeting_channel_members").select("channel_id").eq("profile_id", user.id),
    supabase.from("meeting_channels").select("id").eq("is_general", true),
  ]);
  const channelIds = Array.from(
    new Set([
      ...(memberChannels ?? []).map((m) => m.channel_id as string),
      ...(generalChannels ?? []).map((c) => c.id as string),
    ]),
  );
  if (channelIds.length === 0) return {};

  const [{ data: reads }, { data: messages }] = await Promise.all([
    supabase
      .from("meeting_channel_reads")
      .select("channel_id, last_read_message_id")
      .eq("profile_id", user.id)
      .in("channel_id", channelIds),
    supabase
      .from("meeting_messages")
      .select("id, channel_id, sender_id, created_at")
      .in("channel_id", channelIds)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const lastReadIdByChannel = new Map(
    (reads ?? []).map((r) => [r.channel_id as string, r.last_read_message_id as string | null]),
  );
  const msgById = new Map((messages ?? []).map((m) => [m.id as string, m]));

  const counts: Record<string, number> = {};
  for (const m of messages ?? []) {
    if (m.sender_id === user.id) continue;
    const lastReadId = lastReadIdByChannel.get(m.channel_id as string);
    const lastReadMsg = lastReadId ? msgById.get(lastReadId as string) : undefined;
    if (!lastReadMsg || new Date(m.created_at as string) > new Date(lastReadMsg.created_at as string)) {
      counts[m.channel_id as string] = (counts[m.channel_id as string] ?? 0) + 1;
    }
  }
  return counts;
}

export async function getChannelReads(channelId: string): Promise<MeetingChannelRead[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("meeting_channel_reads").select("*").eq("channel_id", channelId);
  return (data ?? []) as MeetingChannelRead[];
}

export async function markChannelRead(channelId: string, lastMessageId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("meeting_channel_reads").upsert(
    {
      channel_id: channelId,
      profile_id: user.id,
      last_read_message_id: lastMessageId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,profile_id" },
  );
}
