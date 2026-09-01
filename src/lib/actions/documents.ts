"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StaffDocument, StaffDocumentType } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors the can_manage_hr() RLS helper in supabase/schema.sql.
async function requireHrManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền này.");
  }

  return { supabase, user };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

// The caller's own inbox — documents someone actually sent them. Drafts
// never show up here even for the composer's own account; RLS enforces
// this the same way for a direct API call, this mirrors it.
export async function listMyStaffDocuments(): Promise<StaffDocument[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("staff_documents")
    .select("*")
    .eq("profile_id", user.id)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  return (data ?? []) as StaffDocument[];
}

// The full management list — every document, every status, every staff
// member. Only reachable from /quan-tri/hop-dong.
export async function listAllStaffDocuments(): Promise<StaffDocument[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase.from("staff_documents").select("*").order("created_at", { ascending: false });
  return (data ?? []) as StaffDocument[];
}

export async function getStaffDocument(id: string): Promise<StaffDocument | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("staff_documents").select("*").eq("id", id).maybeSingle();
  return (data as StaffDocument) ?? null;
}

export async function createDraftDocument(input: {
  profileId: string;
  type: StaffDocumentType;
  title: string;
  content: string;
}): Promise<StaffDocument> {
  const { supabase, user } = await requireHrManager();
  const title = input.title.trim();
  if (!title) throw new Error("Cần nhập tiêu đề.");

  const { data, error } = await supabase
    .from("staff_documents")
    .insert({
      profile_id: input.profileId,
      type: input.type,
      title,
      content: input.content,
      status: "draft",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể tạo nháp.");

  revalidatePath("/quan-tri/hop-dong");
  return data as StaffDocument;
}

// Only ever touches a still-draft row — trying to "edit" an already-sent
// document should fail loudly rather than silently rewrite something a
// staff member may already be looking at.
export async function updateDraftDocument(
  id: string,
  input: { profileId: string; type: StaffDocumentType; title: string; content: string },
): Promise<StaffDocument> {
  const { supabase } = await requireHrManager();
  const title = input.title.trim();
  if (!title) throw new Error("Cần nhập tiêu đề.");

  const { data, error } = await supabase
    .from("staff_documents")
    .update({ profile_id: input.profileId, type: input.type, title, content: input.content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu nháp — có thể văn bản đã được gửi rồi.");

  revalidatePath("/quan-tri/hop-dong");
  revalidatePath(`/quan-tri/hop-dong/${id}`);
  return data as StaffDocument;
}

// The one-way draft -> pending move — this is what actually puts it in the
// recipient's inbox (see the RLS select policy on staff_documents).
export async function sendDraftDocument(id: string): Promise<StaffDocument> {
  const { supabase } = await requireHrManager();
  const { data, error } = await supabase
    .from("staff_documents")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể gửi văn bản.");

  revalidatePath("/quan-tri/hop-dong");
  revalidatePath(`/quan-tri/hop-dong/${id}`);
  revalidatePath("/workspace/hop-dong");
  return data as StaffDocument;
}

// Marks a document cancelled without deleting it — used for a signed
// contract that's been superseded, or a sent-but-not-yet-signed one nobody
// should sign anymore. Deleting outright (below) stays limited to
// draft/pending so a signed record can never just disappear.
export async function voidStaffDocument(id: string): Promise<void> {
  const { supabase } = await requireHrManager();
  const { error } = await supabase.from("staff_documents").update({ status: "voided" }).eq("id", id);
  if (error) throw new Error("Không thể huỷ văn bản.");
  revalidatePath("/quan-tri/hop-dong");
  revalidatePath("/workspace/hop-dong");
}

export async function deleteStaffDocument(id: string): Promise<void> {
  const { supabase } = await requireHrManager();
  const { error } = await supabase.from("staff_documents").delete().eq("id", id).in("status", ["draft", "pending"]);
  if (error) throw new Error("Không thể xoá văn bản.");
  revalidatePath("/quan-tri/hop-dong");
  revalidatePath("/workspace/hop-dong");
}

const ALLOWED_SIGNATURE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;

// Uploads the drawn-signature PNG, then hands off to the sign_staff_document
// RPC (security definer — see supabase/schema.sql) instead of updating the
// row directly, so a staff member's own session can never touch anything on
// this row besides the sign fields, and only once, while it's pending.
export async function signStaffDocument(documentId: string, signedName: string, formData: FormData): Promise<StaffDocument> {
  const { supabase, user } = await requireUser();
  const file = formData.get("signature");
  if (!(file instanceof File)) throw new Error("Thiếu chữ ký.");
  if (!ALLOWED_SIGNATURE_TYPES.has(file.type)) throw new Error("Định dạng chữ ký không hợp lệ.");
  if (file.size > MAX_SIGNATURE_SIZE) throw new Error("Ảnh chữ ký quá lớn.");

  const name = signedName.trim();
  if (!name) throw new Error("Cần nhập họ tên xác nhận.");

  const storagePath = `staff-documents/${documentId}/${user.id}-${randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage.from("task-attachments").upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải chữ ký lên.");

  const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);

  const { data, error } = await supabase.rpc("sign_staff_document", {
    p_document_id: documentId,
    p_signature_image_url: publicUrlData.publicUrl,
    p_signed_name: name,
  });
  if (error || !data) throw new Error(error?.message || "Không thể ký văn bản.");

  revalidatePath("/workspace/hop-dong");
  revalidatePath(`/workspace/hop-dong/${documentId}`);
  revalidatePath("/quan-tri/hop-dong");
  return data as StaffDocument;
}

// Drives the "chưa ký" red-dot in Sidebar/MobileNav.
export async function countMyPendingDocuments(): Promise<number> {
  const { supabase, user } = await requireUser();
  const { count } = await supabase
    .from("staff_documents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("status", "pending");
  return count ?? 0;
}
