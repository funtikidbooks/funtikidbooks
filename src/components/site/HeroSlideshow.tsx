"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/Modal";
import { addHeroSlide, removeHeroSlide, saveJsonSetting } from "@/lib/actions/admin";
import { DEFAULT_IMAGE_TRANSFORM, type ImageTransform } from "@/components/site/EditableImage";
import { isSupabaseStorageUrl, resizedUrl } from "@/lib/imageTransform";

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
  // Bumped per-slide (keyed by src, not index — stable across reordering)
  // only at the moment that slide BECOMES active. Used solely to key the
  // Ken Burns wrapper below so its animation restarts on a fresh
  // activation, while staying stable for the rest of that slide's life —
  // including while it's fading OUT after being replaced. It used to key
  // off active-vs-not, which unmounted (and CSS-snapped back to no
  // transform) the outgoing slide the instant it stopped being active,
  // causing a visible jerk right at the crossfade; now the outgoing slide
  // just keeps animating smoothly underneath the fade.
  const [activationAt, setActivationAt] = useState<Record<string, number>>({});
  const [managing, setManaging] = useState(false);
  const [transforms, setTransforms] = useState(initialTransforms);
  // What's actually persisted — `transforms` is the live/working copy the
  // director drags and zooms freely; nothing reaches the server until they
  // explicitly hit "Lưu vị trí" below. A stray touch (scrolling the page
  // with a thumb that happened to land on the banner) used to get saved
  // the instant it lifted — now it just sits as an unsaved change they can
  // discard with "Huỷ" or a reload.
  const [savedTransforms, setSavedTransforms] = useState(initialTransforms);
  const [dragging, setDragging] = useState(false);
  const [savingPosition, setSavingPosition] = useState(false);
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
  const activeSaved = savedTransforms[activeSrc] ?? DEFAULT_IMAGE_TRANSFORM;
  const hasUnsavedPosition =
    activeTransform.posX !== activeSaved.posX || activeTransform.posY !== activeSaved.posY || activeTransform.zoom !== activeSaved.zoom;

  function goTo(i: number) {
    setIndex(i);
    setActivationAt((prev) => ({ ...prev, [slides[i]]: (prev[slides[i]] ?? 0) + 1 }));
    setLoaded((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }

  async function savePosition() {
    setSavingPosition(true);
    try {
      await saveJsonSetting(`${settingsKey}-transform`, transformsRef.current, revalidatePaths);
      setSavedTransforms(transformsRef.current);
    } catch {
      // Left as an unsaved change — the Lưu button just stays visible so
      // they can try again.
    } finally {
      setSavingPosition(false);
    }
  }

  function cancelPosition() {
    setTransforms((prev) => ({ ...prev, [activeSrc]: activeSaved }));
  }

  // Re-scheduled every time safeIndex changes rather than one continuous
  // setInterval — still fires every ROTATE_MS, but lets goTo read the
  // current index directly instead of needing a stale-closure workaround.
  // Paused while the director is dragging/zooming the current slide, and
  // while there's an unsaved position change on it, so it doesn't rotate
  // away before they get to hit "Lưu vị trí".
  useEffect(() => {
    if (slides.length <= 1 || dragging || hasUnsavedPosition) return;
    const id = setTimeout(() => goTo((safeIndex + 1) % slides.length), ROTATE_MS);
    return () => clearTimeout(id);
    // goTo intentionally omitted: it's a plain function recreated every
    // render, and listing it would re-run this effect (and reschedule the
    // rotation timer) on every render instead of only when the values
    // below actually change. It always reads the latest `slides` at call
    // time via closure regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, slides.length, dragging, hasUnsavedPosition]);

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
  }, [dragging, activeSrc]);

  function startDrag(x: number, y: number) {
    if (!canEdit) return;
    dragStartRef.current = { x, y, posX: activeTransform.posX, posY: activeTransform.posY };
    setDragging(true);
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
          const isActive = i === safeIndex;
          // Alternate both zoom direction (in vs out) and pan direction
          // (left→right vs right→left) slide-to-slide, purely by position
          // in the list — deterministic, not random. Panning is a
          // translateX on the WRAPPER (not object-position on the image):
          // object-position's usable range depends on how much slack
          // object-fit:cover leaves on that axis, which turned out to be
          // ~zero horizontally for these photos (a ~4:3 photo covering a
          // much wider banner fills the width exactly and only has
          // vertical slack) — so a horizontal object-position pan was
          // invisible. translateX-of-the-already-zoomed-wrapper has no
          // such dependency: zooming always creates real horizontal
          // overscan to pan within, regardless of the source photo's own
          // aspect ratio — AS LONG AS the pan offset is 0 exactly when
          // scale is 1 (no overscan yet) and only reaches its full ±panAmt
          // once scale has reached 1.15 (max overscan), scaling together
          // in lockstep. That's why pan is expressed as "value at rest"
          // vs "value at full zoom" below rather than a fixed from/to —
          // for a zoom-OUT slide the zoomed end is where it STARTS, for a
          // zoom-IN slide the zoomed end is where it FINISHES, and the
          // pan has to track whichever one that is or it'd expose an edge
          // during the low-scale portion.
          const panAmt = 4;
          const zoomOut = i % 2 === 0;
          const panLtr = i % 2 === 0;
          const panAtRest = 0;
          const panAtZoomed = panLtr ? -panAmt : panAmt;
          const scaleFrom = zoomOut ? 1.15 : 1;
          const scaleTo = zoomOut ? 1 : 1.15;
          const panFrom = zoomOut ? panAtZoomed : panAtRest;
          const panTo = zoomOut ? panAtRest : panAtZoomed;
          return (
            <div
              key={src}
              className="absolute inset-0 transition-opacity"
              style={{ opacity: isActive ? 1 : 0, transitionDuration: "1200ms" }}
            >
              {loaded.has(i) && (
                // Keyed by this slide's own last-activation count — stable
                // for its whole lifetime (active AND fading out afterward),
                // only remounting (restarting the animation) the next time
                // it's reactivated. The class is unconditional so the
                // outgoing slide keeps animating smoothly underneath the
                // opacity crossfade instead of snapping back to a static
                // frame the instant it stops being active. The outer div
                // above keeps its own stable `key={src}` so the crossfade
                // itself never restarts either.
                <div
                  key={`kb-${activationAt[src] ?? 0}`}
                  className="absolute inset-0 hero-kenburns"
                  style={
                    {
                      "--fk-scale-from": scaleFrom,
                      "--fk-scale-to": scaleTo,
                      "--fk-pan-from": `${panFrom}%`,
                      "--fk-pan-to": `${panTo}%`,
                    } as React.CSSProperties
                  }
                >
                  <Image
                    src={isSupabaseStorageUrl(src) ? (resizedUrl(src, 1600) ?? src) : src}
                    alt="Funti Kidbooks Studio"
                    fill
                    priority={i === 0}
                    unoptimized={isSupabaseStorageUrl(src)}
                    className="object-cover"
                    style={{ transform: `scale(${t.zoom / 100})`, objectPosition: `${t.posX}% ${t.posY}%`, pointerEvents: "none" }}
                  />
                </div>
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
            style={{ width: 90 }}
            aria-label="Thu phóng ảnh bìa"
          />
          <span style={{ minWidth: 32, textAlign: "right" }}>{activeTransform.zoom}%</span>
        </div>
      )}

      {/* Kéo hoặc thu phóng chỉ đổi cục bộ — không tự lưu nữa, tránh việc lỡ
          tay chạm/kéo màn hình (đặc biệt trên iPad) làm xê dịch ảnh mà
          không hay biết. Chỉ khi bấm "Lưu vị trí" mới thật sự ghi vào máy chủ. */}
      {canEdit && hasUnsavedPosition && (
        <div
          className="absolute top-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ left: 210, background: "rgba(20,18,17,.6)", color: "#fff", zIndex: 20 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span aria-hidden>●</span>
          <span>Vị trí chưa lưu</span>
          <button
            type="button"
            onClick={cancelPosition}
            disabled={savingPosition}
            className="px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,.15)" }}
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={savePosition}
            disabled={savingPosition}
            className="px-2 py-0.5 rounded-full font-bold"
            style={{ background: "var(--color-accent-500)" }}
          >
            {savingPosition ? "Đang lưu…" : "Lưu vị trí"}
          </button>
        </div>
      )}

      {/* Text sits low in the frame (per sếp Phúc's reference) rather than
          dead-center — pb-16 clears the slideshow dots pinned at bottom:28
          below, and this is also where the overlay gradient above is at its
          darkest, so it stays the most readable spot regardless of which
          photo is behind it. */}
      <div className="relative h-full max-w-[760px] mx-auto flex flex-col items-center justify-end text-center gap-5 px-5 pb-16 text-white">
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
              <Image
                src={isSupabaseStorageUrl(url) ? (resizedUrl(url, 250) ?? url) : url}
                alt=""
                fill
                unoptimized={isSupabaseStorageUrl(url)}
                className="object-cover"
                sizes="180px"
              />
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
