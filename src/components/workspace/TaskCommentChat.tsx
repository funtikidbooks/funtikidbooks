"use client";

import { useEffect, useRef, useState } from "react";
import { addComment, getTaskActivity, getTaskComments, uploadTaskAttachment } from "@/lib/actions/task-detail";
import type { Profile, TaskActivity, TaskAttachment, TaskComment } from "@/lib/types";

function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function activityText(a: TaskActivity): string {
  const actor = a.actor?.display_name ?? "Ai đó";
  switch (a.type) {
    case "created":
      return `${actor} đã tạo thẻ này trong danh sách ${a.metadata.column ?? ""}`;
    case "moved":
      return `${actor} đã chuyển thẻ từ ${a.metadata.from ?? "?"} sang ${a.metadata.to ?? "?"}`;
    case "assigned":
      return `${actor} đã giao việc cho ${a.metadata.name ?? ""}`;
    case "attached":
      return `${actor} đã đính kèm tệp "${a.metadata.filename ?? ""}"`;
    case "link_added":
      return `${actor} đã thêm liên kết "${a.metadata.label ?? ""}"`;
    default:
      return `${actor} đã cập nhật thẻ này`;
  }
}

type FeedItem =
  | { kind: "comment"; created_at: string; data: TaskComment }
  | { kind: "activity"; created_at: string; data: TaskActivity };

export function TaskCommentChat({
  taskId,
  currentUser,
  initialComments,
  initialActivity,
  showDetails,
}: {
  taskId: string;
  currentUser: Pick<Profile, "id" | "display_name">;
  initialComments: TaskComment[];
  initialActivity: TaskActivity[];
  showDetails: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [activity, setActivity] = useState(initialActivity);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [freshComments, freshActivity] = await Promise.all([getTaskComments(taskId), getTaskActivity(taskId)]);
        setComments(freshComments);
        setActivity(freshActivity);
      } catch {
        // no live backend yet — keep whatever is already shown
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [taskId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comments.length]);

  // Expanding reveals older activity above the comments — scroll up so it's
  // actually visible instead of staying scrolled to the bottom.
  useEffect(() => {
    if (showDetails) listRef.current?.scrollTo({ top: 0 });
  }, [showDetails]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const attachment = await uploadTaskAttachment(taskId, formData);
          setPending((prev) => [...prev, attachment]);
        } catch {
          // skip files that fail validation/upload
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && pending.length === 0) return;
    setSending(true);

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: TaskComment = {
      id: tempId,
      task_id: taskId,
      user_id: currentUser.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      author: { id: currentUser.id, display_name: currentUser.display_name, avatar_url: null },
      attachments: pending,
    };
    setComments((prev) => [...prev, optimistic]);
    setText("");
    setPending([]);

    try {
      const comment = await addComment(
        taskId,
        trimmed,
        optimistic.attachments.map((p) => p.id),
      );
      if (comment) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? comment : c)));
      }
    } catch {
      // optimistic comment stays as-is when there is no live Supabase backend
    } finally {
      setSending(false);
    }
  }

  const merged: FeedItem[] = [
    ...comments.map((c): FeedItem => ({ kind: "comment", created_at: c.created_at, data: c })),
    ...activity.map((a): FeedItem => ({ kind: "activity", created_at: a.created_at, data: a })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Collapsed view mirrors Trello's default: every comment, but only the
  // single most recent activity entry rather than the full audit trail.
  const lastActivity = activity[activity.length - 1];
  const visible = showDetails ? merged : merged.filter((item) => item.kind === "comment" || item.data.id === lastActivity?.id);

  return (
    <div className="rounded-[var(--radius-md)]" style={{ border: "1px solid var(--color-neutral-200)" }}>
      <div ref={listRef} className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 320 }}>
        {visible.length === 0 && (
          <p className="text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có phản hồi nào. Hãy để lại bình luận đầu tiên.
          </p>
        )}
        {visible.map((item) =>
          item.kind === "activity" ? (
            <div key={item.data.id} className="flex gap-2">
              <div
                className="flex items-center justify-center rounded-full font-bold flex-none"
                style={{ width: 26, height: 26, fontSize: 11, background: "var(--color-neutral-200)", color: "var(--color-neutral-600)" }}
              >
                {(item.data.actor?.display_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <p className="text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
                  {activityText(item.data)}
                </p>
                <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                  {formatTime(item.created_at)}
                </span>
              </div>
            </div>
          ) : (
            <div key={item.data.id} className="flex gap-2">
              <div
                className="flex items-center justify-center rounded-full font-bold flex-none"
                style={{ width: 26, height: 26, fontSize: 11, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
              >
                {(item.data.author?.display_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold">{item.data.author?.display_name ?? "Ẩn danh"}</span>
                  <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                    {formatTime(item.created_at)}
                  </span>
                </div>
                {item.data.content && <p className="text-[13.5px] whitespace-pre-wrap">{item.data.content}</p>}
                {item.data.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {item.data.attachments.map((att) => (
                      <a key={att.id} href={att.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt={att.filename}
                          className="rounded-[6px] object-cover"
                          style={{ width: 64, height: 64, border: "1px solid var(--color-neutral-200)" }}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <form onSubmit={handleSend} className="p-2.5" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pending.map((p) => (
              <div key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.filename}
                  className="rounded-[6px] object-cover"
                  style={{ width: 44, height: 44, border: "1px solid var(--color-neutral-200)" }}
                />
                <button
                  type="button"
                  onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                  className="absolute -right-1 -top-1 flex items-center justify-center rounded-full text-white"
                  style={{ width: 16, height: 16, fontSize: 10, background: "rgba(20,18,17,.75)" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div
            className="flex items-center justify-center rounded-full font-bold flex-none"
            style={{ width: 26, height: 26, fontSize: 11, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
          >
            {currentUser.display_name.charAt(0).toUpperCase()}
          </div>
          <textarea
            className="input"
            style={{ resize: "none", padding: "8px 12px" }}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Viết bình luận…"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-icon flex-none"
            title="Đính kèm ảnh"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button type="submit" disabled={sending} className="btn btn-primary btn-sm flex-none">
            Gửi
          </button>
        </div>
      </form>
    </div>
  );
}
