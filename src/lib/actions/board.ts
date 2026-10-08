"use server";

// No revalidatePath("/workspace") after a change (10/2026): the board keeps
// its own state and follows changes over realtime, so re-rendering the whole
// board on the server after every drag, tick or comment only burned Vercel
// CPU (the free plan’s allowance ran out).
import { requireUser } from "@/lib/supabase/server";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { Task } from "@/lib/types";
import { logTaskActivity } from "@/lib/actions/task-detail";
import { ARCHIVE_COLUMN_TITLE } from "@/lib/boardTools";

export async function createColumn(boardId: string, title: string) {
  const { supabase } = await requireUser();
  const trimmed = title.trim();
  if (!trimmed) return null;

  const { count } = await supabase
    .from("board_columns")
    .select("id", { count: "exact", head: true })
    .eq("board_id", boardId);

  const { data } = await supabase
    .from("board_columns")
    .insert({ board_id: boardId, title: trimmed, color: "#78776F", position: count ?? 0 })
    .select("id, board_id, title, color, position, created_at")
    .single();

  return data ?? null;
}

export async function renameColumn(columnId: string, title: string) {
  const { supabase } = await requireUser();
  const trimmed = title.trim();
  if (!trimmed) return;
  await supabase.from("board_columns").update({ title: trimmed }).eq("id", columnId);
}

export async function deleteColumn(columnId: string) {
  const { supabase } = await requireUser();

  // tasks (and task_attachments through them) cascade-delete with the
  // column at the DB level, but that never touches storage — every cover
  // image and attachment across every task in this column would otherwise
  // be orphaned.
  const { data: tasks } = await supabase.from("tasks").select("id, cover_image_url").eq("column_id", columnId);
  const taskIds = (tasks ?? []).map((t) => t.id as string);
  const paths: string[] = [];
  for (const t of tasks ?? []) {
    if (t.cover_image_url) {
      const p = storagePathFromPublicUrl(t.cover_image_url as string, "task-attachments");
      if (p) paths.push(p);
    }
  }
  if (taskIds.length > 0) {
    const { data: attachments } = await supabase.from("task_attachments").select("storage_path").in("task_id", taskIds);
    paths.push(...(attachments ?? []).map((a) => a.storage_path as string));
  }
  if (paths.length > 0) await supabase.storage.from("task-attachments").remove(paths).catch(() => {});

  await supabase.from("board_columns").delete().eq("id", columnId);
}

function randomTaskCode() {
  return "#" + String(Math.floor(Math.random() * 900) + 100);
}

export async function createTask(input: {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}) {
  const { supabase, user } = await requireUser();
  const title = input.title.trim();
  if (!title) return null;

  const [{ count }, { data: column }] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("column_id", input.columnId),
    supabase.from("board_columns").select("title").eq("id", input.columnId).maybeSingle(),
  ]);

  const { data } = await supabase
    .from("tasks")
    .insert({
      board_id: input.boardId,
      column_id: input.columnId,
      code: randomTaskCode(),
      title,
      description: input.description?.trim() || null,
      assignee_id: input.assigneeId || null,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      position: count ?? 0,
      created_by: user.id,
    })
    .select(
      "id, board_id, column_id, code, title, description, assignee_id, start_date, due_date, progress, position, cover_image_url, labels, created_by, created_at, updated_at",
    )
    .single();

  if (data) {
    await logTaskActivity(supabase, data.id, user.id, "created", { column: column?.title ?? "" });
    if (input.assigneeId) {
      await supabase.from("task_assignees").insert({ task_id: data.id, profile_id: input.assigneeId });
    }
  }

  return data ?? null;
}

export async function addTaskAssignee(taskId: string, profileId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("task_assignees").insert({ task_id: taskId, profile_id: profileId });
  if (error) return;

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", profileId).maybeSingle();
  if (profile) await logTaskActivity(supabase, taskId, user.id, "assigned", { name: profile.display_name });

}

export async function removeTaskAssignee(taskId: string, profileId: string) {
  const { supabase } = await requireUser();
  await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("profile_id", profileId);
}

// The file itself is uploaded client-side, straight to Supabase Storage
// (see TaskCover.tsx) — never routed through this action. A Server Action's
// body goes through Vercel's serverless function invocation, which caps
// request bodies at 4.5MB regardless of Next.js's own configured
// bodySizeLimit; real illustration files routinely exceed that. This action
// only ever receives the resulting URL, a tiny payload with no such limit.
export async function setTaskCoverUrl(taskId: string, url: string) {
  const { supabase } = await requireUser();
  const { data: currentTask } = await supabase.from("tasks").select("cover_image_url").eq("id", taskId).maybeSingle();

  await supabase.from("tasks").update({ cover_image_url: url }).eq("id", taskId);

  // Old cover is now unreferenced — free the space it was taking up.
  if (currentTask?.cover_image_url && currentTask.cover_image_url !== url) {
    await removeCoverFile(supabase, taskId, currentTask.cover_image_url);
  }

  return url;
}

// A cover picked from the card's own attachments ("Đặt làm ảnh bìa") is
// still that attachment — only a cover uploaded on its own gets deleted
// from storage when it's replaced or removed.
async function removeCoverFile(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], taskId: string, url: string) {
  const { count } = await supabase.from("task_attachments").select("id", { count: "exact", head: true }).eq("task_id", taskId).eq("url", url);
  if (count) return;
  const path = storagePathFromPublicUrl(url, "task-attachments");
  if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
}

export async function removeTaskCover(taskId: string) {
  const { supabase } = await requireUser();
  const { data: currentTask } = await supabase.from("tasks").select("cover_image_url").eq("id", taskId).maybeSingle();
  await supabase.from("tasks").update({ cover_image_url: null }).eq("id", taskId);
  if (currentTask?.cover_image_url) await removeCoverFile(supabase, taskId, currentTask.cover_image_url);
}

export async function updateTask(
  taskId: string,
  input: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
  },
) {
  const { supabase } = await requireUser();
  const patch: Partial<Task> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId || null;
  if (input.startDate !== undefined) patch.start_date = input.startDate || null;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;

  await supabase.from("tasks").update(patch).eq("id", taskId);
}

// Changing a card's list from the card or its quick menu — distinct from
// reorderTasks (drag-and-drop position sync), this always logs an activity
// entry since a list change is a notable event, unlike an in-list reorder.
// The card lands on top of the new list, where the studio keeps its newest.
export async function moveTaskColumn(taskId: string, toColumnId: string) {
  const { supabase, user } = await requireUser();

  const { data: task } = await supabase.from("tasks").select("column_id").eq("id", taskId).maybeSingle();
  if (!task || task.column_id === toColumnId) return;

  const [{ data: fromColumn }, { data: toColumn }, { data: first }] = await Promise.all([
    supabase.from("board_columns").select("title").eq("id", task.column_id).maybeSingle(),
    supabase.from("board_columns").select("title").eq("id", toColumnId).maybeSingle(),
    supabase.from("tasks").select("position").eq("column_id", toColumnId).order("position", { ascending: true }).limit(1).maybeSingle(),
  ]);

  const position = first ? Math.min(0, (first.position as number) - 1) : 0;
  await supabase.from("tasks").update({ column_id: toColumnId, position }).eq("id", taskId);
  await logTaskActivity(supabase, taskId, user.id, "moved", {
    from: fromColumn?.title ?? "",
    to: toColumn?.title ?? "",
  });

}

export async function updateTaskLabels(taskId: string, labels: string[]) {
  const { supabase } = await requireUser();
  await supabase.from("tasks").update({ labels }).eq("id", taskId);
}

export async function createBoardLabel(boardId: string, name: string, color: string) {
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("board_labels")
    .select("id", { count: "exact", head: true })
    .eq("board_id", boardId);

  const { data } = await supabase
    .from("board_labels")
    .insert({ board_id: boardId, name: name.trim(), color, position: count ?? 0 })
    .select("id, board_id, name, color, position, created_at")
    .single();

  return data ?? null;
}

export async function updateBoardLabel(labelId: string, patch: { name?: string; color?: string }) {
  const { supabase } = await requireUser();
  const update: { name?: string; color?: string } = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.color !== undefined) update.color = patch.color;
  if (Object.keys(update).length === 0) return;
  await supabase.from("board_labels").update(update).eq("id", labelId);
}

export async function deleteBoardLabel(labelId: string) {
  const { supabase } = await requireUser();

  // tasks.labels is a plain text[], not a foreign key — a deleted label's id
  // would otherwise stay stuck on every card that had it checked.
  const { data: tasks } = await supabase.from("tasks").select("id, labels").contains("labels", [labelId]);
  for (const t of tasks ?? []) {
    const next = (t.labels as string[]).filter((id) => id !== labelId);
    await supabase.from("tasks").update({ labels: next }).eq("id", t.id);
  }

  await supabase.from("board_labels").delete().eq("id", labelId);
}

export async function deleteTask(taskId: string) {
  const { supabase } = await requireUser();

  // task_attachments cascade-deletes with the task at the DB level, but
  // that never touches storage — clean up the cover and every attachment
  // first or they'd be orphaned.
  const [{ data: task }, { data: attachments }] = await Promise.all([
    supabase.from("tasks").select("cover_image_url").eq("id", taskId).maybeSingle(),
    supabase.from("task_attachments").select("storage_path").eq("task_id", taskId),
  ]);
  const paths = (attachments ?? []).map((a) => a.storage_path as string);
  if (task?.cover_image_url) {
    const coverPath = storagePathFromPublicUrl(task.cover_image_url, "task-attachments");
    if (coverPath) paths.push(coverPath);
  }
  if (paths.length > 0) await supabase.storage.from("task-attachments").remove(paths).catch(() => {});

  await supabase.from("tasks").delete().eq("id", taskId);
}

/**
 * Persists the result of a drag-and-drop move: every task whose column or
 * position changed gets written in one batch. The client already applied
 * the change optimistically, so this just syncs the database.
 */
export async function reorderTasks(
  updates: { id: string; column_id: string; position: number }[],
  moved?: { taskId: string; from: string; to: string },
) {
  const { supabase, user } = await requireUser();
  if (updates.length === 0) return;

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("tasks")
        .update({ column_id: u.column_id, position: u.position })
        .eq("id", u.id),
    ),
  );
  // A card dragged to another list shows up in its activity, like Trello.
  if (moved && moved.from !== moved.to) await logTaskActivity(supabase, moved.taskId, user.id, "moved", { from: moved.from, to: moved.to });

}

export async function setDueComplete(taskId: string, done: boolean) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("tasks").update({ due_complete: done }).eq("id", taskId);
  if (error) {
    throw new Error(
      /due_complete/.test(error.message)
        ? "Cần chạy file SQL board_trello_parity.sql trong Supabase trước khi đánh dấu hoàn tất."
        : "Không lưu được dấu hoàn tất.",
    );
  }
  await logTaskActivity(supabase, taskId, user.id, done ? "due_complete" : "due_incomplete");
}

// ---------------------------------------------------------------------------
// Trello-style actions: list order, archive/restore, copy.
// ---------------------------------------------------------------------------

// Positions of the visible lists after a "move left/right" — the client
// already reordered locally, this just writes the new order.
export async function reorderColumns(orderedIds: string[]) {
  const { supabase } = await requireUser();
  await Promise.all(orderedIds.map((id, i) => supabase.from("board_columns").update({ position: i }).eq("id", id)));
}

// The hidden list archived cards live in (see lib/boardTools.ts), created
// the first time anything on this board is archived.
async function archiveColumnId(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], boardId: string) {
  const { data: existing } = await supabase
    .from("board_columns")
    .select("id")
    .eq("board_id", boardId)
    .eq("title", ARCHIVE_COLUMN_TITLE)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await supabase
    .from("board_columns")
    .insert({ board_id: boardId, title: ARCHIVE_COLUMN_TITLE, color: "#78776F", position: 9999 })
    .select("id")
    .single();
  return (created?.id as string) ?? null;
}

export async function archiveTasks(taskIds: string[]) {
  const { supabase, user } = await requireUser();
  if (taskIds.length === 0) return;
  const { data: tasks } = await supabase.from("tasks").select("id, board_id").in("id", taskIds);
  const boardId = tasks?.[0]?.board_id as string | undefined;
  if (!boardId) return;
  const archiveId = await archiveColumnId(supabase, boardId);
  if (!archiveId) throw new Error("Không tạo được mục Lưu trữ.");
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("column_id", archiveId);
  await Promise.all(
    taskIds.map((id, i) => supabase.from("tasks").update({ column_id: archiveId, position: (count ?? 0) + i }).eq("id", id)),
  );
  await Promise.all(taskIds.map((id) => logTaskActivity(supabase, id, user.id, "moved", { from: "", to: ARCHIVE_COLUMN_TITLE })));
  return archiveId;
}

export async function restoreTask(taskId: string, toColumnId: string) {
  // Same bookkeeping as any list change (position at the end + activity).
  await moveTaskColumn(taskId, toColumnId);
}

// Copies a card into a list (the same one by default): title, description,
// dates, labels, cover, members and checklist — comments and attachments
// stay with the original, like Trello's default copy.
export async function copyTask(taskId: string, toColumnId?: string) {
  const { supabase, user } = await requireUser();
  const [{ data: src }, { data: members }, { data: checklist }] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
    supabase.from("task_assignees").select("profile_id").eq("task_id", taskId),
    supabase.from("task_checklist_items").select("*").eq("task_id", taskId),
  ]);
  if (!src) throw new Error("Không tìm thấy thẻ.");
  const columnId = toColumnId ?? (src.column_id as string);
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("column_id", columnId);
  const { data: copy, error } = await supabase
    .from("tasks")
    .insert({
      board_id: src.board_id,
      column_id: columnId,
      code: randomTaskCode(),
      title: src.title,
      description: src.description,
      assignee_id: src.assignee_id,
      start_date: src.start_date,
      due_date: src.due_date,
      cover_image_url: null,
      labels: src.labels,
      position: count ?? 0,
      created_by: user.id,
    })
    .select(
      "id, board_id, column_id, code, title, description, assignee_id, start_date, due_date, progress, position, cover_image_url, labels, created_by, created_at, updated_at",
    )
    .single();
  if (error || !copy) throw new Error("Không sao chép được thẻ.");
  if (members?.length) await supabase.from("task_assignees").insert(members.map((m) => ({ task_id: copy.id, profile_id: m.profile_id })));
  if (checklist?.length) {
    await supabase
      .from("task_checklist_items")
      .insert(checklist.map((c) => ({ task_id: copy.id as string, text: c.text, done: c.done, position: c.position })));
  }
  await logTaskActivity(supabase, copy.id as string, user.id, "created", { column: "(bản sao)" });
  return copy;
}

// Trello's "Đổi hình nền": one background for everyone on the board.
export async function setBoardBackground(boardId: string, key: string) {
  const { supabase } = await requireUser();
  if (!/^bg:[a-z]{2,20}$/.test(key)) throw new Error("Hình nền không hợp lệ");
  await supabase.from("boards").update({ color: key }).eq("id", boardId);
}

export type BoardActivityItem = {
  id: string;
  kind: "activity" | "comment";
  created_at: string;
  actor: string;
  type?: string;
  metadata?: Record<string, string>;
  text?: string;
  task: { id: string; code: string; title: string };
};

// The board menu's "Hoạt động": the latest moves, attachments and comments
// across every card on this board, newest first.
export async function getBoardActivity(boardId: string): Promise<BoardActivityItem[]> {
  const { supabase } = await requireUser();
  const [{ data: acts }, { data: comments }] = await Promise.all([
    supabase
      .from("task_activity")
      .select("id, type, metadata, created_at, actor:profiles(display_name), task:tasks!inner(id, code, title, board_id)")
      .eq("task.board_id", boardId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("task_comments")
      .select("id, content, created_at, author:profiles(display_name), task:tasks!inner(id, code, title, board_id)")
      .eq("task.board_id", boardId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  type Row = { id: string; created_at: string; task: { id: string; code: string; title: string } };
  const name = (p: unknown) => (p as { display_name?: string } | null)?.display_name ?? "Ai đó";
  const items: BoardActivityItem[] = [
    ...((acts ?? []) as unknown as (Row & { type: string; metadata: Record<string, string>; actor: unknown })[]).map((a) => ({
      id: a.id,
      kind: "activity" as const,
      created_at: a.created_at,
      actor: name(a.actor),
      type: a.type,
      metadata: a.metadata ?? {},
      task: { id: a.task.id, code: a.task.code, title: a.task.title },
    })),
    ...((comments ?? []) as unknown as (Row & { content: string; author: unknown })[]).map((c) => ({
      id: c.id,
      kind: "comment" as const,
      created_at: c.created_at,
      actor: name(c.author),
      text: c.content,
      task: { id: c.task.id, code: c.task.code, title: c.task.title },
    })),
  ];
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80);
}
