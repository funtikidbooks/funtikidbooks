"use server";

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
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

  if (error || !data) throw new Error("Không thể gửi tin nhắn — bạn cần tham gia phòng trước.");

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

export async function deleteMeetingMessage(messageId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("meeting_messages")
    .delete()
    .eq("id", messageId)
    .eq("sender_id", user.id);
  if (error) throw new Error("Không thể xoá tin nhắn");
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
