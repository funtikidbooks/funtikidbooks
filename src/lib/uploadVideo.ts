import { createClient } from "@/lib/supabase/client";

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_SIZE = 300 * 1024 * 1024;

// Uploaded directly from the browser straight to Supabase Storage (using the
// signed-in director/admin's own session for RLS) — bypasses the Next.js
// server action body size limit entirely, so large video files work.
export async function uploadVideoDirect(file: File): Promise<string> {
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ video MP4, WebM hoặc MOV");
  if (file.size > MAX_VIDEO_SIZE) throw new Error("Video vượt quá 300MB");

  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "mp4";
  const storagePath = `videos/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("site-content")
    .upload(storagePath, file, { contentType: file.type });
  if (error) throw new Error("Không thể tải video lên");

  const { data } = supabase.storage.from("site-content").getPublicUrl(storagePath);
  return data.publicUrl;
}
