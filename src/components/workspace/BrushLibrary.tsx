"use client";

import { useMemo, useRef, useState } from "react";
import { deleteBrush, uploadBrush } from "@/lib/actions/brushes";
import { BRUSH_CATEGORIES, BRUSH_CATEGORY_EXT, BRUSH_CATEGORY_LABELS } from "@/lib/brushCategory";
import type { BrushAsset, BrushCategory } from "@/lib/types";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function BrushLibrary({
  initialBrushes,
  currentUserId,
  isDirector,
}: {
  initialBrushes: BrushAsset[];
  currentUserId: string;
  isDirector: boolean;
}) {
  const [brushes, setBrushes] = useState(initialBrushes);
  const [uploadCategory, setUploadCategory] = useState<BrushCategory>("procreate");
  const [filter, setFilter] = useState<BrushCategory | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleBrushes = useMemo(
    () => (filter === "all" ? brushes : brushes.filter((b) => b.category === filter)),
    [brushes, filter],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", uploadCategory);
      const created = await uploadBrush(formData);
      setBrushes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải brush lên");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(brush: BrushAsset) {
    if (!confirm(`Xoá brush "${brush.name}"?`)) return;
    setBrushes((prev) => prev.filter((b) => b.id !== brush.id));
    try {
      await deleteBrush(brush.id, brush.storage_path);
    } catch {
      setError("Không thể xoá brush. Vui lòng thử lại.");
      setBrushes((prev) => [...prev, brush].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div>
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            {brushes.length} brush — cọ vẽ Photoshop, Procreate, Clip Studio Paint, tối đa 500MB — ai cũng có thể tải về và thêm brush mới
          </p>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <select
            className="input"
            style={{ padding: "6px 10px", fontSize: 13, width: "auto" }}
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value as BrushCategory)}
            aria-label="Loại brush sắp tải lên"
          >
            {BRUSH_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {BRUSH_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Đang tải lên…" : "+ Thêm brush"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={BRUSH_CATEGORY_EXT[uploadCategory].map((e) => `.${e}`).join(",")}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div className="flex items-center gap-2 px-6 pt-3">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
        >
          Tất cả
        </button>
        {BRUSH_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`btn btn-sm ${filter === c ? "btn-primary" : "btn-ghost"}`}
          >
            {BRUSH_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs font-semibold px-6 pt-3" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {visibleBrushes.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>
            {brushes.length === 0 ? 'Chưa có brush nào. Bấm "+ Thêm brush" để tải lên.' : "Không có brush nào trong mục này."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleBrushes.map((b) => (
              <div key={b.id} className="card elev-sm flex items-center gap-3 p-3">
                <span
                  className="flex items-center justify-center rounded-[10px] flex-none"
                  style={{ width: 44, height: 44, fontSize: 20, background: "var(--color-surface)" }}
                  aria-hidden
                >
                  🖌️
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold truncate" title={b.name}>
                    {b.name}
                  </h3>
                  <span className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: "var(--color-neutral-500)" }}>
                    <span className="tag tag-neutral" style={{ padding: "1px 6px" }}>
                      {BRUSH_CATEGORY_LABELS[b.category]}
                    </span>
                    .{b.file_ext} {formatSize(b.size_bytes) && `· ${formatSize(b.size_bytes)}`}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-none">
                  <a href={b.file_url} download={`${b.name}.${b.file_ext}`} className="btn btn-ghost btn-sm" title="Tải về">
                    ⬇
                  </a>
                  {(isDirector || b.uploaded_by === currentUserId) && (
                    <button type="button" onClick={() => handleDelete(b)} className="btn-icon" aria-label="Xoá brush" title="Xoá">
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
