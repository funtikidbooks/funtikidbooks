"use server";

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { MeetingChannelPublic, MeetingChannelRead, MeetingMessage, MeetingReaction } from "@/lib/types";

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
  const [{ data: channels }, { data: memberships }] = await Promise.all([
    supabase
      .from("meeting_channels")
      .select("id, name, icon, is_general, created_by, created_at, password_hash")
      .order("is_general", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase.from("meeting_channel_members").select("channel_id").eq("profile_id", user.id),
  ]);

  const joinedIds = new Set((memberships ?? []).map((m) => m.channel_id as string));

  return (channels ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    icon: c.icon as string,
    is_general: c.is_general as boolean,
    created_by: c.created_by as string | null,
    created_at: c.created_at as string,
    has_password: !!c.password_hash,
    joined: (c.is_general as boolean) || joinedIds.has(c.id as string),
  }));
}

export async function createChannel(name: string, password: string, icon: string) {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Thiếu tên phòng");

  const { data, error } = await supabase
    .from("meeting_channels")
    .insert({
      name: trimmed,
      icon: icon.trim() || "💬",
      is_general: false,
      password_hash: password.trim() ? hashPassword(password.trim()) : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("Không thể tạo phòng");

  await supabase.from("meeting_channel_members").insert({ channel_id: data.id, profile_id: user.id });

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

  // meeting_messages cascade-deletes with the channel at the DB level, but
  // that never touches Supabase Storage — clean up every attachment first
  // or they'd sit there orphaned forever.
  const { data: messagesWithFiles } = await supabase
    .from("meeting_messages")
    .select("attachment_url")
    .eq("channel_id", channelId)
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

  notifyChannelMembers(supabase, channelId, user.id, trimmed, !!attachment).catch(() => {});

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
  await Promise.all(
    recipientIds
      .filter((id) => id !== senderId)
      .map((id) =>
        sendPushToUser(id, {
          title: `#${channel.name} · ${sender?.display_name ?? "Tin nhắn mới"}`,
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
