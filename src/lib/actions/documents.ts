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

// Returns every document for the whole team (HR manager) or just the
// caller's own (regular staff) — RLS already draws that line identically,
// this just saves the caller from having to know which case it's in.
export async function listStaffDocuments(): Promise<StaffDocument[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("staff_documents").select("*").order("created_at", { ascending: false });
  return (data ?? []) as StaffDocument[];
}

export async function getStaffDocument(id: string): Promise<StaffDocument | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("staff_documents").select("*").eq("id", id).maybeSingle();
  return (data as StaffDocument) ?? null;
}

export async function createStaffDocument(input: {
  profileId: string;
  type: StaffDocumentType;
  title: string;
  content: string;
}): Promise<StaffDocument> {
  const { supabase, user } = await requireHrManager();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw new Error("Cần nhập tiêu đề.");
  if (!content) throw new Error("Cần nhập nội dung văn bản.");

  const { data, error } = await supabase
    .from("staff_documents")
    .insert({
      profile_id: input.profileId,
      type: input.type,
      title,
      content,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể tạo văn bản.");

  revalidatePath("/workspace/hop-dong");
  return data as StaffDocument;
}

// Marks a document cancelled without deleting it — used both for a signed
// contract that's been superseded and a pending one nobody should sign
// anymore. Deleting outright (below) stays limited to still-pending drafts
// so a signed record can never just disappear.
export async function voidStaffDocument(id: string): Promise<void> {
  const { supabase } = await requireHrManager();
  const { error } = await supabase.from("staff_documents").update({ status: "voided" }).eq("id", id);
  if (error) throw new Error("Không thể huỷ văn bản.");
  revalidatePath("/workspace/hop-dong");
}

export async function deleteStaffDocument(id: string): Promise<void> {
  const { supabase } = await requireHrManager();
  const { error } = await supabase.from("staff_documents").delete().eq("id", id).eq("status", "pending");
  if (error) throw new Error("Không thể xoá văn bản.");
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
