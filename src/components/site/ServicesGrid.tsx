"use client";

import { useEffect, useRef, useState } from "react";
import { saveJsonSetting, uploadContentImage } from "@/lib/actions/admin";
import { DEFAULT_IMAGE_TRANSFORM, type ImageTransform } from "@/components/site/EditableImage";

const IMAGES_KEY = "trang-chu-services-images";
const TRANSFORMS_KEY = "trang-chu-services-transform";
export const SERVICE_BG = ["var(--color-accent-100)", "var(--color-accent-2-100)", "var(--color-neutral-100)", "#FCEFC7", "#DCEAE2", "#F3E3F0"];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function ServicesGrid({
  services,
  initialImages,
  initialTransforms,
  canEdit,
}: {
  services: { title: string; desc: string; icon: string }[];
  initialImages: Record<number, string>;
  initialTransforms: Record<number, ImageTransform>;
  canEdit: boolean;
}) {
  const [images, setImages] = useState(initialImages);
  const [transforms, setTransforms] = useState(initialTransforms);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingIndex = useRef<number | null>(null);

  function openPicker(index: number) {
    pendingIndex.current = index;
    inputRef.current?.click();
  }

  async function handleFile(file: File | undefined) {
    const index = pendingIndex.current;
    if (!file || index === null) return;
    setUploadingIndex(index);
    try {
      const url = await uploadContentImage(file);
      const nextImages = { ...images, [index]: url };
      const nextTransforms = { ...transforms, [index]: DEFAULT_IMAGE_TRANSFORM };
      setImages(nextImages);
      setTransforms(nextTransforms);
      await Promise.all([
        saveJsonSetting(IMAGES_KEY, nextImages, ["/"]),
        saveJsonSetting(TRANSFORMS_KEY, nextTransforms, ["/"]),
      ]);
    } catch {
      // upload/save failed — icon just stays as-is
    } finally {
      setUploadingIndex(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function commitTransform(index: number, next: ImageTransform) {
    setTransforms((prev) => {
      const merged = { ...prev, [index]: next };
      saveJsonSetting(TRANSFORMS_KEY, merged, ["/"]).catch(() => {});
      return merged;
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {services.map((s, i) => (
        <div
          key={s.title}
          className="card elev-sm overflow-hidden flex flex-col transition-transform hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
          style={{ border: "none", padding: 0 }}
        >
          <ServiceImageArea
            key={images[i] ?? "empty"}
            bg={SERVICE_BG[i]}
            index={i}
            icon={s.icon}
            imageUrl={images[i] ?? null}
            transform={transforms[i] ?? DEFAULT_IMAGE_TRANSFORM}
            onTransformChange={(t) => commitTransform(i, t)}
            canEdit={canEdit}
            uploading={uploadingIndex === i}
            onReplace={() => openPicker(i)}
          />
          <div className="flex flex-col items-center text-center gap-3 p-7" style={{ background: "var(--color-panel)" }}>
            <h3 className="text-xl font-bold">{s.title}</h3>
            <p className="text-base leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
              {s.desc}
            </p>
          </div>
        </div>
      ))}

      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      )}
    </div>
  );
}

function ServiceImageArea({
  bg,
  index,
  icon,
  imageUrl,
  transform,
  onTransformChange,
  canEdit,
  uploading,
  onReplace,
}: {
  bg: string;
  index: number;
  icon: string;
  imageUrl: string | null;
  transform: ImageTransform;
  onTransformChange: (t: ImageTransform) => void;
  canEdit: boolean;
  uploading: boolean;
  onReplace: () => void;
}) {
  // Deliberately no effect re-syncing from the `transform` prop: this
  // component is remounted (via a key on imageUrl) whenever the photo is
  // replaced, which is the only time the prop legitimately needs to reset
  // local state — re-syncing on every prop change would fight the drag/zoom
  // handlers' own optimistic updates.
  const [dragging, setDragging] = useState(false);
  const [localTransform, setLocalTransform] = useState(transform);
  const boxRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef(transform);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    function point(e: MouseEvent | TouchEvent) {
      return "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    }
    function handleMove(e: MouseEvent | TouchEvent) {
      const start = dragStartRef.current;
      const rect = boxRef.current?.getBoundingClientRect();
      if (!start || !rect) return;
      const p = point(e);
      const dxPct = ((p.x - start.x) / rect.width) * 100;
      const dyPct = ((p.y - start.y) / rect.height) * 100;
      const next = { ...transformRef.current, posX: clamp(start.posX - dxPct, 0, 100), posY: clamp(start.posY - dyPct, 0, 100) };
      transformRef.current = next;
      setLocalTransform(next);
    }
    function handleUp() {
      setDragging(false);
      dragStartRef.current = null;
      onTransformChange(transformRef.current);
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
    if (!canEdit) return;
    dragStartRef.current = { x, y, posX: transformRef.current.posX, posY: transformRef.current.posY };
    setDragging(true);
  }

  function commitZoom(nextZoom: number) {
    const next = { ...transformRef.current, zoom: nextZoom };
    transformRef.current = next;
    setLocalTransform(next);
    onTransformChange(next);
  }

  return (
    <div
      ref={boxRef}
      className="relative overflow-hidden group"
      style={{
        background: bg,
        height: 220,
        cursor: imageUrl && canEdit ? (dragging ? "grabbing" : "grab") : undefined,
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || !imageUrl) return;
        startDrag(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => imageUrl && startDrag(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <span
        className="absolute z-10 flex items-center justify-center rounded-full font-heading font-bold text-base"
        style={{ top: 16, left: 16, width: 44, height: 44, background: "var(--color-panel)", color: "var(--color-accent-600)", boxShadow: "var(--shadow-sm)" }}
      >
        0{index + 1}
      </span>

      {imageUrl ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `${localTransform.zoom}%`,
            backgroundPosition: `${localTransform.posX}% ${localTransform.posY}%`,
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: 96 }} aria-hidden>
            {icon}
          </span>
        </div>
      )}

      {canEdit && imageUrl && (
        <div
          className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span aria-hidden>🔍</span>
          <input
            type="range"
            min={100}
            max={250}
            value={localTransform.zoom}
            onChange={(e) => setLocalTransform((t) => ({ ...t, zoom: Number(e.target.value) }))}
            onMouseUp={(e) => commitZoom(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => commitZoom(Number((e.target as HTMLInputElement).value))}
            style={{ width: 80 }}
            aria-label="Thu phóng ảnh"
          />
        </div>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReplace();
          }}
          disabled={uploading}
          className={`editable-image-btn absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-opacity ${
            imageUrl ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          }`}
          style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
        >
          {uploading ? "Đang tải…" : imageUrl ? "✏️ Đổi ảnh" : "+ Thêm ảnh"}
        </button>
      )}
    </div>
  );
}
