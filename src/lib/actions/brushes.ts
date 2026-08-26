"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BrushAsset, BrushCategory } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

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

  if (error || !data) throw new Error("Không thể lưu brush");
  revalidatePath("/workspace/kho-font");
  return data as BrushAsset;
}

export async function deleteBrush(brushId: string, storagePath: string) {
  const { supabase } = await requireUser();
  await supabase.storage.from("brushes").remove([storagePath]);
  const { error } = await supabase.from("brushes").delete().eq("id", brushId);
  if (error) throw new Error("Không thể xoá brush — chỉ người tải lên hoặc Giám đốc mới xoá được.");
  revalidatePath("/workspace/kho-font");
}
