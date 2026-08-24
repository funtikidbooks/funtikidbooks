"use client";

import { useEffect, useRef, useState } from "react";
import { saveJsonSetting, setSiteImage } from "@/lib/actions/admin";

const CULTURE_IMAGE_KEY = "gioi-thieu-culture-image";
const CULTURE_OPACITY_KEY = "gioi-thieu-culture-opacity";
const CULTURE_TRANSFORM_KEY = "gioi-thieu-culture-transform";

export type CultureTransform = { zoom: number; posX: number; posY: number };
export const DEFAULT_CULTURE_TRANSFORM: CultureTransform = { zoom: 100, posX: 50, posY: 50 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// A full-bleed, faded background photo behind the whole culture section —
// not a separate boxed image, so it reads as texture behind the text rather
// than competing with it. Director can drag to reposition, zoom, and tune
// how faded it is — a plain CSS background (not next/image) since that
// makes continuous drag/zoom trivial via background-size/position.
export function CultureImage({
  imageSrc,
  opacityPct,
  transform: initialTransform,
  canEdit,
}: {
  imageSrc: string | null;
  opacityPct: number;
  transform: CultureTransform;
  canEdit: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [opacity, setOpacity] = useState(opacityPct);
  const [transform, setTransform] = useState(initialTransform);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef(transform);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const shown = preview ?? imageSrc;

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
      const rect = containerRef.current?.getBoundingClientRect();
      if (!start || !rect) return;
      const p = point(e);
      const dxPct = ((p.x - start.x) / rect.width) * 100;
      const dyPct = ((p.y - start.y) / rect.height) * 100;
      setTransform((t) => ({ ...t, posX: clamp(start.posX - dxPct, 0, 100), posY: clamp(start.posY - dyPct, 0, 100) }));
    }
    function handleUp() {
      setDragging(false);
      dragStartRef.current = null;
      saveJsonSetting(CULTURE_TRANSFORM_KEY, transformRef.current, ["/gioi-thieu"]).catch(() => {});
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
  }, [dragging]);

  if (!shown && !canEdit) return null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    try {
      await setSiteImage(CULTURE_IMAGE_KEY, file, ["/gioi-thieu"]);
    } catch {
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  function commitOpacity(next: number) {
    saveJsonSetting(CULTURE_OPACITY_KEY, next, ["/gioi-thieu"]).catch(() => {});
  }

  function commitZoom(nextZoom: number) {
    // Build off the ref (not React state) so this stays a plain event-handler
    // side effect — calling saveJsonSetting from inside a setState updater
    // triggered a "Cannot update a component while rendering" warning.
    const next = { ...transformRef.current, zoom: nextZoom };
    setTransform(next);
    saveJsonSetting(CULTURE_TRANSFORM_KEY, next, ["/gioi-thieu"]).catch(() => {});
  }

  function startDrag(x: number, y: number) {
    if (!canEdit || !shown) return;
    dragStartRef.current = { x, y, posX: transform.posX, posY: transform.posY };
    setDragging(true);
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      aria-hidden={!shown}
      style={canEdit && shown ? { cursor: dragging ? "grabbing" : "grab" } : undefined}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        startDrag(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
    >
      {shown && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${shown})`,
            backgroundSize: `${transform.zoom}%`,
            backgroundPosition: `${transform.posX}% ${transform.posY}%`,
            backgroundRepeat: "no-repeat",
            opacity: opacity / 100,
            pointerEvents: "none",
          }}
        />
      )}

      {canEdit && (
        <>
          <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center justify-end gap-2" style={{ maxWidth: "calc(100% - 24px)" }}>
            {shown && (
              <>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
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
                    style={{ width: 90 }}
                    aria-label="Thu phóng ảnh nền"
                  />
                  <span style={{ minWidth: 34, textAlign: "right" }}>{transform.zoom}%</span>
                </div>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
                >
                  <span aria-hidden>🔅</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    onMouseUp={(e) => commitOpacity(Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => commitOpacity(Number((e.target as HTMLInputElement).value))}
                    style={{ width: 90 }}
                    aria-label="Độ mờ ảnh nền"
                  />
                  <span style={{ minWidth: 28, textAlign: "right" }}>{opacity}%</span>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
            >
              {uploading ? "Đang tải…" : shown ? "✏️ Đổi ảnh nền" : "+ Thêm ảnh nền"}
            </button>
          </div>
          {shown && (
            <p
              className="absolute bottom-3 right-3 z-10 text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(20,18,17,.6)", color: "#fff" }}
            >
              Kéo ảnh để đổi vị trí
            </p>
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
    </div>
  );
}
