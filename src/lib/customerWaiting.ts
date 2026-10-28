import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push";

// Khách chờ trả lời (28/10/2026). Sếp Phúc missed customer messages because
// their notification looked like any coworker's chat ping, and a quote
// request sent at 00:31 on 23/10 was never answered. Three things here:
//   1) customer notifications that look nothing like chat (customerPush);
//   2) the studio's automatic "thanks — while you wait, see our Facebook /
//      Instagram" message (maybeAutoReply);
//   3) "still waiting" reminders until a person actually answers
//      (remindWaitingCustomers — run by the database's 5-minute ping).
// Who's waiting is tracked in the database (customer_waiting.sql).

export const STUDIO_FACEBOOK = "https://www.facebook.com/FuntiKidbooks";
export const STUDIO_INSTAGRAM = "https://www.instagram.com/funtikidbooks";

// The same group that can open and answer Khách hàng (support-chat.ts).
export async function customerStaffIds(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .or("access_role.eq.director,access_role.eq.admin,role.eq.Project Manager");
  return (data ?? []).map((p) => p.id as string);
}

const VI_CHARS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

export function autoReplyText(customerText: string): string {
  if (VI_CHARS.test(customerText)) {
    return [
      "Cảm ơn bạn đã nhắn cho Funti Kidbooks Studio! 💛",
      "Đội ngũ studio sẽ trả lời bạn sớm nhất có thể.",
      "",
      "Trong lúc chờ, bạn ghé xem thêm các dự án của studio nhé:",
      `• Facebook: ${STUDIO_FACEBOOK}`,
      `• Instagram: ${STUDIO_INSTAGRAM}`,
    ].join("\n");
  }
  return [
    "Thank you for reaching out to Funti Kidbooks Studio! 💛",
    "Our team will get back to you as soon as possible (we're in Vietnam, GMT+7).",
    "",
    "While you wait, take a look at more of our work:",
    `• Facebook: ${STUDIO_FACEBOOK}`,
    `• Instagram: ${STUDIO_INSTAGRAM}`,
  ].join("\n");
}

// After a customer's message: the automatic message, unless one already
// went out in the last 12 hours or a person answered in the last 30
// minutes (they're mid-conversation — an auto message would be noise).
// Best effort: before customer_waiting.sql runs there's no is_auto column
// and this quietly does nothing.
export async function maybeAutoReply(kind: "visitor" | "client", conversationId: string, customerText: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data: recent, error } =
    kind === "visitor"
      ? await admin
          .from("visitor_messages")
          .select("sender_type, is_auto, created_at")
          .eq("conversation_id", conversationId)
          .gte("created_at", since)
          .limit(50)
      : await admin
          .from("client_messages")
          .select("sender_type, is_auto, created_at")
          .eq("project_id", conversationId)
          .gte("created_at", since)
          .limit(50);
  if (error) return;
  const rows = (recent ?? []) as { sender_type: string; is_auto?: boolean; created_at: string }[];
  if (rows.some((r) => r.is_auto)) return;
  const halfHourAgo = Date.now() - 30 * 60_000;
  if (rows.some((r) => r.sender_type === "staff" && !r.is_auto && Date.parse(r.created_at) > halfHourAgo)) return;

  const content = autoReplyText(customerText);
  if (kind === "visitor") {
    await admin.from("visitor_messages").insert({ conversation_id: conversationId, sender_type: "staff", sender_id: null, content, is_auto: true });
  } else {
    await admin.from("client_messages").insert({
      project_id: conversationId,
      sender_type: "staff",
      sender_id: null,
      content,
      is_auto: true,
      read_by_staff: true,
      read_by_client: false,
    });
  }
}

// A customer notification has to stand out from the dozens of coworker
// pings around it: an orange marker + KHÁCH HÀNG in capitals as the title
// (a coworker's push title is just their name), its own icon and a long
// vibration on Android/desktop, and it stays until tapped.
export async function customerPush(input: { title: string; body: string; url?: string; tag: string }) {
  const ids = await customerStaffIds();
  if (ids.length === 0) return;
  await sendPushToUsers(ids, {
    title: input.title,
    body: input.body,
    senderId: "customer",
    url: input.url ?? "/workspace/khach-hang",
    tag: input.tag,
    requireInteraction: true,
    customer: true,
  });
}

export function previewOf(text: string, max = 140) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// ---- "Khách vẫn đang chờ" reminders -------------------------------------
// Minutes after the first unanswered message for reminder 1, 2, 3…; past
// the list, one more every 24 hours. Only 07:00–22:30 Vietnam time — a
// reminder due overnight goes out once in the morning instead of buzzing
// phones at 3am (the very first notification still goes out at once,
// whatever the hour).
const REMINDER_AFTER_MIN = [15, 60, 180, 480];

function stepFor(waitedMin: number): number {
  let step = 0;
  for (const t of REMINDER_AFTER_MIN) if (waitedMin >= t) step++;
  const last = REMINDER_AFTER_MIN[REMINDER_AFTER_MIN.length - 1];
  if (waitedMin >= last + 1440) step += Math.floor((waitedMin - last) / 1440);
  return step;
}

function waitedLabel(min: number): string {
  if (min < 60) return `${min} PHÚT`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} GIỜ`;
  return `${Math.floor(h / 24)} NGÀY`;
}

function vnMinuteOfDay(now: Date): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(now)
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
}

type Waiting = { kind: "client" | "visitor" | "form"; id: string; since: string; step: number; who: string; preview: string };

async function listWaiting(): Promise<Waiting[]> {
  const admin = createAdminClient();
  const [projects, visitors, forms] = await Promise.all([
    admin.from("client_projects").select("id, client_id, description, awaiting_reply_since, reminder_step").not("awaiting_reply_since", "is", null),
    admin
      .from("visitor_conversations")
      .select("id, visitor_name, awaiting_reply_since, reminder_step")
      .not("awaiting_reply_since", "is", null)
      .eq("status", "open")
      .is("claimed_by_client_id", null),
    admin.from("contact_messages").select("id, full_name, message, created_at, reminder_step").is("handled_at", null),
  ]);
  if (projects.error || visitors.error || forms.error) return []; // customer_waiting.sql not run yet

  const out: Waiting[] = [];
  const clientIds = [...new Set((projects.data ?? []).map((p) => p.client_id as string))];
  const { data: clients } = clientIds.length
    ? await admin.from("clients").select("id, display_name, email").in("id", clientIds)
    : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
  for (const p of projects.data ?? []) {
    const c = (clients ?? []).find((x) => x.id === p.client_id);
    const { data: last } = await admin
      .from("client_messages")
      .select("content")
      .eq("project_id", p.id)
      .eq("sender_type", "client")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({
      kind: "client",
      id: p.id,
      since: p.awaiting_reply_since as string,
      step: p.reminder_step as number,
      who: c?.display_name?.trim() || c?.email || "Khách hàng",
      preview: previewOf((last?.content as string | undefined) || (p.description as string), 100),
    });
  }
  for (const v of visitors.data ?? []) {
    const { data: last } = await admin
      .from("visitor_messages")
      .select("content")
      .eq("conversation_id", v.id)
      .eq("sender_type", "visitor")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({
      kind: "visitor",
      id: v.id,
      since: v.awaiting_reply_since as string,
      step: v.reminder_step as number,
      who: (v.visitor_name as string | null)?.trim() || "Khách vãng lai",
      preview: previewOf((last?.content as string | undefined) || "", 100),
    });
  }
  for (const f of forms.data ?? []) {
    out.push({
      kind: "form",
      id: f.id,
      since: f.created_at as string,
      step: f.reminder_step as number,
      who: (f.full_name as string) || "Khách",
      preview: previewOf((f.message as string) || "", 100),
    });
  }
  return out;
}

export async function remindWaitingCustomers(now = new Date()) {
  const minute = vnMinuteOfDay(now);
  if (minute < 7 * 60 || minute > 22 * 60 + 30) return;
  const waiting = await listWaiting();
  if (waiting.length === 0) return;
  const admin = createAdminClient();
  for (const w of waiting) {
    const waitedMin = Math.floor((now.getTime() - Date.parse(w.since)) / 60_000);
    const due = stepFor(waitedMin);
    if (due <= w.step) continue;
    // Claim the step first: two overlapping pings can't both send it.
    const table = w.kind === "client" ? "client_projects" : w.kind === "visitor" ? "visitor_conversations" : "contact_messages";
    const { data: claimed } = await admin.from(table).update({ reminder_step: due }).eq("id", w.id).eq("reminder_step", w.step).select("id");
    if (!claimed || claimed.length === 0) continue;
    const others = waiting.length - 1;
    await customerPush({
      title: `⏰ KHÁCH CHỜ ${waitedLabel(waitedMin)} CHƯA AI TRẢ LỜI`,
      body: `👤 ${w.who}${w.kind === "form" ? " (form Liên hệ)" : ""}: ${w.preview}${others > 0 ? `\n…và ${others} khách khác đang chờ` : ""}`,
      url: w.kind === "form" ? "/quan-tri/tin-nhan" : "/workspace/khach-hang",
      tag: `funti-customer-wait-${w.id}`,
    }).catch(() => {});
  }
}
