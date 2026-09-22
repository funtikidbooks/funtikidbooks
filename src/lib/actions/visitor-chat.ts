"use server";

import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { sendNewVisitorMessageEmail } from "@/lib/mail";
import type { FileAttachment, VisitorMessage } from "@/lib/types";

// Public, unauthenticated actions for the site-wide "Chat với chúng tôi"
// widget — any visitor can call these without logging in. There's no
// Supabase auth session to scope RLS by, so these go through the
// service-role client and gate access themselves: every call after
// startVisitorConversation requires the exact `token` that call returned,
// which only this one visitor's browser (via localStorage) ever sees.

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/zip",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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

// Attachments can be picked (and uploaded) before the first message is ever
// sent — there's no conversationId/token yet at that point, same as
// startVisitorConversation itself needing none. Once a conversation exists,
// though, an upload must prove it belongs to that same browser, or anyone
// could guess another visitor's conversationId and drop files into their
// thread.
async function resolveUploadScope(conversationId?: string, token?: string) {
  const supabase = createAdminClient();
  if (!conversationId && !token) return supabase;
  if (!conversationId || !token) throw new Error("Không tìm thấy cuộc trò chuyện.");
  const { data } = await supabase
    .from("visitor_conversations")
    .select("visitor_token")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data || data.visitor_token !== token) throw new Error("Không tìm thấy cuộc trò chuyện.");
  return supabase;
}

// Fires push (to every device a recipient has granted it on) and a
// fallback email (to everyone with one on file) whenever a visitor sends a
// message — the widget has no way to page anyone otherwise, so a message
// left outside office hours would just sit unseen in Khách hàng until
// someone happened to open it. Recipients are director/admin plus any
// Project Manager (Alice Đỗ) — the same tier that can actually open and
// reply to the chat now (see requireStaff() in support-chat.ts).
async function notifyStaffOfVisitorMessage(visitorName: string | null, visitorEmail: string | null, content: string) {
  const supabase = createAdminClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, email")
    .or("access_role.eq.director,access_role.eq.admin,role.eq.Project Manager");
  if (!staff || staff.length === 0) return;

  const who = visitorName?.trim() || "Khách vãng lai";
  const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;

  await Promise.all(
    staff.map((s) =>
      sendPushToUser(s.id, {
        // Fixed, unmistakable title — a workspace DM's push shows the
        // sender's own name as the title (e.g. "Thư"), which this must
        // never resemble, or it reads as just another coworker ping and
        // gets swiped away the same way.
        title: "🔔 Khách hàng nhắn tin mới",
        body: `${who}: ${preview}`,
        senderId: "visitor-chat",
        url: "/workspace/khach-hang",
        tag: "funti-visitor-chat",
        requireInteraction: true,
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

function attachmentPreview(trimmed: string, imageUrls: string[], fileAttachments: FileAttachment[]): string {
  if (trimmed) return trimmed;
  if (imageUrls.length > 0) return imageUrls.length > 1 ? `📷 Đã gửi ${imageUrls.length} ảnh` : "📷 Đã gửi ảnh";
  if (fileAttachments.length > 0) return `📄 ${fileAttachments[0].name}`;
  return "";
}

export async function uploadVisitorImage(formData: FormData, conversationId?: string, token?: string): Promise<string> {
  const supabase = await resolveUploadScope(conversationId, token);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp ảnh.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WEBP.");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("Ảnh vượt quá 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `visitor-uploads/${conversationId ?? "new"}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("client-uploads")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải ảnh lên.");

  const { data } = supabase.storage.from("client-uploads").getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadVisitorFile(formData: FormData, conversationId?: string, token?: string): Promise<FileAttachment> {
  const supabase = await resolveUploadScope(conversationId, token);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp đính kèm.");
  if (!ALLOWED_FILE_TYPES.has(file.type)) throw new Error("Định dạng tệp này chưa được hỗ trợ.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Tệp vượt quá 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storagePath = `visitor-uploads/${conversationId ?? "new"}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("client-uploads")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải tệp lên.");

  const { data } = supabase.storage.from("client-uploads").getPublicUrl(storagePath);
  return { url: data.publicUrl, name: file.name, size: file.size };
}

export async function startVisitorConversation(
  visitorName: string | undefined,
  visitorEmail: string | undefined,
  firstMessage: string,
  imageUrls: string[] = [],
  fileAttachments: FileAttachment[] = [],
): Promise<{ conversationId: string; token: string; message: VisitorMessage }> {
  const content = firstMessage.trim();
  if (!content && imageUrls.length === 0 && fileAttachments.length === 0) {
    throw new Error("Vui lòng nhập nội dung hoặc đính kèm ảnh/tệp.");
  }

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
    .insert({ conversation_id: conversation.id, sender_type: "visitor", content, image_urls: imageUrls, file_attachments: fileAttachments })
    .select("*")
    .single();

  if (msgError || !message) throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");

  after(() => notifyStaffOfVisitorMessage(name, email, attachmentPreview(content, imageUrls, fileAttachments)).catch(() => {}));

  return { conversationId: conversation.id, token: conversation.visitor_token, message: message as VisitorMessage };
}

export async function sendVisitorMessage(
  conversationId: string,
  token: string,
  content: string,
  imageUrls: string[] = [],
  fileAttachments: FileAttachment[] = [],
): Promise<VisitorMessage> {
  const trimmed = content.trim();
  if (!trimmed && imageUrls.length === 0 && fileAttachments.length === 0) {
    throw new Error("Vui lòng nhập nội dung hoặc đính kèm ảnh/tệp.");
  }
  const { supabase } = await requireConversation(conversationId, token);

  const { data, error } = await supabase
    .from("visitor_messages")
    .insert({ conversation_id: conversationId, sender_type: "visitor", content: trimmed, image_urls: imageUrls, file_attachments: fileAttachments })
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
      attachmentPreview(trimmed, imageUrls, fileAttachments),
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
