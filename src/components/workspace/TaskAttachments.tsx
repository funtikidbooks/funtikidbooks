"use client";

import { useRef, useState } from "react";
import { deleteAttachment, uploadTaskAttachment } from "@/lib/actions/task-detail";
import type { TaskAttachment } from "@/lib/types";

export function TaskAttachments({
  taskId,
  attachments,
  onChange,
  inputRef,
  currentUserId,
}: {
  taskId: string;
  attachments: TaskAttachment[];
  onChange: (attachments: TaskAttachment[]) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  currentUserId: string;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const fileInputRef = inputRef ?? localRef;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(attachmentId: string) {
    if (!confirm("Xoá tệp đính kèm này?")) return;
    const prev = attachments;
    onChange(attachments.filter((a) => a.id !== attachmentId));
    try {
      await deleteAttachment(attachmentId);
    } catch {
      setError("Không thể xoá tệp. Vui lòng thử lại.");
      onChange(prev);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const attachment = await uploadTaskAttachment(taskId, formData);
          onChange([...attachments, attachment]);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Không thể tải ảnh lên");
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="field">
      <div className="flex items-center justify-between">
        <label className="!mb-0">📎 Tệp đính kèm</label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-[12.5px] font-bold"
          style={{ color: "var(--color-accent-700)" }}
        >
          {uploading ? "Đang tải lên…" : "+ Tải ảnh lên"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="text-[12px]" style={{ color: "var(--status-red)" }}>{error}</p>}
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((att) => (
            <div key={att.id} className="relative">
              {att.mime_type.startsWith("image/") ? (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-[8px]"
                  style={{ border: "1px solid var(--color-neutral-200)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={att.url} alt={att.filename} className="h-20 w-full object-cover" />
                </a>
              ) : (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1 rounded-[8px] px-2 py-3 text-center"
                  style={{ border: "1px solid var(--color-neutral-200)", height: 80, background: "var(--color-surface)" }}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    📄
                  </span>
                  <span className="text-[10px] font-semibold truncate w-full" style={{ color: "var(--color-neutral-600)" }}>
                    {att.filename}
                  </span>
                </a>
              )}
              {att.uploaded_by === currentUserId && (
                <button
                  type="button"
                  onClick={() => handleDelete(att.id)}
                  className="absolute flex items-center justify-center rounded-full font-bold"
                  style={{
                    top: 3,
                    right: 3,
                    width: 18,
                    height: 18,
                    fontSize: 10,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                  }}
                  aria-label="Xoá tệp đính kèm"
                  title="Xoá"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
