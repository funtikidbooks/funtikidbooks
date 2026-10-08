"use client";

import { createClient, ensureBrowserSession } from "@/lib/supabase/client";
import type { TaskActivity, TaskAttachment, TaskComment } from "@/lib/types";

// A task card's comments and activity, refreshed straight from the browser
// (same queries and RLS as getTaskComments / getTaskActivity in
// lib/actions/task-detail.ts) — the open card refreshes these every few
// seconds, and as Server Actions each refresh was two Vercel function calls.

const ATTACHMENT_SELECT = "id, task_id, comment_id, uploaded_by, url, storage_path, filename, mime_type, size, created_at";
const COMMENT_SELECT = "id, task_id, user_id, content, created_at, author:profiles(id, display_name, avatar_url)";
const ACTIVITY_SELECT = "id, task_id, actor_id, type, metadata, created_at, actor:profiles(id, display_name, avatar_url)";

export async function loadTaskComments(taskId: string): Promise<TaskComment[]> {
  await ensureBrowserSession();
  const supabase = createClient();
  const [{ data: comments, error: e1 }, { data: attachments, error: e2 }] = await Promise.all([
    supabase.from("task_comments").select(COMMENT_SELECT).eq("task_id", taskId).order("created_at", { ascending: true }),
    supabase.from("task_attachments").select(ATTACHMENT_SELECT).eq("task_id", taskId).not("comment_id", "is", null),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  const files = (attachments ?? []) as TaskAttachment[];
  return ((comments ?? []) as unknown as Omit<TaskComment, "attachments">[]).map((c) => ({
    ...c,
    attachments: files.filter((a) => a.comment_id === c.id),
  }));
}

export async function loadTaskActivity(taskId: string): Promise<TaskActivity[]> {
  await ensureBrowserSession();
  const supabase = createClient();
  const { data, error } = await supabase.from("task_activity").select(ACTIVITY_SELECT).eq("task_id", taskId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TaskActivity[];
}
