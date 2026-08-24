import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EditorProject } from "@/lib/types";

export async function getEditorProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("editor_projects")
    .select("id, name, background_url, background_width, background_height, updated_at")
    .order("updated_at", { ascending: false });
  return (data ?? []) as Pick<
    EditorProject,
    "id" | "name" | "background_url" | "background_width" | "background_height" | "updated_at"
  >[];
}

export async function getEditorProject(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("editor_projects").select("*").eq("id", id).maybeSingle();
  return data as EditorProject | null;
}
