"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Matches fk-lightbox-backdrop-out/fk-lightbox-image-out's own duration in
// globals.css — kept as one constant instead of two, so they can't drift
// apart and leave the unmount either cutting the animation short or
// lingering after it's visually finished.
const CLOSE_ANIMATION_MS = 200;

// Full-screen in-page image viewer — replaces the old target="_blank" links,
// which staff reported as opening a pile of new tabs every time they clicked
// a chat photo.
export function ImageLightbox({
  url,
  filename,
  onClose,
}: {
  url: string;
  filename?: string | null;
  onClose: () => void;
}) {
  // The parent unmounts this the instant onClose() fires, which left no
  // window for a closing animation to actually play — clicking away, the
  // whole thing just vanished. Playing the reverse animation first and only
  // calling the real onClose() once it's done (sếp Phúc: "nhớ cho animation
  // zoom ra") is what makes the close feel as smooth as the open.
  const [closing, setClosing] = useState(false);

  function handleClose() {
    if (closing) return;
    // Without this check, prefers-reduced-motion still paid the full
    // CLOSE_ANIMATION_MS delay for an animation that CSS had already
    // turned off — a close that visibly does nothing for 200ms before
    // acting is worse than no animation at all.
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "fk-lightbox-backdrop-out" : "fk-lightbox-backdrop-in"}`}
      style={{ background: "rgba(10,9,8,.9)" }}
      // Closes on a click anywhere in the lightbox now, image included —
      // sếp Phúc specifically didn't want "only clicking the empty area
      // around the photo" anymore. The "open in new tab" link below still
      // stops its own click from bubbling here, since that's a separate
      // action, not a way to close.
      onClick={handleClose}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Đóng"
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 16, right: 16, width: 40, height: 40, background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 20 }}
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={filename ?? ""}
        className={`rounded-[8px] ${closing ? "fk-lightbox-image-out" : "fk-lightbox-image-in"}`}
        style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }}
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute rounded-full px-3 py-1.5 text-[13px] font-semibold"
        style={{ bottom: 16, right: 16, background: "rgba(255,255,255,.15)", color: "#fff" }}
      >
        Mở trong tab mới ↗
      </a>
    </div>,
    document.body,
  );
}
