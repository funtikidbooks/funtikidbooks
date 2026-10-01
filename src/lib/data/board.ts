import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mapTaskAssignees } from "@/lib/mapTaskAssignees";
import { BOARD_TASK_SELECT, isDeferredColumnTitle } from "@/lib/boardTools";
import type { BoardLabel, Profile, TaskWithAssignee } from "@/lib/types";

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

// The board as it opens: every list, the cards of the working lists, and
// only how many cards each finished-work list ("Final 2025…") holds — those
// lists are ~90% of all cards (519KB of 568 cards vs 93KB of the 57 in
// play), and the board fetches them itself right after it's on screen.
export async function getBoardData(boardId: string) {
  const supabase = await createClient();

  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, board_id, title, color, position, created_at")
    .eq("board_id", boardId)
    .order("position", { ascending: true });
  const deferredIds = (columns ?? []).filter((c) => isDeferredColumnTitle(c.title)).map((c) => c.id as string);

  let tasksQuery = supabase.from("tasks").select(BOARD_TASK_SELECT).eq("board_id", boardId);
  if (deferredIds.length > 0) tasksQuery = tasksQuery.not("column_id", "in", `(${deferredIds.join(",")})`);

  const [{ data: tasks }, { data: profiles }, { data: boardLabels }, ...counts] = await Promise.all([
    tasksQuery.order("position", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, created_at")
      .order("display_name", { ascending: true }),
    supabase
      .from("board_labels")
      .select("id, board_id, name, color, position, created_at")
      .eq("board_id", boardId)
      .order("position", { ascending: true }),
    ...deferredIds.map((id) => supabase.from("tasks").select("id", { count: "exact", head: true }).eq("column_id", id)),
  ]);

  return {
    columns: columns ?? [],
    tasks: ((tasks ?? []) as unknown as (TaskWithAssignee & { assignees: unknown })[]).map((t) => ({
      ...t,
      assignees: mapTaskAssignees(t.assignees),
    })),
    profiles: (profiles ?? []) as Profile[],
    boardLabels: (boardLabels ?? []) as BoardLabel[],
    deferredCounts: Object.fromEntries(deferredIds.map((id, i) => [id, counts[i]?.count ?? 0])) as Record<string, number>,
  };
}
