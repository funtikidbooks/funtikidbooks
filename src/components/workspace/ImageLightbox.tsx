"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,9,8,.9)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
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
        className="rounded-[8px]"
        style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }}
        onClick={(e) => e.stopPropagation()}
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
