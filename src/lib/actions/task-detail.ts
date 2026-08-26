"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { mapTaskAssignees } from "@/lib/mapTaskAssignees";
import type {
  ChecklistItem,
  TaskActivity,
  TaskActivityType,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskLink,
  TaskWithAssignee,
} from "@/lib/types";

const ATTACHMENT_SELECT =
  "id, task_id, comment_id, uploaded_by, url, storage_path, filename, mime_type, size, created_at" as const;
const COMMENT_SELECT =
  "id, task_id, user_id, content, created_at, author:profiles(id, display_name, avatar_url)" as const;
const TASK_SELECT =
  "id, board_id, column_id, code, title, description, assignee_id, start_date, due_date, progress, position, cover_image_url, labels, created_by, created_at, updated_at, assignee:profiles!tasks_assignee_id_fkey(id, display_name, avatar_url), assignees:task_assignees(profile:profiles(id, display_name, avatar_url))" as const;
const ACTIVITY_SELECT =
  "id, task_id, actor_id, type, metadata, created_at, actor:profiles(id, display_name, avatar_url)" as const;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

// Fire-and-forget: a failed activity-log insert should never break the
// actual mutation (attaching a file, moving a card) that triggered it.
export async function logTaskActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  actorId: string | null,
  type: TaskActivityType,
  metadata: Record<string, string> = {},
) {
  try {
    await supabase.from("task_activity").insert({ task_id: taskId, actor_id: actorId, type, metadata });
  } catch {
    // best-effort logging only
  }
}

function attachComments(
  comments: unknown[],
  attachments: TaskAttachment[],
): TaskComment[] {
  return (comments as Omit<TaskComment, "attachments">[]).map((c) => ({
    ...c,
    attachments: attachments.filter((a) => a.comment_id === c.id),
  }));
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const { supabase } = await requireUser();

  const [{ data: task }, { data: checklist }, { data: comments }, { data: attachments }, { data: links }, { data: activity }] =
    await Promise.all([
      supabase.from("tasks").select(TASK_SELECT).eq("id", taskId).maybeSingle(),
      supabase
        .from("task_checklist_items")
        .select("id, task_id, text, done, position, created_at")
        .eq("task_id", taskId)
        .order("position", { ascending: true }),
      supabase.from("task_comments").select(COMMENT_SELECT).eq("task_id", taskId).order("created_at", { ascending: true }),
      supabase.from("task_attachments").select(ATTACHMENT_SELECT).eq("task_id", taskId).order("created_at", { ascending: true }),
      supabase.from("task_links").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
      supabase.from("task_activity").select(ACTIVITY_SELECT).eq("task_id", taskId).order("created_at", { ascending: true }),
    ]);

  if (!task) return null;

  const allAttachments = (attachments ?? []) as TaskAttachment[];
  const rawTask = task as unknown as TaskWithAssignee & { assignees: unknown };

  return {
    ...rawTask,
    assignees: mapTaskAssignees(rawTask.assignees),
    checklist_items: (checklist ?? []) as ChecklistItem[],
    comments: attachComments(comments ?? [], allAttachments),
    attachments: allAttachments.filter((a) => !a.comment_id),
    links: (links ?? []) as TaskLink[],
    activity: (activity ?? []) as unknown as TaskActivity[],
  };
}

export async function addTaskLink(taskId: string, label: string, url: string) {
  const { supabase, user } = await requireUser();
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel || !trimmedUrl) return null;

  const { data, error } = await supabase
    .from("task_links")
    .insert({ task_id: taskId, label: trimmedLabel, url: trimmedUrl, created_by: user.id })
    .select("*")
    .single();

  if (error || !data) return null;
  await logTaskActivity(supabase, taskId, user.id, "link_added", { label: trimmedLabel });

  revalidatePath("/workspace");
  return data as TaskLink;
}

export async function deleteTaskLink(linkId: string) {
  const { supabase } = await requireUser();
  await supabase.from("task_links").delete().eq("id", linkId);
  revalidatePath("/workspace");
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { supabase } = await requireUser();
  const [{ data: comments }, { data: attachments }] = await Promise.all([
    supabase.from("task_comments").select(COMMENT_SELECT).eq("task_id", taskId).order("created_at", { ascending: true }),
    supabase.from("task_attachments").select(ATTACHMENT_SELECT).eq("task_id", taskId).not("comment_id", "is", null),
  ]);
  return attachComments(comments ?? [], (attachments ?? []) as TaskAttachment[]);
}

export async function getTaskActivity(taskId: string): Promise<TaskActivity[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("task_activity").select(ACTIVITY_SELECT).eq("task_id", taskId).order("created_at", { ascending: true });
  return (data ?? []) as unknown as TaskActivity[];
}

export async function addChecklistItem(taskId: string, text: string) {
  const { supabase } = await requireUser();
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { count } = await supabase
    .from("task_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);

  const { data } = await supabase
    .from("task_checklist_items")
    .insert({ task_id: taskId, text: trimmed, position: count ?? 0 })
    .select("id, task_id, text, done, position, created_at")
    .single();

  revalidatePath("/workspace");
  return (data as ChecklistItem) ?? null;
}

export async function toggleChecklistItem(itemId: string, done: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("task_checklist_items").update({ done }).eq("id", itemId);
  revalidatePath("/workspace");
}

export async function deleteChecklistItem(itemId: string) {
  const { supabase } = await requireUser();
  await supabase.from("task_checklist_items").delete().eq("id", itemId);
  revalidatePath("/workspace");
}

export async function addComment(taskId: string, content: string, attachmentIds: string[] = []) {
  const { supabase, user } = await requireUser();
  const trimmed = content.trim();
  if (!trimmed && attachmentIds.length === 0) return null;

  const { data: rawComment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, user_id: user.id, content: trimmed })
    .select(COMMENT_SELECT)
    .single();

  if (error || !rawComment) return null;
  const comment = rawComment as unknown as Omit<TaskComment, "attachments">;

  if (attachmentIds.length > 0) {
    await supabase
      .from("task_attachments")
      .update({ comment_id: comment.id })
      .in("id", attachmentIds)
      .eq("task_id", taskId)
      .eq("uploaded_by", user.id)
      .is("comment_id", null);
  }

  const { data: attachments } = await supabase
    .from("task_attachments")
    .select(ATTACHMENT_SELECT)
    .eq("comment_id", comment.id);

  revalidatePath("/workspace");
  return {
    ...comment,
    attachments: (attachments ?? []) as TaskAttachment[],
  };
}

export async function deleteComment(commentId: string) {
  const { supabase, user } = await requireUser();

  // task_attachments.comment_id cascade-deletes with the comment at the DB
  // level, but that never touches storage — clean up first.
  const { data: attachments } = await supabase.from("task_attachments").select("storage_path").eq("comment_id", commentId);
  const paths = (attachments ?? []).map((a) => a.storage_path as string);
  if (paths.length > 0) await supabase.storage.from("task-attachments").remove(paths).catch(() => {});

  await supabase.from("task_comments").delete().eq("id", commentId).eq("user_id", user.id);
  revalidatePath("/workspace");
}

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const MAX_SIZE = 20 * 1024 * 1024;

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp tin");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP hoặc PDF");
  if (file.size > MAX_SIZE) throw new Error("Tệp vượt quá 20MB");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `${taskId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải ảnh lên");

  const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      uploaded_by: user.id,
      url: publicUrlData.publicUrl,
      storage_path: storagePath,
      filename: file.name,
      mime_type: file.type,
      size: file.size,
    })
    .select(ATTACHMENT_SELECT)
    .single();

  if (error || !data) throw new Error("Không thể lưu tệp đính kèm");
  await logTaskActivity(supabase, taskId, user.id, "attached", { filename: file.name });

  revalidatePath("/workspace");
  return data as TaskAttachment;
}

export async function deleteAttachment(attachmentId: string) {
  const { supabase, user } = await requireUser();
  const { data: attachment } = await supabase
    .from("task_attachments")
    .select("storage_path, uploaded_by")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment || attachment.uploaded_by !== user.id) return;

  await supabase.storage.from("task-attachments").remove([attachment.storage_path]);
  await supabase.from("task_attachments").delete().eq("id", attachmentId);
  revalidatePath("/workspace");
}
