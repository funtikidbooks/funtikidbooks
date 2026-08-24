"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/Modal";
import { addHeroSlide, removeHeroSlide, saveJsonSetting } from "@/lib/actions/admin";
import { DEFAULT_IMAGE_TRANSFORM, type ImageTransform } from "@/components/site/EditableImage";

const ROTATE_MS = 6000;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function HeroSlideshow({
  settingsKey,
  images,
  transforms: initialTransforms = {},
  canEdit,
  revalidatePaths = [],
  overlay,
  children,
}: {
  settingsKey: string;
  images: string[];
  transforms?: Record<string, ImageTransform>;
  canEdit: boolean;
  revalidatePaths?: string[];
  overlay?: React.CSSProperties["background"];
  children: React.ReactNode;
}) {
  const [slides, setSlides] = useState(images);
  const [index, setIndex] = useState(0);
  const [managing, setManaging] = useState(false);
  const [transforms, setTransforms] = useState(initialTransforms);
  const [dragging, setDragging] = useState(false);
  const slideBoxRef = useRef<HTMLDivElement>(null);
  const transformsRef = useRef(transforms);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  // Every slide sits in the DOM at all times (for the crossfade), so without
  // this, next/image would eagerly download every hero photo on first paint
  // even though only one is visible — only mount the <img> once a slide has
  // actually been reached, so the rest load lazily as the rotation gets there.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));

  // Clamp at render time instead of via an effect — avoids an extra render
  // when a slide is removed and the current index falls out of range.
  const safeIndex = Math.min(index, slides.length - 1);
  const activeSrc = slides[safeIndex];
  const activeTransform = transforms[activeSrc] ?? DEFAULT_IMAGE_TRANSFORM;

  function goTo(i: number) {
    setIndex(i);
    setLoaded((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }

  // Re-scheduled every time safeIndex changes rather than one continuous
  // setInterval — still fires every ROTATE_MS, but lets goTo read the
  // current index directly instead of needing a stale-closure workaround.
  // Paused while the director is dragging/zooming the current slide so it
  // doesn't jump to the next photo mid-adjustment.
  useEffect(() => {
    if (slides.length <= 1 || dragging) return;
    const id = setTimeout(() => goTo((safeIndex + 1) % slides.length), ROTATE_MS);
    return () => clearTimeout(id);
  }, [safeIndex, slides.length, dragging]);

  useEffect(() => {
    transformsRef.current = transforms;
  }, [transforms]);

  useEffect(() => {
    if (!dragging) return;
    function point(e: MouseEvent | TouchEvent) {
      return "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    }
    function handleMove(e: MouseEvent | TouchEvent) {
      const start = dragStartRef.current;
      const rect = slideBoxRef.current?.getBoundingClientRect();
      if (!start || !rect) return;
      const p = point(e);
      const dxPct = ((p.x - start.x) / rect.width) * 100;
      const dyPct = ((p.y - start.y) / rect.height) * 100;
      setTransforms((prev) => ({
        ...prev,
        [activeSrc]: { ...(prev[activeSrc] ?? DEFAULT_IMAGE_TRANSFORM), posX: clamp(start.posX - dxPct, 0, 100), posY: clamp(start.posY - dyPct, 0, 100) },
      }));
    }
    function handleUp() {
      setDragging(false);
      dragStartRef.current = null;
      saveJsonSetting(`${settingsKey}-transform`, transformsRef.current, revalidatePaths).catch(() => {});
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
  }, [dragging, activeSrc]);

  function startDrag(x: number, y: number) {
    if (!canEdit) return;
    dragStartRef.current = { x, y, posX: activeTransform.posX, posY: activeTransform.posY };
    setDragging(true);
  }

  function commitZoom(nextZoom: number) {
    const next = { ...transformsRef.current, [activeSrc]: { ...activeTransform, zoom: nextZoom } };
    setTransforms(next);
    saveJsonSetting(`${settingsKey}-transform`, next, revalidatePaths).catch(() => {});
  }

  return (
    <section className="relative w-full overflow-hidden" style={{ height: 620 }}>
      <div
        ref={slideBoxRef}
        className="absolute inset-0"
        style={canEdit ? { cursor: dragging ? "grabbing" : "grab" } : undefined}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          startDrag(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
      >
        {slides.map((src, i) => {
          const t = transforms[src] ?? DEFAULT_IMAGE_TRANSFORM;
          return (
            <div
              key={src}
              className="absolute inset-0 transition-opacity"
              style={{ opacity: i === safeIndex ? 1 : 0, transitionDuration: "1200ms" }}
            >
              {loaded.has(i) && (
                <Image
                  src={src}
                  alt="Funti Kidbooks Studio"
                  fill
                  priority={i === 0}
                  className="object-cover"
                  style={{ transform: `scale(${t.zoom / 100})`, objectPosition: `${t.posX}% ${t.posY}%`, pointerEvents: "none" }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: overlay }} />

      {canEdit && (
        <div
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: "rgba(20,18,17,.6)", color: "#fff" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span aria-hidden>🔍</span>
          <input
            type="range"
            min={100}
            max={250}
            value={activeTransform.zoom}
            onChange={(e) => setTransforms((prev) => ({ ...prev, [activeSrc]: { ...activeTransform, zoom: Number(e.target.value) } }))}
            onMouseUp={(e) => commitZoom(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => commitZoom(Number((e.target as HTMLInputElement).value))}
            style={{ width: 90 }}
            aria-label="Thu phóng ảnh bìa"
          />
          <span style={{ minWidth: 32, textAlign: "right" }}>{activeTransform.zoom}%</span>
        </div>
      )}

      <div className="relative h-full max-w-[760px] mx-auto flex flex-col items-center justify-center text-center gap-5 px-5 text-white">
        {children}

        {slides.length > 1 && (
          <div className="absolute flex gap-2" style={{ bottom: 28 }}>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ảnh ${i + 1}`}
                onClick={() => goTo(i)}
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: i === safeIndex ? "#fff" : "rgba(255,255,255,.4)",
                  transition: "background-color 0.2s ease",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => setManaging(true)}
          className="editable-image-btn absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: "rgba(20,18,17,.6)", color: "#fff" }}
        >
          🖼 Quản lý ảnh bìa ({slides.length})
        </button>
      )}

      {managing && (
        <HeroSlideManager
          settingsKey={settingsKey}
          slides={slides}
          revalidatePaths={revalidatePaths}
          onChange={setSlides}
          onClose={() => setManaging(false)}
        />
      )}
    </section>
  );
}

function HeroSlideManager({
  settingsKey,
  slides,
  revalidatePaths,
  onChange,
  onClose,
}: {
  settingsKey: string;
  slides: string[];
  revalidatePaths: string[];
  onChange: (slides: string[]) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleAdd(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const next = await addHeroSlide(settingsKey, file, revalidatePaths);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thêm ảnh");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(url: string) {
    if (slides.length <= 1) {
      setError("Cần giữ lại ít nhất 1 ảnh.");
      return;
    }
    setRemovingUrl(url);
    setError(null);
    try {
      const next = await removeHeroSlide(settingsKey, url, revalidatePaths);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xoá ảnh");
    } finally {
      setRemovingUrl(null);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={560}>
      <div className="flex flex-col p-6 gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Ảnh bìa trang chủ</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
          Các ảnh sẽ tự động chuyển đổi mỗi 6 giây trên trang chủ. Nên dùng ảnh ngang, rõ nét.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {slides.map((url) => (
            <div key={url} className="relative group rounded-[8px] overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
              <Image src={url} alt="" fill className="object-cover" sizes="180px" />
              <button
                type="button"
                onClick={() => handleRemove(url)}
                disabled={removingUrl === url}
                aria-label="Xoá ảnh"
                className="gallery-remove-btn absolute top-1 right-1 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100"
                style={{ width: 22, height: 22, background: "rgba(20,18,17,.75)", color: "#fff", fontSize: 12 }}
              >
                {removingUrl === url ? "…" : "✕"}
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="gallery-add-tile flex flex-col items-center justify-center gap-1 rounded-[8px]"
            style={{ aspectRatio: "16 / 10", border: "2px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
          >
            <span className="text-xl leading-none" aria-hidden>
              {busy ? "…" : "+"}
            </span>
            <span className="text-[10px] font-semibold">Thêm ảnh</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleAdd(e.target.files?.[0])}
        />

        {error && (
          <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
