// Line art picture → vector outlines ("chuyển line sang vector").
//
// The picture is read as an "ink" map (0 paper … 1 line). The edge of every
// line is then found *between* pixels — marching squares on the ink map at
// the chosen level — so the soft anti-aliased edge of a line gives an exact
// position (no stair-steps, thin lines stay as thin as they were drawn, a
// tapered brush stroke keeps its taper). Each outline is then fitted with
// cubic Béziers (Schneider's curve fitting, "An Algorithm for Automatically
// Fitting Digitized Curves", Graphics Gems) with sharp corners kept where
// the outline really turns, so a line comes out as a few smooth nodes
// instead of thousands of tiny segments.
//
// Pure typed-array maths with no imports, so it runs in a Web Worker (iPad
// included) and in Node for the tests.

export type TraceParams = {
  level: number; // 0..1 — ink level the edge is put at. 0.5 = middle of the soft edge; lower = bolder lines
  blurPx: number; // gaussian σ applied before the edge is found (takes out grain / JPEG noise)
  minAreaPx: number; // specks and pin-holes with a smaller area are dropped
  tolerancePx: number; // the curves may stray this far from the traced edge
  cornerDeg: number; // turns sharper than this stay sharp corners (180 = never)
  smoothPx?: number; // smoothing along the path before it is fitted (0 = none): takes the pixel steps out of a hard-edged line
  cornerClearPx?: number; // a corner's tip is read from the straight edges this much further from it (a band's inside corner is not where its middle is)
};

// One traced edge before curve fitting: x,y pairs (last point is not a copy of
// the first). `area` is signed: negative = outer edge of a line, positive =
// the edge of a hole in it (the ink is always on the same side of the walk).
export type Loop = { pts: Float32Array; area: number };

// A closed outline as cubic Béziers: x0,y0 then, per segment,
// c1x,c1y, c2x,c2y, x,y. The last segment ends on x0,y0.
export type Outline = Float32Array;

// `closed[i]`: outline i is a loop (a filled shape's edge) rather than an open
// line. `maxDevPx`: the largest distance between a curve and the edge it was
// fitted to — the tool shows this so a conversion can be trusted.
export type TraceResult = { outlines: Outline[]; closed: boolean[]; nodes: number; islands: number; holes: number; maxDevPx: number };

// ---------------------------------------------------------------- blur

export function blurField(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src;
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += k[i + r];
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  // Edges repeat the last pixel: a line that runs off the picture keeps going.
  const tmp = new Float32Array(w * h);
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
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let j = -r; j <= r; j++) {
      const yy = y + j < 0 ? 0 : y + j >= h ? h - 1 : y + j;
      const kj = k[j + r];
      const s = yy * w;
      for (let x = 0; x < w; x++) out[o + x] += kj * tmp[s + x];
    }
  }
  return out;
}

// ------------------------------------------------- marching squares loops

// Cell corners: a top-left (bit 1), b top-right (2), c bottom-right (4),
// d bottom-left (8). Cell edges: 0 top, 1 right, 2 bottom, 3 left. The walk
// keeps the ink on its left (y pointing down), so an edge is "entered" or
// "left" by the walk depending on which end of it is ink.
// EXIT[(case * 2 + centreIsInk) * 4 + entryEdge] = the edge the walk leaves by.
const EXIT = new Uint8Array(16 * 2 * 4).fill(255);
(function buildTable() {
  for (let cs = 1; cs < 15; cs++) {
    const a = cs & 1;
    const b = (cs >> 1) & 1;
    const c = (cs >> 2) & 1;
    const d = (cs >> 3) & 1;
    const role = [0, 0, 0, 0]; // 1 = walk comes in here, 2 = walk goes out here
    if (a !== b) role[0] = a ? 2 : 1;
    if (b !== c) role[1] = b ? 2 : 1;
    if (d !== c) role[2] = d ? 1 : 2;
    if (a !== d) role[3] = a ? 1 : 2;
    const set = (centre: number, from: number, to: number) => {
      EXIT[(cs * 2 + centre) * 4 + from] = to;
    };
    const ins = [0, 1, 2, 3].filter((e) => role[e] === 1);
    const outs = [0, 1, 2, 3].filter((e) => role[e] === 2);
    if (ins.length === 1) {
      set(0, ins[0], outs[0]);
      set(1, ins[0], outs[0]);
    } else if (cs === 5) {
      // ink at top-left and bottom-right
      set(1, 1, 0); // joined through the middle: the two paper corners are cut off
      set(1, 3, 2);
      set(0, 3, 0); // split in two: each ink corner is cut off
      set(0, 1, 2);
    } else {
      // case 10: ink at top-right and bottom-left
      set(1, 0, 3);
      set(1, 2, 1);
      set(0, 0, 1);
      set(0, 2, 3);
    }
  }
})();

// Every edge of the ink, as closed loops. Outside the picture counts as paper,
// so a line running off the page is closed along the page edge.
export function findLoops(f: Float32Array, w: number, h: number, level: number): Loop[] {
  const cw = w + 1;
  const ch = h + 1;
  const cells = new Uint8Array(cw * ch); // low 4 bits: corner case; high 4 bits: entry edges already walked
  const prev = new Uint8Array(w + 2);
  const cur = new Uint8Array(w + 2);
  for (let j = 0; j < ch; j++) {
    if (j < h) {
      const base = j * w;
      for (let x = 0; x < w; x++) cur[x + 1] = f[base + x] >= level ? 1 : 0;
    } else cur.fill(0);
    const row = j * cw;
    for (let i = 0; i < cw; i++) cells[row + i] = prev[i] | (prev[i + 1] << 1) | (cur[i + 1] << 2) | (cur[i] << 3);
    prev.set(cur);
  }

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : f[y * w + x]);
  const loops: Loop[] = [];
  const limit = cw * ch * 2 + 16;

  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const cs0 = cells[j * cw + i] & 15;
      if (cs0 === 0 || cs0 === 15) continue;
      for (let e0 = 0; e0 < 4; e0++) {
        if (cells[j * cw + i] & (16 << e0)) continue;
        let ci = i;
        let cj = j;
        let e = e0;
        // does the cell have a stretch of edge entered by e0?
        {
          const va = at(ci - 1, cj - 1);
          const vb = at(ci, cj - 1);
          const vc = at(ci, cj);
          const vd = at(ci - 1, cj);
          const centre = cs0 === 5 || cs0 === 10 ? ((va + vb + vc + vd) / 4 >= level ? 1 : 0) : 0;
          if (EXIT[(cs0 * 2 + centre) * 4 + e0] === 255) continue;
        }
        const pts: number[] = [];
        let steps = 0;
        do {
          const idx = cj * cw + ci;
          const cs = cells[idx] & 15;
          cells[idx] |= 16 << e;
          const va = at(ci - 1, cj - 1);
          const vb = at(ci, cj - 1);
          const vc = at(ci, cj);
          const vd = at(ci - 1, cj);
          const centre = cs === 5 || cs === 10 ? ((va + vb + vc + vd) / 4 >= level ? 1 : 0) : 0;
          const ex = EXIT[(cs * 2 + centre) * 4 + e];
          if (ex === 255 || ++steps > limit) throw new Error("Không dò được viền hình này.");
          let x: number;
          let y: number;
          if (ex === 0) {
            x = ci - 1 + (level - va) / (vb - va);
            y = cj - 1;
          } else if (ex === 1) {
            x = ci;
            y = cj - 1 + (level - vb) / (vc - vb);
          } else if (ex === 2) {
            x = ci - 1 + (level - vd) / (vc - vd);
            y = cj;
          } else {
            x = ci - 1;
            y = cj - 1 + (level - va) / (vd - va);
          }
          // sample (x, y) sits at the middle of pixel (x, y)
          x += 0.5;
          y += 0.5;
          pts.push(x < 0 ? 0 : x > w ? w : x, y < 0 ? 0 : y > h ? h : y);
          if (ex === 0) {
            cj--;
            e = 2;
          } else if (ex === 1) {
            ci++;
            e = 3;
          } else if (ex === 2) {
            cj++;
            e = 0;
          } else {
            ci--;
            e = 1;
          }
        } while (ci !== i || cj !== j || e !== e0);
        const n = pts.length / 2;
        let area = 0;
        for (let k = 0; k < n; k++) {
          const k2 = k + 1 === n ? 0 : k + 1;
          area += pts[k * 2] * pts[k2 * 2 + 1] - pts[k2 * 2] * pts[k * 2 + 1];
        }
        loops.push({ pts: Float32Array.from(pts), area: area / 2 });
      }
    }
  }
  return loops;
}

// ------------------------------------------------------ Bézier fitting

type Fit = {
  px: Float64Array; // the stretch being fitted, x,y pairs
  u: Float64Array;
  v: Float64Array;
  bz: Float64Array; // current curve: x0,y0, c1, c2, x3,y3
  split: number;
  worst: number; // largest squared distance from a curve that was kept to the points it stands for
};

function bezier(b: Float64Array, t: number, o: Float64Array) {
  const s = 1 - t;
  const b0 = s * s * s;
  const b1 = 3 * s * s * t;
  const b2 = 3 * s * t * t;
  const b3 = t * t * t;
  o[0] = b0 * b[0] + b1 * b[2] + b2 * b[4] + b3 * b[6];
  o[1] = b0 * b[1] + b1 * b[3] + b2 * b[5] + b3 * b[7];
}

const tmp2 = new Float64Array(2);

function chordParams(F: Fit, first: number, last: number) {
  const p = F.px;
  F.u[first] = 0;
  for (let i = first + 1; i <= last; i++) F.u[i] = F.u[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
  const total = F.u[last] || 1;
  for (let i = first + 1; i <= last; i++) F.u[i] /= total;
  F.u[last] = 1;
}

// Least-squares lengths for the two handles, the curve leaving along t1 and
// arriving along t2 (t2 points back into the stretch).
function generate(F: Fit, first: number, last: number, u: Float64Array, t1x: number, t1y: number, t2x: number, t2y: number) {
  const p = F.px;
  const x0 = p[first * 2];
  const y0 = p[first * 2 + 1];
  const x3 = p[last * 2];
  const y3 = p[last * 2 + 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let xa = 0;
  let xb = 0;
  for (let i = first; i <= last; i++) {
    const t = u[i];
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * t * s * s;
    const b2 = 3 * t * t * s;
    const b3 = t * t * t;
    const a1x = t1x * b1;
    const a1y = t1y * b1;
    const a2x = t2x * b2;
    const a2y = t2y * b2;
    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;
    const rx = p[i * 2] - ((b0 + b1) * x0 + (b2 + b3) * x3);
    const ry = p[i * 2 + 1] - ((b0 + b1) * y0 + (b2 + b3) * y3);
    xa += a1x * rx + a1y * ry;
    xb += a2x * rx + a2y * ry;
  }
  const det = c00 * c11 - c01 * c01;
  let al = det === 0 ? 0 : (xa * c11 - xb * c01) / det;
  let ar = det === 0 ? 0 : (c00 * xb - c01 * xa) / det;
  const seg = Math.hypot(x3 - x0, y3 - y0);
  // A handle that came out backwards or absurdly long: fall back to a third of the chord.
  if (al < 1e-6 * seg || ar < 1e-6 * seg || al > seg * 2 || ar > seg * 2) al = ar = seg / 3;
  const b = F.bz;
  b[0] = x0;
  b[1] = y0;
  b[2] = x0 + t1x * al;
  b[3] = y0 + t1y * al;
  b[4] = x3 + t2x * ar;
  b[5] = y3 + t2y * ar;
  b[6] = x3;
  b[7] = y3;
}

// Largest squared distance between the points and the curve (at their
// parameters); F.split is the point where it happens.
function maxError(F: Fit, first: number, last: number, u: Float64Array): number {
  let worst = 0;
  F.split = (first + last) >> 1;
  for (let i = first + 1; i < last; i++) {
    bezier(F.bz, u[i], tmp2);
    const dx = tmp2[0] - F.px[i * 2];
    const dy = tmp2[1] - F.px[i * 2 + 1];
    const d = dx * dx + dy * dy;
    if (d >= worst) {
      worst = d;
      F.split = i;
    }
  }
  return worst;
}

// One Newton–Raphson step per point towards the nearest spot on the curve.
function reparameterize(F: Fit, first: number, last: number) {
  const b = F.bz;
  const p = F.px;
  const q1x0 = (b[2] - b[0]) * 3;
  const q1y0 = (b[3] - b[1]) * 3;
  const q1x1 = (b[4] - b[2]) * 3;
  const q1y1 = (b[5] - b[3]) * 3;
  const q1x2 = (b[6] - b[4]) * 3;
  const q1y2 = (b[7] - b[5]) * 3;
  const q2x0 = (q1x1 - q1x0) * 2;
  const q2y0 = (q1y1 - q1y0) * 2;
  const q2x1 = (q1x2 - q1x1) * 2;
  const q2y1 = (q1y2 - q1y1) * 2;
  for (let i = first; i <= last; i++) {
    const t = F.u[i];
    const s = 1 - t;
    bezier(b, t, tmp2);
    const ex = tmp2[0] - p[i * 2];
    const ey = tmp2[1] - p[i * 2 + 1];
    const d1x = s * s * q1x0 + 2 * s * t * q1x1 + t * t * q1x2;
    const d1y = s * s * q1y0 + 2 * s * t * q1y1 + t * t * q1y2;
    const d2x = s * q2x0 + t * q2x1;
    const d2y = s * q2y0 + t * q2y1;
    const num = ex * d1x + ey * d1y;
    const den = d1x * d1x + d1y * d1y + ex * d2x + ey * d2y;
    let nt = den === 0 ? t : t - num / den;
    if (!(nt >= 0)) nt = 0;
    else if (nt > 1) nt = 1;
    F.v[i] = nt;
  }
  F.v[first] = 0;
  F.v[last] = 1;
}

// Fits the stretch with as few cubic Béziers as stay within `tol`, pushing
// each curve's c1, c2 and end point onto `out`. Corners keep their own
// tangents; where a stretch has to be cut, the cut point gets one shared
// tangent so the curve stays smooth through it.
function fitStretch(F: Fit, m: number, tol: number, t1x: number, t1y: number, t2x: number, t2y: number, out: number[]) {
  const err2 = tol * tol;
  const iterate2 = err2 * 16;
  const todo: number[] = [0, m - 1, t1x, t1y, t2x, t2y];
  const p = F.px;
  while (todo.length) {
    const ty2 = todo.pop()!;
    const tx2 = todo.pop()!;
    const ty1 = todo.pop()!;
    const tx1 = todo.pop()!;
    const last = todo.pop()!;
    const first = todo.pop()!;
    if (last - first === 1) {
      const d = Math.hypot(p[last * 2] - p[first * 2], p[last * 2 + 1] - p[first * 2 + 1]) / 3;
      out.push(p[first * 2] + tx1 * d, p[first * 2 + 1] + ty1 * d, p[last * 2] + tx2 * d, p[last * 2 + 1] + ty2 * d, p[last * 2], p[last * 2 + 1]);
      continue;
    }
    // A stretch that really is straight (a frame, a ruled edge) stays a
    // straight segment — as long as the neighbouring curves arrive along it.
    {
      const cx = p[last * 2] - p[first * 2];
      const cy = p[last * 2 + 1] - p[first * 2 + 1];
      const cl = Math.hypot(cx, cy);
      if (cl > 0) {
        const ux = cx / cl;
        const uy = cy / cl;
        let off = 0;
        for (let i = first + 1; i < last; i++) {
          const d = Math.abs((p[i * 2] - p[first * 2]) * uy - (p[i * 2 + 1] - p[first * 2 + 1]) * ux);
          if (d > off) off = d;
        }
        if (off <= Math.min(0.12, tol * 0.4) && tx1 * ux + ty1 * uy > 0.9976 && -(tx2 * ux + ty2 * uy) > 0.9976) {
          out.push(
            p[first * 2] + cx / 3,
            p[first * 2 + 1] + cy / 3,
            p[first * 2] + (cx * 2) / 3,
            p[first * 2 + 1] + (cy * 2) / 3,
            p[last * 2],
            p[last * 2 + 1],
          );
          if (off * off > F.worst) F.worst = off * off;
          continue;
        }
      }
    }
    chordParams(F, first, last);
    generate(F, first, last, F.u, tx1, ty1, tx2, ty2);
    let err = maxError(F, first, last, F.u);
    if (err >= err2 && err < iterate2) {
      for (let k = 0; k < 4 && err >= err2; k++) {
        reparameterize(F, first, last); // new parameters land in F.v …
        const swap = F.u;
        F.u = F.v; // … and become the current ones
        F.v = swap;
        generate(F, first, last, F.u, tx1, ty1, tx2, ty2);
        err = maxError(F, first, last, F.u);
      }
    }
    if (err < err2) {
      const b = F.bz;
      out.push(b[2], b[3], b[4], b[5], b[6], b[7]);
      if (err > F.worst) F.worst = err;
      continue;
    }
    // Too far off: cut at the worst point, smooth through the cut.
    const s = F.split;
    const w = Math.max(1, Math.min(3, s - first, last - s));
    let cx = p[(s - w) * 2] - p[(s + w) * 2];
    let cy = p[(s - w) * 2 + 1] - p[(s + w) * 2 + 1];
    const cl = Math.hypot(cx, cy) || 1;
    cx /= cl;
    cy /= cl;
    // the second half is done first so the curves come out in order
    todo.push(s, last, -cx, -cy, tx2, ty2);
    todo.push(first, s, tx1, ty1, cx, cy);
  }
}

// ------------------------------------------------- one path → curves

type PathNode = { idx: number; corner: boolean; end?: boolean };
type Apex = { x: number; y: number; ix: number; iy: number; ox: number; oy: number };

function tidy(raw: ArrayLike<number>, closed: boolean) {
  // drop points sitting on top of each other
  const n0 = raw.length / 2;
  const xs = new Float64Array(n0);
  const ys = new Float64Array(n0);
  let n = 0;
  for (let i = 0; i < n0; i++) {
    const x = raw[i * 2];
    const y = raw[i * 2 + 1];
    if (n > 0 && Math.hypot(x - xs[n - 1], y - ys[n - 1]) < 0.02) continue;
    xs[n] = x;
    ys[n] = y;
    n++;
  }
  if (closed) while (n > 1 && Math.hypot(xs[n - 1] - xs[0], ys[n - 1] - ys[0]) < 0.02) n--;
  return { xs, ys, n };
}

// Gaussian smoothing along the path, in place. The ends of an open path stay put.
function smoothAlong(xs: Float64Array, ys: Float64Array, n: number, closed: boolean, sigma: number) {
  if (n < 6 || sigma < 0.3) return;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = i + 1 === n ? 0 : i + 1;
    cum[i + 1] = cum[i] + Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
  }
  const total = closed ? cum[n] : cum[n - 1];
  if (total < sigma * 6) return;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const reach = sigma * 2.5;
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) {
      nx[i] = xs[i];
      ny[i] = ys[i];
      continue;
    }
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (let dir = -1; dir <= 1; dir += 2) {
      for (let k = dir === -1 ? 1 : 0, j = i + (dir === -1 ? -1 : 0); k < n; k++, j += dir) {
        let jj = j;
        if (closed) jj = ((j % n) + n) % n;
        else if (jj < 0 || jj >= n) break;
        let d = dir === -1 ? cum[i] - cum[jj] : cum[jj] - cum[i];
        if (closed && d < 0) d += total;
        if (d > reach) break;
        const wgt = Math.exp(-(d * d) / (2 * sigma * sigma));
        sw += wgt;
        sx += wgt * xs[jj];
        sy += wgt * ys[jj];
      }
    }
    nx[i] = sx / sw;
    ny[i] = sy / sw;
  }
  xs.set(nx);
  ys.set(ny);
}

function newFit(): Fit {
  return { px: new Float64Array(0), u: new Float64Array(0), v: new Float64Array(0), bz: new Float64Array(8), split: 0, worst: 0 };
}

// One traced path (a closed loop, or an open line) as cubic Béziers: x0,y0,
// then c1x,c1y,c2x,c2y,x,y per curve (a closed path's last curve ends on x0,y0).
function fitPath(raw: ArrayLike<number>, closed: boolean, tol: number, cornerDeg: number, blurPx: number, smoothPx: number, clearPx: number, F: Fit): Float32Array | null {
  const { xs, ys, n } = tidy(raw, closed);
  if (n < (closed ? 3 : 2)) return null;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = i + 1 === n ? 0 : i + 1;
    cum[i + 1] = cum[i] + Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
  }
  const total = closed ? cum[n] : cum[n - 1];
  if (total < (closed ? 1.5 : 0.3)) return null;

  const straight = () => {
    const c = closed ? n : n - 1;
    const o = new Float32Array(2 + c * 6);
    o[0] = xs[0];
    o[1] = ys[0];
    for (let i = 0; i < c; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const k = 2 + i * 6;
      o[k] = xs[i] + (xs[j] - xs[i]) / 3;
      o[k + 1] = ys[i] + (ys[j] - ys[i]) / 3;
      o[k + 2] = xs[i] + ((xs[j] - xs[i]) * 2) / 3;
      o[k + 3] = ys[i] + ((ys[j] - ys[i]) * 2) / 3;
      o[k + 4] = xs[j];
      o[k + 5] = ys[j];
    }
    return o;
  };
  if (n < (closed ? 8 : 4) || total < (closed ? 8 : 4)) return straight();

  // The vertex at (or just past) arc length a along the path; a closed path
  // wraps round, an open one stops at its ends.
  const idxAt = (a: number) => {
    if (closed) {
      a %= total;
      if (a < 0) a += total;
    } else a = a < 0 ? 0 : a > total ? total : a;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < a) lo = mid + 1;
      else hi = mid;
    }
    return cum[lo] < a ? (closed ? 0 : n - 1) : lo;
  };
  const fwdArc = (a: number, b: number) => {
    const d = cum[b] - cum[a];
    return closed && d <= 0 ? d + total : d;
  };
  const steps = (a: number, b: number) => (closed ? (b - a + n) % n : b - a);
  const unit = (dx: number, dy: number): [number, number] => {
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };

  // 1. Corners: where the path turns by more than `cornerDeg` within a short
  // stretch (about 1.5 + 2σ pixels each way) and does not keep on turning.
  const span = Math.min(Math.max(1.5 + 2 * blurPx, 2), 5, total / (closed ? 8 : 6));
  const nodes: PathNode[] = [];
  if (cornerDeg < 175) {
    const minTurn = (cornerDeg * Math.PI) / 180;
    const angleAt = (i: number, a: number, b: number) => {
      const ax = xs[i] - xs[a];
      const ay = ys[i] - ys[a];
      const bx = xs[b] - xs[i];
      const by = ys[b] - ys[i];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      return la > 0 && lb > 0 ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) : 0;
    };
    // How far the path has turned over `win` pixels each way of every point.
    const turnOver = (win: number) => {
      const t = new Float32Array(n);
      let fw = 0;
      let bw = 0;
      if (closed) {
        const arc = (j: number) => (j < n ? cum[j] : cum[j - n] + total);
        for (let i = 0; i < n; i++) {
          if (fw < i) fw = i;
          while (arc(fw) - cum[i] < win) fw++;
          while (arc(bw + 1) <= arc(i + n) - win) bw++;
          t[i] = angleAt(i, bw % n, fw % n);
        }
      } else {
        for (let i = 0; i < n; i++) {
          if (cum[i] < win || total - cum[i] < win) continue;
          if (fw < i) fw = i;
          while (fw < n - 1 && cum[fw] - cum[i] < win) fw++;
          while (bw + 1 < i && cum[bw + 1] <= cum[i] - win) bw++;
          t[i] = angleAt(i, bw, fw);
        }
      }
      return t;
    };
    const turn = turnOver(span);
    const turnWide = turnOver(span * 2);
    // A corner turns once; a curve keeps turning (twice as far over twice the
    // length), so tight round ends and dots stay round.
    const isCorner = (i: number) => turn[i] >= minTurn && turnWide[i] <= turn[i] * 1.5;
    const beaten = (i: number, j: number) => turn[j] > turn[i] || (turn[j] === turn[i] && j < i);
    for (let i = 0; i < n; i++) {
      if (!isCorner(i)) continue;
      if (!closed && (cum[i] < span * 0.75 || total - cum[i] < span * 0.75)) continue;
      let best = true;
      for (let d = 1; d < n; d++) {
        const j = closed ? (i + d) % n : i + d;
        if (j >= n) break;
        let dist = cum[j] - cum[i];
        if (dist < 0) dist += total;
        if (dist >= span) break;
        if (isCorner(j) && beaten(i, j)) {
          best = false;
          break;
        }
      }
      for (let d = 1; d < n && best; d++) {
        const j = closed ? (i - d + n) % n : i - d;
        if (j < 0) break;
        let dist = cum[i] - cum[j];
        if (dist < 0) dist += total;
        if (dist >= span) break;
        if (isCorner(j) && beaten(i, j)) best = false;
      }
      if (best) nodes.push({ idx: i, corner: true });
    }
  }
  if (closed) {
    // A loop needs at least two nodes to have somewhere to bend from.
    const far = (i: number) => idxAt(cum[i] + total / 2);
    if (nodes.length === 0) nodes.push({ idx: 0, corner: false }, { idx: far(0), corner: false });
    else if (nodes.length === 1) {
      nodes.push({ idx: far(nodes[0].idx), corner: false });
      nodes.sort((p, q) => p.idx - q.idx);
    }
  } else {
    nodes.unshift({ idx: 0, corner: true, end: true });
    nodes.push({ idx: n - 1, corner: true, end: true });
  }
  const m = nodes.length;
  const prevOf = (k: number) => nodes[closed ? (k - 1 + m) % m : k - 1];
  const nextOf = (k: number) => nodes[closed ? (k + 1) % m : k + 1];

  // 2. Sharp corners: the blur and the pixel grid round a corner off, so its
  // tip is put back where the two straight edges leading into it meet.
  const lead = 2 * blurPx + 0.8 + clearPx; // how far from the tip the edge is straight again
  const win = Math.max(3, 3 * blurPx + 2);
  const leg = (i0: number, i1: number) => {
    let cnt = 0;
    let mx = 0;
    let my = 0;
    for (let j = i0, c = 0; c <= n; c++, j = closed ? (j + 1) % n : j + 1) {
      mx += xs[j];
      my += ys[j];
      cnt++;
      if (j === i1 || (!closed && j >= n - 1)) break;
    }
    if (cnt < 3) return null;
    mx /= cnt;
    my /= cnt;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let j = i0, c = 0; c < cnt; c++, j = closed ? (j + 1) % n : j + 1) {
      const dx = xs[j] - mx;
      const dy = ys[j] - my;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let dx = Math.cos(ang);
    let dy = Math.sin(ang);
    const ex = xs[i1] - xs[i0];
    const ey = ys[i1] - ys[i0];
    if (dx * ex + dy * ey < 0) {
      dx = -dx;
      dy = -dy;
    }
    return { mx, my, dx, dy };
  };
  const apexes: (Apex | null)[] = nodes.map(() => null);
  for (let k = 0; k < m; k++) {
    const nd = nodes[k];
    if (!nd.corner || nd.end) continue;
    const room = Math.min(fwdArc(prevOf(k).idx, nd.idx), fwdArc(nd.idx, nextOf(k).idx));
    if (room < lead + 2.5) continue;
    const w2 = Math.min(win, room - lead - 0.5);
    const c = nd.idx;
    const a = leg(idxAt(cum[c] - lead - w2), idxAt(cum[c] - lead));
    const b = leg(idxAt(cum[c] + lead), idxAt(cum[c] + lead + w2));
    if (!a || !b) continue;
    const cross = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(cross) < 0.34) continue; // nearly straight on, or a needle: no tip to find
    const t = ((b.mx - a.mx) * b.dy - (b.my - a.my) * b.dx) / cross;
    const x = a.mx + t * a.dx;
    const y = a.my + t * a.dy;
    if (Math.hypot(x - xs[c], y - ys[c]) > 4 * blurPx + 1.5) continue;
    apexes[k] = { x, y, ix: a.dx, iy: a.dy, ox: b.dx, oy: b.dy };
  }

  // 3. Fit each stretch between nodes.
  const out: number[] = [apexes[0] ? apexes[0]!.x : xs[nodes[0].idx], apexes[0] ? apexes[0]!.y : ys[nodes[0].idx]];
  const pts: number[] = [];
  for (let k = 0; k < (closed ? m : m - 1); k++) {
    const A = nodes[k];
    const B = nodes[(k + 1) % m];
    const aA = apexes[k];
    const aB = apexes[(k + 1) % m];
    const s = A.idx;
    const e = B.idx;
    const len = steps(s, e);
    const segLen = fwdArc(s, e);
    const cap = Math.max(0.5, segLen / 3);
    const reach = Math.min(span * 1.5, cap);
    const skip = Math.min(1.5 * blurPx + 0.4, cap / 2);

    // the points to fit: from the start tip (or node) to the end tip (or node)
    pts.length = 0;
    let vs = 0;
    let ve = len;
    if (aA) {
      pts.push(aA.x, aA.y);
      vs = steps(s, idxAt(cum[s] + Math.min(lead, segLen / 3)));
    }
    if (aB) ve = steps(s, idxAt(cum[e] - Math.min(lead, segLen / 3)));
    for (let t = vs; t <= ve; t++) {
      const j = closed ? (s + t) % n : s + t;
      pts.push(xs[j], ys[j]);
    }
    if (aB) pts.push(aB.x, aB.y);
    const cnt = pts.length / 2;
    if (cnt < 2) continue;
    if (smoothPx > 0 && cnt >= 6) {
      // smoothed only now, so a corner's tip was found on the untouched path
      const sx = new Float64Array(cnt);
      const sy = new Float64Array(cnt);
      for (let i = 0; i < cnt; i++) {
        sx[i] = pts[i * 2];
        sy[i] = pts[i * 2 + 1];
      }
      smoothAlong(sx, sy, cnt, false, smoothPx);
      for (let i = 0; i < cnt; i++) {
        pts[i * 2] = sx[i];
        pts[i * 2 + 1] = sy[i];
      }
    }

    let t1: [number, number];
    if (aA) t1 = [aA.ox, aA.oy];
    else if (A.corner) {
      const lo = A.end ? 0 : skip;
      t1 = unit(xs[idxAt(cum[s] + lo + reach)] - xs[idxAt(cum[s] + lo)], ys[idxAt(cum[s] + lo + reach)] - ys[idxAt(cum[s] + lo)]);
    } else t1 = unit(xs[idxAt(cum[s] + reach)] - xs[idxAt(cum[s] - reach)], ys[idxAt(cum[s] + reach)] - ys[idxAt(cum[s] - reach)]);
    let t2: [number, number];
    if (aB) t2 = [-aB.ix, -aB.iy];
    else if (B.corner) {
      const lo = B.end ? 0 : skip;
      t2 = unit(xs[idxAt(cum[e] - lo - reach)] - xs[idxAt(cum[e] - lo)], ys[idxAt(cum[e] - lo - reach)] - ys[idxAt(cum[e] - lo)]);
    } else t2 = unit(xs[idxAt(cum[e] - reach)] - xs[idxAt(cum[e] + reach)], ys[idxAt(cum[e] - reach)] - ys[idxAt(cum[e] + reach)]);

    if (F.px.length < cnt * 2) {
      F.px = new Float64Array(cnt * 2);
      F.u = new Float64Array(cnt);
      F.v = new Float64Array(cnt);
    }
    for (let i = 0; i < cnt * 2; i++) F.px[i] = pts[i];
    fitStretch(F, cnt, tol, t1[0], t1[1], t2[0], t2[1], out);
  }
  return Float32Array.from(out);
}

export type Polyline = { pts: Float32Array; closed: boolean };

// Fits traced paths (see fitPath). `closed[i]` says whether outline i is a loop.
export function fitPolylines(lines: Polyline[], p: TraceParams): TraceResult {
  const outlines: Outline[] = [];
  const closed: boolean[] = [];
  const islands = 0;
  const holes = 0;
  let nodes = 0;
  const F = newFit();
  for (const l of lines) {
    const o = fitPath(l.pts, l.closed, Math.max(0.05, p.tolerancePx), p.cornerDeg, p.blurPx, p.smoothPx ?? 0, p.cornerClearPx ?? 0, F);
    if (!o) continue;
    outlines.push(o);
    closed.push(l.closed);
    nodes += (o.length - 2) / 6;
  }
  return { outlines, closed, nodes, islands, holes, maxDevPx: Math.sqrt(F.worst) };
}

// Fits every edge loop big enough to keep (see TraceParams.minAreaPx).
export function fitLoops(loops: Loop[], p: TraceParams): TraceResult {
  const outlines: Outline[] = [];
  let islands = 0;
  let holes = 0;
  let nodes = 0;
  const F = newFit();
  for (const l of loops) {
    if (Math.abs(l.area) < p.minAreaPx) continue;
    const o = fitPath(l.pts, true, Math.max(0.05, p.tolerancePx), p.cornerDeg, p.blurPx, p.smoothPx ?? 0, p.cornerClearPx ?? 0, F);
    if (!o) continue;
    outlines.push(o);
    nodes += (o.length - 2) / 6;
    if (l.area < 0) islands++;
    else holes++;
  }
  return { outlines, closed: outlines.map(() => true), nodes, islands, holes, maxDevPx: Math.sqrt(F.worst) };
}

export function traceInk(ink: Float32Array, w: number, h: number, p: TraceParams): TraceResult {
  return fitLoops(findLoops(blurField(ink, w, h, p.blurPx), w, h, p.level), p);
}
