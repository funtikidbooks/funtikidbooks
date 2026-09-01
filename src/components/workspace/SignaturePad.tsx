"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type SignaturePadHandle = {
  getBlob: () => Promise<Blob | null>;
  clear: () => void;
};

// A minimal draw-to-sign canvas — Pointer Events so mouse, touch, and
// stylus all just work without separate handlers. The drawing is read out
// as a PNG Blob via the imperative handle on submit, rather than pushing
// every stroke up as state, since nothing outside needs to react mid-draw.
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange: (hasDrawn: boolean) => void }>(
  function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);

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
      getBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
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
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
      onChange(false);
    }

    return (
      <div className="flex flex-col gap-2">
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
            Ký bằng ngón tay hoặc chuột vào khung trên
          </span>
          <button type="button" onClick={clear} className="btn btn-ghost btn-sm">
            Xoá, ký lại
          </button>
        </div>
      </div>
    );
  },
);
