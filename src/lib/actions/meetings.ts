"use server";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient, requireUser } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { pushMeetingMessage } from "@/lib/chatPush";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { MeetingChannel, MeetingChannelPublic, MeetingChannelRead, MeetingMessage, MeetingReaction, MeetingSearchResult, Profile } from "@/lib/types";

// How many of a room's most recent messages to load on a fresh open —
// tunable in one place since it's used both here and in getRoomSync below.
const INITIAL_MESSAGE_PAGE_SIZE = 60;

// One "scroll up for more" batch, Zalo/Messenger-style — see
// getOlderMeetingMessages below and MeetingHub's loadOlderMessages, its
// only caller.
const OLDER_MESSAGE_PAGE_SIZE = 40;

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

// A minimal, single-column lookup so the room page (workspace/hop/page.tsx)
// can find which room to pre-fetch messages for in the SAME Promise.all as
// listChannels()/profiles/dmTabLabel, instead of waiting for the full
// listChannels() result first just to read one id off it. That sequential
// wait — fetch the channel list, then only start fetching messages once it
// lands — was adding a full extra network round trip to every fresh visit
// to the room page, on top of workspace/layout.tsx's own data fetching,
// which is what made opening "Trò chuyện & họp" feel slow to load.
export async function getGeneralChannelId(): Promise<string | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("meeting_channels").select("id").eq("is_general", true).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listChannels(): Promise<MeetingChannelPublic[]> {
  const { supabase, user } = await requireUser();
  const [channelsResult, membershipsResult] = await Promise.all([
    supabase
      .from("meeting_channels")
      .select(
        "id, name, icon, is_general, is_food_room, created_by, created_at, password_hash, parent_channel_id, weekly_hour_cap, billing_type",
      )
      .order("is_general", { ascending: false })
      .order("is_food_room", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase.from("meeting_channel_members").select("channel_id, seen_at").eq("profile_id", user.id),
  ]);

  // parent_channel_id/is_food_room might not exist yet if supabase/schema.sql's
  // migrations haven't been re-run in Supabase — fall back to the same query
  // without them so the whole room list doesn't break in the meantime.
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

  // closed_at is fetched on its own so a database that hasn't run
  // supabase/meeting_channel_close.sql yet just reads as "nothing closed"
  // instead of breaking the whole room list.
  // last_message_at the same way (supabase/migrations/meeting_channel_last_message.sql)
  // — before it's run, rooms just keep their old creation-date order.
  const [closedRes, activityRes] = await Promise.all([
    supabase.from("meeting_channels").select("id, closed_at"),
    supabase.from("meeting_channels").select("id, last_message_at"),
  ]);
  const closedAtById = new Map<string, string | null>(
    closedRes.error ? [] : (closedRes.data ?? []).map((c) => [c.id as string, (c.closed_at as string | null) ?? null]),
  );
  const lastMessageAtById = new Map<string, string | null>(
    activityRes.error
      ? []
      : (activityRes.data ?? []).map((c) => [c.id as string, ((c as { last_message_at?: string | null }).last_message_at) ?? null]),
  );

  return (channels ?? []).map((c) => {
    const isGeneral = c.is_general as boolean;
    const isFoodRoom = (c.is_food_room as boolean | undefined) ?? false;
    const joined = isGeneral || isFoodRoom || seenAtByChannelId.has(c.id as string);
    return {
      id: c.id as string,
      name: c.name as string,
      icon: c.icon as string,
      is_general: isGeneral,
      is_food_room: isFoodRoom,
      created_by: c.created_by as string | null,
      created_at: c.created_at as string,
      parent_channel_id: (c.parent_channel_id as string | null | undefined) ?? null,
      weekly_hour_cap: (c.weekly_hour_cap as number | null | undefined) ?? null,
      billing_type: ((c.billing_type as "hourly" | "milestone" | undefined) ?? "hourly") as "hourly" | "milestone",
      closed_at: closedAtById.get(c.id as string) ?? null,
      last_message_at: lastMessageAtById.get(c.id as string) ?? null,
      has_password: !!c.password_hash,
      joined,
      is_new: !isGeneral && !isFoodRoom && joined && seenAtByChannelId.get(c.id as string) == null,
    };
  });
}

export async function createChannel(
  name: string,
  password: string,
  icon: string,
  parentChannelId?: string | null,
  billingType?: "hourly" | "milestone",
) {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Thiếu tên phòng");

  // parent_channel_id is only ever included when actually nesting under a
  // room, so a director who hasn't re-run supabase/schema.sql yet (adding
  // that column) can still create ordinary top-level rooms without erroring
  // — only the sub-room feature itself needs that migration. billing_type
  // is left out entirely when not passed, same reasoning — its own column
  // default ('hourly') covers a schema that hasn't been re-run yet either.
  const insertRow: Partial<MeetingChannel> & { name: string; icon: string; is_general: boolean; created_by: string } = {
    name: trimmed,
    icon: icon.trim() || "💬",
    is_general: false,
    password_hash: password.trim() ? hashPassword(password.trim()) : null,
    created_by: user.id,
  };
  if (parentChannelId) insertRow.parent_channel_id = parentChannelId;
  if (billingType) insertRow.billing_type = billingType;

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
// "staff, director/PM, or room owner can remove memberships" RLS policy is
// what actually enforces "caller must be that member, a director/PM, or
// this room's creator" — a non-owner calling this just silently affects
// zero rows.
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

// Rename and/or set/change/remove the room password. The "creator,
// director, or PM can update channels" RLS policy on meeting_channels is
// the real gate here (the UI shows this to the creator and to any
// director/PM, unlike "Xoá phòng" which is creator-only) — this just turns
// a plain-text password into a hash before it touches the row, same as
// createChannel().
export async function updateChannel(
  channelId: string,
  input: { name?: string; password?: string | null; billingType?: "hourly" | "milestone" },
) {
  const { supabase } = await requireUser();
  const patch: { name?: string; password_hash?: string | null; billing_type?: "hourly" | "milestone" } = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Thiếu tên phòng");
    patch.name = trimmed;
  }
  if (input.password !== undefined) {
    patch.password_hash = input.password && input.password.trim() ? hashPassword(input.password.trim()) : null;
  }
  if (input.billingType !== undefined) patch.billing_type = input.billingType;
  const { error } = await supabase.from("meeting_channels").update(patch).eq("id", channelId);
  if (error) throw new Error("Không thể cập nhật phòng");
  revalidatePath("/workspace/hop");
}

// Closing a room closes its sub-rooms with it — a finished project has no
// live sub-rooms left. Same who-can-do-it as editing a room (RLS: creator,
// director, or PM).
export async function setChannelClosed(channelId: string, closed: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("meeting_channels")
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .or(`id.eq.${channelId},parent_channel_id.eq.${channelId}`);
  if (error) throw new Error("Không thể đóng/mở lại dự án — cần chạy file SQL meeting_channel_close.sql trong Supabase trước.");
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
// messages ask for only what's new since the last one it holds — a small,
// fast delta fetch instead of the full-history one below. See MeetingHub's
// resync().
//
// The full-history fetch (no afterCreatedAt — opening/switching into a room
// for the first time this session) asks for the newest INITIAL_MESSAGE_PAGE_SIZE
// instead of "the first 300 ever posted": `.order(ascending: true).limit(300)`
// sorts oldest-first *then* caps, so any room with more than 300 messages
// ever showed the very beginning of its history and silently never reached
// anything recent. Newest-first + limit + reversing back to chronological
// order fixes that and, being a much smaller page than 300, is the main
// thing that made a fresh room switch feel slow. There's no older-messages
// pagination in the UI, so anything past this page was already unreachable
// either way — this only changes *which* capped window shows up.
export async function getMeetingMessages(channelId: string, afterCreatedAt?: string): Promise<MeetingMessage[]> {
  const { supabase } = await requireUser();
  if (afterCreatedAt) {
    const { data } = await supabase
      .from("meeting_messages")
      .select("*")
      .eq("channel_id", channelId)
      .gt("created_at", afterCreatedAt)
      .order("created_at", { ascending: true })
      .limit(300);
    return (data ?? []) as MeetingMessage[];
  }
  const { data } = await supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(INITIAL_MESSAGE_PAGE_SIZE);
  return ((data ?? []) as MeetingMessage[]).reverse();
}

// One page of history older than whatever's currently loaded — the
// "scroll to the top, it loads more" counterpart to getMeetingMessages'
// initial page above. Reactions come along for this batch (looked up by
// exact message id, not a channel+time-range join like getRoomSync uses)
// since the messages themselves are brand new to the client and would
// otherwise render with no reactions until a reload.
export async function getOlderMeetingMessages(
  channelId: string,
  beforeCreatedAt: string,
): Promise<{ messages: MeetingMessage[]; reactions: MeetingReaction[] }> {
  const { supabase } = await requireUser();
  const { data: msgData } = await supabase
    .from("meeting_messages")
    .select("*")
    .eq("channel_id", channelId)
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(OLDER_MESSAGE_PAGE_SIZE);
  const messages = ((msgData ?? []) as MeetingMessage[]).reverse();
  if (messages.length === 0) return { messages: [], reactions: [] };

  const { data: rxData } = await supabase
    .from("meeting_message_reactions")
    .select("message_id, profile_id, emoji, created_at")
    .in(
      "message_id",
      messages.map((m) => m.id),
    );
  return { messages, reactions: (rxData ?? []) as MeetingReaction[] };
}

// Combines getMeetingMessages + getReactionsSince + getChannelReads +
// getPinnedMessages into one round trip instead of four. Each of those
// calls requireUser() — a real network round trip to Supabase's *auth*
// server via auth.getUser(), not a local check — so four separate
// client→server calls meant four separate auth round trips stacked on top
// of four separate queries. This pays that auth cost once and runs every
// query in parallel server-side afterward. Only the /workspace/hop page's
// initial server render calls this now — MeetingHub's own resync() and
// warm-up pass use lib/roomLoad.ts's fetchRoomSync straight from the
// browser instead, so they never queue behind other Server Actions.
export async function getRoomSync(
  channelId: string,
  opts: { messagesAfter?: string; reactionsAfter?: string } = {},
): Promise<{
  messages: MeetingMessage[];
  reactions: MeetingReaction[];
  reads: MeetingChannelRead[];
  pinnedMessages: MeetingMessage[];
}> {
  const { supabase } = await requireUser();

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
    supabase.from("meeting_channels").select("id").or("is_general.eq.true,is_food_room.eq.true"),
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

  const sent = data as MeetingMessage;
  after(() => pushMeetingMessage(sent).catch(() => {}));

  return sent;
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
  const mapRow = (r: { message_id: string; profile_id: string; emoji: string; created_at: string }) => ({
    message_id: r.message_id,
    profile_id: r.profile_id,
    emoji: r.emoji,
    created_at: r.created_at,
  });
  if (afterCreatedAt) {
    const { data, error } = await supabase
      .from("meeting_message_reactions")
      .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
      .eq("meeting_messages.channel_id", channelId)
      .gt("created_at", afterCreatedAt)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error || !data) return [];
    return data.map(mapRow);
  }
  // Same "newest N, not oldest N" fix as getMeetingMessages — a reaction
  // can only ever render on a message that's also loaded, and that's now
  // the newest 80, so there's no reason to pull the oldest 500 reactions
  // in a room with a long history.
  const { data, error } = await supabase
    .from("meeting_message_reactions")
    .select("message_id, profile_id, emoji, created_at, meeting_messages!inner(channel_id)")
    .eq("meeting_messages.channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data.map(mapRow).reverse();
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
    supabase.from("meeting_channels").select("id").or("is_general.eq.true,is_food_room.eq.true"),
  ]);
  const channelIds = Array.from(
    new Set([
      ...(memberChannels ?? []).map((m) => m.channel_id as string),
      ...(generalChannels ?? []).map((c) => c.id as string),
    ]),
  );
  const { data: closedRows } = await supabase.from("meeting_channels").select("id").not("closed_at", "is", null);
  const closedIds = new Set((closedRows ?? []).map((c) => c.id as string));
  const openChannelIds = channelIds.filter((id) => !closedIds.has(id));
  if (openChannelIds.length === 0) return {};

  const { data: reads } = await supabase
    .from("meeting_channel_reads")
    .select("channel_id, last_read_message_id")
    .eq("profile_id", user.id)
    .in("channel_id", openChannelIds);

  // The read message's own created_at, fetched directly by id rather than
  // pulled from a capped "recent messages" query — a global top-N across
  // every room the two-query version used to run used to let a quiet
  // room's last-read message fall out of that window once busier rooms
  // pushed past it, which made this treat the whole room as never-read
  // again even though the director had definitely opened it. A direct
  // by-id lookup has no such window to fall out of.
  const readMessageIds = (reads ?? [])
    .map((r) => r.last_read_message_id as string | null)
    .filter((id): id is string => !!id);
  const { data: readMessages } =
    readMessageIds.length > 0
      ? await supabase.from("meeting_messages").select("id, created_at").in("id", readMessageIds)
      : { data: [] };
  const readCreatedAtById = new Map((readMessages ?? []).map((m) => [m.id as string, m.created_at as string]));
  const lastReadAtByChannel = new Map(
    (reads ?? []).map((r) => [
      r.channel_id as string,
      r.last_read_message_id ? readCreatedAtById.get(r.last_read_message_id as string) : undefined,
    ]),
  );

  const counts: Record<string, number> = {};
  await Promise.all(
    openChannelIds.map(async (channelId) => {
      let query = supabase
        .from("meeting_messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .neq("sender_id", user.id);
      const lastReadAt = lastReadAtByChannel.get(channelId);
      if (lastReadAt) query = query.gt("created_at", lastReadAt);
      const { count } = await query;
      if (count) counts[channelId] = count;
    }),
  );
  return counts;
}

export async function getChannelReads(channelId: string): Promise<MeetingChannelRead[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("meeting_channel_reads").select("*").eq("channel_id", channelId);
  return (data ?? []) as MeetingChannelRead[];
}
