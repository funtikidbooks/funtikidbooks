"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { isSupabaseStorageUrl } from "@/lib/imageTransform";

export type ImageTransform = { zoom: number; posX: number; posY: number };
export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = { zoom: 100, posX: 50, posY: 50 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// A photo/illustration slot on a public page that director/admin can replace
// in place. When `canEdit` is false it just renders the image (or the
// placeholder used everywhere else on the site) with no editing chrome.
export function EditableImage({
  src,
  alt = "",
  emoji = "🎨",
  canEdit,
  onUpload,
  className = "",
  style,
  sizes,
  circle = false,
  placeholderVariant = "emoji",
  dropzoneLabel = "Ảnh",
  dropzoneHint = "or browse files",
  transform: initialTransform,
  onTransformChange,
}: {
  src: string | null;
  alt?: string;
  emoji?: string;
  canEdit: boolean;
  onUpload: (file: File) => Promise<string>;
  className?: string;
  style?: React.CSSProperties;
  sizes?: string;
  // Round the image itself into a circle (e.g. a team member avatar) — the
  // edit button stays outside the clip so it isn't cut off at the corners.
  circle?: boolean;
  // "emoji" (default): the shared decorative placeholder + floating "+ Thêm
  // ảnh" pill. "dropzone": a compact upload hint (icon + label + browse-files
  // hint) that fills the whole shape — used for small circular slots like
  // team avatars where the floating pill button doesn't fit well.
  placeholderVariant?: "emoji" | "dropzone";
  dropzoneLabel?: string;
  dropzoneHint?: string;
  // Pass both to let the director drag-to-reposition and zoom the photo
  // inside its frame (e.g. the hero photo, which is often cropped oddly by
  // plain object-fit: cover). Omit both to keep the slot non-adjustable.
  transform?: ImageTransform;
  onTransformChange?: (t: ImageTransform) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [transform, setTransform] = useState(initialTransform ?? DEFAULT_IMAGE_TRANSFORM);
  const [dragging, setDragging] = useState(false);
  const imgBoxRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef(transform);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const adjustable = !!initialTransform && !!onTransformChange;

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    if (!dragging) return;
    function point(e: MouseEvent | TouchEvent) {
      return "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    }
    function handleMove(e: MouseEvent | TouchEvent) {
      const start = dragStartRef.current;
      const rect = imgBoxRef.current?.getBoundingClientRect();
      if (!start || !rect) return;
      const p = point(e);
      const dxPct = ((p.x - start.x) / rect.width) * 100;
      const dyPct = ((p.y - start.y) / rect.height) * 100;
      setTransform((t) => ({ ...t, posX: clamp(start.posX - dxPct, 0, 100), posY: clamp(start.posY - dyPct, 0, 100) }));
    }
    function handleUp() {
      setDragging(false);
      dragStartRef.current = null;
      onTransformChange?.(transformRef.current);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function startDrag(x: number, y: number) {
    if (!canEdit || !adjustable) return;
    dragStartRef.current = { x, y, posX: transform.posX, posY: transform.posY };
    setDragging(true);
  }

  function commitZoom(nextZoom: number) {
    const next = { ...transformRef.current, zoom: nextZoom };
    setTransform(next);
    onTransformChange?.(next);
  }

  const shown = preview ?? src;
  // ImagePlaceholder defaults to minHeight:160 for the larger, unconstrained
  // slots it's normally used in; a fixed-height slot (e.g. a 120px avatar)
  // must override that default explicitly, or min-height wins over height
  // and the "circle" ends up taller than it is wide — an oval, not a circle.
  const placeholderStyle: React.CSSProperties = { ...style };
  if (style?.height !== undefined) placeholderStyle.minHeight = style.height;
  if (circle) placeholderStyle.borderRadius = "9999px";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Không thể tải ảnh lên");
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  return (
    <div className={`relative group ${className}`} style={style}>
      {shown ? (
        <div
          ref={imgBoxRef}
          className={`relative w-full h-full overflow-hidden ${circle ? "rounded-full" : "rounded-[var(--radius-lg)]"}`}
          style={{
            minHeight: style?.minHeight,
            cursor: canEdit && adjustable ? (dragging ? "grabbing" : "grab") : undefined,
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            startDrag(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        >
          <Image
            src={shown}
            alt={alt}
            fill
            unoptimized={isSupabaseStorageUrl(shown)}
            className="object-cover"
            sizes={sizes}
            style={
              adjustable
                ? { transform: `scale(${transform.zoom / 100})`, objectPosition: `${transform.posX}% ${transform.posY}%`, pointerEvents: "none" }
                : undefined
            }
          />
          {canEdit && adjustable && (
            <div
              className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span aria-hidden>🔍</span>
              <input
                type="range"
                min={100}
                max={250}
                value={transform.zoom}
                onChange={(e) => setTransform((t) => ({ ...t, zoom: Number(e.target.value) }))}
                onMouseUp={(e) => commitZoom(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => commitZoom(Number((e.target as HTMLInputElement).value))}
                style={{ width: 80 }}
                aria-label="Thu phóng ảnh"
              />
              <span style={{ minWidth: 32, textAlign: "right" }}>{transform.zoom}%</span>
            </div>
          )}
        </div>
      ) : placeholderVariant === "dropzone" ? (
        <button
          type="button"
          onClick={() => canEdit && inputRef.current?.click()}
          disabled={uploading || !canEdit}
          className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-center"
          style={{
            borderRadius: circle ? "9999px" : "var(--radius-lg)",
            border: "1.5px dashed var(--color-neutral-300)",
            background: "var(--color-surface)",
            color: "var(--color-neutral-500)",
            cursor: canEdit ? "pointer" : "default",
          }}
        >
          <span className="text-lg leading-none" aria-hidden>
            🖼️
          </span>
          <span className="text-[11px] font-semibold">{uploading ? "…" : dropzoneLabel}</span>
          {canEdit && !uploading && (
            <span className="text-[10px] underline" style={{ color: "var(--color-accent-700)" }}>
              {dropzoneHint}
            </span>
          )}
        </button>
      ) : (
        <ImagePlaceholder emoji={emoji} className="w-full h-full" style={placeholderStyle} />
      )}

      {canEdit && (
        <>
          {(shown || placeholderVariant !== "dropzone") && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={uploading}
              className={`editable-image-btn absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-opacity ${
                shown ? "opacity-80 group-hover:opacity-100" : "opacity-100"
              }`}
              style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
            >
              {uploading ? "Đang tải…" : shown ? "✏️ Đổi ảnh" : "+ Thêm ảnh"}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}

      {error && (
        <p
          className="absolute inset-x-2 bottom-2 text-[11px] font-semibold px-2 py-1 rounded-[6px]"
          style={{ background: "var(--status-red)", color: "#fff" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
