import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser, sendPushToUsers } from "@/lib/push";

type MeetingRow = { id: string; channel_id: string; sender_id: string; content: string; attachment_url: string | null };
type DirectRow = { id: string; sender_id: string; recipient_id: string; content: string; attachment_url: string | null };

function bodyFor(content: string, hasAttachment: boolean) {
  return content.trim() || (hasAttachment ? "📎 Đã gửi một tệp đính kèm" : "");
}

// Pushes a room message to everyone who should hear about it — every staff
// member for #Chung / the food room, or just that room's members otherwise.
export async function pushMeetingMessage(message: MeetingRow) {
  const admin = createAdminClient();
  const [{ data: channel }, { data: sender }] = await Promise.all([
    admin.from("meeting_channels").select("name, is_general, is_food_room").eq("id", message.channel_id).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", message.sender_id).maybeSingle(),
  ]);
  if (!channel) return;

  const { data: recipients } =
    channel.is_general || channel.is_food_room
      ? await admin.from("profiles").select("id")
      : await admin.from("meeting_channel_members").select("id:profile_id").eq("channel_id", message.channel_id);

  const content = message.content ?? "";
  // "@all" makes the push impossible to miss — everyone in the room already
  // gets notified for every message, this just makes clear it was meant
  // for all of them.
  const taggedAll = /(^|\s)@all\b/.test(content);
  const title = taggedAll
    ? `📢 #${channel.name} · ${sender?.display_name ?? "Ai đó"} đã nhắc tất cả mọi người`
    : `#${channel.name} · ${sender?.display_name ?? "Tin nhắn mới"}`;

  await sendPushToUsers(
    (recipients ?? []).map((r) => r.id as string).filter((id) => id !== message.sender_id),
    {
      title,
      body: bodyFor(content, !!message.attachment_url),
      senderId: message.sender_id,
      url: `/workspace/hop?room=${message.channel_id}`,
      tag: `funti-channel-${message.channel_id}`,
    },
  );
}

export async function pushDirectMessage(message: DirectRow) {
  const admin = createAdminClient();
  const { data: sender } = await admin.from("profiles").select("display_name").eq("id", message.sender_id).maybeSingle();
  await sendPushToUser(message.recipient_id, {
    title: sender?.display_name ?? "Tin nhắn mới",
    body: bodyFor(message.content ?? "", !!message.attachment_url),
    senderId: message.sender_id,
    url: `/workspace/hop?dm=${message.sender_id}`,
  });
}
