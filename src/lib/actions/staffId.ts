"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import type { StaffIdDocument } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors the can_manage_hr() RLS helper in supabase/schema.sql. Same
// pattern as documents.ts/payroll.ts's own requireHrManager().
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

export async function listStaffIdDocuments(): Promise<StaffIdDocument[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase.from("staff_id_documents").select("*");
  return (data ?? []) as StaffIdDocument[];
}

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

async function uploadOne(
  supabase: Awaited<ReturnType<typeof requireHrManager>>["supabase"],
  profileId: string,
  side: "front" | "back",
  file: File,
) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Ảnh CCCD chỉ hỗ trợ PNG, JPG hoặc WEBP.");
  if (file.size > MAX_SIZE) throw new Error("Ảnh vượt quá 10MB.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${profileId}/${side}-${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("staff-id-documents").upload(path, file, { contentType: file.type });
  if (error) throw new Error("Không thể tải ảnh CCCD lên.");
  return path;
}

// One row per profile — upserted on profile_id, which carries a unique
// constraint (see supabase/schema.sql), so re-saving the same person's
// info just replaces the row instead of accumulating duplicates. Images
// are optional: formData only carries "front"/"back" when the director
// actually picked new files this time, so re-saving text fields alone
// never wipes an already-uploaded photo.
export async function upsertStaffIdDocument(
  profileId: string,
  fields: {
    fullName: string;
    idNumber: string;
    dob: string;
    sex: string;
    permanentAddress: string;
    temporaryAddress: string;
    issuedDate: string;
    issuedPlace: string;
    expiryDate: string;
    note: string;
  },
  formData?: FormData,
): Promise<StaffIdDocument> {
  const { supabase, user } = await requireHrManager();

  const frontFile = formData?.get("front");
  const backFile = formData?.get("back");
  const frontPath = frontFile instanceof File && frontFile.size > 0 ? await uploadOne(supabase, profileId, "front", frontFile) : undefined;
  const backPath = backFile instanceof File && backFile.size > 0 ? await uploadOne(supabase, profileId, "back", backFile) : undefined;

  const row = {
    profile_id: profileId,
    full_name: fields.fullName.trim() || null,
    id_number: fields.idNumber.trim() || null,
    dob: fields.dob || null,
    sex: fields.sex.trim() || null,
    permanent_address: fields.permanentAddress.trim() || null,
    temporary_address: fields.temporaryAddress.trim() || null,
    issued_date: fields.issuedDate || null,
    issued_place: fields.issuedPlace.trim() || null,
    expiry_date: fields.expiryDate || null,
    note: fields.note.trim() || null,
    created_by: user.id,
    ...(frontPath ? { front_image_path: frontPath } : {}),
    ...(backPath ? { back_image_path: backPath } : {}),
  };

  const { data, error } = await supabase
    .from("staff_id_documents")
    .upsert(row, { onConflict: "profile_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu thông tin CCCD.");
  return data as StaffIdDocument;
}

// A permanent public URL would make a CCCD photo reachable by anyone who
// ever gets hold of the link — the bucket is private (see schema.sql), so
// this hands the UI a link that works for a few minutes and then stops,
// generated fresh server-side each time the modal actually needs to show
// the image rather than stored anywhere.
export async function getStaffIdImageUrl(path: string): Promise<string | null> {
  const { supabase } = await requireHrManager();
  const { data, error } = await supabase.storage.from("staff-id-documents").createSignedUrl(path, 300);
  if (error || !data) return null;
  return data.signedUrl;
}
