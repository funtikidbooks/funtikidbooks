"use client";

// Shared shell for the hover/long-press "peek" popups across the workspace
// (Báo cáo giờ's cell + today-column popups, the phòng họp room-info
// popup) — positions itself off an anchor rect, grows out of that rect
// with a quick zoom-in (.fk-popup-in in globals.css), and only renders a
// dismiss backdrop for the touch/long-press path (hover already closes
// itself via onMouseLeave — a backdrop there would sit above the very
// anchor being hovered and swallow its click).
export function FloatingPopup({
  rect,
  width = 300,
  // "vertical" opens above/below the anchor, centered on it — fine for a
  // cell in a wide table. "side" opens to the right of the anchor instead
  // (flipping left if there's no room) — needed for a narrow vertical list
  // like the phòng họp sidebar, where opening below would sit on top of
  // the very next rows the room list scrolls through.
  placement = "vertical",
  dismissOnBackdrop,
  onClose,
  children,
}: {
  rect: DOMRect;
  width?: number;
  placement?: "vertical" | "side";
  dismissOnBackdrop: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const margin = 8;
  const maxHeight = 320;

  let left: number;
  let top: number | undefined;
  let bottom: number | undefined;
  let originX: string;
  let originY: string;

  if (placement === "side") {
    const spaceRight = window.innerWidth - rect.right;
    const opensRight = spaceRight >= width + margin * 2;
    left = opensRight ? rect.right + margin : Math.max(margin, rect.left - width - margin);
    top = Math.min(Math.max(margin, rect.top), window.innerHeight - maxHeight - margin);
    originX = opensRight ? "0%" : "100%";
    originY = `${Math.min(100, Math.max(0, ((rect.top - top) / maxHeight) * 100))}%`;
  } else {
    left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin);
    const spaceBelow = window.innerHeight - rect.bottom;
    const opensDown = spaceBelow > 260 || spaceBelow > rect.top;
    top = opensDown ? rect.bottom + margin : undefined;
    bottom = opensDown ? undefined : window.innerHeight - rect.top + margin;
    originX = `${Math.min(100, Math.max(0, (((rect.left + rect.width / 2 - left) / width) * 100)))}%`;
    originY = opensDown ? "0%" : "100%";
  }

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
          top,
          bottom,
          width,
          maxHeight,
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
