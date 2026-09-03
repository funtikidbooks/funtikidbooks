"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { signatureFont } from "@/lib/fonts/signature";

export type SignaturePadHandle = {
  getBlob: () => Promise<Blob | null>;
  clear: () => void;
};

type Mode = "draw" | "type";

// Renders `text` centered in a cursive font onto a fresh canvas sized like
// the draw pad, shrinking the font until it fits — a typed name can run
// much longer than the pad is wide. document.fonts.load() first because a
// canvas fillText draws with whatever font is *already* active; without
// waiting for it, this would silently fall back to the browser default the
// first time (before the font's had a chance to finish loading).
async function renderTypedSignature(text: string, width: number, height: number): Promise<Blob | null> {
  const family = signatureFont.style.fontFamily;
  let size = 56;
  await document.fonts.load(`700 ${size}px ${family}`);

  const canvas = document.createElement("canvas");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ratio, ratio);

  const maxWidth = width - 32;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#141211";
  for (; size > 18; size -= 2) {
    ctx.font = `700 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillText(text, width / 2, height / 2, maxWidth);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

// Draw-to-sign works well with a finger or Apple Pencil (Pointer Events
// cover both), but drawing a legible signature with a mouse on a desktop
// computer is clumsy for most people — "Nhập tên để ký" renders whatever
// they type in a cursive font instead, going through the same getBlob()
// handle so the rest of the sign flow (upload, staff_documents row) never
// needs to know which mode produced the image.
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange: (hasContent: boolean) => void }>(
  function SignaturePad({ onChange }, ref) {
    const [mode, setMode] = useState<Mode>("draw");
    // Always mounted regardless of mode (unlike canvasRef, which only
    // exists in draw mode) — type mode measures this fresh at sign time
    // instead of caching a width from whenever the draw canvas happened to
    // last mount, which could be stale or, if draw mode was never visited
    // this session, never set at all.
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [typedName, setTypedName] = useState("");

    // Backs the canvas with real device pixels (crisp strokes on
    // retina/phone screens) while CSS keeps it laid out at its declared size.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = "#141211";
      }
    }, []);

    useImperativeHandle(ref, () => ({
      getBlob: () => {
        if (mode === "type") {
          const trimmed = typedName.trim();
          if (!trimmed) return Promise.resolve(null);
          const width = containerRef.current?.getBoundingClientRect().width || 600;
          return renderTypedSignature(trimmed, width, 180);
        }
        return new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), "image/png");
        });
      },
      clear,
    }));

    function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = pointFromEvent(e);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const last = lastPointRef.current;
      if (!ctx || !last) return;
      const point = pointFromEvent(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      if (!hasDrawn) {
        setHasDrawn(true);
        onChange(true);
      }
    }

    function handlePointerUp() {
      drawingRef.current = false;
      lastPointRef.current = null;
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
      setTypedName("");
      onChange(false);
    }

    function switchMode(next: Mode) {
      if (next === mode) return;
      clear();
      setMode(next);
    }

    return (
      <div ref={containerRef} className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => switchMode("draw")}
            className={mode === "draw" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          >
            ✍️ Vẽ chữ ký
          </button>
          <button
            type="button"
            onClick={() => switchMode("type")}
            className={mode === "type" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          >
            ⌨️ Nhập tên để ký
          </button>
        </div>

        {mode === "draw" ? (
          <>
            <canvas
              ref={canvasRef}
              className="touch-none select-none rounded-[10px] w-full"
              style={{ height: 180, background: "#fff", border: "1.5px dashed var(--color-neutral-300)", cursor: "crosshair" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                Ký bằng ngón tay, Apple Pencil hoặc chuột vào khung trên
              </span>
              <button type="button" onClick={clear} className="btn btn-ghost btn-sm">
                Xoá, ký lại
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="flex items-center justify-center rounded-[10px] w-full px-4 overflow-hidden"
              style={{ height: 180, background: "#fff", border: "1.5px dashed var(--color-neutral-300)" }}
            >
              <span
                className={signatureFont.className}
                style={{ fontSize: 40, fontWeight: 700, color: "#141211", whiteSpace: "nowrap" }}
              >
                {typedName.trim() || " "}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="Nhập họ tên để ký"
                value={typedName}
                onChange={(e) => {
                  const value = e.target.value;
                  setTypedName(value);
                  onChange(value.trim().length > 0);
                }}
              />
              <button type="button" onClick={clear} className="btn btn-ghost btn-sm flex-none">
                Xoá
              </button>
            </div>
          </>
        )}
      </div>
    );
  },
);
