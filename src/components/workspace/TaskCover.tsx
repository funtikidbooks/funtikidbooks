"use client";

import { useRef, useState } from "react";
import { removeTaskCover, setTaskCover } from "@/lib/actions/board";

export function TaskCover({
  taskId,
  coverUrl,
  onChange,
}: {
  taskId: string;
  coverUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await setTaskCover(taskId, formData);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải ảnh lên");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove() {
    onChange(null);
    removeTaskCover(taskId).catch(() => {
      // Local removal stays as-is (e.g. workspace-demo has no real backend).
    });
  }

  return (
    <div className="relative -m-6 mb-0 rounded-t-[var(--radius-lg)] overflow-hidden group">
      {coverUrl ? (
        <div className="relative" style={{ height: 130 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute bottom-2 right-2 btn btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(20,18,17,.7)", color: "#fff" }}
          >
            Xoá ảnh bìa
          </button>
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
