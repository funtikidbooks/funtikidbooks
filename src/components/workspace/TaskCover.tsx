"use client";

import { useRef, useState } from "react";
import { removeTaskCover, setTaskCoverUrl } from "@/lib/actions/board";
import { createClient } from "@/lib/supabase/client";
import { thumbnailUrl } from "@/lib/imageTransform";

const ALLOWED_COVER_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_COVER_SIZE = 20 * 1024 * 1024;

export function TaskCover({
  taskId,
  coverUrl,
  onChange,
  onRemove,
}: {
  taskId: string;
  coverUrl: string | null;
  onChange: (url: string | null) => void;
  // When the card dialog manages removal itself (it knows whether the cover
  // is one of the card's attachments).
  onRemove?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_COVER_TYPES.has(file.type)) {
      setError("Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WEBP");
      return;
    }
    if (file.size > MAX_COVER_SIZE) {
      setError("Ảnh vượt quá 20MB");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // Uploaded straight to Supabase Storage from the browser, not through
      // a Server Action — Vercel caps a Server Action's request body at
      // 4.5MB regardless of Next.js's own bodySizeLimit config, and real
      // illustration files routinely exceed that.
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const storagePath = `${taskId}/cover-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) throw new Error("Không thể tải ảnh lên");

      const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);
      const url = await setTaskCoverUrl(taskId, publicUrlData.publicUrl);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải ảnh lên");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove() {
    if (onRemove) return onRemove();
    onChange(null);
    removeTaskCover(taskId).catch(() => {
      // Local removal stays as-is (e.g. workspace-demo has no real backend).
    });
  }

  return (
    <div className="relative sm:rounded-t-[var(--radius-lg)] overflow-hidden group">
      {coverUrl ? (
        <div className="relative" style={{ height: 130 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl(coverUrl, 640, 260)} alt="" className="w-full h-full object-cover" />
          {/* Always shown on touch screens — there's no hover to reveal them. */}
          <div className="fk-hover-reveal absolute bottom-2 right-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-sm"
              style={{ background: "rgba(20,18,17,.7)", color: "#fff" }}
            >
              {uploading ? "Đang tải…" : "Đổi ảnh bìa"}
            </button>
            <button type="button" onClick={handleRemove} className="btn btn-sm" style={{ background: "rgba(20,18,17,.7)", color: "#fff" }}>
              Bỏ ảnh bìa
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="ws-cover-add-btn w-full flex items-center justify-center text-sm font-semibold cursor-pointer"
          style={{ height: 130 }}
        >
          {uploading ? "Đang tải lên…" : "🖼 + Thêm ảnh bìa"}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && (
        <p className="text-[11px] px-6 py-1" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
