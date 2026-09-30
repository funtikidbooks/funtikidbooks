"use client";

import { useEffect, useRef, useState } from "react";
import { saveJsonSetting, uploadContentImage } from "@/lib/actions/admin";
import { resizedUrl } from "@/lib/imageTransform";
import { COMPARE_KEY, type ComparePair } from "@/lib/homeArt";

// The same page as a pencil sketch and in colour, one over the other; drag
// the bar to wipe between them. Mouse through pointer events, fingers
// through touch events (Safari hands a sideways finger to its own
// gestures otherwise), keys through the hidden range input.
export function SketchCompare({
  initial,
  canEdit,
  labels,
}: {
  initial: ComparePair;
  canEdit: boolean;
  labels: { sketch: string; color: string; hint: string; sketchUpload: string; colorUpload: string; editorHint: string };
}) {
  const [pair, setPair] = useState(initial);
  const [pos, setPos] = useState(50);
  const [busy, setBusy] = useState<"sketch" | "color" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const setFromX = (clientX: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let dir: "x" | "y" | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dir = null;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || dir === "y") return;
      const t = e.touches[0];
      if (dir === null) {
        if (Math.abs(t.clientX - x0) < 5 && Math.abs(t.clientY - y0) < 5) return;
        dir = Math.abs(t.clientX - x0) > Math.abs(t.clientY - y0) ? "x" : "y";
        if (dir === "y") return; // scrolling past
      }
      if (e.cancelable) e.preventDefault();
      setFromX(t.clientX);
    };
    const onEnd = (e: TouchEvent) => {
      // A tap (no drag) moves the bar there too.
      if (dir === null && e.changedTouches[0]) setFromX(e.changedTouches[0].clientX);
      dir = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  async function upload(which: "sketch" | "color", file: File | undefined) {
    if (!file) return;
    setBusy(which);
    try {
      const url = await uploadContentImage(file);
      const next = { ...pair, [which]: url };
      setPair(next);
      await saveJsonSetting(COMPARE_KEY, next, ["/"]);
    } catch {
      // keeps the previous picture
    } finally {
      setBusy(null);
    }
  }

  const chip = "absolute top-3 rounded-full px-2.5 py-1 text-[12px] font-bold shadow-sm";

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-[18px] select-none cursor-ew-resize"
        style={{ boxShadow: "var(--shadow-lg)", touchAction: "pan-y", background: "var(--color-panel)" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && draggingRef.current) setFromX(e.clientX);
        }}
        onPointerUp={() => (draggingRef.current = false)}
        onPointerCancel={() => (draggingRef.current = false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resizedUrl(pair.color, 1100)} alt={labels.color} draggable={false} loading="lazy" className="block w-full h-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resizedUrl(pair.sketch, 1100)}
          alt={labels.sketch}
          draggable={false}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <span className={chip} style={{ left: 12, background: "var(--color-panel)", color: "var(--color-text)", opacity: pos > 12 ? 1 : 0 }}>
          ✏️ {labels.sketch}
        </span>
        <span className={chip} style={{ right: 12, background: "var(--color-accent-500)", color: "#fff", opacity: pos < 88 ? 1 : 0 }}>
          🎨 {labels.color}
        </span>
        {/* The bar and its knob. */}
        <span className="absolute inset-y-0 pointer-events-none" style={{ left: `${pos}%`, width: 3, marginLeft: -1.5, background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.08)" }} aria-hidden />
        <span
          className="absolute top-1/2 flex items-center justify-center rounded-full pointer-events-none text-[15px] font-bold"
          style={{
            left: `${pos}%`,
            width: 42,
            height: 42,
            marginLeft: -21,
            marginTop: -21,
            background: "#fff",
            color: "var(--color-accent-700)",
            boxShadow: "var(--shadow-md)",
          }}
          aria-hidden
        >
          ⟷
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pos)}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={labels.hint}
          className="sr-only"
        />
      </div>
      <p className="text-[12.5px] text-center" style={{ color: "var(--color-neutral-500)" }}>
        ⟷ {labels.hint}
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-[12.5px]" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
          <span className="basis-full text-center">{labels.editorHint}</span>
          {(["sketch", "color"] as const).map((which) => (
            <label key={which} className="btn btn-secondary btn-sm cursor-pointer">
              {busy === which ? "Đang tải…" : which === "sketch" ? labels.sketchUpload : labels.colorUpload}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void upload(which, e.target.files?.[0])} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
