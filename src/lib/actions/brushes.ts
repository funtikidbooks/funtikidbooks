"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { BRUSH_CATEGORY_EXT, BRUSH_CATEGORY_LABELS } from "@/lib/brushCategory";
import type { BrushAsset, BrushCategory } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

const MAX_SIZE = 500 * 1024 * 1024;

export async function uploadBrush(formData: FormData): Promise<BrushAsset> {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp brush");

  const categoryInput = formData.get("category");
  if (typeof categoryInput !== "string" || !(categoryInput in BRUSH_CATEGORY_EXT)) throw new Error("Thiếu loại brush");
  const category = categoryInput as BrushCategory;
  const allowedExt = BRUSH_CATEGORY_EXT[category];

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!allowedExt.includes(ext)) {
    throw new Error(`Brush ${BRUSH_CATEGORY_LABELS[category]} chỉ hỗ trợ đuôi .${allowedExt.join(", .")}`);
  }
  if (file.size > MAX_SIZE) throw new Error("Tệp vượt quá 500MB");

  const name = file.name.replace(/\.[^.]+$/, "");
  const storagePath = `${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("brushes").upload(storagePath, file);
  if (uploadError) throw new Error("Không thể tải brush lên");

  const { data: publicUrlData } = supabase.storage.from("brushes").getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("brushes")
    .insert({
      name,
      category,
      storage_path: storagePath,
      file_url: publicUrlData.publicUrl,
      file_ext: ext,
      size_bytes: file.size,
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
