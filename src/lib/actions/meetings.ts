"use server";

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { MeetingChannel, MeetingChannelPublic, MeetingChannelRead, MeetingMessage, MeetingReaction, MeetingSearchResult, Profile } from "@/lib/types";

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
  const [channelsResult, membershipsResult] = await Promise.all([
    supabase
      .from("meeting_channels")
      .select("id, name, icon, is_general, created_by, created_at, password_hash, parent_channel_id")
      .order("is_general", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase.from("meeting_channel_members").select("channel_id, seen_at").eq("profile_id", user.id),
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

  // seen_at might not exist yet either (same reasoning) — fall back to a
  // plain membership list, which just means "is_new" reads true for every
  // joined room until the migration is re-run, a harmless cosmetic default.
  let memberships: Array<{ channel_id: string; seen_at: string | null }> | null = membershipsResult.data as
    | Array<{ channel_id: string; seen_at: string | null }>
    | null;
  if (membershipsResult.error) {
    const fallback = await supabase.from("meeting_channel_members").select("channel_id").eq("profile_id", user.id);
    memberships = (fallback.data ?? []).map((m) => ({ channel_id: m.channel_id as string, seen_at: null }));
  }

  const seenAtByChannelId = new Map((memberships ?? []).map((m) => [m.channel_id, m.seen_at]));

  return (channels ?? []).map((c) => {
    const isGeneral = c.is_general as boolean;
    const joined = isGeneral || seenAtByChannelId.has(c.id as string);
    return {
      id: c.id as string,
      name: c.name as string,
      icon: c.icon as string,
      is_general: isGeneral,
      created_by: c.created_by as string | null,
      created_at: c.created_at as string,
      parent_channel_id: (c.parent_channel_id as string | null | undefined) ?? null,
      has_password: !!c.password_hash,
      joined,
      is_new: !isGeneral && joined && seenAtByChannelId.get(c.id as string) == null,
    };
  });
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

// Clears the sidebar's "you were just added to this room" dot the first
// time the member actually opens it. No revalidatePath — purely cosmetic,
// the caller already updates its own local state optimistically.
export async function markRoomSeen(channelId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("meeting_channel_members")
    .update({ seen_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("profile_id", user.id)
    .is("seen_at", null);
}

export async function leaveChannel(channelId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("meeting_channel_members").delete().eq("channel_id", channelId).eq("profile_id", user.id);
  revalidatePath("/workspace/hop");
}

// Lets the room's creator kick someone out (the "mời ra" swipe action). The
// "staff or room owner can remove memberships" RLS policy is what actually
// enforces "caller must be that member, a director, or this room's creator"
// — a non-owner calling this just silently affects zero rows.
export async function removeChannelMember(channelId: string, profileId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("meeting_channel_members").delete().eq("channel_id", channelId).eq("profile_id", profileId);
  if (error) throw new Error("Không thể mời thành viên ra khỏi phòng");
  revalidatePath("/workspace/hop");
}

export async function listChannelMembers(channelId: string): Promise<Profile[]> {
  const { supabase } = await requireUser();
  const { data: memberRows } = await supabase.from("meeting_channel_members").select("profile_id").eq("channel_id", channelId);
  const ids = (memberRows ?? []).map((m) => m.profile_id as string);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
    .in("id", ids)
    .order("display_name", { ascending: true });
  return (profiles ?? []) as Profile[];
}

// Lets an existing member add a teammate directly — skips that person
// having to browse to the room and (if it's locked) know the password.
// The "members can add teammates to the channel" RLS policy is what
// actually enforces "caller must already be a member"; this just surfaces
// a clean error if that's not the case.
export async function addChannelMember(channelId: string, profileId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("meeting_channel_members")
    .upsert({ channel_id: channelId, profile_id: profileId }, { onConflict: "channel_id,profile_id" });
  if (error) throw new Error("Không thể thêm thành viên — bạn cần tham gia phòng này trước.");
  revalidatePath("/workspace/hop");
}

// Rename and/or set/change/remove the room password. The "creator or
// director can update channels" RLS policy on meeting_channels is the real
// gate here (the UI only ever shows this to the creator, matching how
// "Xoá phòng" is already gated) — this just turns a plain-text password
// into a hash before it touches the row, same as createChannel().
export async function updateChannel(channelId: string, input: { name?: string; password?: string | null }) {
  const { supabase } = await requireUser();
  const patch: { name?: string; password_hash?: string | null } = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Thiếu tên phòng");
    patch.name = trimmed;
  }
  if (input.password !== undefined) {
    patch.password_hash = input.password && input.password.trim() ? hashPassword(input.password.trim()) : null;
  }
  const { error } = await supabase.from("meeting_channels").update(patch).eq("id", channelId);
  if (error) throw new Error("Không thể cập nhật phòng");
  revalidatePath("/workspace/hop");
}

const DM_TAB_LABEL_KEY = "dm_tab";
const DEFAULT_DM_TAB_LABEL = "Riêng";

// The "Riêng" tab has no meeting_channels row of its own to rename, so its
// label lives in workspace_room_labels instead — falls back to the default
// Vietnamese label until a director/PM ever renames it (or if the row is
// missing because supabase/schema.sql hasn't been re-run yet).
export async function getDmTabLabel(): Promise<string> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("workspace_room_labels").select("label").eq("key", DM_TAB_LABEL_KEY).maybeSingle();
  return (data?.label as string | undefined)?.trim() || DEFAULT_DM_TAB_LABEL;
}

export async function setDmTabLabel(label: string) {
  const { supabase } = await requireUser();
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Thiếu tên tab");
  const { error } = await supabase
    .from("workspace_room_labels")
    .upsert({ key: DM_TAB_LABEL_KEY, label: trimmed, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error("Không thể đổi tên — chỉ giám đốc hoặc Project Manager mới có quyền này.");
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

// `afterCreatedAt` (exclusive) lets a caller that already has a page of
// messages ask for only what's new since the last one it holds, instead of
// re-fetching the whole capped 300 every time — see MeetingHub's resync().
export async function getMeetingMessages(channelId: string, afterCreatedAt?: string): Promise<MeetingMessage[]> {
  const { supabase } = await requireUser();
  let query = supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (afterCreatedAt) query = query.gt("created_at", afterCreatedAt);
  const { data } = await query;
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

// Forwards a message someone already has on screen to another room they're
// a member of — takes the content/attachment fields straight from that
// message instead of re-uploading, since the attachment is already sitting
// in storage under its own URL.
export async function forwardMeetingMessage(
  targetChannelId: string,
  content: string,
  attachment: { url: string; filename: string | null; mime: string | null; size: number | null } | null,
) {
  const { supabase, user } = await requireUser();
  const trimmed = content.trim();
  if (!trimmed && !attachment) return null;

  const { data, error } = await supabase
    .from("meeting_messages")
    .insert({
      channel_id: targetChannelId,
      sender_id: user.id,
      content: trimmed,
      attachment_url: attachment?.url ?? null,
      attachment_filename: attachment?.filename ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể chuyển tiếp — bạn cần tham gia phòng trước.");

  after(() => notifyChannelMembers(supabase, targetChannelId, user.id, trimmed, !!attachment).catch(() => {}));

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
          url: `/workspace/hop?room=${channelId}`,
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

// Any room member can pin/unpin any message — collaborative like reactions,
// not restricted to the sender the way recall is. Returns the new pinned
// state so the caller doesn't need a separate read to know it stuck.
export async function togglePinMessage(messageId: string, pin: boolean) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("meeting_messages")
    .update(pin ? { pinned_at: new Date().toISOString(), pinned_by: user.id } : { pinned_at: null, pinned_by: null })
    .eq("id", messageId);
  if (error) throw new Error("Không thể ghim tin nhắn — bạn cần tham gia phòng trước.");
}

// Pulls pinned messages straight from the table rather than filtering
// whatever's currently loaded in the message list — the list is capped/
// paginated, so an old pinned message can easily have scrolled out of what
// the client already has in memory.
export async function getPinnedMessages(channelId: string): Promise<MeetingMessage[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false });
  if (error || !data) return [];
  return data as MeetingMessage[];
}

// Every reaction in the channel created after `afterCreatedAt` (or all of
// them, for the initial load of a room) — not scoped to a specific set of
// message ids, so a reaction added to a message the caller already had
// loaded (not just a brand new message) still gets picked up. That gap is
// exactly what made a reaction show up as a push notification but never as
// an actual heart on the message: the live realtime event for it can be
// missed the same way a message INSERT can (websocket drop, tab
// backgrounded...), and the old resync only re-fetched reactions for
// messages it had *just* fetched, never for ones already on screen.
export async function getReactionsSince(channelId: string, afterCreatedAt?: string): Promise<MeetingReaction[]> {
  const { supabase } = await requireUser();
  let query = supabase
    .from("meeting_message_reactions")
    .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
    .eq("meeting_messages.channel_id", channelId)
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

export async function addReaction(messageId: string, emoji: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("meeting_message_reactions")
    .upsert({ message_id: messageId, profile_id: user.id, emoji }, { onConflict: "message_id,profile_id,emoji" });
  if (error) throw new Error("Không thể thả cảm xúc");

  // Same after()-wrapped fire-and-forget push as sendMeetingMessage — see
  // its comment for why a plain un-awaited promise silently gets cut off on
  // Vercel's serverless runtime.
  after(() => notifyReaction(supabase, messageId, user.id, emoji).catch(() => {}));
}

async function notifyReaction(supabase: Awaited<ReturnType<typeof createClient>>, messageId: string, reactorId: string, emoji: string) {
  const { data: message } = await supabase.from("meeting_messages").select("sender_id, channel_id").eq("id", messageId).maybeSingle();
  if (!message || message.sender_id === reactorId) return;

  const [{ data: reactor }, { data: channel }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", reactorId).maybeSingle(),
    supabase.from("meeting_channels").select("name").eq("id", message.channel_id as string).maybeSingle(),
  ]);
  const reactorName = reactor?.display_name ?? "Ai đó";

  await sendPushToUser(message.sender_id as string, {
    title: `#${channel?.name ?? ""} · ${reactorName}`,
    body: `Đã thả ${emoji} vào tin nhắn của bạn`,
    senderId: reactorId,
    url: `/workspace/hop?room=${message.channel_id}`,
    tag: `funti-reaction-${messageId}`,
  }).catch(() => {});
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
