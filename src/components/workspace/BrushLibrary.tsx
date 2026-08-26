"use client";

import { useRef, useState } from "react";
import { deleteBrush, uploadBrush } from "@/lib/actions/brushes";
import type { BrushAsset } from "@/lib/types";

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
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
            {brushes.length} brush — cọ vẽ Procreate, Photoshop, Clip Studio Paint, Krita… ai cũng có thể tải về và thêm brush mới
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Đang tải lên…" : "+ Thêm brush"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".brush,.brushset,.abr,.sut,.kpp,.bundle"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="text-xs font-semibold px-6 pt-3" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {brushes.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có brush nào. Bấm &quot;+ Thêm brush&quot; để tải lên.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {brushes.map((b) => (
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
                  <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
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
