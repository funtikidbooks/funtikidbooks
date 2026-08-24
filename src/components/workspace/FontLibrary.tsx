"use client";

import { useEffect, useRef, useState } from "react";
import { deleteFont, uploadFont } from "@/lib/actions/fonts";
import { FONT_FORMAT_BY_EXT, fontFamilyFor } from "@/lib/fontFormat";
import type { FontAsset } from "@/lib/types";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const PREVIEW_TEXT = "Funtikidbooks";
const PREVIEW_BASE_SIZE = 52;

// Fits PREVIEW_TEXT to whatever width the card actually renders at (phone,
// tablet, desktop grid columns all differ) by measuring and scaling down —
// never wraps, since a shrunk-but-whole word reads better than a broken one.
function FontPreviewText({
  fontFamily,
  text = PREVIEW_TEXT,
  fontSize = PREVIEW_BASE_SIZE,
}: {
  fontFamily: string;
  text?: string;
  fontSize?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const ro = new ResizeObserver(() => {
      const available = container.clientWidth;
      const natural = textEl.scrollWidth;
      if (available > 0 && natural > 0) {
        setScale(Math.min(1, (available / natural) * 0.94));
      }
    });
    ro.observe(container);
    ro.observe(textEl);
    return () => ro.disconnect();
  }, [fontFamily, text, fontSize]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <span
        ref={textRef}
        style={{
          fontFamily,
          fontSize,
          whiteSpace: "nowrap",
          display: "inline-block",
          transform: `scale(${scale})`,
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function FontLibrary({
  initialFonts,
  isDirector,
}: {
  initialFonts: FontAsset[];
  isDirector: boolean;
}) {
  const [fonts, setFonts] = useState(initialFonts);
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
      const created = await uploadFont(formData);
      setFonts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải font lên");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(font: FontAsset) {
    if (!confirm(`Xoá font "${font.name}"?`)) return;
    setFonts((prev) => prev.filter((f) => f.id !== font.id));
    try {
      await deleteFont(font.id, font.storage_path);
    } catch {
      setError("Không thể xoá font. Vui lòng thử lại.");
      setFonts((prev) => [...prev, font].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <style>
        {fonts
          .map(
            (f) =>
              `@font-face { font-family: "${fontFamilyFor(f)}"; src: url("${f.file_url}") format("${FONT_FORMAT_BY_EXT[f.file_ext] ?? "truetype"}"); font-display: swap; }`,
          )
          .join("\n")}
      </style>

      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div>
          <h1 className="text-xl">Kho font</h1>
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            {fonts.length} font — đây là những font không bị lỗi dấu tiếng Việt, nhân viên có thể xem trước và tải về
          </p>
        </div>
        {isDirector && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "Đang tải lên…" : "+ Thêm font"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </>
        )}
      </div>

      {error && (
        <p className="text-xs font-semibold px-6 pt-3" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {fonts.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>
            Chưa có font nào. {isDirector ? 'Bấm "+ Thêm font" để tải lên.' : "Đợi Giám đốc thêm font vào đây."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {fonts.map((f) => (
              <div key={f.id} className="relative card elev-sm overflow-hidden flex flex-col" style={{ height: 200 }}>
                <div className="flex-1 px-4" style={{ background: "var(--color-surface)" }}>
                  <FontPreviewText fontFamily={`"${fontFamilyFor(f)}"`} />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate" title={f.name}>
                      {f.name}
                    </h3>
                    <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                      .{f.file_ext} {formatSize(f.size_bytes) && `· ${formatSize(f.size_bytes)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <a href={f.file_url} download={`${f.name}.${f.file_ext}`} className="btn btn-ghost btn-sm" title="Tải về">
                      ⬇
                    </a>
                    {isDirector && (
                      <button type="button" onClick={() => handleDelete(f)} className="btn-icon" aria-label="Xoá font" title="Xoá">
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
