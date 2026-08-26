"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { FontAsset } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

const ALLOWED_EXT = new Set(["ttf", "otf", "woff", "woff2"]);
const MAX_SIZE = 30 * 1024 * 1024;

export async function uploadFont(formData: FormData): Promise<FontAsset> {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp font");

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_EXT.has(ext)) throw new Error("Chỉ hỗ trợ font .ttf, .otf, .woff, .woff2");
  if (file.size > MAX_SIZE) throw new Error("Tệp vượt quá 30MB");

  const name = file.name.replace(/\.[^.]+$/, "");
  const storagePath = `${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("fonts").upload(storagePath, file);
  if (uploadError) throw new Error("Không thể tải font lên");

  const { data: publicUrlData } = supabase.storage.from("fonts").getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("fonts")
    .insert({
      name,
      storage_path: storagePath,
      file_url: publicUrlData.publicUrl,
      file_ext: ext,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    await supabase.storage.from("fonts").remove([storagePath]).catch(() => {});
    throw new Error("Không thể lưu font");
  }
  revalidatePath("/workspace/kho-font");
  return data as FontAsset;
}

export async function deleteFont(fontId: string, storagePath: string) {
  const { supabase } = await requireUser();
  await supabase.storage.from("fonts").remove([storagePath]);
  const { error } = await supabase.from("fonts").delete().eq("id", fontId);
  if (error) throw new Error("Không thể xoá font — chỉ người tải lên hoặc Giám đốc mới xoá được.");
  revalidatePath("/workspace/kho-font");
}
