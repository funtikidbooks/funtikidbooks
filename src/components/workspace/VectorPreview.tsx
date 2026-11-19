"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type PreviewView = "vector" | "original" | "overlay";
export type PreviewZoom = "fit" | number;

type Props = {
  width: number;
  height: number;
  original: HTMLCanvasElement | null;
  outlines: Float32Array[];
  closed: boolean[];
  mode: "fill" | "stroke";
  color: string;
  strokeMm: number;
  dpi: number;
  view: PreviewView;
  zoom: PreviewZoom;
  showNodes: boolean;
  busy: boolean;
};

function buildPath(outlines: Float32Array[], closed: boolean[]): Path2D | null {
  if (typeof Path2D === "undefined") return null;
  const p = new Path2D();
  outlines.forEach((o, k) => {
    p.moveTo(o[0], o[1]);
    for (let i = 2; i < o.length; i += 6) p.bezierCurveTo(o[i], o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5]);
    if (closed[k]) p.closePath();
  });
  return p;
}

// The picture and its vector, drawn at whatever zoom is asked. The page
// scrolls natively (so a finger scrolls it on an iPad); a canvas the size of
// the window just stays put over it and is redrawn for the part in view —
// a 400% zoom of a big sheet never needs a canvas of its own size.
export function VectorPreview({ width, height, original, outlines, closed, mode, color, strokeMm, dpi, view, zoom, showNodes, busy }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const centre = useRef({ x: width / 2, y: height / 2 });
  const lastScale = useRef(0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const path = useMemo(() => buildPath(outlines, closed), [outlines, closed]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / width, box.h / height) : 1;
  const scale = zoom === "fit" ? fit : zoom;
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sc = scrollerRef.current;
    if (!canvas || !sc) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = Math.min(sc.clientWidth, cw);
    const vh = Math.min(sc.clientHeight, ch);
    const pw = Math.max(1, Math.round(vw * dpr));
    const ph = Math.max(1, Math.round(vh * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, pw, ph);
    const sl = sc.scrollLeft;
    const st = sc.scrollTop;
    centre.current = { x: (sl + vw / 2) / scale, y: (st + vh / 2) / scale };
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -sl * dpr, -st * dpr);

    if ((view === "original" || view === "overlay") && original) {
      ctx.imageSmoothingEnabled = scale < 2;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = view === "overlay" ? 0.85 : 1;
      ctx.drawImage(original, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (path && view === "vector") {
      if (mode === "fill") {
        ctx.fillStyle = color;
        ctx.fill(path, "nonzero");
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = (strokeMm * dpi) / 25.4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(path);
      }
    }
    if (path && view === "overlay") {
      ctx.strokeStyle = "#00c8ff";
      ctx.lineWidth = 1.6 / scale;
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }
    if (showNodes && view !== "original") {
      const x0 = sl / scale - 4;
      const y0 = st / scale - 4;
      const x1 = (sl + vw) / scale + 4;
      const y1 = (st + vh) / scale + 4;
      const r = 3.2 / scale;
      let drawn = 0;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#00c8ff";
      ctx.lineWidth = 1.4 / scale;
      outer: for (const o of outlines) {
        for (let i = 0; i < o.length; i += i === 0 ? 2 : 6) {
          const x = i === 0 ? o[0] : o[i + 4];
          const y = i === 0 ? o[1] : o[i + 5];
          if (x < x0 || x > x1 || y < y0 || y > y1) continue;
          ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
          ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
          if (++drawn > 20000) break outer;
        }
      }
    }
  }, [cw, ch, scale, view, original, path, mode, color, strokeMm, dpi, showNodes, outlines]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // Zooming keeps whatever was in the middle of the window in the middle.
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (sc && lastScale.current && lastScale.current !== scale) {
      sc.scrollLeft = Math.max(0, centre.current.x * scale - Math.min(sc.clientWidth, cw) / 2);
      sc.scrollTop = Math.max(0, centre.current.y * scale - Math.min(sc.clientHeight, ch) / 2);
    }
    lastScale.current = scale;
  }, [scale, cw, ch]);

  useLayoutEffect(() => {
    draw();
  }, [draw, box]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const canDrag = cw > box.w || ch > box.h;
  return (
    <div
      ref={scrollerRef}
      onScroll={schedule}
      onPointerDown={(e) => {
        const sc = scrollerRef.current;
        if (!sc || e.pointerType !== "mouse" || e.button !== 0 || !canDrag) return;
        dragRef.current = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop };
        sc.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        const sc = scrollerRef.current;
        if (!d || !sc) return;
        sc.scrollLeft = d.sl - (e.clientX - d.x);
        sc.scrollTop = d.st - (e.clientY - d.y);
      }}
      onPointerUp={() => (dragRef.current = null)}
      onPointerCancel={() => (dragRef.current = null)}
      className="overflow-auto rounded-[var(--radius-sm)]"
      style={{
        height: "clamp(320px, 68vh, 900px)",
        background: "#fff",
        border: "1px solid var(--color-neutral-200)",
        cursor: canDrag ? "grab" : "default",
        opacity: busy ? 0.55 : 1,
        touchAction: "auto",
      }}
    >
      <div style={{ width: cw, height: ch, margin: "0 auto" }}>
        <canvas ref={canvasRef} role="img" aria-label="Xem trước vector" className="block" style={{ position: "sticky", top: 0, left: 0 }} />
      </div>
    </div>
  );
}
