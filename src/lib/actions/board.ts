"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { Task } from "@/lib/types";
import { logTaskActivity } from "@/lib/actions/task-detail";

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

  revalidatePath("/workspace");
  return data ?? null;
}

export async function renameColumn(columnId: string, title: string) {
  const { supabase } = await requireUser();
  const trimmed = title.trim();
  if (!trimmed) return;
  await supabase.from("board_columns").update({ title: trimmed }).eq("id", columnId);
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
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

  revalidatePath("/workspace");
  return data ?? null;
}

export async function addTaskAssignee(taskId: string, profileId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("task_assignees").insert({ task_id: taskId, profile_id: profileId });
  if (error) return;

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", profileId).maybeSingle();
  if (profile) await logTaskActivity(supabase, taskId, user.id, "assigned", { name: profile.display_name });

  revalidatePath("/workspace");
}

export async function removeTaskAssignee(taskId: string, profileId: string) {
  const { supabase } = await requireUser();
  await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("profile_id", profileId);
  revalidatePath("/workspace");
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
    const oldPath = storagePathFromPublicUrl(currentTask.cover_image_url, "task-attachments");
    if (oldPath) await supabase.storage.from("task-attachments").remove([oldPath]).catch(() => {});
  }

  revalidatePath("/workspace");
  return url;
}

export async function removeTaskCover(taskId: string) {
  const { supabase } = await requireUser();
  const { data: currentTask } = await supabase.from("tasks").select("cover_image_url").eq("id", taskId).maybeSingle();
  await supabase.from("tasks").update({ cover_image_url: null }).eq("id", taskId);
  if (currentTask?.cover_image_url) {
    const path = storagePathFromPublicUrl(currentTask.cover_image_url, "task-attachments");
    if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
  }
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
}

// Changing a card's list from within the card detail view — distinct from
// reorderTasks (drag-and-drop position sync), this always logs an activity
// entry since a list change is a notable event, unlike an in-list reorder.
export async function moveTaskColumn(taskId: string, toColumnId: string) {
  const { supabase, user } = await requireUser();

  const { data: task } = await supabase.from("tasks").select("column_id").eq("id", taskId).maybeSingle();
  if (!task || task.column_id === toColumnId) return;

  const [{ data: fromColumn }, { data: toColumn }, { count }] = await Promise.all([
    supabase.from("board_columns").select("title").eq("id", task.column_id).maybeSingle(),
    supabase.from("board_columns").select("title").eq("id", toColumnId).maybeSingle(),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("column_id", toColumnId),
  ]);

  await supabase.from("tasks").update({ column_id: toColumnId, position: count ?? 0 }).eq("id", taskId);
  await logTaskActivity(supabase, taskId, user.id, "moved", {
    from: fromColumn?.title ?? "",
    to: toColumn?.title ?? "",
  });

  revalidatePath("/workspace");
}

export async function updateTaskLabels(taskId: string, labels: string[]) {
  const { supabase } = await requireUser();
  await supabase.from("tasks").update({ labels }).eq("id", taskId);
  revalidatePath("/workspace");
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

  revalidatePath("/workspace");
  return data ?? null;
}

export async function updateBoardLabel(labelId: string, patch: { name?: string; color?: string }) {
  const { supabase } = await requireUser();
  const update: { name?: string; color?: string } = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.color !== undefined) update.color = patch.color;
  if (Object.keys(update).length === 0) return;
  await supabase.from("board_labels").update(update).eq("id", labelId);
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
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
  revalidatePath("/workspace");
}

/**
 * Persists the result of a drag-and-drop move: every task whose column or
 * position changed gets written in one batch. The client already applied
 * the change optimistically, so this just syncs the database.
 */
export async function reorderTasks(
  updates: { id: string; column_id: string; position: number }[],
) {
  const { supabase } = await requireUser();
  if (updates.length === 0) return;

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("tasks")
        .update({ column_id: u.column_id, position: u.position })
        .eq("id", u.id),
    ),
  );

  revalidatePath("/workspace");
}
