"use client";

import { useLayoutEffect, useRef, useState } from "react";

// A popover anchored to a message's ⋯/😊 button (room chat and direct
// messages). Opens toward the bubble's own side (right-aligned for your
// messages, so it grows leftward) but flips to the other side if that would
// spill past the chat panel — on iPad the panel sits right beside the room
// list, so a leftward menu on a short/narrow-left message was cut off
// underneath it. If it still doesn't fit after flipping (a phone: the
// reaction row on someone else's message ran off the right edge — sếp
// Phúc's screenshot), it slides sideways until it's fully on screen.
export function FlipPopover({
  preferRight,
  popoverRef,
  className,
  style,
  children,
}: {
  preferRight: boolean;
  popoverRef: { current: HTMLDivElement | null };
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [alignRight, setAlignRight] = useState(preferRight);
  const flippedRef = useRef(false);
  const [shift, setShift] = useState(0);
  // Opens upward by default; a message near the top of the scrolled chat
  // list had its menu cut off under the room header (sếp Phúc's screenshot:
  // only "Thu hồi" left visible), so it drops below the button instead
  // when there isn't room above.
  const [openDown, setOpenDown] = useState(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    let clip: HTMLElement | null = el.parentElement;
    while (clip && getComputedStyle(clip).overflowX === "visible") clip = clip.parentElement;
    const box = clip ? clip.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    const minX = Math.max(box.left, 0) + 4;
    const maxX = Math.min(box.right, window.innerWidth) - 4;
    const rect = el.getBoundingClientRect();
    // Where it sits before any sideways slide.
    const left = rect.left - shift;
    const right = rect.right - shift;

    if (!flippedRef.current && alignRight && left < minX) {
      flippedRef.current = true;
      setAlignRight(false);
      return;
    }
    if (!flippedRef.current && !alignRight && right > maxX) {
      flippedRef.current = true;
      setAlignRight(true);
      return;
    }
    const next = left < minX ? minX - left : right > maxX ? Math.max(minX - left, maxX - right) : 0;
    if (Math.abs(next - shift) > 0.5) setShift(next);

    if (!openDown) {
      let clipY: HTMLElement | null = el.parentElement;
      while (clipY && getComputedStyle(clipY).overflowY === "visible") clipY = clipY.parentElement;
      const top = clipY ? clipY.getBoundingClientRect().top : 0;
      if (rect.top < top + 4) setOpenDown(true);
    }
  }, [alignRight, openDown, shift]);

  const vertical: React.CSSProperties = openDown ? { bottom: "auto", top: "100%", marginBottom: 0, marginTop: 6 } : {};

  return (
    <div
      ref={(node) => {
        innerRef.current = node;
        popoverRef.current = node;
      }}
      className={className}
      style={{ ...style, ...vertical, [alignRight ? "right" : "left"]: 0, transform: shift ? `translateX(${shift}px)` : undefined }}
    >
      {children}
    </div>
  );
}
