"use client";

// Shared shell for the hover/long-press "peek" popups across the workspace
// (Báo cáo giờ's cell + today-column popups, the phòng họp room-info
// popup) — positions itself off an anchor rect (opening whichever of
// up/down has room), grows out of that rect with a quick zoom-in
// (.fk-popup-in in globals.css), and only renders a dismiss backdrop for
// the touch/long-press path (hover already closes itself via onMouseLeave
// — a backdrop there would sit above the very anchor being hovered and
// swallow its click).
export function FloatingPopup({
  rect,
  width = 300,
  dismissOnBackdrop,
  onClose,
  children,
}: {
  rect: DOMRect;
  width?: number;
  dismissOnBackdrop: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const margin = 8;
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin);
  const spaceBelow = window.innerHeight - rect.bottom;
  const opensDown = spaceBelow > 260 || spaceBelow > rect.top;
  const originX = `${Math.min(100, Math.max(0, (((rect.left + rect.width / 2 - left) / width) * 100)))}%`;
  const originY = opensDown ? "0%" : "100%";

  return (
    <>
      {dismissOnBackdrop && (
        <div onClick={onClose} onTouchStart={onClose} style={{ position: "fixed", inset: 0, zIndex: 45 }} />
      )}
      <div
        className="card elev-lg flex flex-col gap-3 p-4 fk-popup-in"
        style={{
          position: "fixed",
          left,
          top: opensDown ? rect.bottom + margin : undefined,
          bottom: opensDown ? undefined : window.innerHeight - rect.top + margin,
          width,
          maxHeight: 320,
          overflowY: "auto",
          zIndex: 46,
          ["--popup-origin-x" as string]: originX,
          ["--popup-origin-y" as string]: originY,
        }}
      >
        {children}
      </div>
    </>
  );
}
