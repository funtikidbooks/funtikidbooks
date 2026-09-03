"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { BrushAsset, BrushCategory } from "@/lib/types";

// The actual file bytes go straight from the browser to Supabase Storage
// (see BrushLibrary.tsx) instead of through this server action — brush
// packs run up to 500MB, way past Vercel's request body limit for server
// actions, so routing them through our own server would get rejected
// before ever reaching Supabase. This just records the metadata afterward,
// a tiny payload with no size concerns.
export async function recordBrush(input: {
  name: string;
  category: BrushCategory;
  storagePath: string;
  fileUrl: string;
  fileExt: string;
  sizeBytes: number;
}): Promise<BrushAsset> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("brushes")
    .insert({
      name: input.name,
      category: input.category,
      storage_path: input.storagePath,
      file_url: input.fileUrl,
      file_ext: input.fileExt,
      size_bytes: input.sizeBytes,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    await supabase.storage.from("brushes").remove([input.storagePath]).catch(() => {});
    throw new Error("Không thể lưu brush");
  }
  revalidatePath("/workspace/kho-font");
  return data as BrushAsset;
}

// The swatch image itself is uploaded client-side straight to Storage (see
// BrushLibrary.tsx), same reasoning as the brush file itself — this just
// records the resulting URL and cleans up whatever preview it's replacing.
export async function setBrushPreview(brushId: string, previewUrl: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data: current } = await supabase.from("brushes").select("preview_url").eq("id", brushId).maybeSingle();

  const { error } = await supabase.from("brushes").update({ preview_url: previewUrl }).eq("id", brushId);
  if (error) throw new Error("Không thể lưu ảnh mẫu — chỉ người tải brush lên hoặc Giám đốc mới sửa được.");

  if (current?.preview_url && current.preview_url !== previewUrl) {
    const oldPath = storagePathFromPublicUrl(current.preview_url, "brushes");
    if (oldPath) await supabase.storage.from("brushes").remove([oldPath]).catch(() => {});
  }
  revalidatePath("/workspace/kho-font");
}

export async function deleteBrush(brushId: string, storagePath: string, previewUrl?: string | null) {
  const { supabase } = await requireUser();
  const paths = [storagePath];
  if (previewUrl) {
    const previewPath = storagePathFromPublicUrl(previewUrl, "brushes");
    if (previewPath) paths.push(previewPath);
  }
  await supabase.storage.from("brushes").remove(paths);
  const { error } = await supabase.from("brushes").delete().eq("id", brushId);
  if (error) throw new Error("Không thể xoá brush — chỉ người tải lên hoặc Giám đốc mới xoá được.");
  revalidatePath("/workspace/kho-font");
}
