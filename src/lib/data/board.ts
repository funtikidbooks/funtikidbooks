import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mapTaskAssignees } from "@/lib/mapTaskAssignees";
import type { Profile, TaskWithAssignee } from "@/lib/types";

const DEFAULT_COLUMNS = [
  { title: "Ý tưởng", color: "#78776F" },
  { title: "Cần làm", color: "#4F80D9" },
  { title: "Đang làm", color: "#D6A400" },
  { title: "Đánh giá", color: "#FF7A3D" },
  { title: "Hoàn thành", color: "#3F9E52" },
];

export async function getOrCreateDefaultBoard(userId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("boards")
    .select("id, title, color, created_by, created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("boards")
    .insert({ title: "Bảng công việc chung", color: "#FF7A3D", created_by: userId })
    .select("id, title, color, created_by, created_at")
    .single();

  if (error || !created) {
    throw new Error("Không thể khởi tạo bảng công việc.");
  }

  await supabase.from("board_columns").insert(
    DEFAULT_COLUMNS.map((col, i) => ({
      board_id: created.id,
      title: col.title,
      color: col.color,
      position: i,
    })),
  );

  return created;
}

export async function getBoardData(boardId: string) {
  const supabase = await createClient();

  const [{ data: columns }, { data: tasks }, { data: profiles }] = await Promise.all([
    supabase
      .from("board_columns")
      .select("id, board_id, title, color, position, created_at")
      .eq("board_id", boardId)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select(
        "id, board_id, column_id, code, title, description, assignee_id, start_date, due_date, progress, position, cover_image_url, labels, created_by, created_at, updated_at, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url), assignees:task_assignees(profile:profiles(id, display_name, avatar_url)), checklist_items:task_checklist_items(id, done), comment_count:task_comments(count), attachment_count:task_attachments(count)",
      )
      .eq("board_id", boardId)
      .order("position", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, created_at")
      .order("display_name", { ascending: true }),
  ]);

  return {
    columns: columns ?? [],
    tasks: ((tasks ?? []) as unknown as (TaskWithAssignee & { assignees: unknown })[]).map((t) => ({
      ...t,
      assignees: mapTaskAssignees(t.assignees),
    })),
    profiles: (profiles ?? []) as Profile[],
  };
}
