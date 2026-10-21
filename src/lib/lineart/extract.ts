// Rough sketch → clean line art ("đi line" tự động).
//
// Each sketch stroke (a textured pencil or brush line, often drawn twice or
// overshooting at corners) is filled in solid, then reduced to its centre
// line. The centre lines are joined into strokes and tidied the way an
// inker would: whiskers and overshoots at corners trimmed, crossings carried
// straight through, small breaks closed and line ends snapped onto the line
// they almost touch (so shapes are closed for colouring), crumbs dropped and
// every stroke smoothed. Small solid dots (eyes) stay solid. The result is
// vector strokes the page can draw at any thickness or with any brush.
// Pure typed-array maths, so it runs in a Web Worker on an iPad as well as
// a desktop.
import { distanceTransform, traceOutlines } from "../sticker/border";

export type ExtractParams = {
  sigmaPx: number; // sketch strokes closer than about 2× this merge into one line ("gom nét")
  sensitivity: number; // 0..1 — higher keeps fainter lines
  minLengthPx: number; // strokes shorter than this are dropped
  gapPx: number; // breaks up to this long are closed, line ends snapped
  smoothPx: number; // smoothing along each stroke
};

// x,y pairs in image pixels. `weight`: how heavy the sketch stroke was (its
// half-width in pixels) — lets a heavier sketch line come out a heavier
// clean line, the way a frame is inked bolder than a whisker.
export type Stroke = { pts: Float32Array; closed: boolean; fill?: boolean; weight: number };

export type ExtractResult = { strokes: Stroke[]; sketchWidthPx: number };

// How dark each pixel is, 0 (paper) … 1 (darkest line), with uneven paper
// or scan shading flattened out and the darkest lines scaled to ~1 so the
// sensitivity means the same for a faint and a heavy sketch, whatever the
// colour of the pencil.
export function inkMap(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const l = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
    lum[i] = 1 - a * (1 - l);
  }
  // Paper brightness: the brightest value in each 32px block, spread to the
  // neighbouring blocks.
  const B = 32;
  const bw = Math.ceil(w / B);
  const bh = Math.ceil(h / B);
  let blk = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const by = ((y / B) | 0) * bw;
    for (let x = 0; x < w; x++) {
      const v = lum[y * w + x];
      const j = by + ((x / B) | 0);
      if (v > blk[j]) blk[j] = v;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) m = Math.max(m, blk[yy * bw + xx]);
          }
        }
        next[y * bw + x] = m;
      }
    }
    blk = next;
  }
  const ink = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1.001, Math.max(0, y / B - 0.5));
    const y0 = fy | 0;
    const ty = fy - y0;
    const y1 = Math.min(bh - 1, y0 + 1);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, x / B - 0.5));
      const x0 = fx | 0;
      const tx = fx - x0;
      const x1 = Math.min(bw - 1, x0 + 1);
      const bg =
        (blk[y0 * bw + x0] * (1 - tx) + blk[y0 * bw + x1] * tx) * (1 - ty) + (blk[y1 * bw + x0] * (1 - tx) + blk[y1 * bw + x1] * tx) * ty;
      const v = 1 - lum[y * w + x] / Math.max(bg, 0.05);
      ink[y * w + x] = v > 0 ? v : 0;
    }
  }
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (ink[i] > 0.03) {
      hist[Math.min(255, (ink[i] * 255) | 0)]++;
      total++;
    }
  }
  let acc = 0;
  let p995 = 1;
  for (let b = 255; b >= 0; b--) {
    acc += hist[b];
    if (acc >= total * 0.005) {
      p995 = (b + 1) / 256;
      break;
    }
  }
  const scale = 1 / Math.max(p995, 0.15);
  for (let i = 0; i < n; i++) ink[i] = Math.min(1, ink[i] * scale);
  return ink;
}

export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src.slice();
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += k[i + r];
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      if (x >= r && x < w - r) {
        for (let j = -r; j <= r; j++) a += src[row + x + j] * k[j + r];
      } else {
        for (let j = -r; j <= r; j++) {
          const xx = x + j < 0 ? 0 : x + j >= w ? w - 1 : x + j;
          a += src[row + xx] * k[j + r];
        }
      }
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      if (y >= r && y < h - r) {
        for (let j = -r; j <= r; j++) a += tmp[(y + j) * w + x] * k[j + r];
      } else {
        for (let j = -r; j <= r; j++) {
          const yy = y + j < 0 ? 0 : y + j >= h ? h - 1 : y + j;
          a += tmp[yy * w + x] * k[j + r];
        }
      }
      out[y * w + x] = a;
    }
  }
  return out;
}

// Pixels of the drawing: dark enough, or fainter but joined to something
// dark enough (a light stretch of a pencil line stays part of the line).
function hysteresis(blur: Float32Array, w: number, h: number, hi: number, lo: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (blur[i] >= hi) {
      out[i] = 1;
      stack[sp++] = i;
    }
  }
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        if (!out[j] && blur[j] >= lo) {
          out[j] = 1;
          stack[sp++] = j;
        }
      }
    }
  }
  for (let x = 0; x < w; x++) out[x] = out[(h - 1) * w + x] = 0;
  for (let y = 0; y < h; y++) out[y * w] = out[y * w + w - 1] = 0;
  return out;
}

// Pinholes from the pencil/brush grain, not real gaps in the drawing.
function fillSmallHoles(m: Uint8Array, w: number, h: number, maxArea: number) {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const region: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (m[s] || seen[s]) continue;
    region.length = 0;
    stack.push(s);
    seen[s] = 1;
    let touchesEdge = false;
    let big = false;
    while (stack.length) {
      const i = stack.pop()!;
      if (!big) region.push(i);
      if (region.length > maxArea) big = true;
      const x = i % w;
      const y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !m[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (!touchesEdge && !big) for (const i of region) m[i] = 1;
  }
}

// Zhang–Suen thinning to one-pixel-wide centre lines.
function thin(m: Uint8Array, w: number, h: number) {
  let pts: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i]) pts.push(i);
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del: number[] = [];
      for (const i of pts) {
        if (!m[i]) continue;
        const x = i % w;
        const y = (i / w) | 0;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const p2 = m[i - w];
        const p3 = m[i - w + 1];
        const p4 = m[i + 1];
        const p5 = m[i + w + 1];
        const p6 = m[i + w];
        const p7 = m[i + w - 1];
        const p8 = m[i - 1];
        const p9 = m[i - w - 1];
        const bsum = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (bsum < 2 || bsum > 6) continue;
        let a = 0;
        if (!p2 && p3) a++;
        if (!p3 && p4) a++;
        if (!p4 && p5) a++;
        if (!p5 && p6) a++;
        if (!p6 && p7) a++;
        if (!p7 && p8) a++;
        if (!p8 && p9) a++;
        if (!p9 && p2) a++;
        if (a !== 1) continue;
        if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(i);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
    pts = pts.filter((i) => m[i]);
  }
}

type Chain = { pix: number[]; a: number; b: number; closed: boolean }; // a/b: junction node ids, -1 = free end

// Skeleton → chains between line ends and junctions.
function traceChains(m: Uint8Array, w: number) {
  const N8 = [-w, 1, w, -1, -w + 1, w + 1, w - 1, -w - 1]; // 4-neighbours first
  const RING = [-w - 1, -w, -w + 1, 1, w + 1, w, w - 1, -1];
  const kind = new Uint8Array(m.length); // 1 line, 2 end, 3 junction
  const fg: number[] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    fg.push(i);
    let c = 0;
    let cr = 0;
    for (let k = 0; k < 8; k++) {
      if (m[i + RING[k]]) c++;
      if (!m[i + RING[k]] && m[i + RING[(k + 1) % 8]]) cr++;
    }
    if (c === 0) continue;
    kind[i] = c === 1 || cr === 1 ? 2 : cr >= 3 ? 3 : 1;
  }
  const nodeOf = new Int32Array(m.length).fill(-1);
  let nodes = 0;
  for (const i of fg) {
    if (kind[i] !== 3 || nodeOf[i] >= 0) continue;
    const st = [i];
    nodeOf[i] = nodes;
    while (st.length) {
      const j = st.pop()!;
      for (const o of RING) {
        const q = j + o;
        if (kind[q] === 3 && nodeOf[q] < 0) {
          nodeOf[q] = nodes;
          st.push(q);
        }
      }
    }
    nodes++;
  }
  const used = new Uint8Array(m.length);
  const chains: Chain[] = [];
  const walk = (start: number, first: number) => {
    const pix = [start, first];
    used[first] = 1;
    let prev = start;
    let cur = first;
    for (;;) {
      if (kind[cur] === 3) break;
      let next = -1;
      for (const o of N8) {
        const q = cur + o;
        if (q === prev || !m[q]) continue;
        if (kind[q] === 3 && (nodeOf[q] !== nodeOf[start] || pix.length > 3)) {
          next = q;
          break;
        }
        if (kind[q] !== 3 && !used[q]) {
          next = q;
          break;
        }
      }
      if (next < 0) break;
      pix.push(next);
      if (kind[next] === 3) break;
      used[next] = 1;
      prev = cur;
      cur = next;
    }
    const last = pix[pix.length - 1];
    chains.push({ pix, a: kind[start] === 3 ? nodeOf[start] : -1, b: kind[last] === 3 ? nodeOf[last] : -1, closed: false });
  };
  for (const i of fg) {
    if (kind[i] !== 2 || used[i]) continue;
    used[i] = 1;
    for (const o of N8) {
      const q = i + o;
      if (!m[q]) continue;
      if (kind[q] === 3) {
        chains.push({ pix: [i, q], a: -1, b: nodeOf[q], closed: false });
        break;
      }
      if (!used[q]) {
        walk(i, q);
        break;
      }
    }
  }
  for (const i of fg) {
    if (kind[i] !== 3) continue;
    for (const o of N8) {
      const q = i + o;
      if (m[q] && kind[q] !== 3 && !used[q]) walk(i, q);
    }
  }
  // Whatever is left is closed loops (an eye outline, a ring) with no ends.
  for (const i of fg) {
    if (used[i] || kind[i] === 3) continue;
    used[i] = 1;
    const pix = [i];
    let cur = i;
    for (;;) {
      let next = -1;
      for (const o of N8) {
        const q = cur + o;
        if (m[q] && !used[q] && kind[q] !== 3) {
          next = q;
          break;
        }
      }
      if (next < 0) break;
      used[next] = 1;
      pix.push(next);
      cur = next;
    }
    if (pix.length > 4) chains.push({ pix, a: -1, b: -1, closed: true });
  }
  return { chains, nodes };
}

function polyLength(p: Float32Array): number {
  let l = 0;
  for (let i = 2; i < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function reversed(p: Float32Array): Float32Array {
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    out[p.length - 2 - i] = p[i];
    out[p.length - 1 - i] = p[i + 1];
  }
  return out;
}

// Unit direction pointing OUT of the stroke at its start (end=0) or end (end=1),
// judged over `reach` pixels of the stroke.
function endDir(p: Float32Array, end: 0 | 1, reach: number): [number, number] {
  const n = p.length / 2;
  let i = end === 0 ? 0 : n - 1;
  const step = end === 0 ? 1 : -1;
  const ex = p[i * 2];
  const ey = p[i * 2 + 1];
  let travelled = 0;
  let px = ex;
  let py = ey;
  while (travelled < reach && i + step >= 0 && i + step < n) {
    i += step;
    travelled += Math.hypot(p[i * 2] - px, p[i * 2 + 1] - py);
    px = p[i * 2];
    py = p[i * 2 + 1];
  }
  const len = Math.hypot(ex - px, ey - py) || 1;
  return [(ex - px) / len, (ey - py) / len];
}

// Even spacing (1px) then a Gaussian along the stroke; open ends stay put.
function smoothStroke(p: Float32Array, closed: boolean, sigma: number): Float32Array {
  const n0 = p.length / 2;
  if (n0 < 3) return p;
  const total = polyLength(p) + (closed ? Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) : 0);
  const n = Math.max(3, Math.round(total));
  const step = total / (closed ? n : n - 1);
  const rs = new Float32Array(n * 2);
  const segs = closed ? n0 : n0 - 1;
  let seg = 0;
  let segStart = 0;
  const pt = (k: number) => (k % n0) * 2;
  let segLen = Math.hypot(p[pt(1)] - p[0], p[pt(1) + 1] - p[1]);
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (segStart + segLen < target && seg < segs - 1) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(p[pt(seg + 1)] - p[pt(seg)], p[pt(seg + 1) + 1] - p[pt(seg) + 1]);
    }
    const t = segLen > 0 ? Math.min(1, Math.max(0, (target - segStart) / segLen)) : 0;
    rs[k * 2] = p[pt(seg)] + (p[pt(seg + 1)] - p[pt(seg)]) * t;
    rs[k * 2 + 1] = p[pt(seg) + 1] + (p[pt(seg + 1) + 1] - p[pt(seg) + 1]) * t;
  }
  if (!closed) {
    rs[(n - 1) * 2] = p[p.length - 2];
    rs[(n - 1) * 2 + 1] = p[p.length - 1];
  }
  if (sigma < 0.5) return rs;
  const r = Math.min(Math.ceil(sigma * 2.5), closed ? Math.floor(n / 2) - 1 : n - 1);
  if (r < 1) return rs;
  const k = new Float32Array(r * 2 + 1);
  for (let j = -r; j <= r; j++) k[j + r] = Math.exp(-(j * j) / (2 * sigma * sigma));
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let j = -r; j <= r; j++) {
      let q = i + j;
      let x: number;
      let y: number;
      if (closed) {
        q = ((q % n) + n) % n;
        x = rs[q * 2];
        y = rs[q * 2 + 1];
      } else if (q < 0) {
        // point reflection keeps the end where it is, and its direction
        x = 2 * rs[0] - rs[-q * 2];
        y = 2 * rs[1] - rs[-q * 2 + 1];
      } else if (q >= n) {
        const m = 2 * (n - 1) - q;
        x = 2 * rs[(n - 1) * 2] - rs[m * 2];
        y = 2 * rs[(n - 1) * 2 + 1] - rs[m * 2 + 1];
      } else {
        x = rs[q * 2];
        y = rs[q * 2 + 1];
      }
      sx += x * k[j + r];
      sy += y * k[j + r];
      sw += k[j + r];
    }
    out[i * 2] = sx / sw;
    out[i * 2 + 1] = sy / sw;
  }
  return out;
}

// Fewest points that stay within `tol` of the line (Ramer–Douglas–Peucker).
function simplify(p: Float32Array, tol: number): Float32Array {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const b = stack.pop()!;
    const a = stack.pop()!;
    const ax = p[a * 2];
    const ay = p[a * 2 + 1];
    const bx = p[b * 2];
    const by = p[b * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d =
        len > 1e-6
          ? Math.abs((bx - ax) * (ay - p[i * 2 + 1]) - (ax - p[i * 2]) * (by - ay)) / len
          : Math.hypot(p[i * 2] - ax, p[i * 2 + 1] - ay);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push(a, best, best, b);
    }
  }
  let m = 0;
  for (let i = 0; i < n; i++) if (keep[i]) m++;
  const out = new Float32Array(m * 2);
  let o = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    out[o++] = p[i * 2];
    out[o++] = p[i * 2 + 1];
  }
  return out;
}

// A smooth curve hugging the control points (uniform cubic B-spline; an
// open one is pinned to its two ends). Sampled about every pixel.
function bspline(c: Float32Array, closed: boolean): Float32Array {
  const m = c.length / 2;
  if (m < 3) return c;
  const P = (i: number) => {
    if (closed) i = ((i % m) + m) % m;
    else i = Math.max(0, Math.min(m - 1, i));
    return i * 2;
  };
  const out: number[] = [];
  const first = closed ? 0 : -2;
  const last = closed ? m : m - 1; // segment index range
  for (let i = first; i < last; i++) {
    const a = P(i - 1);
    const b = P(i);
    const d = P(i + 1);
    const e = P(i + 2);
    const segLen = Math.hypot(c[d] - c[b], c[d + 1] - c[b + 1]);
    const steps = Math.max(1, Math.ceil(segLen));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const w0 = (1 - 3 * t + 3 * t2 - t3) / 6;
      const w1 = (4 - 6 * t2 + 3 * t3) / 6;
      const w2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
      const w3 = t3 / 6;
      out.push(w0 * c[a] + w1 * c[b] + w2 * c[d] + w3 * c[e], w0 * c[a + 1] + w1 * c[b + 1] + w2 * c[d + 1] + w3 * c[e + 1]);
    }
  }
  if (!closed) out.push(c[(m - 1) * 2], c[(m - 1) * 2 + 1]);
  return Float32Array.from(out);
}

// Light smoothing, then the wobble a rough stroke leaves is ironed out:
// only the points needed to stay within `tol` are kept and a smooth curve is
// laid through them — what a vector program's "smooth" does.
function fairCurve(p: Float32Array, closed: boolean, sigma: number, tol: number): Float32Array {
  const pre = smoothStroke(p, closed, sigma);
  if (tol < 0.5 || pre.length < 8) return pre;
  if (closed) {
    // Simplify as an open line from the point farthest from the start, so
    // the seam isn't a fixed corner.
    const n = pre.length / 2;
    let far = 0;
    let farD = -1;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(pre[i * 2] - pre[0], pre[i * 2 + 1] - pre[1]);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    const a = simplify(pre.subarray(0, far * 2 + 2), tol);
    const loopBack = new Float32Array((n - far + 1) * 2);
    loopBack.set(pre.subarray(far * 2));
    loopBack[loopBack.length - 2] = pre[0];
    loopBack[loopBack.length - 1] = pre[1];
    const b = simplify(loopBack, tol);
    const ctrl = concat(a.subarray(0, a.length - 2), b.subarray(0, b.length - 2));
    return ctrl.length >= 6 ? bspline(ctrl, true) : pre;
  }
  return bspline(simplify(pre, tol), false);
}

// Sharp turns (a box corner, the point of a leaf) stay sharp: the stroke is
// smoothed piece by piece between them.
function cornersOf(p: Float32Array, closed: boolean, k: number): number[] {
  const n = p.length / 2;
  if (n < k * 2 + 3) return [];
  // Turning angle at i, judged over `r` points either side.
  const turnAt = (i: number, r: number) => {
    const a = closed ? (i - r + n * 4) % n : i - r;
    const b = closed ? (i + r) % n : i + r;
    if (a < 0 || b >= n) return 0;
    const ux = p[i * 2] - p[a * 2];
    const uy = p[i * 2 + 1] - p[a * 2 + 1];
    const vx = p[b * 2] - p[i * 2];
    const vy = p[b * 2 + 1] - p[i * 2 + 1];
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < r * 0.5 || lv < r * 0.5) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
  };
  const turn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // A real corner (a box, a leaf tip) still turns sharply when looked at
    // from further back; a hand wobble or a little bump doesn't.
    const near = turnAt(i, k);
    turn[i] = near >= 1.0 && turnAt(i, k * 2) >= 0.85 ? near : 0;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!turn[i]) continue;
    let peak = true;
    for (let j = -k; j <= k && peak; j++) {
      const q = closed ? (i + j + n) % n : i + j;
      if (q < 0 || q >= n || q === i) continue;
      if (turn[q] > turn[i] || (turn[q] === turn[i] && q < i)) peak = false;
    }
    if (peak) out.push(i);
  }
  return out;
}


// ---- Inking: deciding what each stretch of a sketch line was meant to be.
// A hand-drawn straight edge wobbles; an inker rules it straight (dead level
// or plumb when it was meant to be). A curve wobbles; the inker draws one
// clean sweep. Where two straight edges meet they meet in a crisp corner.
// Each stroke is cut into runs that are straight within a tolerance that
// grows a little with length (a long ruled line is allowed a little more
// hand wobble) and curved runs in between; straight runs are refitted as
// exact lines, curved runs as smooth curves that flow into the lines.

type Run = { line: boolean; pts: Float32Array; a: [number, number]; b: [number, number]; dir: [number, number] };

// Control points spaced evenly along a curve — a few per bend, so the
// spline through them is one clean sweep without the hand's small wobble.
function evenPoints(p: Float32Array, curveTol: number): Float32Array {
  const n = p.length / 2;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
  const spacing = Math.min(Math.max(6, curveTol * 3), Math.max(3, total / 4));
  const out: number[] = [p[0], p[1]];
  let acc = 0;
  let next = spacing;
  for (let i = 1; i < n; i++) {
    const seg = Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    while (acc + seg >= next && next < total - spacing * 0.5) {
      const t = seg > 0 ? (next - acc) / seg : 0;
      out.push(p[i * 2 - 2] + (p[i * 2] - p[i * 2 - 2]) * t, p[i * 2 - 1] + (p[i * 2 + 1] - p[i * 2 - 1]) * t);
      next += spacing;
    }
    acc += seg;
  }
  out.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
  return Float32Array.from(out);
}

function sliceRun(p: Float32Array, i: number, j: number): Float32Array {
  return p.slice(i * 2, j * 2 + 2);
}

// How far the points between i and j stray from the straight chord: the
// worst point, and the average bow to one side. A wobbly straight line
// strays both ways (bow ≈ 0); a gentle curve bows consistently to one side.
function chordDeviation(p: Float32Array, i: number, j: number): { worst: number; bow: number; len: number } {
  const ax = p[i * 2];
  const ay = p[i * 2 + 1];
  const bx = p[j * 2];
  const by = p[j * 2 + 1];
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1e-6) return { worst: 0, bow: 0, len };
  let worst = 0;
  let sum = 0;
  let count = 0;
  const step = j - i > 40 ? 2 : 1;
  for (let k = i + 1; k < j; k += step) {
    const d = ((bx - ax) * (ay - p[k * 2 + 1]) - (ax - p[k * 2]) * (by - ay)) / len;
    if (Math.abs(d) > worst) worst = Math.abs(d);
    sum += d;
    count++;
  }
  return { worst, bow: count ? Math.abs(sum / count) : 0, len };
}

// Best straight line through a run (principal axis), snapped dead level or
// plumb when it's within 3° of it.
function fitLine(p: Float32Array): { cx: number; cy: number; dx: number; dy: number } {
  const n = p.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += p[i * 2];
    cy += p[i * 2 + 1];
  }
  cx /= n;
  cy /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = p[i * 2] - cx;
    const y = p[i * 2 + 1] - cy;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const snap = (3 * Math.PI) / 180;
  for (const axis of [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI]) {
    if (Math.abs(ang - axis) < snap) ang = axis;
  }
  let dx = Math.cos(ang);
  let dy = Math.sin(ang);
  // point the same way as the drawing
  if ((p[(n - 1) * 2] - p[0]) * dx + (p[(n - 1) * 2 + 1] - p[1]) * dy < 0) {
    dx = -dx;
    dy = -dy;
  }
  return { cx, cy, dx, dy };
}

function project(l: { cx: number; cy: number; dx: number; dy: number }, x: number, y: number): [number, number] {
  const t = (x - l.cx) * l.dx + (y - l.cy) * l.dy;
  return [l.cx + t * l.dx, l.cy + t * l.dy];
}

function splitRuns(p: Float32Array, maxTol: number, minLen: number): Run[] {
  const n = p.length / 2;
  const tol = (len: number) => Math.min(maxTol, 0.8 + len * 0.012);
  const runs: Run[] = [];
  let curveStart = 0;
  let i = 0;
  const pushCurve = (from: number, to: number) => {
    if (to <= from) return;
    const pts = sliceRun(p, from, to);
    runs.push({ line: false, pts, a: [pts[0], pts[1]], b: [pts[pts.length - 2], pts[pts.length - 1]], dir: [0, 0] });
  };
  while (i < n - 1) {
    let best = -1;
    let misses = 0;
    for (let j = i + 2; j < n; j++) {
      const dev = chordDeviation(p, i, j);
      if (dev.worst <= tol(dev.len) && dev.bow <= 0.15 + dev.len * 0.004) {
        best = j;
        misses = 0;
      } else if (++misses > 4) break;
    }
    if (best > 0 && Math.hypot(p[best * 2] - p[i * 2], p[best * 2 + 1] - p[i * 2 + 1]) >= minLen) {
      pushCurve(curveStart, i);
      const pts = sliceRun(p, i, best);
      const l = fitLine(pts);
      runs.push({ line: true, pts, a: project(l, pts[0], pts[1]), b: project(l, pts[pts.length - 2], pts[pts.length - 1]), dir: [l.dx, l.dy] });
      i = best;
      curveStart = best;
    } else {
      i++;
    }
  }
  pushCurve(curveStart, n - 1);
  return mergeCollinear(runs, maxTol, minLen);
}

// A long ruled line drawn as a few overlapping strokes comes out as straight
// runs a few pixels apart with a little jog between them: put them back
// into one line.
function mergeCollinear(runs: Run[], maxTol: number, minLen: number): Run[] {
  const out: Run[] = [];
  for (const r of runs) out.push(r);
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < out.length && !changed; k++) {
      const a = out[k];
      if (!a.line) continue;
      // the next line, possibly after one short jog
      let m = k + 1;
      if (m < out.length && !out[m].line && polyLen(out[m].pts) < minLen * 0.6) m++;
      const b = out[m];
      if (!b || !b.line) continue;
      const cos = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1];
      if (cos < Math.cos((5 * Math.PI) / 180)) continue;
      const all = concat(a.pts, b.pts);
      const l = fitLine(all);
      let worst = 0;
      for (let q = 0; q < all.length; q += 2) {
        const d = Math.abs((all[q] - l.cx) * l.dy - (all[q + 1] - l.cy) * l.dx);
        if (d > worst) worst = d;
      }
      if (worst > maxTol * 1.6) continue;
      const pts = concat(a.pts, b.pts);
      out.splice(k, m - k + 1, {
        line: true,
        pts,
        a: project(l, pts[0], pts[1]),
        b: project(l, pts[pts.length - 2], pts[pts.length - 1]),
        dir: [l.dx, l.dy],
      });
      changed = true;
    }
  }
  return out;
}

function polyLen(p: Float32Array): number {
  let l = 0;
  for (let i = 2; i < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
}

function intersect(a: Run, b: Run): [number, number] | null {
  const [ax, ay] = a.b;
  const [bx, by] = b.a;
  const [d1x, d1y] = a.dir;
  const [d2x, d2y] = b.dir;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < Math.sin((12 * Math.PI) / 180)) return null;
  const t = ((bx - ax) * d2y - (by - ay) * d2x) / den;
  return [ax + t * d1x, ay + t * d1y];
}

function curveDir(pts: Float32Array, fromStart: boolean, reach: number): [number, number] {
  const n = pts.length / 2;
  const k = Math.min(n - 1, reach);
  const [x0, y0, x1, y1] = fromStart
    ? [pts[0], pts[1], pts[k * 2], pts[k * 2 + 1]]
    : [pts[(n - 1 - k) * 2], pts[(n - 1 - k) * 2 + 1], pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  return [(x1 - x0) / len, (y1 - y0) / len];
}

// One open stretch (between corners, or a whole stroke) inked.
function inkOpen(p: Float32Array, maxTol: number, minLen: number, curveTol: number, startCorner: [number, number] | null, endCorner: [number, number] | null): Float32Array {
  const runs = splitRuns(p, maxTol, minLen);
  // Joints between neighbouring runs.
  for (let k = 0; k + 1 < runs.length; k++) {
    const a = runs[k];
    const b = runs[k + 1];
    if (a.line && b.line) {
      const x = intersect(a, b);
      const mid: [number, number] = [(a.b[0] + b.a[0]) / 2, (a.b[1] + b.a[1]) / 2];
      const pt = x && Math.hypot(x[0] - mid[0], x[1] - mid[1]) < maxTol * 4 ? x : mid;
      a.b = pt;
      b.a = pt;
    } else if (a.line) {
      b.a = a.b;
    } else if (b.line) {
      a.b = b.a;
    }
  }
  if (startCorner) runs[0].a = startCorner;
  if (endCorner) runs[runs.length - 1].b = endCorner;
  const out: number[] = [];
  runs.forEach((r, k) => {
    if (r.line) {
      if (!out.length) out.push(r.a[0], r.a[1]);
      out.push(r.b[0], r.b[1]);
      return;
    }
    // Curve: smooth, starting along the line before it and leaving along
    // the line after it when they flow into each other.
    const prev = runs[k - 1];
    const next = runs[k + 1];
    const reach = 6;
    const ctrl: number[] = [r.a[0], r.a[1]];
    const inner = evenPoints(r.pts, curveTol);
    const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) + 1;
    const hand = Math.min(len / 3, 12);
    if (prev?.line) {
      const cd = curveDir(r.pts, true, reach);
      if (cd[0] * prev.dir[0] + cd[1] * prev.dir[1] > 0.7) ctrl.push(r.a[0] + prev.dir[0] * hand, r.a[1] + prev.dir[1] * hand);
    }
    for (let q = 2; q < inner.length - 2; q += 2) ctrl.push(inner[q], inner[q + 1]);
    if (next?.line) {
      const cd = curveDir(r.pts, false, reach);
      if (cd[0] * next.dir[0] + cd[1] * next.dir[1] > 0.7) ctrl.push(r.b[0] - next.dir[0] * hand, r.b[1] - next.dir[1] * hand);
    }
    ctrl.push(r.b[0], r.b[1]);
    const curve = ctrl.length >= 6 ? bspline(Float32Array.from(ctrl), false) : Float32Array.from(ctrl);
    const startAt = out.length ? 2 : 0;
    for (let q = startAt; q < curve.length; q++) out.push(curve[q]);
  });
  return Float32Array.from(out);
}

function inkStroke(raw: Float32Array, closed: boolean, opt: { sigma: number; k: number; maxTol: number; minLen: number; curveTol: number }): Float32Array {
  // Even 2px spacing after a light smoothing.
  const sm = smoothStroke(raw, closed, opt.sigma);
  const n1 = sm.length / 2;
  const m = Math.max(2, Math.ceil(n1 / 2));
  const p = new Float32Array(m * 2);
  for (let i = 0; i < m; i++) {
    const q = Math.min(n1 - 1, i * 2);
    p[i * 2] = sm[q * 2];
    p[i * 2 + 1] = sm[q * 2 + 1];
  }
  if (!closed) {
    p[(m - 1) * 2] = sm[(n1 - 1) * 2];
    p[(m - 1) * 2 + 1] = sm[(n1 - 1) * 2 + 1];
  }
  if (m < 4) return sm;
  const corners = cornersOf(p, closed, opt.k);
  if (closed) {
    if (!corners.length) {
      // Start the loop at its sharpest bend so a straight side isn't cut in two.
      const fair = fairCurve(raw, true, opt.sigma, opt.curveTol);
      const runs = splitRuns(p, opt.maxTol, opt.minLen);
      if (!runs.some((r) => r.line)) return fair;
      corners.push(0);
    }
    const pieces: Float32Array[] = [];
    for (let c = 0; c < corners.length; c++) {
      const from = corners[c];
      const to = corners[(c + 1) % corners.length];
      const len = ((to - from + m) % m || m) + 1;
      const seg = new Float32Array(len * 2);
      for (let j = 0; j < len; j++) {
        const q = (from + j) % m;
        seg[j * 2] = p[q * 2];
        seg[j * 2 + 1] = p[q * 2 + 1];
      }
      pieces.push(seg);
    }
    return joinPieces(pieces, opt, true);
  }
  const cuts = [0, ...corners, m - 1];
  const pieces: Float32Array[] = [];
  for (let c = 0; c + 1 < cuts.length; c++) pieces.push(sliceRun(p, cuts[c], cuts[c + 1]));
  return joinPieces(pieces, opt, false);
}

// Pieces meet at corners: two straight pieces meet where their lines cross.
function joinPieces(pieces: Float32Array[], opt: { maxTol: number; minLen: number; curveTol: number }, closed: boolean): Float32Array {
  const runsOf = pieces.map((pc) => splitRuns(pc, opt.maxTol, opt.minLen));
  const cornerAt: ([number, number] | null)[] = pieces.map(() => null);
  for (let c = 0; c < pieces.length; c++) {
    const nextIdx = c + 1 < pieces.length ? c + 1 : closed ? 0 : -1;
    if (nextIdx < 0) continue;
    const a = runsOf[c][runsOf[c].length - 1];
    const b = runsOf[nextIdx][0];
    const shared: [number, number] = [pieces[c][pieces[c].length - 2], pieces[c][pieces[c].length - 1]];
    let pt = shared;
    if (a?.line && b?.line) {
      const x = intersect(a, b);
      if (x && Math.hypot(x[0] - shared[0], x[1] - shared[1]) < opt.maxTol * 4) pt = x;
    }
    cornerAt[c] = pt;
  }
  const out: number[] = [];
  for (let c = 0; c < pieces.length; c++) {
    const prevCorner = c > 0 ? cornerAt[c - 1] : closed ? cornerAt[pieces.length - 1] : null;
    const inked = inkOpen(pieces[c], opt.maxTol, opt.minLen, opt.curveTol, prevCorner, cornerAt[c]);
    for (let q = out.length ? 2 : 0; q < inked.length; q++) out.push(inked[q]);
  }
  if (closed && out.length > 4) {
    out.pop();
    out.pop();
  }
  return Float32Array.from(out);
}

// Small solid marks (eyes, a dot on an "i") are kept as filled shapes —
// thinning would shrink them to a tick. Their pixels are taken out of the
// line mask.
function takeDots(mask: Uint8Array, dist: Float32Array, w: number, h: number, halfW: number, sigma: number): Stroke[] {
  const label = new Int32Array(w * h);
  const out: Stroke[] = [];
  const maxSide = Math.max(8, halfW * 4.5);
  let next = 1;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    const id = next++;
    label[s] = id;
    stack.push(s);
    const pix: number[] = [];
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    let maxD = 0;
    while (stack.length) {
      const i = stack.pop()!;
      pix.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (dist[i] > maxD) maxD = dist[i];
      if (pix.length > maxSide * maxSide) continue; // too big to be a dot; keep labelling only
      for (const o of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
        const j = i + o;
        if (mask[j] && !label[j]) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const long = Math.max(bw, bh);
    const short = Math.min(bw, bh);
    if (long > maxSide) continue;
    const solid = pix.length / (bw * bh);
    // Tiny specks of grain: not part of the drawing.
    if (pix.length < Math.max(6, (sigma + 1) * (sigma + 1))) {
      for (const i of pix) mask[i] = 0;
      continue;
    }
    // Round and solid (an eye), not a wedge where two strokes overlap.
    if (long / short > 1.8 || solid < 0.66 || maxD < short * 0.42) continue;
    const cw = bw + 4;
    const ch = bh + 4;
    const crop = new Uint8Array(cw * ch);
    for (const i of pix) crop[((i / w | 0) - y0 + 2) * cw + (i % w) - x0 + 2] = 1;
    for (const loop of traceOutlines(crop, cw, ch, x0 - 2 + 0.5, y0 - 2 + 0.5)) {
      out.push({ pts: smoothStroke(Float32Array.from(loop), true, 1.2), closed: true, fill: true, weight: maxD });
    }
    for (const i of pix) mask[i] = 0;
  }
  return out;
}

export function extractStrokes(ink: Float32Array, w: number, h: number, p: ExtractParams, onStep?: (label: string) => void): ExtractResult {
  const n = w * h;
  const sigma = Math.max(0.8, p.sigmaPx);
  onStep?.("blur");
  const blur = gaussianBlur(ink, w, h, sigma);
  const sens = Math.min(1, Math.max(0, p.sensitivity));
  const hi = 0.55 - 0.4 * sens;
  onStep?.("mask");
  const mask = hysteresis(blur, w, h, hi, hi * 0.5);
  fillSmallHoles(mask, w, h, Math.max(10, Math.round(sigma * sigma * 2)));
  const region = mask.slice();
  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) bg[i] = mask[i] ? 0 : 1;
  const { dist } = distanceTransform(bg, w, h);

  // Typical half-width of a sketch line: the median distance-to-paper on
  // the crest of the stroke shapes.
  const crestHist = new Uint32Array(64);
  let crestCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const d = dist[i];
      if (!mask[i] || d < 1) continue;
      if (d >= dist[i - 1] && d >= dist[i + 1] && d >= dist[i - w] && d >= dist[i + w]) {
        crestHist[Math.min(63, Math.round(d * 2))]++;
        crestCount++;
      }
    }
  }
  let halfW = 2;
  for (let b = 0, a = 0; b < 64; b++) {
    a += crestHist[b];
    if (a >= crestCount / 2) {
      halfW = Math.max(1, b / 2);
      break;
    }
  }

  onStep?.("dots");
  const dots = takeDots(mask, dist, w, h, halfW, sigma);
  onStep?.("thin");
  thin(mask, w, h);
  onStep?.("trace");
  const { chains, nodes } = traceChains(mask, w);
  const nodeHalf = new Float32Array(nodes);
  for (const c of chains) {
    for (const [nd, pix] of [
      [c.a, c.pix[0]],
      [c.b, c.pix[c.pix.length - 1]],
    ] as const) {
      if (nd >= 0) nodeHalf[nd] = Math.max(nodeHalf[nd], dist[pix]);
    }
  }
  const toPts = (pix: number[]) => {
    const out = new Float32Array(pix.length * 2);
    pix.forEach((i, k) => {
      out[k * 2] = (i % w) + 0.5;
      out[k * 2 + 1] = ((i / w) | 0) + 0.5;
    });
    return out;
  };

  type S = { pts: Float32Array; a: number; b: number; closed: boolean; dead: boolean; wsum: number; wn: number };
  let list: S[] = chains
    .filter((c) => c.pix.length >= 2)
    .map((c) => {
      let wsum = 0;
      for (const i of c.pix) wsum += dist[i];
      return { pts: toPts(c.pix), a: c.a, b: c.b, closed: c.closed, dead: false, wsum, wn: c.pix.length };
    });
  const degreeOf = () => {
    const deg = new Map<number, number>();
    for (const s of list) {
      if (s.a >= 0) deg.set(s.a, (deg.get(s.a) ?? 0) + 1);
      if (s.b >= 0) deg.set(s.b, (deg.get(s.b) ?? 0) + 1);
    }
    return deg;
  };

  // 1. Trim whiskers: the forks a thick or bumpy stroke leaves on its centre
  // line, and short overshoots where two lines cross at a corner.
  for (let round = 0; round < 4; round++) {
    const deg = degreeOf();
    let removed = false;
    for (const s of list) {
      if (s.closed || (s.a >= 0) === (s.b >= 0)) continue;
      const node = s.a >= 0 ? s.a : s.b;
      if ((deg.get(node) ?? 0) < 3) continue;
      if (polyLength(s.pts) < Math.max(4, nodeHalf[node] * 2.2 + 2, sigma * 2)) {
        s.dead = true;
        removed = true;
        deg.set(node, deg.get(node)! - 1);
      }
    }
    list = list.filter((s) => !s.dead);
    if (!removed) break;
  }

  // 2. Two junctions a stroke-width apart are one crossing.
  const parent = Array.from({ length: nodes }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const s of list) {
    if (s.a < 0 || s.b < 0) continue;
    const ra = find(s.a);
    const rb = find(s.b);
    const len = polyLength(s.pts);
    if (ra === rb) {
      if (len < Math.max(nodeHalf[s.a], nodeHalf[s.b]) * 6 + 4) s.dead = true; // a tiny loop inside a blob
    } else if (len < Math.max(nodeHalf[s.a], nodeHalf[s.b]) * 2 + 3) {
      s.dead = true;
      parent[ra] = rb;
    }
  }
  list = list.filter((s) => !s.dead);
  for (const s of list) {
    if (s.a >= 0) s.a = find(s.a);
    if (s.b >= 0) s.b = find(s.b);
  }

  // 3. Through every junction carry the straightest pair of strokes on as
  // one stroke; the rest end there.
  const reach = Math.max(6, halfW * 4);
  for (let guard = 0; guard < 8; guard++) {
    const at = new Map<number, { s: S; end: 0 | 1 }[]>();
    for (const s of list) {
      if (s.closed) continue;
      if (s.a >= 0) at.set(s.a, [...(at.get(s.a) ?? []), { s, end: 0 }]);
      if (s.b >= 0) at.set(s.b, [...(at.get(s.b) ?? []), { s, end: 1 }]);
    }
    let any = false;
    for (const [, ends] of at) {
      const live = ends.filter((e) => !e.s.dead);
      if (live.length < 2) continue;
      let best: [number, number] | null = null;
      let bestCos = live.length === 2 ? -2 : -0.35;
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const di = endDir(live[i].s.pts, live[i].end, reach);
          const dj = endDir(live[j].s.pts, live[j].end, reach);
          const c = -(di[0] * dj[0] + di[1] * dj[1]); // 1 = straight through
          if (c > bestCos) {
            bestCos = c;
            best = [i, j];
          }
        }
      }
      if (!best) continue;
      const x = live[best[0]];
      const y = live[best[1]];
      if (x.s === y.s) {
        // Both ends of one stroke meet here: it's a closed loop.
        x.s.closed = true;
        x.s.a = x.s.b = -1;
        any = true;
        continue;
      }
      const first = x.end === 1 ? x.s.pts : reversed(x.s.pts);
      const second = y.end === 0 ? y.s.pts : reversed(y.s.pts);
      const merged: S = {
        pts: concat(first, second.subarray(2)),
        a: x.end === 1 ? x.s.a : x.s.b,
        b: y.end === 0 ? y.s.b : y.s.a,
        closed: false,
        dead: false,
        wsum: x.s.wsum + y.s.wsum,
        wn: x.s.wn + y.s.wn,
      };
      x.s.dead = true;
      y.s.dead = true;
      list.push(merged);
      any = true;
    }
    list = list.filter((s) => !s.dead);
    if (!any) break;
  }

  // 4a. A blunt or flicked brush end leaves a little hook on the centre
  // line: cut it off when the last bit turns away from the line before it.
  const hook = Math.max(3, halfW * 1.6);
  const pointAlong = (pts: Float32Array, fromEnd: 0 | 1, dist: number) => {
    const n = pts.length / 2;
    let travelled = 0;
    for (let k = 1; k < n; k++) {
      const a = fromEnd === 0 ? k - 1 : n - k;
      const b = fromEnd === 0 ? k : n - 1 - k;
      travelled += Math.hypot(pts[b * 2] - pts[a * 2], pts[b * 2 + 1] - pts[a * 2 + 1]);
      if (travelled >= dist) return b;
    }
    return -1;
  };
  for (const s of list) {
    if (s.closed) continue;
    for (const end of [0, 1] as const) {
      if ((end === 0 ? s.a : s.b) >= 0) continue;
      const n = s.pts.length / 2;
      const i1 = pointAlong(s.pts, end, hook);
      const i2 = pointAlong(s.pts, end, hook * 3);
      if (i1 < 0 || i2 < 0) continue;
      const e = end === 0 ? 0 : n - 1;
      const ux = s.pts[e * 2] - s.pts[i1 * 2];
      const uy = s.pts[e * 2 + 1] - s.pts[i1 * 2 + 1];
      const vx = s.pts[i1 * 2] - s.pts[i2 * 2];
      const vy = s.pts[i1 * 2 + 1] - s.pts[i2 * 2 + 1];
      const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) || 1) * (Math.hypot(vx, vy) || 1));
      if (c < Math.cos((35 * Math.PI) / 180)) s.pts = end === 0 ? s.pts.slice(i1 * 2) : s.pts.slice(0, i1 * 2 + 2);
    }
  }

  // 4b. Line ends reach out to where the sketch stroke actually ended (the
  // centre line stops half a stroke-width short).
  for (const s of list) {
    if (s.closed) continue;
    for (const end of [0, 1] as const) {
      if ((end === 0 ? s.a : s.b) >= 0) continue;
      const k = end === 0 ? 0 : s.pts.length - 2;
      const [dx, dy] = endDir(s.pts, end, reach);
      let x = s.pts[k];
      let y = s.pts[k + 1];
      let grown = 0;
      const limit = halfW * 1.5 + 2;
      while (grown < limit) {
        const nx = x + dx;
        const ny = y + dy;
        const ix = nx | 0;
        const iy = ny | 0;
        if (ix < 0 || iy < 0 || ix >= w || iy >= h || !region[iy * w + ix]) break;
        x = nx;
        y = ny;
        grown++;
      }
      if (grown >= 1) {
        const tip = Float32Array.of(x, y);
        s.pts = end === 0 ? concat(tip, s.pts) : concat(s.pts, tip);
      }
    }
  }

  // 5. Close small breaks between ends that point at each other, and snap
  // an end that stops just short of another line onto it — shapes come out
  // closed, ready to colour.
  type End = { s: S; end: 0 | 1; x: number; y: number; dx: number; dy: number };
  const freeEnds = () => {
    const ends: End[] = [];
    for (const s of list) {
      if (s.closed || s.dead) continue;
      for (const end of [0, 1] as const) {
        if ((end === 0 ? s.a : s.b) >= 0) continue;
        const k = end === 0 ? 0 : s.pts.length - 2;
        const [dx, dy] = endDir(s.pts, end, reach);
        ends.push({ s, end, x: s.pts[k], y: s.pts[k + 1], dx, dy });
      }
    }
    return ends;
  };
  {
    const ends = freeEnds();
    const pairs: { i: number; j: number; score: number }[] = [];
    const sideSlack = Math.max(3, halfW * 2.5);
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i];
      for (let j = i + 1; j < ends.length; j++) {
        const f = ends[j];
        const vx = f.x - e.x;
        const vy = f.y - e.y;
        if (Math.abs(vx) > p.gapPx || Math.abs(vy) > p.gapPx) continue;
        const d = Math.hypot(vx, vy);
        if (d > p.gapPx) continue;
        if (d < 0.5) {
          pairs.push({ i, j, score: 0 });
          continue;
        }
        const ce = (e.dx * vx + e.dy * vy) / d;
        const cf = -(f.dx * vx + f.dy * vy) / d;
        // A long line laid down as several brush strokes: the pieces run the
        // same way, a little to the side of each other, often overlapping.
        const sameWay = e.dx * f.dx + e.dy * f.dy < -0.92;
        const side = Math.abs(e.dx * vy - e.dy * vx);
        if (sameWay && side <= sideSlack && f.s !== e.s) {
          pairs.push({ i, j, score: d * 0.5 });
          continue;
        }
        if (ce < 0.55 || cf < 0.55) continue;
        if (f.s === e.s && polyLength(e.s.pts) < p.gapPx * 3) continue;
        pairs.push({ i, j, score: d * (3 - ce - cf) });
      }
    }
    pairs.sort((a, b) => a.score - b.score);
    const taken = new Set<number>();
    for (const pr of pairs) {
      if (taken.has(pr.i) || taken.has(pr.j)) continue;
      const e = ends[pr.i];
      const f = ends[pr.j];
      if (e.s.dead || f.s.dead) continue;
      taken.add(pr.i);
      taken.add(pr.j);
      if (e.s === f.s) {
        e.s.closed = true;
        continue;
      }
      const first = e.end === 1 ? e.s.pts : reversed(e.s.pts);
      let second = f.end === 0 ? f.s.pts : reversed(f.s.pts);
      // Where the pieces overlap, the second picks up past the end of the first.
      let skip = 0;
      while (skip < second.length - 4 && (second[skip] - e.x) * e.dx + (second[skip + 1] - e.y) * e.dy < 0) skip += 2;
      if (skip) second = second.subarray(skip);
      const merged: S = {
        pts: concat(first, second),
        a: e.end === 1 ? e.s.a : e.s.b,
        b: f.end === 0 ? f.s.b : f.s.a,
        closed: false,
        dead: false,
        wsum: e.s.wsum + f.s.wsum,
        wn: e.s.wn + f.s.wn,
      };
      e.s.dead = true;
      f.s.dead = true;
      list.push(merged);
      for (const q of ends) {
        if (q.s === e.s) {
          q.s = merged;
          q.end = 0;
        } else if (q.s === f.s) {
          q.s = merged;
          q.end = 1;
        }
      }
    }
    list = list.filter((s) => !s.dead);
  }
  {
    // Every other stroke point, bucketed for a quick nearby search.
    const cell = Math.max(8, p.gapPx);
    const gw = Math.ceil(w / cell) + 1;
    const grid = new Map<number, number[]>();
    list.forEach((s, si) => {
      for (let k = 0; k < s.pts.length; k += 4) {
        const key = Math.floor(s.pts[k + 1] / cell) * gw + Math.floor(s.pts[k] / cell);
        const b = grid.get(key);
        if (b) b.push(si, k);
        else grid.set(key, [si, k]);
      }
    });
    for (const e of freeEnds()) {
      const si = list.indexOf(e.s);
      const endK = e.end === 0 ? 0 : e.s.pts.length - 2;
      const cx = Math.floor(e.x / cell);
      const cy = Math.floor(e.y / cell);
      let best: [number, number] | null = null;
      let bestScore = Infinity;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          const b = grid.get(gy * gw + gx);
          if (!b) continue;
          for (let q = 0; q < b.length; q += 2) {
            const oi = b[q];
            const ok = b[q + 1];
            const o = list[oi];
            // Not the stretch of its own stroke it's just come from.
            if (oi === si && Math.abs(ok - endK) / 2 < p.gapPx * 2.5) continue;
            const vx = o.pts[ok] - e.x;
            const vy = o.pts[ok + 1] - e.y;
            const d = Math.hypot(vx, vy);
            if (d > p.gapPx || d < 0.5) continue;
            const c = (e.dx * vx + e.dy * vy) / d;
            if (c < 0.6) continue;
            const score = d / c;
            if (score < bestScore) {
              bestScore = score;
              best = [o.pts[ok], o.pts[ok + 1]];
            }
          }
        }
      }
      if (best) {
        const tip = Float32Array.of(best[0], best[1]);
        e.s.pts = e.end === 0 ? concat(tip, e.s.pts) : concat(e.s.pts, tip);
      }
    }
  }

  // 6. Drop crumbs, smooth what's left.
  onStep?.("smooth");
  const out: Stroke[] = [];
  for (const s of list) {
    const len = polyLength(s.pts);
    if (len < p.minLengthPx && !(s.a >= 0 || s.b >= 0)) continue;
    if (len < 3) continue;
    out.push({
      pts: inkStroke(s.pts, s.closed, {
        sigma: Math.min(p.smoothPx, halfW) * 0.5,
        k: Math.max(3, Math.round(halfW * 0.7)),
        maxTol: Math.max(1.5, p.smoothPx * 0.6),
        minLen: Math.max(40, p.smoothPx * 7),
        curveTol: Math.max(1, p.smoothPx * 0.5),
      }),
      closed: s.closed,
      weight: s.wsum / Math.max(1, s.wn),
    });
  }
  return { strokes: [...out, ...dots], sketchWidthPx: halfW * 2 };
}
