"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import type { MindmapNode, MindmapProject, NewsPost } from "@/lib/types";

// Internal "Dự án" mindmap tool — see supabase/migrations/mindmap_projects.sql
// for the schema/RLS. Any signed-in staff account can read/write, same as
// the Kanban board; a linked draft news_posts row stays gated by its own
// RLS (director/admin only) regardless of who can see the node itself.

export async function getMindmapProjects(): Promise<(MindmapProject & { nodeCount: number })[]> {
  const { supabase } = await requireUser();
  const { data: projects } = await supabase.from("mindmap_projects").select("*").order("created_at", { ascending: false });
  if (!projects || projects.length === 0) return [];

  const { data: nodes } = await supabase.from("mindmap_nodes").select("project_id");
  const counts = new Map<string, number>();
  for (const n of nodes ?? []) counts.set(n.project_id, (counts.get(n.project_id) ?? 0) + 1);

  return (projects as MindmapProject[]).map((p) => ({ ...p, nodeCount: counts.get(p.id) ?? 0 }));
}

// Creates the project and its root node (title-only, centered) in one call
// so a project is never left with zero nodes — the canvas always has
// somewhere to branch from.
export async function createMindmapProject(title: string, color = "#FF7A3D"): Promise<MindmapProject> {
  const { supabase, user } = await requireUser();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Thiếu tên dự án");

  const { data: project, error } = await supabase
    .from("mindmap_projects")
    .insert({ title: trimmed, color, created_by: user.id })
    .select("*")
    .single();
  if (error || !project) throw new Error("Không thể tạo dự án");

  const { error: nodeError } = await supabase
    .from("mindmap_nodes")
    .insert({ project_id: project.id, parent_id: null, title: trimmed, x: 0, y: 0, color, created_by: user.id });
  if (nodeError) throw new Error("Không thể tạo nhánh gốc");

  revalidatePath("/workspace/du-an");
  return project as MindmapProject;
}

export async function deleteMindmapProject(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("mindmap_projects").delete().eq("id", id);
  revalidatePath("/workspace/du-an");
}

export async function getMindmapProjectDetail(
  id: string,
): Promise<{ project: MindmapProject; nodes: MindmapNode[] } | null> {
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("mindmap_projects").select("*").eq("id", id).maybeSingle();
  if (!project) return null;

  const { data: nodes } = await supabase
    .from("mindmap_nodes")
    .select("*, news_post:linked_news_post_id(id, title, excerpt, category, published, created_at)")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  return { project: project as MindmapProject, nodes: (nodes ?? []) as unknown as MindmapNode[] };
}

export async function createMindmapNode(input: {
  projectId: string;
  parentId: string;
  title: string;
  x: number;
  y: number;
  isListItem?: boolean;
}): Promise<MindmapNode> {
  const { supabase, user } = await requireUser();
  const title = input.title.trim() || "Nhánh mới";

  const { data: parent } = await supabase.from("mindmap_nodes").select("color").eq("id", input.parentId).maybeSingle();

  const { data, error } = await supabase
    .from("mindmap_nodes")
    .insert({
      project_id: input.projectId,
      parent_id: input.parentId,
      title,
      x: input.x,
      y: input.y,
      color: parent?.color ?? null,
      is_list_item: input.isListItem ?? false,
      created_by: user.id,
    })
    .select("*, news_post:linked_news_post_id(id, title, excerpt, category, published, created_at)")
    .single();
  if (error || !data) throw new Error("Không thể tạo nhánh");

  revalidatePath("/workspace/du-an");
  return data as unknown as MindmapNode;
}

export async function updateMindmapNode(
  id: string,
  patch: {
    title?: string;
    note?: string | null;
    x?: number;
    y?: number;
    color?: string | null;
    linkedNewsPostId?: string | null;
    linkUrl?: string | null;
  },
): Promise<void> {
  const { supabase } = await requireUser();
  const row: Partial<Omit<MindmapNode, "news_post">> = {};
  if (patch.linkUrl !== undefined) {
    const url = patch.linkUrl?.trim() || null;
    // An in-app path or a plain web link only — never javascript:/data:
    // or a protocol-relative "//host" link rendered as a clickable button.
    if (url && !/^\/(?!\/)/.test(url) && !/^https?:\/\//i.test(url)) {
      throw new Error("Liên kết phải bắt đầu bằng / hoặc https://");
    }
    row.link_url = url;
  }
  if (patch.title !== undefined) row.title = patch.title.trim() || "Chưa đặt tên";
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  if (patch.x !== undefined) row.x = patch.x;
  if (patch.y !== undefined) row.y = patch.y;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.linkedNewsPostId !== undefined) row.linked_news_post_id = patch.linkedNewsPostId;

  const { error } = await supabase.from("mindmap_nodes").update(row).eq("id", id);
  if (error) throw new Error("Không thể cập nhật nhánh");
  revalidatePath("/workspace/du-an");
}

// Cascades to every descendant branch (on delete cascade on parent_id) —
// deleting a branch takes its whole sub-tree with it, same as a real
// mindmap. The root node (parent_id null) can't be deleted on its own;
// deleteMindmapProject removes the whole project instead.
export async function deleteMindmapNode(id: string) {
  const { supabase } = await requireUser();
  const { data: node } = await supabase.from("mindmap_nodes").select("parent_id").eq("id", id).maybeSingle();
  if (node && node.parent_id === null) throw new Error("Không thể xoá nhánh gốc — xoá cả dự án nếu muốn bỏ.");
  await supabase.from("mindmap_nodes").delete().eq("id", id);
  revalidatePath("/workspace/du-an");
}

// Drafts available to link into a node — RLS on news_posts already limits
// unpublished rows to director/admin sessions, so a regular staff member
// simply gets an empty list here rather than an error.
export async function getDraftNewsPosts(): Promise<Pick<NewsPost, "id" | "title" | "excerpt" | "category" | "created_at">[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("news_posts")
    .select("id, title, excerpt, category, created_at")
    .eq("published", false)
    .order("created_at", { ascending: false });
  return data ?? [];
}
