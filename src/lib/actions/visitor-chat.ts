"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { sendNewVisitorMessageEmail } from "@/lib/mail";
import type { VisitorMessage } from "@/lib/types";

// Public, unauthenticated actions for the site-wide "Chat với chúng tôi"
// widget — any visitor can call these without logging in. There's no
// Supabase auth session to scope RLS by, so these go through the
// service-role client and gate access themselves: every call after
// startVisitorConversation requires the exact `token` that call returned,
// which only this one visitor's browser (via localStorage) ever sees.

async function requireConversation(conversationId: string, token: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("visitor_conversations")
    .select("id, visitor_token, status")
    .eq("id", conversationId)
    .maybeSingle();

  if (!data || data.visitor_token !== token) {
    throw new Error("Không tìm thấy cuộc trò chuyện.");
  }
  return { supabase, conversation: data };
}

// Fires push (to every director/admin device that's granted it) and a
// fallback email (to every director/admin who has one on file) whenever a
// visitor sends a message — the widget has no way to page anyone otherwise,
// so a message left outside office hours would just sit unseen in
// /quan-tri/chat until someone happened to open it.
async function notifyStaffOfVisitorMessage(visitorName: string | null, visitorEmail: string | null, content: string) {
  const supabase = createAdminClient();
  const { data: staff } = await supabase.from("profiles").select("id, email").in("access_role", ["director", "admin"]);
  if (!staff || staff.length === 0) return;

  const who = visitorName?.trim() || "Khách vãng lai";
  const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;

  await Promise.all(
    staff.map((s) =>
      sendPushToUser(s.id, {
        title: `Tin nhắn mới từ ${who}`,
        body: preview,
        senderId: "visitor-chat",
        url: "/quan-tri/chat",
        tag: "funti-visitor-chat",
      }).catch(() => {}),
    ),
  );

  await Promise.all(
    staff.map((s) =>
      s.email
        ? sendNewVisitorMessageEmail({ to: s.email, visitorName, visitorEmail, preview }).catch(() => {})
        : Promise.resolve(),
    ),
  );
}

export async function startVisitorConversation(
  visitorName: string | undefined,
  visitorEmail: string | undefined,
  firstMessage: string,
): Promise<{ conversationId: string; token: string; message: VisitorMessage }> {
  const content = firstMessage.trim();
  if (!content) throw new Error("Vui lòng nhập nội dung tin nhắn.");

  const name = visitorName?.trim() || null;
  const email = visitorEmail?.trim() || null;

  const supabase = createAdminClient();
  const { data: conversation, error: convError } = await supabase
    .from("visitor_conversations")
    .insert({ visitor_name: name, visitor_email: email })
    .select("id, visitor_token")
    .single();

  if (convError || !conversation) throw new Error("Không thể bắt đầu trò chuyện. Vui lòng thử lại.");

  const { data: message, error: msgError } = await supabase
    .from("visitor_messages")
    .insert({ conversation_id: conversation.id, sender_type: "visitor", content })
    .select("*")
    .single();

  if (msgError || !message) throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");

  after(() => notifyStaffOfVisitorMessage(name, email, content).catch(() => {}));

  return { conversationId: conversation.id, token: conversation.visitor_token, message: message as VisitorMessage };
}

export async function sendVisitorMessage(conversationId: string, token: string, content: string): Promise<VisitorMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Vui lòng nhập nội dung tin nhắn.");
  const { supabase } = await requireConversation(conversationId, token);

  const { data, error } = await supabase
    .from("visitor_messages")
    .insert({ conversation_id: conversationId, sender_type: "visitor", content: trimmed })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");

  const { data: updatedConversation } = await supabase
    .from("visitor_conversations")
    .update({ unread: true, last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .select("visitor_name, visitor_email")
    .single();

  after(() =>
    notifyStaffOfVisitorMessage(
      updatedConversation?.visitor_name ?? null,
      updatedConversation?.visitor_email ?? null,
      trimmed,
    ).catch(() => {}),
  );

  return data as VisitorMessage;
}

export async function getVisitorMessages(conversationId: string, token: string): Promise<VisitorMessage[]> {
  const { supabase } = await requireConversation(conversationId, token);
  const { data } = await supabase
    .from("visitor_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as VisitorMessage[];
}
