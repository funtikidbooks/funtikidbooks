"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { DirectMessage } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

export async function getConversation(otherUserId: string): Promise<DirectMessage[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("direct_messages")
    .select("*")
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`,
    )
    .order("created_at", { ascending: true })
    .limit(200);

  return (data ?? []) as DirectMessage[];
}

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const MAX_SIZE = 20 * 1024 * 1024;

export async function sendDirectMessage(recipientId: string, content: string, formData?: FormData) {
  const { supabase, user } = await requireUser();
  const trimmed = content.trim();

  let attachment: { url: string; filename: string; mime: string; size: number } | null = null;
  const file = formData?.get("file");
  if (file instanceof File) {
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP hoặc PDF");
    if (file.size > MAX_SIZE) throw new Error("Tệp vượt quá 20MB");

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const conversationKey = [user.id, recipientId].sort().join("-");
    const storagePath = `dm/${conversationKey}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) throw new Error("Không thể tải tệp lên");

    const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);
    attachment = { url: publicUrlData.publicUrl, filename: file.name, mime: file.type, size: file.size };
  }

  if (!trimmed && !attachment) return null;

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: user.id,
      recipient_id: recipientId,
      content: trimmed,
      attachment_url: attachment?.url ?? null,
      attachment_filename: attachment?.filename ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (attachment) {
      const path = storagePathFromPublicUrl(attachment.url, "task-attachments");
      if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
    }
    throw new Error("Không thể gửi tin nhắn");
  }

  const { data: senderProfile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  sendPushToUser(recipientId, {
    title: senderProfile?.display_name ?? "Tin nhắn mới",
    body: trimmed || (attachment ? "📎 Đã gửi một tệp đính kèm" : ""),
    senderId: user.id,
  }).catch(() => {});

  return data as DirectMessage;
}

// One unread count per teammate who has sent me a message since I last read
// that conversation — powers the badge shown next to their name in the
// workspace sidebar.
export async function getUnreadCounts(): Promise<Record<string, number>> {
  const { supabase, user } = await requireUser();
  const [{ data: reads }, { data: incoming }] = await Promise.all([
    supabase.from("dm_reads").select("peer_id, last_read_at").eq("user_id", user.id),
    supabase.from("direct_messages").select("sender_id, created_at").eq("recipient_id", user.id),
  ]);

  const lastReadByPeer = new Map((reads ?? []).map((r) => [r.peer_id as string, r.last_read_at as string]));
  const counts: Record<string, number> = {};
  for (const m of incoming ?? []) {
    const lastRead = lastReadByPeer.get(m.sender_id as string);
    if (!lastRead || new Date(m.created_at as string) > new Date(lastRead)) {
      counts[m.sender_id as string] = (counts[m.sender_id as string] ?? 0) + 1;
    }
  }
  return counts;
}

export async function markConversationRead(peerId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("dm_reads")
    .upsert({ user_id: user.id, peer_id: peerId, last_read_at: new Date().toISOString() });
}
