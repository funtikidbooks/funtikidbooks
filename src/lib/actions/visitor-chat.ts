"use server";

import { createAdminClient } from "@/lib/supabase/admin";
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

export async function startVisitorConversation(
  visitorName: string | undefined,
  firstMessage: string,
): Promise<{ conversationId: string; token: string; message: VisitorMessage }> {
  const content = firstMessage.trim();
  if (!content) throw new Error("Vui lòng nhập nội dung tin nhắn.");

  const supabase = createAdminClient();
  const { data: conversation, error: convError } = await supabase
    .from("visitor_conversations")
    .insert({ visitor_name: visitorName?.trim() || null })
    .select("id, visitor_token")
    .single();

  if (convError || !conversation) throw new Error("Không thể bắt đầu trò chuyện. Vui lòng thử lại.");

  const { data: message, error: msgError } = await supabase
    .from("visitor_messages")
    .insert({ conversation_id: conversation.id, sender_type: "visitor", content })
    .select("*")
    .single();

  if (msgError || !message) throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");

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

  await supabase
    .from("visitor_conversations")
    .update({ unread: true, last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

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
