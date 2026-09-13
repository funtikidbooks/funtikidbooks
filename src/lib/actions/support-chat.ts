"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import type { VisitorConversation, VisitorMessage } from "@/lib/types";

// Director/admin, or a Project Manager (Alice Đỗ's chức danh) — same
// director-or-PM tier as can_manage_hr()/is_director_or_pm() elsewhere,
// widened from director/admin-only so a PM can actually open and reply to
// a customer chat, not just get paged for one.
async function requireStaff() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  const allowed =
    profile?.access_role === "director" || profile?.access_role === "admin" || profile?.role === "Project Manager";
  if (!allowed) {
    throw new Error("Chỉ Admin, Giám đốc và Quản lý dự án mới xem được mục này.");
  }

  return { supabase, user };
}

export async function listVisitorConversations(): Promise<VisitorConversation[]> {
  const { supabase } = await requireStaff();
  const { data } = await supabase
    .from("visitor_conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  return (data ?? []) as VisitorConversation[];
}

export async function getVisitorConversationMessages(conversationId: string): Promise<VisitorMessage[]> {
  const { supabase } = await requireStaff();
  const { data } = await supabase
    .from("visitor_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as VisitorMessage[];
}

export async function markVisitorConversationRead(conversationId: string) {
  const { supabase } = await requireStaff();
  await supabase.from("visitor_conversations").update({ unread: false }).eq("id", conversationId);
  revalidatePath("/workspace/khach-hang");
}

export async function sendStaffReply(conversationId: string, content: string): Promise<VisitorMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Vui lòng nhập nội dung tin nhắn.");
  const { supabase, user } = await requireStaff();

  const { data, error } = await supabase
    .from("visitor_messages")
    .insert({ conversation_id: conversationId, sender_type: "staff", sender_id: user.id, content: trimmed })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");

  await supabase
    .from("visitor_conversations")
    .update({ unread: false, last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath("/workspace/khach-hang");
  return data as VisitorMessage;
}

export async function closeVisitorConversation(conversationId: string) {
  const { supabase } = await requireStaff();
  await supabase.from("visitor_conversations").update({ status: "closed" }).eq("id", conversationId);
  revalidatePath("/workspace/khach-hang");
}
