"use client";

import { useState } from "react";
import { deleteAttachment } from "@/lib/actions/task-detail";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { TaskAttachment } from "@/lib/types";
import { ImageLightbox } from "./ImageLightbox";

// A card's files, Trello-style: a grid of thumbnails, any image can become
// the card's cover, click an image to see it full size. Uploading (picker,
// paste, drop) lives in the card dialog so every way in shares one path.
export function TaskAttachments({
  attachments,
  onChange,
  inputRef,
  onPickFiles,
  uploadingLabel,
  error,
  currentUserId,
  coverUrl,
  onSetCover,
}: {
  attachments: TaskAttachment[];
  onChange: (attachments: TaskAttachment[]) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPickFiles: (files: File[]) => void;
  uploadingLabel: string | null;
  error: string | null;
  currentUserId: string;
  coverUrl: string | null;
  onSetCover: (url: string | null) => void;
}) {
  const [viewing, setViewing] = useState<TaskAttachment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(att: TaskAttachment) {
    if (!confirm(`Xoá tệp "${att.filename}"?`)) return;
    const prev = attachments;
    onChange(attachments.filter((a) => a.id !== att.id));
    if (coverUrl === att.url) onSetCover(null);
    try {
      await deleteAttachment(att.id);
      setDeleteError(null);
    } catch {
      setDeleteError("Không thể xoá tệp. Vui lòng thử lại.");
      onChange(prev);
    }
  }

  const isImage = (a: TaskAttachment) => (a.mime_type ?? "").startsWith("image/");
  const shown = error ?? deleteError;

  return (
    <div className="field">
      <div className="flex items-center justify-between gap-2">
        <label className="!mb-0">📎 Tệp đính kèm{attachments.length ? ` · ${attachments.length}` : ""}</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!!uploadingLabel}
          className="text-[12.5px] font-bold flex-none"
          style={{ color: "var(--color-accent-700)" }}
        >
          {uploadingLabel ?? "+ Thêm tệp"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onPickFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-[11.5px] -mt-1" style={{ color: "var(--color-neutral-500)" }}>
        Kéo thả hoặc dán ảnh (Ctrl/⌘+V) vào thẻ để đính kèm · tối đa 50MB mỗi tệp
      </p>
      {shown && (
        <p className="text-[12px]" style={{ color: "var(--status-red)" }}>
          {shown}
        </p>
      )}
      {attachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attachments.map((att) => {
            const isCover = !!coverUrl && coverUrl === att.url;
            return (
              <div key={att.id} className="flex flex-col gap-1 min-w-0">
                <div className="relative">
                  {isImage(att) ? (
                    <button
                      type="button"
                      onClick={() => setViewing(att)}
                      className="block w-full overflow-hidden rounded-[8px]"
                      style={{ border: `1.5px solid ${isCover ? "var(--color-accent-500)" : "var(--color-neutral-200)"}` }}
                      title="Xem ảnh"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbnailUrl(att.url, 300, 160)} alt={att.filename} className="h-20 w-full object-cover" loading="lazy" />
                    </button>
                  ) : (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center gap-1 rounded-[8px] px-2 text-center"
                      style={{ border: "1px solid var(--color-neutral-200)", height: 83, background: "var(--color-surface)" }}
                    >
                      <span className="text-[11px] font-bold uppercase" style={{ color: "var(--color-neutral-600)" }}>
                        {/\.([a-z0-9]{1,6})$/i.exec(att.filename)?.[1] ?? "tệp"}
                      </span>
                      <span className="text-lg leading-none" aria-hidden>
                        📄
                      </span>
                    </a>
                  )}
                  {isCover && (
                    <span
                      className="absolute left-1 top-1 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--color-accent-500)", color: "#fff" }}
                    >
                      Ảnh bìa
                    </span>
                  )}
                  {att.uploaded_by === currentUserId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(att)}
                      className="absolute flex items-center justify-center rounded-full font-bold"
                      style={{ top: 3, right: 3, width: 22, height: 22, fontSize: 11, background: "rgba(0,0,0,0.6)", color: "#fff" }}
                      aria-label={`Xoá ${att.filename}`}
                      title="Xoá"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-600)" }} title={att.filename}>
                  {att.filename}
                </span>
                {isImage(att) && (
                  <button
                    type="button"
                    onClick={() => onSetCover(isCover ? null : att.url)}
                    className="text-[11.5px] font-semibold text-left"
                    style={{ color: isCover ? "var(--color-neutral-500)" : "var(--color-accent-700)" }}
                  >
                    {isCover ? "Bỏ ảnh bìa" : "Đặt làm ảnh bìa"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {viewing && <ImageLightbox url={viewing.url} filename={viewing.filename} onClose={() => setViewing(null)} />}
    </div>
  );
}
