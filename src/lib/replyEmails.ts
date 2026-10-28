import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mailConfigured, sendCustomerReplyEmail } from "@/lib/mail";
import { looksVietnamese } from "@/lib/customerWaiting";
import type { FileAttachment } from "@/lib/types";

// Câu trả lời tới tay khách dù khách đã rời web (28/10/2026). Customers
// write in their evening — the Vietnamese night — and by the time sếp Phúc
// answers next morning they've long left the site; an answer that only
// lives on the site may never be seen. Run by the database's every-minute
// ping (api/chat/push-hook): studio replies the customer hasn't seen on the
// site go out as one email once the studio has stopped typing for a few
// minutes — a run of short messages makes one email, and nobody chatting
// live gets emailed at all.
//
// Each conversation's reply_email_upto (reply_emails.sql) is the cursor:
// studio replies up to it were emailed, seen on the site (a guest's page
// moves it, see getVisitorMessages; a client's read_by_client counts), or
// answered by the customer.

const QUIET_MS = 3 * 60_000;
const LOOKBACK_MS = 3 * 86_400_000;
const SITE = "https://funtikidbooks.com";

type Row = {
  sender_type: string;
  is_auto?: boolean | null;
  content: string;
  image_urls: string[] | null;
  file_attachments: FileAttachment[] | null;
  created_at: string;
  read_by_client?: boolean;
};

type Plan =
  | { kind: "wait" }
  | { kind: "none"; upto: string }
  | { kind: "send"; replies: Row[]; upto: string; youWrote: string | null };

const later = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b);

// rows: everything after the cursor, oldest first. Only the studio's
// replies after the customer's own latest message are still owed — anything
// before it they've obviously read.
function plan(rows: Row[], customer: "visitor" | "client", lastMessageAt: string, now: number): Plan {
  let lastCustomer = -1;
  rows.forEach((r, i) => {
    if (r.sender_type === customer) lastCustomer = i;
  });
  const replies = rows
    .slice(lastCustomer + 1)
    .filter((r) => r.sender_type === "staff" && !r.is_auto && r.read_by_client !== true);
  if (replies.length === 0) {
    // Nothing owed: move the cursor past it all so the next pings skip this
    // conversation until something new comes in.
    return { kind: "none", upto: rows.length ? later(rows[rows.length - 1].created_at, lastMessageAt) : lastMessageAt };
  }
  const newest = replies[replies.length - 1];
  if (now - Date.parse(newest.created_at) < QUIET_MS) return { kind: "wait" };
  return {
    kind: "send",
    replies,
    upto: newest.created_at,
    youWrote: lastCustomer >= 0 ? rows[lastCustomer].content : null,
  };
}

function languageOf(replies: Row[], youWrote: string | null): "vi" | "en" {
  const answer = replies.map((r) => r.content).join(" ").trim();
  if (answer) return looksVietnamese(answer) ? "vi" : "en";
  return youWrote && looksVietnamese(youWrote) ? "vi" : "en";
}

const toParts = (replies: Row[]) =>
  replies.map((r) => ({ content: r.content, imageUrls: r.image_urls ?? [], files: r.file_attachments ?? [] }));

async function emailGuests(now: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("visitor_conversations")
    .select("id, visitor_name, visitor_email, visitor_token, last_message_at, reply_email_upto, reply_emailed_at")
    .not("visitor_email", "is", null)
    .is("claimed_by_client_id", null)
    .gt("last_message_at", new Date(now - LOOKBACK_MS).toISOString());
  if (error) return; // reply_emails.sql not run yet

  for (const c of data ?? []) {
    const cursor = c.reply_email_upto as string;
    if (!c.visitor_email || Date.parse(c.last_message_at) <= Date.parse(cursor)) continue;
    const { data: rows } = await admin
      .from("visitor_messages")
      .select("sender_type, is_auto, content, image_urls, file_attachments, created_at")
      .eq("conversation_id", c.id)
      .gt("created_at", cursor)
      .order("created_at", { ascending: true });
    const p = plan((rows ?? []) as Row[], "visitor", c.last_message_at, now);
    if (p.kind === "wait") continue;
    if (p.kind === "none") {
      await admin.from("visitor_conversations").update({ reply_email_upto: p.upto }).eq("id", c.id).eq("reply_email_upto", cursor);
      continue;
    }

    // Claim first, so two overlapping pings can't both send it.
    const sentAt = new Date(now).toISOString();
    const { data: claimed } = await admin
      .from("visitor_conversations")
      .update({ reply_email_upto: p.upto, reply_emailed_at: sentAt })
      .eq("id", c.id)
      .eq("reply_email_upto", cursor)
      .select("id");
    if (!claimed?.length) continue;

    let youWrote = p.youWrote;
    if (youWrote === null) {
      const { data: last } = await admin
        .from("visitor_messages")
        .select("content")
        .eq("conversation_id", c.id)
        .eq("sender_type", "visitor")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      youWrote = (last?.content as string | undefined) ?? null;
    }
    const lang = languageOf(p.replies, youWrote);
    try {
      await sendCustomerReplyEmail({
        to: c.visitor_email,
        name: c.visitor_name,
        lang,
        kind: "visitor",
        replies: toParts(p.replies),
        youWrote,
        // Carries the chat's key: the email may well be opened on another
        // device than the one the guest wrote from (GuestChatPanel).
        link: `${SITE}/cong-viec?chat=${c.id}&t=${c.visitor_token}&lang=${lang}`,
      });
    } catch {
      // Put it back in line for the next ping.
      await admin
        .from("visitor_conversations")
        .update({ reply_email_upto: cursor, reply_emailed_at: c.reply_emailed_at })
        .eq("id", c.id)
        .eq("reply_email_upto", p.upto);
    }
  }
}

async function emailClients(now: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_projects")
    .select("id, client_id, last_message_at, reply_email_upto, reply_emailed_at")
    .gt("last_message_at", new Date(now - LOOKBACK_MS).toISOString());
  if (error) return; // reply_emails.sql not run yet

  for (const pr of data ?? []) {
    const cursor = pr.reply_email_upto as string;
    if (Date.parse(pr.last_message_at) <= Date.parse(cursor)) continue;
    const { data: rows } = await admin
      .from("client_messages")
      .select("sender_type, is_auto, content, image_urls, file_attachments, created_at, read_by_client")
      .eq("project_id", pr.id)
      .gt("created_at", cursor)
      .order("created_at", { ascending: true });
    const p = plan((rows ?? []) as Row[], "client", pr.last_message_at, now);
    if (p.kind === "wait") continue;
    const { data: client } =
      p.kind === "send" ? await admin.from("clients").select("display_name, email").eq("id", pr.client_id).maybeSingle() : { data: null };
    if (p.kind === "none" || !client?.email) {
      // Nothing owed — or no address to send it to.
      await admin.from("client_projects").update({ reply_email_upto: p.upto }).eq("id", pr.id).eq("reply_email_upto", cursor);
      continue;
    }

    const sentAt = new Date(now).toISOString();
    const { data: claimed } = await admin
      .from("client_projects")
      .update({ reply_email_upto: p.upto, reply_emailed_at: sentAt })
      .eq("id", pr.id)
      .eq("reply_email_upto", cursor)
      .select("id");
    if (!claimed?.length) continue;

    let youWrote = p.youWrote;
    if (youWrote === null) {
      const { data: last } = await admin
        .from("client_messages")
        .select("content")
        .eq("project_id", pr.id)
        .eq("sender_type", "client")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      youWrote = (last?.content as string | undefined) ?? null;
    }
    const lang = languageOf(p.replies, youWrote);
    try {
      await sendCustomerReplyEmail({
        to: client.email,
        name: client.display_name,
        lang,
        kind: "client",
        replies: toParts(p.replies),
        youWrote,
        link: `${SITE}/cong-viec?lang=${lang}`,
      });
    } catch {
      await admin
        .from("client_projects")
        .update({ reply_email_upto: cursor, reply_emailed_at: pr.reply_emailed_at })
        .eq("id", pr.id)
        .eq("reply_email_upto", p.upto);
    }
  }
}

export async function emailUnseenReplies(now = Date.now()) {
  if (!mailConfigured()) return;
  await Promise.all([emailGuests(now).catch(() => {}), emailClients(now).catch(() => {})]);
}
