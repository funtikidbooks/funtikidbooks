"use client";

import { useEffect, useRef, useState } from "react";
import { addComment, updateComment } from "@/lib/actions/task-detail";
import { loadTaskActivity, loadTaskComments } from "@/lib/taskCommentsClient";
import { uploadTaskFile } from "@/lib/taskUpload";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { Profile, TaskActivity, TaskAttachment, TaskComment } from "@/lib/types";

// Explicit timeZone — without it this reads the server's own timezone
// (UTC on Vercel) instead of Vietnam's, a real hydration-mismatch source;
// see MeetingHub.tsx's own comment on the same fix.
function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
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
    case "due_complete":
      return `${actor} đã đánh dấu hạn chót là hoàn tất`;
    case "due_incomplete":
      return `${actor} đã bỏ dấu hoàn tất hạn chót`;
    default:
      return `${actor} đã cập nhật thẻ này`;
  }
}

// A file in the conversation, the way Trello shows it: a picture as a
// thumbnail, anything else (PDF, PSD…) as a named chip. Both open the file.
function FileInFeed({ url, filename, mimeType, size = 64 }: { url: string; filename: string; mimeType?: string; size?: number }) {
  const isImage = (mimeType ?? "").startsWith("image/") || /.(png|jpe?g|webp|gif|avif)$/i.test(filename);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={filename}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl(url, size * 2)}
          alt={filename}
          className="rounded-[6px] object-cover"
          style={{ width: size, height: size, border: "1px solid var(--color-neutral-200)" }}
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-semibold max-w-full"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-neutral-200)", color: "var(--color-text)" }}
    >
      <span aria-hidden>📄</span>
      <span className="truncate">{filename}</span>
    </a>
  );
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
  attachments = [],
}: {
  taskId: string;
  currentUser: Pick<Profile, "id" | "display_name">;
  initialComments: TaskComment[];
  initialActivity: TaskActivity[];
  showDetails: boolean;
  // The card's own files — older "đã đính kèm" entries only kept the file
  // name, so this is how they find the file to show.
  attachments?: TaskAttachment[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [activity, setActivity] = useState(initialActivity);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Read straight from Supabase (lib/taskCommentsClient.ts), only while the
  // card is on screen, every 10 s — it used to be two Vercel function calls
  // every 4 s even in a background tab (Vercel's allowance ran out, 10/2026).
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [freshComments, freshActivity] = await Promise.all([loadTaskComments(taskId), loadTaskActivity(taskId)]);
        setComments(freshComments);
        setActivity(freshActivity);
      } catch {
        // no live backend yet — keep whatever is already shown
      }
    }, 10000);
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
        try {
          const attachment = await uploadTaskFile(taskId, file);
          setPending((prev) => [...prev, attachment]);
        } catch {
          // skip files that fail validation/upload
        }
      }
    } finally {
      setUploading(false);
    }
  }

  // Ctrl+V only ever reached the file picker button before — the composer
  // itself had no paste handler at all, so an image copied from elsewhere
  // (a screenshot, a browser image) silently did nothing.
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    const list = new DataTransfer();
    files.forEach((f) => list.items.add(f));
    handleFiles(list.files);
  }

  function startEdit(comment: TaskComment) {
    setEditingId(comment.id);
    setEditText(comment.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(commentId: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    const prevComments = comments;
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, content: trimmed } : c)));
    setEditingId(null);
    setEditText("");
    const updated = await updateComment(commentId, trimmed);
    if (!updated) setComments(prevComments);
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

  // The file an "đã đính kèm" entry is about. A photo sent with a comment
  // already shows in that comment, so its entry is left out.
  const commentFileUrls = new Set(comments.flatMap((c) => c.attachments.map((a) => a.url)));
  const fileOf = (a: TaskActivity) => {
    if (a.type !== "attached") return null;
    if (a.metadata.url) return { url: a.metadata.url, filename: a.metadata.filename ?? "Tệp", mimeType: a.metadata.mime_type };
    const match = attachments.find((x) => x.filename === a.metadata.filename);
    return match ? { url: match.url, filename: match.filename, mimeType: match.mime_type ?? undefined } : null;
  };
  const shown = merged.filter((item) => {
    if (item.kind !== "activity" || item.data.type !== "attached") return true;
    const file = fileOf(item.data);
    return !file || !commentFileUrls.has(file.url);
  });

  // Collapsed view mirrors Trello's default: every comment and every file
  // added (sếp Phúc, 15/10: "đính kèm file nó hiện cùng hội thoại"), but
  // only the single most recent other activity entry.
  const lastActivity = activity[activity.length - 1];
  const visible = showDetails
    ? shown
    : shown.filter((item) => item.kind === "comment" || item.data.type === "attached" || item.data.id === lastActivity?.id);

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
                {(() => {
                  const file = fileOf(item.data);
                  return file ? (
                    <div className="mt-1">
                      <FileInFeed url={file.url} filename={file.filename} mimeType={file.mimeType} size={96} />
                    </div>
                  ) : null;
                })()}
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
                  {item.data.user_id === currentUser.id && editingId !== item.data.id && (
                    <button
                      type="button"
                      onClick={() => startEdit(item.data)}
                      className="text-[11px] font-semibold"
                      style={{ color: "var(--color-accent-700)" }}
                    >
                      Sửa
                    </button>
                  )}
                </div>
                {editingId === item.data.id ? (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <textarea
                      className="input"
                      style={{ resize: "none", padding: "6px 10px", fontSize: 13.5 }}
                      rows={2}
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit(item.data.id);
                        } else if (e.key === "Escape") {
                          cancelEdit();
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(item.data.id)}
                        className="btn btn-primary btn-sm"
                        style={{ padding: "2px 10px", fontSize: 12 }}
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-[12px] font-semibold"
                        style={{ color: "var(--color-neutral-500)" }}
                      >
                        Huỷ
                      </button>
                    </div>
                  </div>
                ) : (
                  item.data.content && <p className="text-[13.5px] whitespace-pre-wrap">{item.data.content}</p>
                )}
                {item.data.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {item.data.attachments.map((att) => (
                      <FileInFeed key={att.id} url={att.url} filename={att.filename} mimeType={att.mime_type ?? undefined} />
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
                <FileInFeed url={p.url} filename={p.filename} mimeType={p.mime_type ?? undefined} size={44} />
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
            onPaste={handlePaste}
            placeholder="Viết bình luận…"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-icon flex-none"
            title="Đính kèm ảnh hoặc tệp"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
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
