"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({
  onClose,
  children,
  maxWidth = 480,
  sheetOnPhone = false,
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number | string;
  // Full-screen on phones (a card detail, like the Trello app); a centred
  // dialog from sm up.
  sheetOnPhone?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

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
      className={`fixed inset-0 z-50 flex items-center justify-center ${sheetOnPhone ? "p-0 sm:p-4" : "p-4"}`}
      style={{ background: "rgba(20,18,17,.55)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`card elev-lg w-full overflow-y-auto ${sheetOnPhone ? "h-[100dvh] max-h-[100dvh] rounded-none pt-[env(safe-area-inset-top)] sm:pt-0 sm:h-auto sm:max-h-[90vh] sm:rounded-[var(--radius-lg)]" : "max-h-[90vh]"}`}
        style={{ maxWidth, ...(sheetOnPhone ? {} : { borderRadius: "var(--radius-lg)" }) }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
