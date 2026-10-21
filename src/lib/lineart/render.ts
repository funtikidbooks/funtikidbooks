// Draws extracted strokes as finished line art, and writes them out as SVG
// and as a Photoshop path (so any Photoshop brush can be applied with
// Stroke Path).
import type { Stroke } from "./extract";

export type BrushStyle = "round" | "taper" | "ink" | "pencil";

export type RenderStyle = {
  widthPx: number; // a normal line
  byWeight: boolean; // heavier sketch lines → bolder (frame), lighter → finer (details)
  brush: BrushStyle;
  color: string;
};

export const BRUSHES: { id: BrushStyle; label: string }[] = [
  { id: "round", label: "Đều nét" },
  { id: "taper", label: "Vuốt nhọn 2 đầu" },
  { id: "ink", label: "Bút mực" },
  { id: "pencil", label: "Bút chì" },
];

// Three weights, like a hand-inked colouring page: bold frame and outer
// lines, normal lines, fine details.
export function widthFor(s: Stroke, sketchHalf: number, style: RenderStyle): number {
  if (!style.byWeight || sketchHalf <= 0) return style.widthPx;
  const r = s.weight / sketchHalf;
  return style.widthPx * (r < 0.8 ? 0.72 : r > 1.2 ? 1.5 : 1);
}

function pathOf(ctx: CanvasRenderingContext2D, p: Float32Array, closed: boolean) {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  if (closed) ctx.closePath();
}

// Width along the stroke, 0..1 of full: thin at the ends for the tapered
// brushes, with a slow swell for the ink pen.
function profile(brush: BrushStyle, along: number, total: number, seed: number): number {
  if (brush === "round" || brush === "pencil") return 1;
  const taper = Math.min(total * 0.3, 60);
  const ends = Math.min(1, Math.min(along, total - along) / Math.max(1, taper));
  const eased = 0.18 + 0.82 * Math.sin((ends * Math.PI) / 2);
  if (brush === "taper") return eased;
  const swell = 0.88 + 0.12 * Math.sin(along / 37 + seed) * Math.sin(along / 113 + seed * 1.7);
  return eased * swell;
}

function variableOutline(ctx: CanvasRenderingContext2D, p: Float32Array, closed: boolean, w: number, brush: BrushStyle, seed: number) {
  const n = p.length / 2;
  if (n < 2) return;
  const along = new Float32Array(n);
  for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
  const total = along[n - 1];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    let tx = p[b * 2] - p[a * 2];
    let ty = p[b * 2 + 1] - p[a * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const half = (w / 2) * (closed ? 1 : profile(brush, along[i], total, seed));
    left.push(p[i * 2] - ty * half, p[i * 2 + 1] + tx * half);
    right.push(p[i * 2] + ty * half, p[i * 2 + 1] - tx * half);
  }
  ctx.moveTo(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
  ctx.closePath();
}

let grain: HTMLCanvasElement | null = null;
function grainPattern(ctx: CanvasRenderingContext2D) {
  if (!grain) {
    grain = document.createElement("canvas");
    grain.width = grain.height = 128;
    const g = grain.getContext("2d")!;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      img.data[i * 4 + 3] = 150 + Math.floor(Math.random() * 105);
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grain, "repeat")!;
}

// `hidden` holds strokes the artist tapped away.
export function drawLineArt(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  sketchHalf: number,
  style: RenderStyle,
  hidden: Set<number>,
  scale = 1,
) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = style.color;
  ctx.strokeStyle = style.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokes.forEach((s, i) => {
    if (hidden.has(i)) return;
    ctx.beginPath();
    if (s.fill) {
      pathOf(ctx, s.pts, true);
      ctx.fill();
      return;
    }
    const w = widthFor(s, sketchHalf, style);
    if (style.brush === "round" || style.brush === "pencil" || s.closed) {
      ctx.lineWidth = w;
      pathOf(ctx, s.pts, s.closed);
      ctx.stroke();
    } else {
      variableOutline(ctx, s.pts, s.closed, w, style.brush, i * 1.37);
      ctx.fill();
    }
  });
  if (style.brush === "pencil") {
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, ctx.canvas.width / scale, ctx.canvas.height / scale);
  }
  ctx.restore();
}

// The stroke under a tap, for removing stray lines by hand.
export function strokeAt(strokes: Stroke[], x: number, y: number, radius: number): number {
  let best = -1;
  let bestD = radius;
  strokes.forEach((s, i) => {
    const p = s.pts;
    if (s.fill) {
      // inside test
      let inside = false;
      for (let a = 0, b = p.length / 2 - 1; a < p.length / 2; b = a++) {
        const ya = p[a * 2 + 1];
        const yb = p[b * 2 + 1];
        if (ya > y !== yb > y && x < ((p[b * 2] - p[a * 2]) * (y - ya)) / (yb - ya) + p[a * 2]) inside = !inside;
      }
      if (inside) {
        best = i;
        bestD = 0;
      }
    }
    for (let k = 0; k < p.length; k += 2) {
      const d = Math.hypot(p[k] - x, p[k + 1] - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

function fewer(p: Float32Array, tol: number): Float32Array {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const st = [0, n - 1];
  while (st.length) {
    const b = st.pop()!;
    const a = st.pop()!;
    const len = Math.hypot(p[b * 2] - p[a * 2], p[b * 2 + 1] - p[a * 2 + 1]) || 1e-6;
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[b * 2] - p[a * 2]) * (p[a * 2 + 1] - p[i * 2 + 1]) - (p[a * 2] - p[i * 2]) * (p[b * 2 + 1] - p[a * 2 + 1])) / len;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      st.push(a, best, best, b);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return Float32Array.from(out);
}

export function lineArtSvg(strokes: Stroke[], sketchHalf: number, style: RenderStyle, hidden: Set<number>, w: number, h: number, dpi: number): string {
  const mm = 25.4 / dpi;
  const f = (v: number) => (v * mm).toFixed(3);
  const parts: string[] = [];
  strokes.forEach((s, i) => {
    if (hidden.has(i)) return;
    const p = fewer(s.pts, 0.35);
    let d = `M${f(p[0])} ${f(p[1])}`;
    for (let k = 2; k < p.length; k += 2) d += `L${f(p[k])} ${f(p[k + 1])}`;
    if (s.closed) d += "Z";
    if (s.fill) parts.push(`<path d="${d}" fill="${style.color}"/>`);
    else parts.push(`<path d="${d}" fill="none" stroke="${style.color}" stroke-width="${f(widthFor(s, sketchHalf, style))}"/>`);
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">\n` +
    `<g stroke-linecap="round" stroke-linejoin="round">\n${parts.join("\n")}\n</g>\n</svg>\n`
  );
}

// Photoshop saved-path resource data (image resource 2000+): every stroke as
// a smooth open or closed sub-path. In Photoshop: Paths panel → "Line art" →
// pick any brush → Stroke Path (tick Simulate Pressure for tapered ends).
export function photoshopPath(strokes: Stroke[], hidden: Set<number>, w: number, h: number): Uint8Array {
  const recs: Uint8Array[] = [];
  const rec = () => new Uint8Array(26);
  const fixed = (dv: DataView, off: number, v: number) => dv.setInt32(off, Math.round(v * 16777216));
  const r6 = rec();
  r6[1] = 6;
  recs.push(r6);
  const r8 = rec();
  r8[1] = 8;
  recs.push(r8);
  strokes.forEach((s, i) => {
    if (hidden.has(i)) return;
    const p = fewer(s.pts, 0.6);
    const n = p.length / 2;
    if (n < 2) return;
    const len = rec();
    const dl = new DataView(len.buffer);
    dl.setUint16(0, s.closed ? 0 : 3);
    dl.setUint16(2, n);
    recs.push(len);
    for (let k = 0; k < n; k++) {
      const prev = s.closed ? (k - 1 + n) % n : Math.max(0, k - 1);
      const next = s.closed ? (k + 1) % n : Math.min(n - 1, k + 1);
      const tx = (p[next * 2] - p[prev * 2]) / 6;
      const ty = (p[next * 2 + 1] - p[prev * 2 + 1]) / 6;
      const knot = rec();
      const dv = new DataView(knot.buffer);
      dv.setUint16(0, s.closed ? 1 : 4);
      const x = p[k * 2];
      const y = p[k * 2 + 1];
      fixed(dv, 2, (y - ty) / h);
      fixed(dv, 6, (x - tx) / w);
      fixed(dv, 10, y / h);
      fixed(dv, 14, x / w);
      fixed(dv, 18, (y + ty) / h);
      fixed(dv, 22, (x + tx) / w);
      recs.push(knot);
    }
  });
  const out = new Uint8Array(recs.length * 26);
  recs.forEach((r, i) => out.set(r, i * 26));
  return out;
}
