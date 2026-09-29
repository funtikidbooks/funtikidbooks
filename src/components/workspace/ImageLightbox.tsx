"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Matches fk-lightbox-backdrop-out/fk-lightbox-image-out's own duration in
// globals.css — kept as one constant instead of two, so they can't drift
// apart and leave the unmount either cutting the animation short or
// lingering after it's visually finished.
const CLOSE_ANIMATION_MS = 200;
const SLIDE_MS = 260;

export type LightboxItem = { url: string; filename?: string | null };

// Full-screen in-page image viewer — replaces the old target="_blank" links,
// which staff reported as opening a pile of new tabs every time they clicked
// a chat photo. Given `items` (every photo in the room, oldest first) it
// pages through them: swipe on a phone/iPad, ‹ › or the arrow keys on a
// computer — no closing and reopening for each one.
export function ImageLightbox({
  url,
  filename,
  items,
  onClose,
}: {
  url: string;
  filename?: string | null;
  items?: LightboxItem[];
  onClose: () => void;
}) {
  // The parent unmounts this the instant onClose() fires, which left no
  // window for a closing animation to actually play — clicking away, the
  // whole thing just vanished. Playing the reverse animation first and only
  // calling the real onClose() once it's done (sếp Phúc: "nhớ cho animation
  // zoom ra") is what makes the close feel as smooth as the open.
  const [closing, setClosing] = useState(false);

  // The gallery: the photo that was tapped, and its neighbours either side.
  const list: LightboxItem[] = items && items.length > 1 && items.some((it) => it.url === url) ? items : [{ url, filename }];
  const [opened] = useState(() => Math.max(0, list.findIndex((it) => it.url === url)));
  const [index, setIndex] = useState(opened);
  // Live finger offset (px), and where the strip is heading once let go:
  // -1 the previous photo, 1 the next, 0 back to this one.
  const [dx, setDx] = useState(0);
  const [heading, setHeading] = useState<-1 | 0 | 1 | null>(null);
  // Paged away from the photo that was tapped — its zoom-in doesn't replay.
  const [moved, setMoved] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const swipedRef = useRef(false);
  const current = list[Math.min(index, list.length - 1)];
  const many = list.length > 1;

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function handleClose() {
    if (closing) return;
    // Without this check, prefers-reduced-motion still paid the full
    // CLOSE_ANIMATION_MS delay for an animation that CSS had already
    // turned off — a close that visibly does nothing for 200ms before
    // acting is worse than no animation at all.
    if (reduced()) {
      onClose();
      return;
    }
    setClosing(true);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  function go(step: -1 | 1) {
    if (heading !== null) return;
    const target = index + step;
    if (target < 0 || target >= list.length) {
      if (dx !== 0) setHeading(0);
      return;
    }
    if (reduced()) {
      setIndex(target);
      setMoved(true);
      setDx(0);
      return;
    }
    setHeading(step);
  }

  // The strip has slid to a neighbour: that photo becomes the middle one.
  // Same commit as the strip snapping back to centre, so nothing moves.
  function settle() {
    if (heading === null) return;
    if (heading !== 0) {
      setIndex(index + heading);
      setMoved(true);
    }
    setHeading(null);
    setDx(0);
  }

  const goRef = useRef(go);
  const closeRef = useRef(handleClose);
  const settleRef = useRef(settle);
  useEffect(() => {
    goRef.current = go;
    closeRef.current = handleClose;
    settleRef.current = settle;
  });

  // transitionend is the usual signal; this covers a slide that didn't
  // need to move (or a tab that went to the background mid-way).
  useEffect(() => {
    if (heading === null) return;
    const t = setTimeout(() => settleRef.current(), SLIDE_MS + 120);
    return () => clearTimeout(t);
  }, [heading]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      else if (e.key === "ArrowRight") goRef.current(1);
      else if (e.key === "ArrowLeft") goRef.current(-1);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  // Swiping, read from touch events (Safari hands a sideways finger to its
  // own gestures otherwise); the move handler must be allowed to stop the
  // page from reacting, so it's bound by hand rather than through React.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !many) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let lastX = 0;
    let lastT = 0;
    let dir: "x" | "y" | null = null;
    const width = () => el.clientWidth || window.innerWidth;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        dir = "y"; // a pinch: leave it alone
        return;
      }
      x0 = lastX = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = lastT = performance.now();
      dir = null;
      swipedRef.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (dir === "y" || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const dxNow = x - x0;
      const dyNow = e.touches[0].clientY - y0;
      if (dir === null) {
        if (Math.abs(dxNow) < 6 && Math.abs(dyNow) < 6) return;
        dir = Math.abs(dxNow) > Math.abs(dyNow) ? "x" : "y";
        if (dir === "y") return;
      }
      if (e.cancelable) e.preventDefault();
      swipedRef.current = true;
      lastX = x;
      lastT = performance.now();
      setDx(dxNow);
    };
    const onEnd = () => {
      if (dir !== "x") return;
      const travel = lastX - x0;
      const speed = travel / Math.max(1, lastT - t0); // px/ms
      if (travel < -width() * 0.18 || speed < -0.35) goRef.current(1);
      else if (travel > width() * 0.18 || speed > 0.35) goRef.current(-1);
      else if (travel !== 0) setHeading(0);
      dir = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [many]);

  // Past either end the strip only gives a little, like a rubber band.
  const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1);
  const drag = atEdge ? dx * 0.3 : dx;
  const offset = heading === null ? drag : 0;
  const shift = heading === 1 ? -100 : heading === -1 ? 100 : 0;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const navButton = (step: -1 | 1) => {
    const disabled = step === -1 ? index === 0 : index === list.length - 1;
    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          go(step);
        }}
        disabled={disabled}
        aria-label={step === -1 ? "Ảnh trước" : "Ảnh tiếp theo"}
        className="absolute hidden sm:flex items-center justify-center rounded-full disabled:opacity-25"
        style={{
          top: "50%",
          [step === -1 ? "left" : "right"]: 16,
          width: 48,
          height: 48,
          marginTop: -24,
          background: "rgba(255,255,255,.15)",
          color: "#fff",
          fontSize: 26,
          zIndex: 2,
        }}
      >
        {step === -1 ? "‹" : "›"}
      </button>
    );
  };

  return createPortal(
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 overflow-hidden ${closing ? "fk-lightbox-backdrop-out" : "fk-lightbox-backdrop-in"}`}
      style={{ background: "rgba(10,9,8,.9)" }}
      // Closes on a click anywhere in the lightbox now, image included —
      // sếp Phúc specifically didn't want "only clicking the empty area
      // around the photo" anymore. A swipe isn't a click, though.
      onClick={() => {
        if (swipedRef.current) {
          swipedRef.current = false;
          return;
        }
        handleClose();
      }}
    >
      {/* Three slides — previous, this, next — so a neighbour is already
          loaded and in place while the finger drags. Keyed by position in
          the list, the next photo's <img> becomes the middle one as is. */}
      <div
        className="absolute inset-0 flex"
        style={{
          transform: `translateX(calc(${-100 + shift}% + ${offset}px))`,
          transition: heading === null ? "none" : `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1)`,
        }}
        onTransitionEnd={settle}
      >
        {[index - 1, index, index + 1].map((i) => {
          const it = list[i];
          return (
            <div key={it ? `i${i}` : `empty${i - index}`} className="flex-none w-full h-full flex items-center justify-center p-4 sm:px-20">
              {it && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.url}
                  alt={it.filename ?? ""}
                  draggable={false}
                  className={`rounded-[8px] select-none ${
                    i !== index ? "" : closing ? "fk-lightbox-image-out" : i === opened && !moved ? "fk-lightbox-image-in" : ""
                  }`}
                  style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={(e) => {
          stop(e);
          handleClose();
        }}
        aria-label="Đóng"
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 16, right: 16, width: 40, height: 40, background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 20, zIndex: 2 }}
      >
        ✕
      </button>
      {many && (
        <span
          className="absolute rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums"
          style={{ top: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,.15)", color: "#fff", zIndex: 2 }}
        >
          {index + 1} / {list.length}
        </span>
      )}
      {many && navButton(-1)}
      {many && navButton(1)}
      <a
        href={current.url}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        className="absolute rounded-full px-3 py-1.5 text-[13px] font-semibold"
        style={{ bottom: 16, right: 16, background: "rgba(255,255,255,.15)", color: "#fff", zIndex: 2 }}
      >
        Mở trong tab mới ↗
      </a>
    </div>,
    document.body,
  );
}
