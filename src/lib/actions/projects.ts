"use server";

import { createClient } from "@/lib/supabase/server";

// Public, unauthenticated actions — any site visitor can call these. The
// counters themselves are only writable through the increment_project_view
// / set_project_like Postgres functions (see supabase/schema.sql), which
// each touch just their one counter column.

export async function trackProjectView(projectId: string) {
  const supabase = await createClient();
  await supabase.rpc("increment_project_view", { project_id: projectId });
}

export async function setProjectLike(projectId: string, liked: boolean): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_project_like", { project_id: projectId, liked });
  if (error) return null;
  return data;
}
