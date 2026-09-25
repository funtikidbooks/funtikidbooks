import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { pushDirectMessage, pushMeetingMessage } from "@/lib/chatPush";

// Push-notification trigger for a chat message the browser just inserted.
// A route handler rather than a Server Action on purpose: Next runs a
// client's Server Actions one at a time, so the old notify action sat in
// line behind MeetingHub's background room syncs (every 20s, plus a warm-up
// pass over every room) — the push only went out once those finished.
// Route handlers run concurrently, and the client calls this with
// `keepalive` so it still completes if the tab closes right after sending.
//
// Only the message id comes from the client: the row is read back through
// the caller's own RLS-scoped session and must be theirs, so nobody can
// trigger a push for a message they didn't send or with made-up content.
export async function POST(request: Request) {
  let user;
  let supabase;
  try {
    ({ supabase, user } = await requireUser());
  } catch {
    return new Response(null, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { type?: string; messageId?: string } | null;
  if (!body?.messageId || (body.type !== "meeting" && body.type !== "dm")) {
    return new Response(null, { status: 400 });
  }

  if (body.type === "meeting") {
    const { data } = await supabase
      .from("meeting_messages")
      .select("id, channel_id, sender_id, content, attachment_url")
      .eq("id", body.messageId)
      .maybeSingle();
    if (!data || data.sender_id !== user.id) return new Response(null, { status: 404 });
    after(() => pushMeetingMessage(data).catch(() => {}));
  } else {
    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, recipient_id, content, attachment_url")
      .eq("id", body.messageId)
      .maybeSingle();
    if (!data || data.sender_id !== user.id) return new Response(null, { status: 404 });
    after(() => pushDirectMessage(data).catch(() => {}));
  }

  return new Response(null, { status: 202 });
}
