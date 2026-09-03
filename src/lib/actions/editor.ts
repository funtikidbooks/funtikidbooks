"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { EditorLayer, EditorProject } from "@/lib/types";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_SIZE = 20 * 1024 * 1024;

async function uploadEditorFile(supabase: Awaited<ReturnType<typeof createClient>>, folder: string, file: File) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WEBP");
  if (file.size > MAX_SIZE) throw new Error("Ảnh vượt quá 20MB");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("editor-uploads").upload(storagePath, file, { contentType: file.type });
  if (error) throw new Error("Không thể tải ảnh lên");

  const { data } = supabase.storage.from("editor-uploads").getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function createEditorProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim() || "Bản chỉnh sửa mới";
  const width = parseInt(String(formData.get("width") ?? ""), 10) || 1000;
  const height = parseInt(String(formData.get("height") ?? ""), 10) || 1000;
  if (!(file instanceof File)) throw new Error("Thiếu tệp tin");

  const backgroundUrl = await uploadEditorFile(supabase, "backgrounds", file);

  const { data, error } = await supabase
    .from("editor_projects")
    .insert({
      name,
      background_url: backgroundUrl,
      background_width: width,
      background_height: height,
      layers: [],
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo bản chỉnh sửa");
  revalidatePath("/workspace/bien-tap");
  return data as EditorProject;
}

export async function updateEditorProject(id: string, input: { name?: string; layers?: EditorLayer[] }) {
  const { supabase } = await requireUser();
  const patch: Partial<Pick<EditorProject, "name" | "layers">> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Bản chỉnh sửa mới";
  if (input.layers !== undefined) patch.layers = input.layers;

  const { data, error } = await supabase.from("editor_projects").update(patch).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể lưu");

  revalidatePath("/workspace/bien-tap");
  revalidatePath(`/workspace/bien-tap/${id}`);
  return data as EditorProject;
}

export async function deleteEditorProject(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("editor_projects").delete().eq("id", id);
  revalidatePath("/workspace/bien-tap");
}

export async function uploadEditorImage(formData: FormData) {
  const { supabase } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp tin");
  return uploadEditorFile(supabase, "layers", file);
}
