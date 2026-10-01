import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareDirectPush, prepareMeetingPush, sendPrepared } from "@/lib/chatPush";

// Each chat message is pushed exactly once, by whichever trigger reaches
// the server first: the database itself on insert (chat_push_hook.sql →
// /api/chat/push-hook) or the sender's browser (/api/chat/notify, kept as
// a fallback). chat_push_log's primary key is the claim — the second
// arrival finds it taken and stops. Before chat_push_hook.sql runs the
// table doesn't exist and every call just pushes (the browser path is then
// the only one anyway).
async function claim(messageId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("chat_push_log").insert({ message_id: messageId });
  if (!error) return true;
  if (error.code === "23505") return false; // already pushed
  return true; // table missing or a hiccup — better twice than never
}

// Only fresh messages: a replayed/late hook for an old message mustn't
// ring everyone's phone again.
const MAX_AGE_MS = 10 * 60 * 1000;

// The claim and everything the push needs are fetched side by side: the
// push leaves as soon as both are back, instead of claiming first and only
// then starting to look up the room, the sender and the devices.
export async function pushChatMessageOnce(type: "meeting" | "dm", messageId: string) {
  const admin = createAdminClient();
  if (type === "meeting") {
    const { data } = await admin
      .from("meeting_messages")
      .select("id, channel_id, sender_id, content, attachment_url, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!data || Date.now() - new Date(data.created_at).getTime() > MAX_AGE_MS) return;
    const [claimed, prepared] = await Promise.all([claim(data.id), prepareMeetingPush(data)]);
    if (claimed) await sendPrepared(prepared);
  } else {
    const { data } = await admin
      .from("direct_messages")
      .select("id, sender_id, recipient_id, content, attachment_url, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!data || Date.now() - new Date(data.created_at).getTime() > MAX_AGE_MS) return;
    const [claimed, prepared] = await Promise.all([claim(data.id), prepareDirectPush(data)]);
    if (claimed) await sendPrepared(prepared);
  }
}

// The database pings the hook every minute (push_delivery.sql) so a
// function and its connections are already up when a real message comes.
export async function warmChatPush() {
  await createAdminClient().from("chat_push_log").select("message_id").limit(1);
}
