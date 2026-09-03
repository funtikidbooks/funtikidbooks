"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { Profile } from "@/lib/types";

// Every teammate's basic profile — used by pickers (forward-message
// destinations, @mentions) that need the full roster but aren't the
// director/PM-only "Nhân sự" screens, so this deliberately skips
// requireDirectorOrPM and just requires being signed in.
export async function listWorkspaceProfiles(): Promise<Profile[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").order("display_name", { ascending: true });
  return (data ?? []) as Profile[];
}

// Self-service profile editing — `role` (job title) is deliberately not
// accepted here: it's assigned by the director via Nhân sự, not editable
// by the staff member themselves (the RLS "own profile" update policy also
// doesn't gate this specifically, so the omission here is what enforces it).
export async function updateMyProfile(input: { displayName?: string; phone?: string; address?: string }) {
  const { supabase, user } = await requireUser();
  const patch: Partial<Profile> = {};
  if (input.displayName !== undefined) {
    const trimmed = input.displayName.trim();
    if (!trimmed) throw new Error("Tên hiển thị không được để trống.");
    patch.display_name = trimmed;
  }
  if (input.phone !== undefined) patch.phone = input.phone.trim() || null;
  if (input.address !== undefined) patch.address = input.address.trim() || null;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) throw new Error("Không thể lưu thông tin.");

  revalidatePath("/workspace");
}

// Ties the dark/light choice to the account so it survives localStorage
// getting wiped (browser privacy settings, Safari's ITP purge for inactive
// sites...) — see ThemeSync.tsx for how this gets reconciled on load.
export async function updateMyTheme(theme: "light" | "dark") {
  const { supabase, user } = await requireUser();
  await supabase.from("profiles").update({ theme }).eq("id", user.id);
}

const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  // iPhone camera photos default to HEIC/HEIF — Supabase's image render
  // endpoint (see thumbnailUrl in imageTransform.ts) can transform these
  // fine for display, so there's no reason to reject the upload itself.
  "image/heic",
  "image/heif",
]);
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
const MAX_AVATAR_SIZE = 8 * 1024 * 1024;

export async function updateMyAvatar(formData: FormData) {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp tin");

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  // Some mobile browsers/camera apps send an empty or generic file.type
  // (e.g. "application/octet-stream") for a perfectly normal photo — fall
  // back to guessing from the file extension instead of rejecting it.
  const mime = ALLOWED_AVATAR_TYPES.has(file.type) ? file.type : EXT_TO_MIME[ext];
  if (!mime) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP hoặc HEIC");
  if (file.size > MAX_AVATAR_SIZE) throw new Error("Ảnh vượt quá 8MB");

  const { data: currentProfile } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();

  const storagePath = `avatars/${user.id}-${randomUUID()}.${ext || mime.split("/")[1]}`;

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(storagePath, file, { contentType: mime });
  if (uploadError) throw new Error("Không thể tải ảnh lên");

  const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);

  const { error } = await supabase.from("profiles").update({ avatar_url: publicUrlData.publicUrl }).eq("id", user.id);
  if (error) {
    await supabase.storage.from("task-attachments").remove([storagePath]).catch(() => {});
    throw new Error("Không thể lưu ảnh đại diện");
  }

  // Old avatar is now unreferenced — free the space it was taking up.
  if (currentProfile?.avatar_url) {
    const oldPath = storagePathFromPublicUrl(currentProfile.avatar_url, "task-attachments");
    if (oldPath) await supabase.storage.from("task-attachments").remove([oldPath]).catch(() => {});
  }

  revalidatePath("/workspace");
  return publicUrlData.publicUrl;
}

// Supabase requires confirming a fresh email via a link it sends to that
// address before the change actually takes effect — this call only starts
// that flow, it doesn't change the sign-in email immediately.
export async function updateMyEmail(newEmail: string) {
  const { supabase } = await requireUser();
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) throw new Error("Email không hợp lệ.");

  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) {
    throw new Error(error.message.toLowerCase().includes("already") ? "Email này đã được dùng." : "Không thể đổi email.");
  }
}
