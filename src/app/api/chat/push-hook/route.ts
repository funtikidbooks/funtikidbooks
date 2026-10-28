import { after } from "next/server";
import { pushChatMessageOnce, warmChatPush } from "@/lib/chatPushOnce";
import { remindWaitingCustomers } from "@/lib/customerWaiting";

export const dynamic = "force-dynamic";

// Called by the database itself the moment a chat message row is inserted
// (supabase/migrations/chat_push_hook.sql, via pg_net) — so a notification
// no longer depends on the sender's phone staying awake long enough to ask
// for it. Only the message id comes in: the row is read back server-side,
// must be under 10 minutes old, and is pushed at most once (chat_push_log),
// so calling this for a message that was already announced does nothing.
// Answers at once and does the work after, so the database never waits.
// {"type":"ping"} every minute (push_delivery.sql) keeps it warm: no cold
// start in front of the next real message. The same ping sends "khách
// vẫn đang chờ" reminders for customers nobody has answered yet
// (lib/customerWaiting.ts) — each reminder is claimed in the database
// first, so extra pings can't repeat one.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { type?: string; id?: string } | null;
  if (body?.type === "ping") {
    after(() => warmChatPush().catch(() => {}));
    after(() => remindWaitingCustomers().catch(() => {}));
    return new Response(null, { status: 204 });
  }
  const type = body?.type === "dm" ? "dm" : body?.type === "meeting" ? "meeting" : null;
  if (!type || !body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return new Response(null, { status: 400 });
  after(() => pushChatMessageOnce(type, body.id!).catch(() => {}));
  return new Response(null, { status: 202 });
}
