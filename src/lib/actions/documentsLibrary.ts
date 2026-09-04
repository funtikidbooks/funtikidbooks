"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import type { DocumentLibraryItem } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors the can_manage_hr() RLS helper in supabase/schema.sql. Same
// pattern as staffId.ts/documents.ts/payroll.ts's own requireHrManager().
async function requireHrManager() {
  const { supabase, user } = await requireUser();

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

export async function listDocumentLibraryItems(): Promise<DocumentLibraryItem[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase
    .from("document_library_items")
    .select("*")
    .order("folder", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as DocumentLibraryItem[];
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_SIZE = 20 * 1024 * 1024;

// One file per row — a document that changes (a new SOP revision, this
// year's tax filing) is uploaded as a new row rather than overwriting the
// old file in place, so nothing already shared/downloaded silently changes
// out from under whoever has it.
export async function uploadDocumentLibraryItem(
  fields: { title: string; folder: string; note: string },
  formData: FormData,
): Promise<DocumentLibraryItem> {
  const { supabase, user } = await requireHrManager();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Vui lòng chọn tệp cần tải lên.");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ PDF, Word, Excel hoặc ảnh (PNG/JPG/WEBP).");
  if (file.size > MAX_SIZE) throw new Error("Tệp vượt quá 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const folder = fields.folder.trim() || "chung";
  const path = `${folder}/${randomUUID()}${ext ? `.${ext}` : ""}`;

  const { error: uploadError } = await supabase.storage
    .from("documents-library")
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải tệp lên.");

  const { data, error } = await supabase
    .from("document_library_items")
    .insert({
      title: fields.title.trim() || file.name,
      folder: fields.folder.trim() || null,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      note: fields.note.trim() || null,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu tài liệu.");

  revalidatePath("/quan-tri/tai-lieu");
  return data as DocumentLibraryItem;
}

export async function updateDocumentLibraryItem(
  id: string,
  fields: { title: string; folder: string; note: string },
): Promise<DocumentLibraryItem> {
  const { supabase } = await requireHrManager();
  const { data, error } = await supabase
    .from("document_library_items")
    .update({
      title: fields.title.trim(),
      folder: fields.folder.trim() || null,
      note: fields.note.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể cập nhật tài liệu.");

  revalidatePath("/quan-tri/tai-lieu");
  return data as DocumentLibraryItem;
}

export async function deleteDocumentLibraryItem(id: string, filePath: string): Promise<void> {
  const { supabase } = await requireHrManager();
  await supabase.storage.from("documents-library").remove([filePath]);
  const { error } = await supabase.from("document_library_items").delete().eq("id", id);
  if (error) throw new Error("Không thể xoá tài liệu.");

  revalidatePath("/quan-tri/tai-lieu");
}

// A permanent public URL would make a tax/insurance/payroll file reachable
// by anyone who ever gets hold of the link — the bucket is private (see
// schema.sql), so this hands the UI a link that works for a few minutes and
// then stops, generated fresh server-side each time it's actually needed
// rather than stored anywhere. `download: fileName` makes the link save
// with its real original filename instead of the random storage-path uuid.
export async function getDocumentLibraryFileUrl(filePath: string, fileName: string): Promise<string | null> {
  const { supabase } = await requireHrManager();
  const { data, error } = await supabase.storage
    .from("documents-library")
    .createSignedUrl(filePath, 300, { download: fileName });
  if (error || !data) return null;
  return data.signedUrl;
}
