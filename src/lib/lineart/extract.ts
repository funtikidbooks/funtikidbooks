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
// `role: "frame"` marks the outer frame of the page, inked a little bolder.
export type Stroke = { pts: Float32Array; closed: boolean; fill?: boolean; weight: number; role?: "frame" };

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

// How big the drawn thing each stroke belongs to is: strokes meeting at a
// junction belong together; the size is the diagonal of their bounding box.
// A small one is a mark (an eye, a nose, a whisker) rather than an outline.
function markSize(items: { pts: ArrayLike<number>; a: number; b: number }[], touch = 0): Float32Array {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  if (touch > 0) {
    // An end at a junction belongs with whatever stroke runs through that
    // junction (it may have been carried on through it as one stroke).
    const cell = 16;
    const grid = new Map<string, number[]>();
    items.forEach((it, i) => {
      for (let k = 0; k < it.pts.length; k += 2) {
        const key = Math.floor(it.pts[k] / cell) + "," + Math.floor(it.pts[k + 1] / cell);
        const g = grid.get(key);
        if (!g) grid.set(key, [i]);
        else if (g[g.length - 1] !== i) g.push(i);
      }
    });
    items.forEach((it, i) => {
      const m = it.pts.length;
      for (const [nd, k] of [[it.a, 0], [it.b, m - 2]]) {
        if (nd < 0 || m < 2) continue;
        const x = it.pts[k];
        const y = it.pts[k + 1];
        const g: number[] = [];
        for (let gy = Math.floor(y / cell) - 1; gy <= Math.floor(y / cell) + 1; gy++) {
          for (let gx = Math.floor(x / cell) - 1; gx <= Math.floor(x / cell) + 1; gx++) g.push(...(grid.get(gx + "," + gy) ?? []));
        }
        for (const j of g) {
          if (j === i || find(j) === find(i)) continue;
          const q = items[j].pts;
          for (let t = 0; t < q.length; t += 2) {
            if (Math.abs(q[t] - x) <= touch && Math.abs(q[t + 1] - y) <= touch) {
              parent[find(i)] = find(j);
              break;
            }
          }
        }
      }
    });
  }
  const byNode = new Map<number, number>();
  items.forEach((it, i) => {
    for (const nd of [it.a, it.b]) {
      if (nd < 0) continue;
      const o = byNode.get(nd);
      if (o === undefined) byNode.set(nd, i);
      else parent[find(i)] = find(o);
    }
  });
  const box = new Map<number, [number, number, number, number]>();
  items.forEach((it, i) => {
    const r = find(i);
    let b = box.get(r);
    if (!b) box.set(r, (b = [Infinity, Infinity, -Infinity, -Infinity]));
    const p = it.pts;
    for (let k = 0; k < p.length; k += 2) {
      if (p[k] < b[0]) b[0] = p[k];
      if (p[k] > b[2]) b[2] = p[k];
      if (p[k + 1] < b[1]) b[1] = p[k + 1];
      if (p[k + 1] > b[3]) b[3] = p[k + 1];
    }
  });
  return Float32Array.from(items.map((_, i) => {
    const b = box.get(find(i))!;
    return Math.hypot(b[2] - b[0], b[3] - b[1]);
  }));
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
  // ...but only when that doesn't tilt it visibly off the drawn line (a long
  // gently sloping line stays sloping, or it would step where it meets the
  // next piece).
  const half = Math.hypot(p[(n - 1) * 2] - p[0], p[(n - 1) * 2 + 1] - p[1]) / 2;
  const snap = Math.min((3 * Math.PI) / 180, 4.5 / Math.max(1, half));
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

function splitRuns(p: Float32Array, maxTol: number, minLen: number, jog = 0): Run[] {
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
  return mergeCollinear(runs, maxTol, minLen, jog);
}

// A long ruled line drawn as a few overlapping strokes comes out as straight
// runs a few pixels apart with a little jog between them: put them back
// into one line.
// `jog`: how far apart (side to side) two such runs may be — a step smaller
// than a line's width is a slip of the hand.
function mergeCollinear(runs: Run[], maxTol: number, minLen: number, jog = 0): Run[] {
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
      if (worst > Math.max(maxTol * 1.6, jog)) continue;
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
function inkOpen(p: Float32Array, maxTol: number, minLen: number, curveTol: number, startCorner: [number, number] | null, endCorner: [number, number] | null, jog = 0): Float32Array {
  const runs = splitRuns(p, maxTol, minLen, jog);
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
  // Two straight runs meeting at a gentle bend (not a corner) are joined by
  // a short round sweep rather than a kink.
  const fillet: number[] = runs.map(() => 0);
  for (let k = 0; k + 1 < runs.length; k++) {
    const a = runs[k];
    const b = runs[k + 1];
    if (!a.line || !b.line) continue;
    const cos = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1];
    if (cos > Math.cos((2 * Math.PI) / 180) || cos < Math.cos((35 * Math.PI) / 180)) continue;
    const la = Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]);
    const lb = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    fillet[k] = Math.min(la / 3, lb / 3, 24);
  }
  // Two straight runs of one line, side by side a little apart with a tiny
  // jog between them (a line laid down as two strokes): the jog is eased
  // out into a long gentle S instead of a step.
  const ease: number[] = runs.map(() => 0);
  for (let k = 0; k + 2 < runs.length; k++) {
    const a = runs[k];
    const j = runs[k + 1];
    const b = runs[k + 2];
    if (!a.line || j.line || !b.line || polyLen(j.pts) > minLen * 0.6) continue;
    if (a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] < Math.cos((8 * Math.PI) / 180)) continue;
    const off = Math.abs((b.a[0] - a.b[0]) * a.dir[1] - (b.a[1] - a.b[1]) * a.dir[0]);
    if (off > Math.max(jog * 1.5, maxTol)) continue;
    const la = Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]);
    const lb = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    ease[k] = Math.min(la / 2, lb / 2, Math.max(12, off * 15));
    k += 1;
  }
  const out: number[] = [];
  let skipCurve = -1;
  runs.forEach((r, k) => {
    if (k === skipCurve) return;
    if (r.line) {
      if (!out.length) out.push(r.a[0], r.a[1]);
      const c = fillet[k];
      if (ease[k] > 1) {
        const e = ease[k];
        const nx = runs[k + 2];
        const p1x = r.b[0] - r.dir[0] * e;
        const p1y = r.b[1] - r.dir[1] * e;
        const p2x = nx.a[0] + nx.dir[0] * e;
        const p2y = nx.a[1] + nx.dir[1] * e;
        const L = Math.hypot(p2x - p1x, p2y - p1y) / 3;
        const c1x = p1x + r.dir[0] * L;
        const c1y = p1y + r.dir[1] * L;
        const c2x = p2x - nx.dir[0] * L;
        const c2y = p2y - nx.dir[1] * L;
        const steps = Math.max(3, Math.ceil(L * 3));
        for (let q = 0; q <= steps; q++) {
          const t = q / steps;
          const u = 1 - t;
          out.push(
            u * u * u * p1x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p2x,
            u * u * u * p1y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * p2y,
          );
        }
        skipCurve = k + 1;
      } else if (c > 1) {
        const nx = runs[k + 1];
        const p1x = r.b[0] - r.dir[0] * c;
        const p1y = r.b[1] - r.dir[1] * c;
        const p2x = nx.a[0] + nx.dir[0] * c;
        const p2y = nx.a[1] + nx.dir[1] * c;
        const steps = Math.max(2, Math.ceil(c));
        for (let q = 0; q <= steps; q++) {
          const t = q / steps;
          const u = 1 - t;
          out.push(u * u * p1x + 2 * u * t * r.b[0] + t * t * p2x, u * u * p1y + 2 * u * t * r.b[1] + t * t * p2y);
        }
      } else out.push(r.b[0], r.b[1]);
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
    // The curve is eased onto where the lines either side of it end (a
    // straight run is refitted, so its end moves a little): no step where
    // they meet.
    {
      const dax = r.a[0] - r.pts[0];
      const day = r.a[1] - r.pts[1];
      const dbx = r.b[0] - r.pts[r.pts.length - 2];
      const dby = r.b[1] - r.pts[r.pts.length - 1];
      const L = polyLen(inner);
      const D = Math.max(1, Math.min(L, 40));
      let s = 0;
      for (let q = 2; q < inner.length - 2; q += 2) {
        s += Math.hypot(inner[q] - inner[q - 2], inner[q + 1] - inner[q - 1]);
        const wa = Math.max(0, 1 - s / D);
        const wb = Math.max(0, 1 - (L - s) / D);
        ctrl.push(inner[q] + dax * wa + dbx * wb, inner[q + 1] + day * wa + dby * wb);
      }
    }
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

function inkStroke(raw: Float32Array, closed: boolean, opt: { sigma: number; k: number; maxTol: number; minLen: number; curveTol: number; jog?: number }): Float32Array {
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
function joinPieces(pieces: Float32Array[], opt: { maxTol: number; minLen: number; curveTol: number; jog?: number }, closed: boolean): Float32Array {
  const runsOf = pieces.map((pc) => splitRuns(pc, opt.maxTol, opt.minLen, opt.jog));
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
    const inked = inkOpen(pieces[c], opt.maxTol, opt.minLen, opt.curveTol, prevCorner, cornerAt[c], opt.jog);
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


// ---- Mending the sketch before it is thinned.
// A line drawn as several brush strokes comes out as pieces: two strokes
// that overlap side by side a little apart, a tail where one stroke peels
// off the other, a small break between two pieces of one line, or a line
// that stops just short of the line it was meant to meet. Each is mended in
// the ink itself — the sliver of paper between overlapping strokes is filled
// so they become one band, and breaks are bridged with a band as wide as the
// stroke that flows smoothly out of one piece into the other — so the centre
// line found afterwards is already one continuous line.

function stampDisk(m: Uint8Array, w: number, h: number, x: number, y: number, r: number) {
  const x0 = Math.max(1, Math.floor(x - r));
  const x1 = Math.min(w - 2, Math.ceil(x + r));
  const y0 = Math.max(1, Math.floor(y - r));
  const y1 = Math.min(h - 2, Math.ceil(y + r));
  const r2 = r * r;
  for (let yy = y0; yy <= y1; yy++) {
    const dy = yy + 0.5 - y;
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - x;
      if (dx * dx + dy * dy <= r2) m[yy * w + xx] = 1;
    }
  }
}

function stampSegment(m: Uint8Array, w: number, h: number, ax: number, ay: number, bx: number, by: number, r: number) {
  const L = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(L / 0.5));
  for (let s = 0; s <= steps; s++) stampDisk(m, w, h, ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps, r);
}

type FreeEnd = { c: number; atStart: boolean; x: number; y: number; dx: number; dy: number; r: number; len: number };

function repairBreaks(mask: Uint8Array, dist: Float32Array, w: number, h: number, halfW: number, gapPx: number): number {
  const n = w * h;
  const skel = mask.slice();
  thin(skel, w, h);
  const { chains } = traceChains(skel, w);
  // skeleton pixel → which chain, and where along it
  const onChain = new Map<number, number>();
  const chainOf = (p: number) => {
    const v = onChain.get(p);
    return v === undefined ? -1 : Math.floor(v / 1e6);
  };
  const idxOf = (p: number) => (onChain.get(p) ?? 0) % 1e6;
  chains.forEach((c, ci) => {
    c.pix.forEach((p, k) => {
      if (!onChain.has(p) || (k > 0 && k < c.pix.length - 1)) {
        onChain.set(p, ci * 1e6 + k);
      }
    });
  });
  const P = (c: number, k: number): [number, number] => {
    const p = chains[c].pix[k];
    return [(p % w) + 0.5, ((p / w) | 0) + 0.5];
  };
  // Unit tangent of chain c at index k, judged over ±r pixels.
  const tangent = (c: number, k: number, r: number): [number, number] => {
    const pix = chains[c].pix;
    const a = Math.max(0, k - r);
    const b = Math.min(pix.length - 1, k + r);
    const [ax, ay] = P(c, a);
    const [bx, by] = P(c, b);
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [(bx - ax) / l, (by - ay) / l];
  };
  const inside = (x: number, y: number) => {
    const ix = x | 0;
    const iy = y | 0;
    return ix >= 0 && iy >= 0 && ix < w && iy < h && mask[iy * w + ix] === 1;
  };
  const skelNear = (x: number, y: number): number => {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) return -1;
    const i = iy * w + ix;
    for (const o of [0, -1, 1, -w, w]) if (onChain.has(i + o)) return i + o;
    return -1;
  };
  const chainLen = (c: number) => chains[c].pix.length;
  // size of the drawn thing each chain belongs to; small = a mark
  const size = markSize(chains.map((c) => ({ pts: c.pix.flatMap((p) => [p % w, (p / w) | 0]), a: c.a, b: c.b })));
  const markMax = halfW * 8;
  const isMark = (c: number) => size[c] < markMax;

  // Free ends worth mending: not the whisker a blunt stroke end leaves.
  const ends: FreeEnd[] = [];
  const whisker = Math.max(6, halfW * 2.5);
  chains.forEach((c, ci) => {
    if (c.closed) return;
    const len = c.pix.length;
    const bothFree = c.a < 0 && c.b < 0;
    if (len < (bothFree ? Math.max(4, halfW) : whisker)) return;
    for (const atStart of [true, false]) {
      if ((atStart ? c.a : c.b) >= 0) continue;
      const k0 = atStart ? 0 : len - 1;
      const s = atStart ? 1 : -1;
      const near = Math.min(len - 1, Math.round(halfW * 0.5));
      const far = Math.min(len - 1, Math.round(halfW * 4 + 4));
      const [ax, ay] = P(ci, k0 + s * near);
      const [bx, by] = P(ci, k0 + s * far);
      const l = Math.hypot(ax - bx, ay - by);
      if (l < 2) continue;
      const [x, y] = P(ci, k0);
      // half-width of the stroke just behind the end
      let r = 0;
      let rn = 0;
      for (let q = Math.min(len - 1, Math.round(halfW)); q < Math.min(len, halfW * 5); q++, rn++) r += dist[c.pix[atStart ? q : len - 1 - q]];
      r = rn ? r / rn : halfW;
      ends.push({ c: ci, atStart, x, y, dx: (ax - bx) / l, dy: (ay - by) / l, r: Math.max(1.5, Math.min(r, halfW * 1.6)), len });
    }
  });

  const add = new Uint8Array(n); // pixels to add to the mask
  let mended = 0;
  const fusedEnd = new Uint8Array(ends.length);

  // 1. Overlapping strokes side by side: fill the sliver between them.
  const gMax = Math.max(4, halfW * 1.3);
  ends.forEach((e, ei) => {
    const c = chains[e.c];
    const len = c.pix.length;
    if (len < halfW * 6) return; // a little mark beside a line stays a mark
    const r = Math.max(3, Math.round(halfW * 1.5));
    for (const side of [1, -1]) {
      type Hit = { k: number; ax: number; ay: number; bx: number; by: number; oc: number };
      const hits: Hit[] = [];
      let miss = 0;
      let started = false;
      for (let q = 0; q < len; q++) {
        const k = e.atStart ? q : len - 1 - q;
        const [px, py] = P(e.c, k);
        const [tx, ty] = tangent(e.c, k, r);
        const nx = -ty * side;
        const ny = tx * side;
        // own ink, then paper, then the other stroke
        let t = 0;
        let hit: Hit | null = null;
        const ownMax = halfW * 2.5 + 2;
        while (t < ownMax && inside(px + nx * t, py + ny * t)) t += 0.5;
        if (t < ownMax) {
          const t0 = t;
          while (t - t0 <= gMax && !inside(px + nx * t, py + ny * t)) t += 0.5;
          if (t - t0 <= gMax && t - t0 >= 0.5) {
            const t1 = t;
            // the other stroke's centre line, running the same way
            let found = -1;
            while (t - t1 < halfW * 3 + 2 && inside(px + nx * t, py + ny * t)) {
              found = skelNear(px + nx * t, py + ny * t);
              if (found >= 0) break;
              t += 0.5;
            }
            if (found >= 0 && chainOf(found) !== e.c) {
              const oc = chainOf(found);
              const [ux, uy] = tangent(oc, idxOf(found), r);
              if (Math.abs(ux * tx + uy * ty) > 0.96) {
                hit = { k: q, ax: px + nx * (t0 - 0.5), ay: py + ny * (t0 - 0.5), bx: px + nx * (t1 + 0.5), by: py + ny * (t1 + 0.5), oc };
              }
            }
          }
        }
        // the same other stroke all along
        if (hit && started && hit.oc !== hits[0].oc) hit = null;
        if (hit) {
          started = true;
          hits.push(hit);
          miss = 0;
        } else if (started) {
          if (++miss > Math.max(3, halfW)) break;
        } else if (q > halfW * 2.5) break;
      }
      if (hits.length < 2) continue;
      // Pieces of one line: the other stroke carries on past this end (two
      // fingers side by side end together, and stay two lines).
      {
        const pc = chains[hits[0].oc];
        let beyond = -Infinity;
        for (let q = 0; q < pc.pix.length; q++) {
          const pp = pc.pix[q];
          const t = ((pp % w) + 0.5 - e.x) * e.dx + (((pp / w) | 0) + 0.5 - e.y) * e.dy;
          if (t > beyond) beyond = t;
        }
        if (beyond < Math.max(halfW * 4, 24)) continue;
        // a line that branches off the other one and runs beside it is a
        // drawn detail (a finger inside a hand), not a second try at it
        const other = e.atStart ? c.b : c.a;
        if (other >= 0 && (other === pc.a || other === pc.b)) continue;
      }
      const run = hits[hits.length - 1].k - hits[0].k;
      if (run < Math.max(8, halfW * 1.5)) continue;
      // Two tries at one line run side by side a steady distance apart; two
      // lines that cross at a shallow angle close in on each other.
      {
        let gmin = Infinity;
        let gmax = 0;
        for (const ht of hits) {
          const g = Math.hypot(ht.bx - ht.ax, ht.by - ht.ay);
          gmin = Math.min(gmin, g);
          gmax = Math.max(gmax, g);
        }
        if (gmax - gmin > Math.max(3, halfW * 0.8)) continue;
      }
      for (let j = 0; j + 1 < hits.length; j++) {
        const A = hits[j];
        const B = hits[j + 1];
        if (B.k - A.k > 3 || Math.hypot(B.bx - A.bx, B.by - A.by) > 4) continue;
        const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(B.ax - A.ax, B.ay - A.ay), Math.hypot(B.bx - A.bx, B.by - A.by)) * 2));
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          stampSegment(add, w, h, A.ax + (B.ax - A.ax) * u, A.ay + (B.ay - A.ay) * u, A.bx + (B.bx - A.bx) * u, A.by + (B.by - A.by) * u, 0.8);
        }
      }
      fusedEnd[ei] = 1;
      mended++;
    }
  });

  // 2. Breaks between two line ends that carry on into each other.
  const G = gapPx;
  const taken = new Uint8Array(ends.length);
  {
    const pairs: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i];
      if (fusedEnd[i]) continue;
      for (let j = i + 1; j < ends.length; j++) {
        const f = ends[j];
        if (fusedEnd[j]) continue;
        const vx = f.x - e.x;
        const vy = f.y - e.y;
        if (Math.abs(vx) > G || Math.abs(vy) > G) continue;
        const d = Math.hypot(vx, vy);
        // the paper between the two tips, not between the centre-line ends
        // small pieces (a nose and a mouth) only close a gap small for them
        if (d > Math.min(G, 0.3 * Math.min(e.len, f.len)) || d < 1) continue;
        if (f.c === e.c && chainLen(e.c) < G * 3) continue;
        const ce = (e.dx * vx + e.dy * vy) / d;
        const cf = -(f.dx * vx + f.dy * vy) / d;
        const along = -(e.dx * f.dx + e.dy * f.dy);
        if (ce < 0.7 || cf < 0.7 || along < 0.5) continue;
        // two little marks close together (a nose and a mouth) stay apart;
        // a little piece only joins a line it carries straight on from
        if (e.c !== f.c && isMark(e.c) && isMark(f.c)) continue;
        if ((isMark(e.c) || isMark(f.c)) && (ce < 0.9 || cf < 0.9 || along < 0.85)) continue;
        pairs.push({ i, j, score: d * (3.2 - ce - cf - along * 0.2) });
      }
    }
    pairs.sort((a, b) => a.score - b.score);
    for (const pr of pairs) {
      if (taken[pr.i] || taken[pr.j]) continue;
      taken[pr.i] = taken[pr.j] = 1;
      const e = ends[pr.i];
      const f = ends[pr.j];
      const d = Math.hypot(f.x - e.x, f.y - e.y);
      const k = d * 0.9;
      const r = Math.min(e.r, f.r);
      const steps = Math.ceil(d * 2) + 2;
      let lx = e.x;
      let ly = e.y;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        const x = h00 * e.x + h10 * e.dx * k + h01 * f.x - h11 * f.dx * k;
        const y = h00 * e.y + h10 * e.dy * k + h01 * f.y - h11 * f.dy * k;
        stampSegment(add, w, h, lx, ly, x, y, r);
        lx = x;
        ly = y;
      }
      mended++;
    }
  }

  // 3. A line that stops just short of another line: carry it on, straight,
  // until it meets it.
  ends.forEach((e, ei) => {
    if (taken[ei] || fusedEnd[ei]) return;
    if (e.len < G * 2 || isMark(e.c)) return; // small details (an eye, a nose, a hair tip) are left as drawn
    let best: { x: number; y: number; score: number } | null = null;
    for (const ang of [0, 0.12, -0.12, 0.25, -0.25]) {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const dx = e.dx * ca - e.dy * sa;
      const dy = e.dx * sa + e.dy * ca;
      let t = 0;
      const ownMax = e.r * 2 + 4;
      while (t < ownMax && inside(e.x + dx * t, e.y + dy * t)) t += 0.5;
      if (t >= ownMax) continue;
      const t0 = t;
      while (t <= G && !inside(e.x + dx * t, e.y + dy * t)) t += 0.5;
      if (t > G) continue;
      // went into another line: carry on to its centre line
      const t1 = t;
      let found = -1;
      while (t - t1 < halfW * 3 + 2 && inside(e.x + dx * t, e.y + dy * t)) {
        found = skelNear(e.x + dx * t, e.y + dy * t);
        if (found >= 0) break;
        t += 0.5;
      }
      if (found < 0) continue;
      if (chainOf(found) === e.c && Math.abs(idxOf(found) - (e.atStart ? 0 : e.len - 1)) < G * 3) continue;
      // only onto a proper line, not from one small mark to another
      if (chainLen(chainOf(found)) < G * 3 && chains[chainOf(found)].a < 0 && chains[chainOf(found)].b < 0) continue;
      const score = (t1 - t0) / Math.cos(ang) + Math.abs(ang) * 4;
      if (!best || score < best.score) best = { x: e.x + dx * t, y: e.y + dy * t, score };
    }
    if (!best) return;
    stampSegment(add, w, h, e.x, e.y, best.x, best.y, Math.min(e.r, halfW * 1.2));
    mended++;
  });

  for (let i = 0; i < n; i++) if (add[i]) mask[i] = 1;
  return mended;
}


// ---- The outer frame. Most colouring pages sit in a hand-drawn frame (a
// rounded box, a wavy border) that is inked as one closed line, a little
// bolder than the drawing inside it. The frame is the run of lines with open
// paper outside them and the drawing inside them; pieces of it (a frame
// drawn as several strokes, overlapping or with gaps) are merged into one
// smooth closed curve that goes all the way round.

type FramePiece = { pts: Float32Array; from: number; cutStart: boolean; cutEnd: boolean };

function floodOutside(free: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (i: number) => {
    if (free[i] && !out[i]) {
      out[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  return out;
}

function findFrame(
  strokes: { pts: Float32Array; closed: boolean }[],
  ink: Uint8Array,
  w: number,
  h: number,
  halfW: number,
  gapPx: number,
  dark: Float32Array,
): { lines: { pts: Float32Array; closed: boolean }[]; rest: FramePiece[] } | null {
  // Worked out at a third of the size: it only needs to be right to a few
  // pixels, and it is quicker.
  const F = 3;
  const ws = Math.ceil(w / F);
  const hs = Math.ceil(h / F);
  const n = ws * hs;
  const inkS = new Uint8Array(n);
  const darkS = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const row = ((y / F) | 0) * ws;
    for (let x = 0; x < w; x++) {
      const j = row + ((x / F) | 0);
      const i = y * w + x;
      if (ink[i]) inkS[j] = 1;
      darkS[j] += dark[i] / (F * F);
    }
  }
  const toInk = distanceTransform(inkS, ws, hs).dist;
  // The paper outside the frame. Gaps in the frame (a corner not quite
  // closed) are bridged by first finding the paper further than Rb from any
  // line that is connected to the edge of the page — it can't squeeze
  // through a gap narrower than 2·Rb — then growing it back by Rb, up to the
  // lines, without leaking through the gaps.
  const Rb = Math.max(gapPx * 3, halfW * 6) / F;
  const free = new Uint8Array(n);
  for (let i = 0; i < n; i++) free[i] = toInk[i] > Rb ? 1 : 0;
  const core = floodOutside(free, ws, hs);
  const toOut = distanceTransform(core, ws, hs).dist;
  const outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) outside[i] = toOut[i] <= Rb + 1 ? 1 : 0;
  // ...and a little further still past a faint extra stroke sketched just
  // outside the frame (but not past a proper line: the frame itself).
  const E = Math.round(halfW * 6);
  {
    let front: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!outside[i]) continue;
      const x = i % ws;
      if ((x > 0 && !outside[i - 1]) || (x < ws - 1 && !outside[i + 1]) || (i >= ws && !outside[i - ws]) || (i < n - ws && !outside[i + ws])) front.push(i);
    }
    for (let step = 0; step < E / F && front.length; step++) {
      const next: number[] = [];
      for (const i of front) {
        const x = i % ws;
        for (const j of [x > 0 ? i - 1 : -1, x < ws - 1 ? i + 1 : -1, i - ws, i + ws]) {
          if (j < 0 || j >= n || outside[j] || darkS[j] >= 0.58) continue;
          outside[j] = 1;
          next.push(j);
        }
      }
      front = next;
    }
  }
  const isOut = (x: number, y: number) => {
    const ix = Math.floor(x / F);
    const iy = Math.floor(y / F);
    if (ix < 0 || iy < 0 || ix >= ws || iy >= hs) return true;
    return outside[iy * ws + ix] === 1;
  };
  const probe = halfW * 2 + 6;
  const probeIn = probe + E + 2;
  const minRun = Math.max(halfW * 3, 20);
  const frameRuns: { pts: Float32Array; len: number; from: number; cutStart: boolean; cutEnd: boolean }[] = [];
  const rest: FramePiece[] = [];
  strokes.forEach((s, si) => {
    const p = s.pts;
    const m = p.length / 2;
    const flag = new Uint8Array(m);
    const k = 4;
    for (let i = 0; i < m; i++) {
      let a = i - k;
      let b = i + k;
      if (s.closed) {
        a = (a + m) % m;
        b = b % m;
      } else {
        a = Math.max(0, a);
        b = Math.min(m - 1, b);
      }
      const tx = p[b * 2] - p[a * 2];
      const ty = p[b * 2 + 1] - p[a * 2 + 1];
      const l = Math.hypot(tx, ty);
      if (l < 1) continue;
      const nx = -ty / l;
      const ny = tx / l;
      const x = p[i * 2];
      const y = p[i * 2 + 1];
      const oa = isOut(x + nx * probe, y + ny * probe);
      const ob = isOut(x - nx * probe, y - ny * probe);
      flag[i] = (oa && !isOut(x - nx * probeIn, y - ny * probeIn)) || (ob && !isOut(x + nx * probeIn, y + ny * probeIn)) ? 1 : 0;
    }
    // majority over a short window, so a junction doesn't cut a frame run
    const win = Math.max(3, Math.round(halfW * 2));
    const sm = new Uint8Array(m);
    let acc = 0;
    const at = (i: number) => (s.closed ? flag[((i % m) + m) % m] : i < 0 || i >= m ? 0 : flag[i]);
    for (let i = -win; i <= win; i++) acc += at(i);
    for (let i = 0; i < m; i++) {
      sm[i] = acc * 2 > win * 2 + 1 ? 1 : 0;
      acc += at(i + win + 1) - at(i - win);
    }
    // Cut into runs; long flagged runs are frame.
    const runs: [number, number, number][] = []; // from, to (inclusive), flag
    let st = 0;
    for (let i = 1; i <= m; i++) {
      if (i === m || sm[i] !== sm[st]) {
        runs.push([st, i - 1, sm[st]]);
        st = i;
      }
    }
    const lenOf = (a: number, b: number) => {
      let l = 0;
      for (let i = a + 1; i <= b; i++) l += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      return l;
    };
    for (const r of runs) if (r[2] && lenOf(r[0], r[1]) < minRun) r[2] = 0;
    // merge neighbouring non-frame runs back together
    const merged: [number, number, number][] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last[2] === r[2]) last[1] = r[1];
      else merged.push([r[0], r[1], r[2]]);
    }
    if (merged.length === 1 && !merged[0][2]) {
      rest.push({ pts: p, from: si, cutStart: false, cutEnd: false });
      return;
    }
    // a closed stroke whose seam falls in a non-frame run: join first and last
    if (s.closed && merged.length > 1 && !merged[0][2] && !merged[merged.length - 1][2]) {
      const last = merged.pop()!;
      const a = sliceRun(p, last[0], last[1]);
      const b = sliceRun(p, merged[0][0], merged[0][1]);
      rest.push({ pts: concat(a, b), from: si, cutStart: true, cutEnd: true });
      merged.shift();
    }
    for (const r of merged) {
      if (r[2]) {
        frameRuns.push({ pts: sliceRun(p, r[0], r[1]), len: lenOf(r[0], r[1]), from: si, cutStart: s.closed || r[0] > 0, cutEnd: s.closed || r[1] < m - 1 });
      } else {
        const a = Math.max(0, r[0] - 1);
        const b = Math.min(m - 1, r[1] + 1);
        if (b - a < 1) continue;
        rest.push({ pts: sliceRun(p, a, b), from: si, cutStart: s.closed || r[0] > 0, cutEnd: s.closed || r[1] < m - 1 });
      }
    }
  });
  if (!frameRuns.length) return null;
  // The frame has to go most of the way round the picture.
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  let frameLen = 0;
  for (const fr of frameRuns) {
    frameLen += fr.len;
    for (let q = 0; q < fr.pts.length; q += 2) {
      x0 = Math.min(x0, fr.pts[q]);
      x1 = Math.max(x1, fr.pts[q]);
      y0 = Math.min(y0, fr.pts[q + 1]);
      y1 = Math.max(y1, fr.pts[q + 1]);
    }
  }
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < w * 0.4 || bh < h * 0.4 || frameLen < (bw + bh) * 2 * 0.6) return null;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const N = 2048;
  const binOf = (x: number, y: number) => Math.min(N - 1, Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * N));
  // Radius of the frame line in each direction from the middle. Where the
  // frame was drawn twice, the outer stroke is the frame and a stroke right
  // next to it is averaged in; directions with no frame line are filled in
  // from either side.
  const profile = (runs: typeof frameRuns, fill: boolean): { rr: Float32Array; cnt: Uint32Array } | null => {
    // Lines found in each direction, grouped where they lie within a
    // stroke-width or two of each other (a frame drawn twice, close).
    const rs: number[][] = Array.from({ length: N }, () => []);
    for (const fr of runs) {
      for (let q = 0; q < fr.pts.length; q += 2) rs[binOf(fr.pts[q], fr.pts[q + 1])].push(Math.hypot(fr.pts[q] - cx, fr.pts[q + 1] - cy));
    }
    const groups: number[][] = rs.map((list) => {
      if (!list.length) return [];
      list.sort((p, q) => q - p);
      const out: number[] = [];
      let sum = list[0];
      let c = 1;
      let top = list[0];
      for (let k = 1; k <= list.length; k++) {
        if (k < list.length && list[k] >= top - halfW * 2.5) {
          sum += list[k];
          c++;
          continue;
        }
        out.push(sum / c);
        if (k < list.length) {
          sum = top = list[k];
          c = 1;
        }
      }
      return out; // outermost first
    });
    // Follow the frame round: the outermost line, unless that means jumping
    // across to another line and back (a faint extra stroke outside the
    // frame at a corner) — the frame is one line that carries on.
    const outerCost = 0.5;
    const jump = (d: number) => (d <= halfW * 1.5 ? 0 : 200 + d * 4);
    const start = groups.findIndex((g) => g.length > 0);
    if (start < 0) return null;
    const cost: Float64Array[] = [];
    const from: Int32Array[] = [];
    const binsUsed: number[] = [];
    for (let j = 0; j < N; j++) {
      const bb = (start + j) % N;
      const g = groups[bb];
      if (!g.length) continue;
      const cst = new Float64Array(g.length);
      const frm = new Int32Array(g.length).fill(-1);
      const prev = binsUsed.length ? groups[binsUsed[binsUsed.length - 1]] : null;
      const prevCost = cost.length ? cost[cost.length - 1] : null;
      for (let k = 0; k < g.length; k++) {
        let best = prev ? Infinity : 0;
        if (prev && prevCost) {
          for (let m = 0; m < prev.length; m++) {
            const v = prevCost[m] + jump(Math.abs(g[k] - prev[m]));
            if (v < best) {
              best = v;
              frm[k] = m;
            }
          }
        }
        cst[k] = best + (k > 0 ? outerCost : 0);
      }
      cost.push(cst);
      from.push(frm);
      binsUsed.push(bb);
    }
    const choice = new Int32Array(binsUsed.length);
    {
      const last = cost[cost.length - 1];
      let k = 0;
      for (let m = 1; m < last.length; m++) if (last[m] < last[k]) k = m;
      for (let j = binsUsed.length - 1; j >= 0; j--) {
        choice[j] = k;
        k = from[j][k] >= 0 ? from[j][k] : 0;
      }
    }
    const pick = new Float32Array(N);
    const cnt = new Uint32Array(N);
    binsUsed.forEach((bb, j) => {
      pick[bb] = groups[bb][choice[j]];
      cnt[bb] = 1;
    });
    const sum = pick;
    const rr = new Float32Array(N);
    let filled = 0;
    for (let b = 0; b < N; b++) {
      if (cnt[b]) {
        rr[b] = sum[b];
        filled++;
      }
    }
    if (filled < N * 0.3) return null;
    for (let b = 0; b < N && fill; b++) {
      if (cnt[b]) continue;
      let pb = b;
      let nb = b;
      let pd = 0;
      let nd = 0;
      while (!cnt[pb]) {
        pb = (pb - 1 + N) % N;
        pd++;
      }
      while (!cnt[nb]) {
        nb = (nb + 1) % N;
        nd++;
      }
      // straight across the gap: where this direction meets the line
      // between the two frame points either side of it
      const ang = (k: number) => ((k + 0.5) / N) * 2 * Math.PI - Math.PI;
      const ax = Math.cos(ang(pb)) * rr[pb];
      const ay = Math.sin(ang(pb)) * rr[pb];
      const ex = Math.cos(ang(nb)) * rr[nb] - ax;
      const ey = Math.sin(ang(nb)) * rr[nb] - ay;
      const ux = Math.cos(ang(b));
      const uy = Math.sin(ang(b));
      const den = ux * ey - uy * ex;
      const lin = (rr[pb] * nd + rr[nb] * pd) / (pd + nd);
      const r = Math.abs(den) > 1e-6 ? (ax * ey - ay * ex) / den : lin;
      rr[b] = r > 0 && r < lin * 1.5 ? r : lin;
    }
    return { rr, cnt };
  };
  // Long runs are surely frame. A short one (a frame stroke drawn in
  // pieces — or the corner of a mat or a shelf poking out past the frame)
  // is frame only where it lies along the line the long runs make.
  const strongLen = Math.max(gapPx * 6, (bw + bh) * 0.08);
  const accepted: typeof frameRuns = [];
  for (const fr of frameRuns) {
    let ok = fr.len >= strongLen;
    if (!ok) {
      // the frame as the other runs draw it
      const ref = profile(frameRuns.filter((o) => o !== fr), true)?.rr;
      let out = 0;
      if (ref) {
        for (let q = 0; q < fr.pts.length; q += 2) {
          const r = Math.hypot(fr.pts[q] - cx, fr.pts[q + 1] - cy);
          if (r - ref[binOf(fr.pts[q], fr.pts[q + 1])] > halfW * 3) out++;
        }
      }
      ok = out < (fr.pts.length / 2) * 0.3;
    }
    if (ok) accepted.push(fr);
    else rest.push({ pts: fr.pts, from: fr.from, cutStart: fr.cutStart, cutEnd: fr.cutEnd });
  }
  const fin = profile(accepted, false);
  if (!fin) return null;
  const { rr, cnt } = fin;
  const ang = (k: number) => ((k + 0.5) / N) * 2 * Math.PI - Math.PI;
  // Something standing in front of the frame and poking out past it (a
  // mat's corner, a foot) shows as a bulge in the frame line: the line
  // turns sharply outward (against the way a frame turns), runs round the
  // thing, and turns sharply back in. That stretch is the thing's outline,
  // not the frame: the frame stops where the bulge starts.
  {
    const idx: number[] = [];
    for (let b = 0; b < N; b++) if (cnt[b]) idx.push(b);
    const M = idx.length;
    const X = (i: number) => cx + Math.cos(ang(idx[((i % M) + M) % M])) * rr[idx[((i % M) + M) % M]];
    const Y = (i: number) => cy + Math.sin(ang(idx[((i % M) + M) % M])) * rr[idx[((i % M) + M) % M]];
    const arm = Math.max(12, halfW * 3);
    // the point `arm` along the line from i, either way
    const along = (i: number, dir: number) => {
      let d = 0;
      let j = i;
      for (let s = 0; s < M && d < arm; s++) {
        const nj = j + dir;
        d += Math.hypot(X(nj) - X(j), Y(nj) - Y(j));
        j = nj;
      }
      return j;
    };
    const turn = new Float32Array(M);
    let total = 0;
    for (let i = 0; i < M; i++) {
      const j = along(i, -1);
      const k = along(i, 1);
      const ux = X(i) - X(j);
      const uy = Y(i) - Y(j);
      const vx = X(k) - X(i);
      const vy = Y(k) - Y(i);
      turn[i] = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      total += turn[i];
    }
    const orient = total >= 0 ? 1 : -1;
    const inward: number[] = []; // sharp turns against the frame's way
    for (let i = 0; i < M; i++) {
      const t = turn[i] * orient;
      if (t > -0.6) continue;
      let peak = true;
      for (let o = -3; o <= 3 && peak; o++) if (o && turn[(i + o + M) % M] * orient < t) peak = false;
      if (peak) inward.push(i);
    }
    const maxArc = Math.max(halfW * 50, gapPx * 25);
    for (let q = 0; q + 1 < inward.length; q++) {
      const i0 = inward[q];
      const i1 = inward[q + 1];
      // the stretch between, and how far it bulges out past the chord
      let arc = 0;
      for (let i = i0; i < i1; i++) arc += Math.hypot(X(i + 1) - X(i), Y(i + 1) - Y(i));
      if (arc > maxArc || arc < halfW * 4) continue;
      const ax = X(i0);
      const ay = Y(i0);
      const ex = X(i1) - ax;
      const ey = Y(i1) - ay;
      const el = Math.hypot(ex, ey) || 1;
      let nx = ey / el;
      let ny = -ex / el;
      if (nx * (ax - cx) + ny * (ay - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      let bulge = 0;
      for (let i = i0; i <= i1; i++) bulge = Math.max(bulge, (X(i) - ax) * nx + (Y(i) - ay) * ny);
      // a corner of something poking out, not a gentle swell of the frame
      if (bulge < halfW * 4 || arc < el * 1.2 || Math.min(turn[i0] * orient, turn[i1] * orient) > -0.9) continue;
      for (let i = i0 + 1; i < i1; i++) cnt[idx[i]] = 0;
      q++;
    }
  }
  const PX = (k: number) => cx + Math.cos(ang(k)) * rr[k];
  const PY = (k: number) => cy + Math.sin(ang(k)) * rr[k];
  // Radius straight across from bin p to bin q, in direction k.
  const across = (p: number, q: number, k: number) => {
    const ax = PX(p) - cx;
    const ay = PY(p) - cy;
    const ex = PX(q) - cx - ax;
    const ey = PY(q) - cy - ay;
    const ux = Math.cos(ang(k));
    const uy = Math.sin(ang(k));
    const den = ux * ey - uy * ex;
    const lin = (rr[p] + rr[q]) / 2;
    const r = Math.abs(den) > 1e-6 ? (ax * ey - ay * ex) / den : lin;
    return r > 0 && r < lin * 1.5 ? r : lin;
  };
  // A gap in the frame is closed only where it is short and nothing else is
  // drawn across it (the frame running behind a chair or a table is left
  // open — a line through the chair would be a line that isn't there).
  const maxGap = Math.max(gapPx * 6, halfW * 12);
  const skip = halfW * 2 + 3;
  const inkAt = (x: number, y: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    return ix >= 0 && iy >= 0 && ix < w && iy < h && ink[iy * w + ix] === 1;
  };
  const clear = (ax: number, ay: number, bx: number, by: number) => {
    const L = Math.hypot(bx - ax, by - ay);
    // out of the picture, across the gap
    let nx = -(by - ay) / L;
    let ny = (bx - ax) / L;
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    // A line that ends on the frame from inside is fine; one that sticks out
    // past the frame line is something standing in front of the frame.
    for (let t = skip; t <= L - skip; t += 1) {
      const x = ax + ((bx - ax) * t) / L;
      const y = ay + ((by - ay) * t) / L;
      for (let d = halfW * 3.5; d <= halfW * 7; d += 2) if (inkAt(x + nx * d, y + ny * d)) return false;
    }
    return true;
  };

  const covered: number[] = [];
  for (let b = 0; b < N; b++) if (cnt[b]) covered.push(b);
  const C = covered.length;
  const brk = new Uint8Array(C);
  let breaks = 0;
  for (let i = 0; i < C; i++) {
    const b1 = covered[i];
    const b2 = covered[(i + 1) % C];
    const steps = (b2 - b1 + N) % N || N;
    const d = Math.hypot(PX(b2) - PX(b1), PY(b2) - PY(b1));
    const arc = (Math.max(rr[b1], rr[b2]) * steps * 2 * Math.PI) / N;
    if (steps <= 3 && d <= arc * 1.5 + halfW * 2) continue;
    // Two different lines side by side in the same direction from the middle:
    // a step, not a gap, and not to be smoothed over unless it is small.
    const step = Math.abs(rr[b2] - rr[b1]);
    if (steps <= 3 ? step <= halfW * 4 : d <= maxGap && step <= Math.max(halfW * 4, d * 0.8) && clear(PX(b1), PY(b1), PX(b2), PY(b2))) continue;
    brk[i] = 1;
    breaks++;
  }
  // Walk round the frame, filling the closed gaps.
  type Seg = { bins: number[]; rs: number[] };
  const segs: Seg[] = [];
  const start = breaks ? (brk.indexOf(1) + 1) % C : 0;
  let cur: Seg = { bins: [], rs: [] };
  for (let j = 0; j < C; j++) {
    const i = (start + j) % C;
    const b1 = covered[i];
    cur.bins.push(b1);
    cur.rs.push(rr[b1]);
    if (brk[i]) {
      segs.push(cur);
      cur = { bins: [], rs: [] };
      continue;
    }
    if (!breaks && j === C - 1 && C === N) break;
    const b2 = covered[(i + 1) % C];
    for (let k = (b1 + 1) % N; k !== b2; k = (k + 1) % N) {
      cur.bins.push(k);
      cur.rs.push(across(b1, b2, k));
    }
  }
  if (cur.bins.length) segs.push(cur);
  const segPts = segs.map((sg) => {
    const p = new Float32Array(sg.bins.length * 2);
    sg.bins.forEach((k, q) => {
      p[q * 2] = cx + Math.cos(ang(k)) * sg.rs[q];
      p[q * 2 + 1] = cy + Math.sin(ang(k)) * sg.rs[q];
    });
    return p;
  });
  const segLen = segPts.map((p) => polyLength(p));
  const longest = Math.max(...segLen);
  const keep = segLen.map((l) => l >= Math.max(longest * 0.3, minRun * 3));
  // A shorter piece is frame too when the frame carries straight on into it
  // past something drawn in front of the frame (a mat's corner).
  const S = segPts.length;
  const endInfo = (p: Float32Array, atEnd: boolean) => {
    const m = p.length / 2;
    const k = atEnd ? m - 1 : 0;
    const back = Math.min(m - 1, 12);
    const j = atEnd ? m - 1 - back : back;
    const x = p[k * 2];
    const y = p[k * 2 + 1];
    const l = Math.hypot(x - p[j * 2], y - p[j * 2 + 1]) || 1;
    return { x, y, dx: (x - p[j * 2]) / l, dy: (y - p[j * 2 + 1]) / l };
  };
  const carriesOn = (from: Float32Array, into: Float32Array) => {
    const e = endInfo(from, true); // pointing out of the kept piece
    const f = endInfo(into, false); // pointing back out of the candidate
    const vx = f.x - e.x;
    const vy = f.y - e.y;
    const d = Math.hypot(vx, vy);
    if (d > maxGap * 2.2) return false;
    if (d > halfW * 2 && (e.dx * vx + e.dy * vy) / d < Math.cos(0.45)) return false;
    return -(e.dx * f.dx + e.dy * f.dy) > Math.cos(0.55);
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < S && S > 1; i++) {
      if (keep[i] || segLen[i] < minRun * 2) continue;
      const prev = (i - 1 + S) % S;
      const next = (i + 1) % S;
      if ((keep[prev] && carriesOn(segPts[prev], segPts[i])) || (keep[next] && carriesOn(reversed(segPts[next]), reversed(segPts[i])))) {
        keep[i] = true;
        changed = true;
      }
    }
  }
  // A frame goes (nearly) all the way round; the outline of a figure
  // standing on an empty page doesn't.
  {
    const P = 2 * (bw + bh);
    let total = 0;
    segLen.forEach((l, i) => keep[i] && (total += l));
    if (longest < P * 0.35 || total < P * 0.6) return null;
  }
  const segOf = new Int32Array(N).fill(-1);
  segs.forEach((sg, si) => {
    for (const k of sg.bins) segOf[k] = si;
  });
  // Runs on a piece of "frame" too short to be the frame (the bottom of a
  // pouf standing on the lower edge of the page) stay ordinary lines.
  for (const fr of accepted) {
    const votes = new Map<number, number>();
    for (let q = 0; q < fr.pts.length; q += 2) {
      const sid = segOf[binOf(fr.pts[q], fr.pts[q + 1])];
      votes.set(sid, (votes.get(sid) ?? 0) + 1);
    }
    let best = -1;
    let bv = -1;
    for (const [sid, v] of votes) {
      if (v > bv) {
        bv = v;
        best = sid;
      }
    }
    if (best < 0 || !keep[best]) {
      rest.push({ pts: fr.pts, from: fr.from, cutStart: fr.cutStart, cutEnd: fr.cutEnd });
      continue;
    }
    // Where a run leaves the frame line (a line that carried on from the
    // frame into the picture), that part stays a line of its own.
    const m = fr.pts.length / 2;
    const far = new Uint8Array(m);
    for (let q = 0; q < m; q++) {
      const k = binOf(fr.pts[q * 2], fr.pts[q * 2 + 1]);
      far[q] = !cnt[k] || Math.abs(Math.hypot(fr.pts[q * 2] - cx, fr.pts[q * 2 + 1] - cy) - rr[k]) > halfW * 2.5 ? 1 : 0;
    }
    for (let q = 0; q < m; ) {
      if (!far[q]) {
        q++;
        continue;
      }
      let e = q;
      while (e + 1 < m && far[e + 1]) e++;
      if (e - q >= 3) {
        const a0 = Math.max(0, q - 1);
        const b0 = Math.min(m - 1, e + 1);
        rest.push({ pts: sliceRun(fr.pts, a0, b0), from: fr.from, cutStart: q > 0 || fr.cutStart, cutEnd: e < m - 1 || fr.cutEnd });
      }
      q = e + 1;
    }
  }
  const sigma = Math.max(3, halfW * 3);
  const tol = Math.max(1.5, halfW * 0.3);
  const lines: { pts: Float32Array; closed: boolean }[] = [];
  if (!breaks) lines.push({ pts: fairCurve(segPts[0], true, sigma, tol), closed: true });
  else segPts.forEach((p, si) => keep[si] && lines.push({ pts: fairCurve(p, false, sigma, tol), closed: false }));
  if (!lines.length) return null;
  return { lines, rest };
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
  let { dist } = distanceTransform(bg, w, h);

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

  onStep?.("mend");
  const drawnDist = dist;
  if (repairBreaks(mask, dist, w, h, halfW, p.gapPx) > 0) {
    region.set(mask);
    for (let i = 0; i < n; i++) bg[i] = mask[i] ? 0 : 1;
    dist = distanceTransform(bg, w, h).dist;
    // how heavy each line is still comes from the sketch as drawn
    for (let i = 0; i < n; i++) if (!drawnDist[i] && dist[i]) drawnDist[i] = Math.min(dist[i], halfW);
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
      for (const i of c.pix) wsum += drawnDist[i];
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

  // 2b. A little eye where two strokes of one line part and meet again (a
  // bubble between the same two junctions): keep the shorter side.
  {
    const bubble = Math.max(40, halfW * 8);
    const byPair = new Map<string, S[]>();
    for (const s of list) {
      if (s.closed || s.a < 0 || s.b < 0 || s.a === s.b) continue;
      const key = s.a < s.b ? s.a + ":" + s.b : s.b + ":" + s.a;
      byPair.set(key, [...(byPair.get(key) ?? []), s]);
    }
    for (const [, group] of byPair) {
      if (group.length < 2) continue;
      const lens = group.map((g) => polyLength(g.pts));
      if (Math.max(...lens) > bubble) continue;
      // Only a lens — two sides of not too different length. A bump far
      // longer than the line under it (a rounded fingertip) is drawn on
      // purpose.
      if (Math.max(...lens) > Math.min(...lens) * 1.8) continue;
      const keep = lens.indexOf(Math.min(...lens));
      group.forEach((g, i) => {
        if (i !== keep) g.dead = true;
      });
    }
    list = list.filter((s) => !s.dead);
  }

  // 3. Through every junction carry the straightest pair of strokes on as
  // one stroke; the rest end there.
  const reach = Math.max(6, halfW * 4);
  for (let guard = 0; guard < 24; guard++) {
    const at = new Map<number, { s: S; end: 0 | 1 }[]>();
    for (const s of list) {
      if (s.closed) continue;
      if (s.a >= 0) at.set(s.a, [...(at.get(s.a) ?? []), { s, end: 0 }]);
      if (s.b >= 0) at.set(s.b, [...(at.get(s.b) ?? []), { s, end: 1 }]);
    }
    let any = false;
    for (const [, ends] of at) {
      // A stroke here was already carried on through another junction this
      // round: decide this junction next round, with the stroke as it is now
      // (or the pair left over would be joined whatever their angle).
      if (ends.some((e) => e.s.dead)) continue;
      const live = ends;
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
  const sizeOf = new Map<S, number>();
  {
    const sz = markSize(list, Math.max(3, halfW));
    list.forEach((s, i) => sizeOf.set(s, sz[i]));
  }
  const markMax = halfW * 8;
  const isMark = (s: S) => (sizeOf.get(s) ?? Infinity) < markMax;
  // A small shape drawn as one stroke that nearly comes round to where it
  // started (a star, a flower, a leaf) is closed, ready to colour — only
  // across paper, and only when the opening is a small part of it.
  for (const s of list) {
    if (s.closed || s.a !== -1 || s.b !== -1) continue;
    const m = s.pts.length;
    const len = polyLength(s.pts);
    const d = Math.hypot(s.pts[m - 2] - s.pts[0], s.pts[m - 1] - s.pts[1]);
    if (len < p.gapPx * 4 || d < 0.5 || d > Math.min(len * 0.2, p.gapPx * 2.5)) continue;
    let clear = true;
    for (let t = halfW * 1.5; t < d - halfW * 1.5 && clear; t += 1) {
      const x = s.pts[0] + ((s.pts[m - 2] - s.pts[0]) * t) / d;
      const y = s.pts[1] + ((s.pts[m - 1] - s.pts[1]) * t) / d;
      if (region[(y | 0) * w + (x | 0)]) clear = false;
    }
    if (!clear) continue;
    s.closed = true;
  }
  {
    const ends = freeEnds();
    const pairs: { i: number; j: number; score: number }[] = [];
    const sideSlack = Math.max(3, halfW * 2.5);
    const farGap = p.gapPx * 2.5;
    // Points along the bridge from end e to end f (a curve leaving and
    // arriving along both lines).
    const hermite = (e: End, f: End, d: number, step: number) => {
      const k = d * 0.9;
      const n = Math.max(2, Math.ceil(d / step));
      const out = new Float32Array((n - 1) * 2);
      for (let s = 1; s < n; s++) {
        const t = s / n;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        out[(s - 1) * 2] = h00 * e.x + h10 * e.dx * k + h01 * f.x - h11 * f.dx * k;
        out[(s - 1) * 2 + 1] = h00 * e.y + h10 * e.dy * k + h01 * f.y - h11 * f.dy * k;
      }
      return out;
    };
    // The bridge crosses only paper (no other line), and the faded sketch
    // stroke still shows along at least a third of it.
    const traceAcross = (e: End, f: End, d: number) => {
      const path = hermite(e, f, d, 1);
      const near = halfW * 2 + 2;
      let faint = 0;
      let count = 0;
      for (let q = 0; q < path.length; q += 2) {
        const x = path[q];
        const y = path[q + 1];
        const ix = x | 0;
        const iy = y | 0;
        if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
        const i = iy * w + ix;
        if (Math.hypot(x - e.x, y - e.y) < near || Math.hypot(x - f.x, y - f.y) < near) continue;
        if (region[i]) return false;
        count++;
        if (blur[i] >= hi * 0.2) faint++;
      }
      return count === 0 || faint >= count * 0.33;
    };
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i];
      for (let j = i + 1; j < ends.length; j++) {
        const f = ends[j];
        const vx = f.x - e.x;
        const vy = f.y - e.y;
        if (Math.abs(vx) > farGap || Math.abs(vy) > farGap) continue;
        const d = Math.hypot(vx, vy);
        if (d > farGap) continue;
        if (d > p.gapPx) {
          // A longer break, between two long pieces of one line that carry
          // straight on into each other, with a trace of the sketch stroke
          // across it (it faded out) or nothing drawn across it.
          if (e.s === f.s || (isMark(e.s) && isMark(f.s))) continue;
          const le = polyLength(e.s.pts);
          const lf = polyLength(f.s.pts);
          if (Math.min(le, lf) < d || Math.max(le, lf) < d * 3) continue;
          const ce = (e.dx * vx + e.dy * vy) / d;
          const cf = -(f.dx * vx + f.dy * vy) / d;
          if (ce < 0.96 || cf < 0.96 || -(e.dx * f.dx + e.dy * f.dy) < 0.92) continue;
          if (!traceAcross(e, f, d)) continue;
          pairs.push({ i, j, score: 1000 + d * (3 - ce - cf) });
          continue;
        }
        // small pieces (a whisker, a mouth) only close a gap small for them
        if (d > 0.3 * Math.min(polyLength(e.s.pts), polyLength(f.s.pts)) + 2) continue;
        // two little marks (a nose and a mouth) never become one
        const marks = e.s !== f.s ? (isMark(e.s) ? 1 : 0) + (isMark(f.s) ? 1 : 0) : 0;
        if (marks === 2) continue;
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
        if (marks && (ce < 0.9 || cf < 0.9)) continue;
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
      const gap = Math.hypot(f.x - e.x, f.y - e.y);
      const bridge = gap > 4 && skip === 0 ? hermite(e, f, gap, 2) : new Float32Array(0);
      const merged: S = {
        pts: concat(concat(first, bridge), second),
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
      sizeOf.set(merged, Math.max(sizeOf.get(e.s) ?? 0, sizeOf.get(f.s) ?? 0));
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
      if (isMark(e.s)) continue; // a whisker or a mouth stays where it was drawn
      const si = list.indexOf(e.s);
      const ownLen = polyLength(e.s.pts);
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
            if (d > Math.min(p.gapPx, ownLen * 0.3 + 2) || d < 0.5) continue;
            const c = (e.dx * vx + e.dy * vy) / d;
            if (c < 0.6) continue;
            // running alongside the other line rather than meeting it
            {
              const m = o.pts.length;
              const k0 = Math.max(0, ok - 8);
              const k1 = Math.min(m - 2, ok + 8);
              const tx = o.pts[k1] - o.pts[k0];
              const ty = o.pts[k1 + 1] - o.pts[k0 + 1];
              const tl = Math.hypot(tx, ty);
              if (tl > 2 && Math.abs(e.dx * tx + e.dy * ty) / tl > 0.9 && Math.abs(e.dx * vy - e.dy * vx) > halfW) continue;
            }
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


  // 5a. A line that heads straight at another line and stops a little short
  // of it (further than the snap above reaches) is carried on until it
  // meets it — a T-join — when nothing else is in the way and it meets the
  // line rather than running alongside it.
  {
    const lab = new Int32Array(w * h);
    const paint = (si: number, ax: number, ay: number, bx: number, by: number) => {
      const L = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(L * 2));
      for (let k = 0; k <= n; k++) {
        const x = (ax + ((bx - ax) * k) / n) | 0;
        const y = (ay + ((by - ay) * k) / n) | 0;
        if (x >= 0 && y >= 0 && x < w && y < h) lab[y * w + x] = si + 1;
      }
    };
    list.forEach((s, si) => {
      const q = s.pts;
      for (let k = 2; k < q.length; k += 2) paint(si, q[k - 2], q[k - 1], q[k], q[k + 1]);
      if (s.closed && q.length > 4) paint(si, q[q.length - 2], q[q.length - 1], q[0], q[1]);
    });
    const tReach = p.gapPx * 1.6;
    const body = Math.max(6, halfW * 4);
    for (const e of freeEnds()) {
      if (isMark(e.s)) continue;
      const si = list.indexOf(e.s);
      const own = polyLength(e.s.pts);
      if (own < p.gapPx * 2) continue;
      // the end has to head somewhere: its last stretch straight
      const far = endDir(e.s.pts, e.end, body * 2);
      if (e.dx * far[0] + e.dy * far[1] < 0.9) continue;
      let hit = -1;
      let ht = 0;
      for (let t = 1; t <= tReach && hit < 0; t += 0.5) {
        const x = e.x + e.dx * t;
        const y = e.y + e.dy * t;
        const ix = x | 0;
        const iy = y | 0;
        if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) break;
        for (const o of [0, 1, -1, w, -w]) {
          const v = lab[iy * w + ix + o] - 1;
          if (v < 0) continue;
          if (v === si && t < halfW * 3) continue; // its own end
          hit = v;
          ht = t;
          break;
        }
      }
      if (hit < 0 || ht < 1.5) continue; // nothing there, or it already touches
      const o = list[hit];
      const hx = e.x + e.dx * ht;
      const hy = e.y + e.dy * ht;
      // the nearest point of that line, and its direction there
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < o.pts.length; k += 2) {
        const d = Math.hypot(o.pts[k] - hx, o.pts[k + 1] - hy);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best < 0 || bd > 3) continue;
      if (hit === si && Math.abs(best - (e.end === 0 ? 0 : e.s.pts.length - 2)) / 2 < p.gapPx * 2.5) continue;
      const k0 = Math.max(0, best - 8);
      const k1 = Math.min(o.pts.length - 2, best + 8);
      const tx = o.pts[k1] - o.pts[k0];
      const ty = o.pts[k1 + 1] - o.pts[k0 + 1];
      const tl = Math.hypot(tx, ty);
      if (tl < 2 || Math.abs(e.dx * tx + e.dy * ty) / tl > Math.cos((35 * Math.PI) / 180)) continue;
      // only across paper: no sketch ink of another line on the way
      let clear = true;
      for (let t = halfW * 2; t < ht - halfW * 1.5 && clear; t += 1) {
        const ix = (e.x + e.dx * t) | 0;
        const iy = (e.y + e.dy * t) | 0;
        if (region[iy * w + ix]) clear = false;
      }
      if (!clear) continue;
      const tip = Float32Array.of(o.pts[best], o.pts[best + 1]);
      e.s.pts = e.end === 0 ? concat(tip, e.s.pts) : concat(e.s.pts, tip);
      paint(si, e.x, e.y, o.pts[best], o.pts[best + 1]);
    }
  }

  // 5b. The outer frame: one closed, smooth line; lines inside that met the
  // frame are carried onto the new frame line.
  onStep?.("frame");
  let frameLines: { pts: Float32Array; closed: boolean }[] = [];
  {
    const fr = findFrame(list.map((s) => ({ pts: s.pts, closed: s.closed })), region, w, h, halfW, p.gapPx, blur);
    if (fr) {
      frameLines = fr.lines;
      const loop = concat(new Float32Array(0), Float32Array.from(fr.lines.flatMap((l) => Array.from(l.pts))));
      const cell = 16;
      const gw = Math.ceil(w / cell) + 2;
      const grid = new Map<number, number[]>();
      const ln = loop.length / 2;
      for (let k = 0; k < ln; k++) {
        const key = (Math.floor(loop[k * 2 + 1] / cell) + 1) * gw + Math.floor(loop[k * 2] / cell) + 1;
        const b = grid.get(key);
        if (b) b.push(k);
        else grid.set(key, [k]);
      }
      // nearest point of the frame line within `reach`
      const nearest = (x: number, y: number, reach: number): [number, number] => {
        const c = Math.ceil(reach / cell);
        const gx = Math.floor(x / cell) + 1;
        const gy = Math.floor(y / cell) + 1;
        let best = -1;
        let bd = reach;
        for (let yy = gy - c; yy <= gy + c; yy++) {
          for (let xx = gx - c; xx <= gx + c; xx++) {
            const b = grid.get(yy * gw + xx);
            if (!b) continue;
            for (const k of b) {
              const d = Math.hypot(loop[k * 2] - x, loop[k * 2 + 1] - y);
              if (d < bd) {
                bd = d;
                best = k;
              }
            }
          }
        }
        return [best, bd];
      };
      const hug = halfW * 1.2 + 1;
      const newList: S[] = [];
      for (const piece of fr.rest) {
        const src = list[piece.from];
        let pts = piece.pts;
        const whole = pts === src.pts;
        const closed = whole && src.closed;
        let a = whole ? src.a : piece.cutStart ? -1 : src.a;
        let b = whole ? src.b : piece.cutEnd ? -1 : src.b;
        if (!closed && !whole) {
          // Where the frame took over the end of a line (a mat's corner
          // that the frame runs on along), the line goes on along its own
          // path until it reaches the new frame line.
          const sp = src.pts;
          const sm = sp.length / 2;
          const maxExt = p.gapPx * 4;
          for (const end of [0, 1] as const) {
            if (!(end === 0 ? piece.cutStart : piece.cutEnd)) continue;
            const m0 = pts.length / 2;
            const k = end === 0 ? 0 : m0 - 1;
            const ex = pts[k * 2];
            const ey = pts[k * 2 + 1];
            if (nearest(ex, ey, hug)[0] >= 0) continue;
            let j = -1;
            for (let q = 0; q < sm; q++) if (sp[q * 2] === ex && sp[q * 2 + 1] === ey) j = q;
            if (j < 0) continue;
            const add: number[] = [];
            let run = 0;
            let reached = false;
            for (let q = 1; q < sm && run < maxExt; q++) {
              let t = end === 1 ? j + q : j - q;
              if (src.closed) t = ((t % sm) + sm) % sm;
              else if (t < 0 || t >= sm) break;
              const px = add.length ? add[add.length - 2] : ex;
              const py = add.length ? add[add.length - 1] : ey;
              run += Math.hypot(sp[t * 2] - px, sp[t * 2 + 1] - py);
              add.push(sp[t * 2], sp[t * 2 + 1]);
              if (nearest(sp[t * 2], sp[t * 2 + 1], hug * 0.7)[0] >= 0) {
                reached = true;
                break;
              }
            }
            if (!reached) continue;
            if (end === 1) pts = concat(pts, Float32Array.from(add));
            else pts = concat(reversed(Float32Array.from(add)), pts);
          }
        }
        if (!closed) {
          // A second, shorter try at the frame drawn right beside it: the
          // frame line stands for it.
          let beside = true;
          for (let q = 0; q < pts.length && beside; q += 2) if (nearest(pts[q], pts[q + 1], halfW * 2.5 + 2)[0] < 0) beside = false;
          if (beside) continue;
          // Drop what runs along the frame (a second stroke of the frame, or a
          // line's last bit already lying on it) from either end.
          let m = pts.length / 2;
          let i0 = 0;
          let i1 = m - 1;
          while (i0 <= i1 && nearest(pts[i0 * 2], pts[i0 * 2 + 1], hug)[0] >= 0) i0++;
          while (i1 >= i0 && nearest(pts[i1 * 2], pts[i1 * 2 + 1], hug)[0] >= 0) i1--;
          if (i1 - i0 < 2) continue;
          const touchedStart = i0 > 0 || (piece.cutStart && !whole);
          const touchedEnd = i1 < m - 1 || (piece.cutEnd && !whole);
          pts = pts.slice(i0 * 2, i1 * 2 + 2);
          m = pts.length / 2;
          // Ends that met the frame (or stop just short of it) go on to it.
          for (const end of [0, 1] as const) {
            const touched = end === 0 ? touchedStart : touchedEnd;
            const k = end === 0 ? 0 : m - 1;
            const ex = pts[k * 2];
            const ey = pts[k * 2 + 1];
            const reach = touched ? hug * 2.5 : Math.max(hug + 2, p.gapPx);
            if (!touched && (end === 0 ? a : b) >= 0) continue;
            const [nk, nd] = nearest(ex, ey, reach);
            if (nk < 0) continue;
            const [dx, dy] = endDir(pts, end, Math.max(6, halfW * 3));
            // carry on along the line's own direction until it meets the frame
            let tip: [number, number] = [loop[nk * 2], loop[nk * 2 + 1]];
            if (!touched && (dx * (tip[0] - ex) + dy * (tip[1] - ey)) / (nd || 1) < 0.5) continue;
            let best = nd;
            // (not a long way round: then straight onto the nearest point)
            for (let t = 0.5; t < Math.min(reach * 1.5, nd * 1.6 + 3); t += 0.5) {
              const [qk, qd] = nearest(ex + dx * t, ey + dy * t, 3);
              if (qk >= 0 && qd < best) {
                best = qd;
                tip = [loop[qk * 2], loop[qk * 2 + 1]];
                if (qd < 0.75) break;
              }
            }
            const tp = Float32Array.of(tip[0], tip[1]);
            pts = end === 0 ? concat(tp, pts) : concat(pts, tp);
            if (end === 0) a = -3;
            else b = -3;
          }
        }
        const nn = pts.length / 2;
        newList.push({ pts, a, b, closed, dead: false, wsum: (src.wsum / Math.max(1, src.wn)) * nn, wn: nn });
      }
      list = newList;
      if (frameLines.length === 1 && frameLines[0].closed) {
        // A faint second try at the frame sketched just outside it: the
        // frame line replaces it.
        const fl = frameLines[0].pts;
        const fn = fl.length / 2;
        const insideFrame = (x: number, y: number) => {
          let inside = false;
          for (let i = 0, j = fn - 1; i < fn; j = i++) {
            const yi = fl[i * 2 + 1];
            const yj = fl[j * 2 + 1];
            if (yi > y !== yj > y && x < ((fl[j * 2] - fl[i * 2]) * (y - yi)) / (yj - yi) + fl[i * 2]) inside = !inside;
          }
          return inside;
        };
        const near = halfW * 8;
        list = list.filter((st) => {
          const m = st.pts.length / 2;
          let ins = 0;
          for (const k of [0, m >> 2, m >> 1, (m * 3) >> 2, m - 1]) if (insideFrame(st.pts[k * 2], st.pts[k * 2 + 1])) ins++;
          if (ins >= 3) return true;
          for (let k = 0; k < m; k += 3) if (nearest(st.pts[k * 2], st.pts[k * 2 + 1], near)[0] < 0) return true;
          return false;
        });
      }
      // An open frame line that stops where something stands in front of the
      // frame goes on to meet that thing's outline.
      for (const fl of frameLines) {
        if (fl.closed) continue;
        for (const end of [0, 1] as const) {
          const m = fl.pts.length / 2;
          const k = end === 0 ? 0 : m - 1;
          const ex = fl.pts[k * 2];
          const ey = fl.pts[k * 2 + 1];
          const [dx, dy] = endDir(fl.pts, end, Math.max(8, halfW * 3));
          const reach = halfW * 5 + 4;
          let best: [number, number] | null = null;
          let bd = reach;
          for (const st of list) {
            const q = st.pts;
            for (let i = 0; i < q.length; i += 2) {
              const vx = q[i] - ex;
              const vy = q[i + 1] - ey;
              if (Math.abs(vx) > bd || Math.abs(vy) > bd) continue;
              const d = Math.hypot(vx, vy);
              if (d < bd && d > 0.5 && (vx * dx + vy * dy) / d > 0.7) {
                bd = d;
                best = [q[i], q[i + 1]];
              }
            }
          }
          if (best) {
            const tp = Float32Array.of(best[0], best[1]);
            fl.pts = end === 0 ? concat(tp, fl.pts) : concat(fl.pts, tp);
          }
        }
      }
    }
  }

  // 6. Drop crumbs, smooth what's left.
  onStep?.("smooth");
  const out: Stroke[] = [];
  const small: boolean[] = [];
  const finalSize = markSize(list, Math.max(3, halfW));
  list.forEach((s, si) => {
    const len = polyLength(s.pts);
    if (len < p.minLengthPx && s.a === -1 && s.b === -1) return;
    if (len < 3) return;
    small.push(finalSize[si] < halfW * 8);
    out.push({
      pts: inkStroke(s.pts, s.closed, {
        sigma: Math.min(p.smoothPx, halfW) * 0.5,
        k: Math.max(3, Math.round(halfW * 0.7)),
        maxTol: Math.max(1.5, p.smoothPx * 0.6),
        minLen: Math.max(40, p.smoothPx * 7),
        curveTol: Math.max(1, p.smoothPx * 0.5),
        jog: halfW * 1.6,
      }),
      closed: s.closed,
      weight: s.wsum / Math.max(1, s.wn),
    });
  });
  // Smoothing moves a line a little off where it was drawn, so an end that
  // met it (or all but met it) can be left a hair short: it goes on to meet
  // it again.
  {
    const targets: Float32Array[] = [...out.map((o) => o.pts), ...frameLines.map((f) => f.pts)];
    const cell = 16;
    const gw = Math.ceil(w / cell) + 2;
    const grid = new Map<number, number[]>();
    targets.forEach((q, ti) => {
      for (let k = 0; k < q.length; k += 2) {
        const key = (Math.floor(q[k + 1] / cell) + 1) * gw + Math.floor(q[k] / cell) + 1;
        const b = grid.get(key);
        if (b) b.push(ti, k);
        else grid.set(key, [ti, k]);
      }
    });
    const reach = halfW + 3;
    out.forEach((o, oi) => {
      if (o.closed) return;
      const q = o.pts;
      const m = q.length / 2;
      if (m < 2 || polyLength(q) < reach * 2) return;
      for (const end of [0, 1] as const) {
        const k = end === 0 ? 0 : m - 1;
        const ex = q[k * 2];
        const ey = q[k * 2 + 1];
        const [dx, dy] = endDir(q, end, Math.max(6, halfW * 2));
        let best = -1;
        let bt = -1;
        let bd = reach;
        const gx = Math.floor(ex / cell) + 1;
        const gy = Math.floor(ey / cell) + 1;
        for (let yy = gy - 1; yy <= gy + 1; yy++) {
          for (let xx = gx - 1; xx <= gx + 1; xx++) {
            const b = grid.get(yy * gw + xx);
            if (!b) continue;
            for (let j = 0; j < b.length; j += 2) {
              const ti = b[j];
              const tk = b[j + 1];
              if (ti === oi && Math.abs(tk / 2 - k) < reach * 3) continue;
              const t = targets[ti];
              const vx = t[tk] - ex;
              const vy = t[tk + 1] - ey;
              const d = Math.hypot(vx, vy);
              if (d >= bd || d < 0.75) continue;
              // ahead of the end; a small mark only where it all but touches
              const ok = d < halfW * 0.7 || (!small[oi] && (dx * vx + dy * vy) / d > 0.3);
              if (!ok) continue;
              bd = d;
              best = tk;
              bt = ti;
            }
          }
        }
        if (best < 0) continue;
        const tip = Float32Array.of(targets[bt][best], targets[bt][best + 1]);
        o.pts = end === 0 ? concat(tip, o.pts) : concat(o.pts, tip);
        targets[oi] = o.pts;
      }
    });
  }
  for (const fl of frameLines) out.unshift({ pts: fl.pts, closed: fl.closed, weight: halfW, role: "frame" });
  return { strokes: [...out, ...dots], sketchWidthPx: halfW * 2 };
}
