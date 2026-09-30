import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { pushChatMessageOnce } from "@/lib/chatPushOnce";

// Push-notification trigger for a chat message the browser just inserted —
// now the fallback: the database announces each insert itself (push-hook).
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

  // Still checked through the caller's own session: only the sender may ask.
  const table = body.type === "meeting" ? "meeting_messages" : "direct_messages";
  const { data } = await supabase.from(table).select("id, sender_id").eq("id", body.messageId).maybeSingle();
  if (!data || data.sender_id !== user.id) return new Response(null, { status: 404 });
  // The database usually announced it already (chat_push_hook.sql); this
  // is the fallback, and pushChatMessageOnce makes sure it's only once.
  const type = body.type;
  after(() => pushChatMessageOnce(type, data.id).catch(() => {}));

  return new Response(null, { status: 202 });
}
