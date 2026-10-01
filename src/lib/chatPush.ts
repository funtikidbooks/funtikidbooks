import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToSubscriptions, type PushPayload } from "@/lib/push";
import type { PushSubscriptionRow } from "@/lib/types";

type MeetingRow = { id: string; channel_id: string; sender_id: string; content: string; attachment_url: string | null };
type DirectRow = { id: string; sender_id: string; recipient_id: string; content: string; attachment_url: string | null };

// What a message's push needs: the devices to send to and what to say.
export type PreparedPush = { subs: PushSubscriptionRow[]; payload: PushPayload };

function bodyFor(content: string, hasAttachment: boolean) {
  return content.trim() || (hasAttachment ? "📎 Đã gửi một tệp đính kèm" : "");
}

// A room message goes to everyone who should hear about it — every staff
// member for #Chung / the food room, every member of any other room —
// for every message, tagged or not. Everything is read in one go (the room,
// the sender, both possible recipient lists and the devices) rather than
// one after another, so the push leaves a few round trips sooner.
export async function prepareMeetingPush(message: MeetingRow): Promise<PreparedPush | null> {
  const admin = createAdminClient();
  const [{ data: channel }, { data: sender }, { data: everyone }, { data: members }, { data: subs }] = await Promise.all([
    admin.from("meeting_channels").select("name, is_general, is_food_room").eq("id", message.channel_id).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", message.sender_id).maybeSingle(),
    admin.from("profiles").select("id"),
    admin.from("meeting_channel_members").select("profile_id").eq("channel_id", message.channel_id),
    admin.from("push_subscriptions").select("*"),
  ]);
  if (!channel) return null;

  const recipients = new Set(
    channel.is_general || channel.is_food_room
      ? (everyone ?? []).map((p) => p.id as string)
      : (members ?? []).map((m) => m.profile_id as string),
  );
  recipients.delete(message.sender_id);

  const content = message.content ?? "";
  // "@all" makes the push impossible to miss — everyone in the room already
  // gets notified for every message, this just makes clear it was meant
  // for all of them.
  const taggedAll = /(^|\s)@all\b/.test(content);
  const title = taggedAll
    ? `📢 #${channel.name} · ${sender?.display_name ?? "Ai đó"} đã nhắc tất cả mọi người`
    : `#${channel.name} · ${sender?.display_name ?? "Tin nhắn mới"}`;

  return {
    subs: ((subs ?? []) as PushSubscriptionRow[]).filter((s) => recipients.has(s.user_id)),
    payload: {
      title,
      body: bodyFor(content, !!message.attachment_url),
      senderId: message.sender_id,
      url: `/workspace/hop?room=${message.channel_id}`,
      tag: `funti-channel-${message.channel_id}`,
    },
  };
}

export async function prepareDirectPush(message: DirectRow): Promise<PreparedPush> {
  const admin = createAdminClient();
  const [{ data: sender }, { data: subs }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", message.sender_id).maybeSingle(),
    admin.from("push_subscriptions").select("*").eq("user_id", message.recipient_id),
  ]);
  return {
    subs: (subs ?? []) as PushSubscriptionRow[],
    payload: {
      title: sender?.display_name ?? "Tin nhắn mới",
      body: bodyFor(message.content ?? "", !!message.attachment_url),
      senderId: message.sender_id,
      url: `/workspace/hop?dm=${message.sender_id}`,
    },
  };
}

export async function sendPrepared(p: PreparedPush | null) {
  if (p) await sendPushToSubscriptions(p.subs, p.payload);
}
