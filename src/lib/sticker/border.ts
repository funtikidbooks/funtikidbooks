// The sticker border ("bù nền") and die line ("khuôn") for one piece of art,
// worked out from the layer's own pixels. Pure typed-array maths so it runs
// in a Web Worker on an iPad as well as a desktop.
//
// Print spec from sếp (20/10/2026):
//   - die line 1.5mm outside the art (bù nền trong khuôn),
//   - border colour carries on 2mm past the die line (bù nền ngoài khuôn) so
//     a slightly-off cut never shows white,
//   - die lines ≥ 3mm apart and ≥ 3mm from the trim edge,
//   - the border colour follows the art next to it: a dress that's green on
//     top and pink below gets a green-to-pink border.

const INF = 1e20;

// Exact Euclidean distance to the nearest set pixel (Felzenszwalb &
// Huttenlocher), optionally with which pixel that was.
export function distanceTransform(feature: Uint8Array, w: number, h: number, withNearest = false) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const arg = new Int32Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  const rowOf = withNearest ? new Int32Array(w * h) : null;

  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
      arg[q] = v[k];
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = feature[y * w + x] ? 0 : INF;
    pass(h);
    for (let y = 0; y < h; y++) {
      g[y * w + x] = d[y];
      if (rowOf) rowOf[y * w + x] = arg[y];
    }
  }
  const dist = new Float32Array(w * h);
  const nearest = withNearest ? new Int32Array(w * h) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) {
      dist[y * w + x] = Math.sqrt(d[x]);
      if (nearest && rowOf) nearest[y * w + x] = rowOf[y * w + arg[x]] * w + arg[x];
    }
  }
  return { dist, nearest };
}

// Everything the outside can't reach becomes part of the shape — a gap
// between an arm and the dress is kept, not cut out as a hole.
export function fillHoles(m: Uint8Array, w: number, h: number) {
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (i: number) => {
    if (!outside[i] && !m[i]) {
      outside[i] = 1;
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
  for (let i = 0; i < w * h; i++) m[i] = outside[i] ? 0 : 1;
}

// Average of `values` over the masked pixels within `r` of each pixel.
function maskedBoxBlur(values: Float32Array, mask: Uint8Array, w: number, h: number, r: number) {
  const W = w + 1;
  const sv = new Float64Array(W * (h + 1));
  const sm = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rv = 0;
    let rm = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) {
        rv += values[i];
        rm += 1;
      }
      sv[(y + 1) * W + x + 1] = sv[y * W + x + 1] + rv;
      sm[(y + 1) * W + x + 1] = sm[y * W + x + 1] + rm;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const a = y1 * W + x1;
      const b = y0 * W + x1;
      const c = y1 * W + x0;
      const d = y0 * W + x0;
      const m = sm[a] - sm[b] - sm[c] + sm[d];
      out[i] = m > 0 ? (sv[a] - sv[b] - sv[c] + sv[d]) / m : values[i];
    }
  }
  return out;
}

export type BorderParams = {
  insidePx: number; // art edge → die line
  bleedPx: number; // die line → end of border colour
  smoothPx: number; // rounds off notches the knife can't follow
  linePx: number; // drawn die line thickness
  deepen: number; // 1 = same colour as the art, >1 stronger
};

export type BorderResult = {
  left: number;
  top: number;
  w: number;
  h: number;
  // Border colour per channel in the file's own encoding (CMYK inverted).
  color: Uint8Array[];
  fill: Uint8Array; // where the border colour goes (0/255)
  cut: Uint8Array; // inside the die line (0/1)
  line: Uint8Array; // the drawn die line (0/255)
};

// `alpha` and `channels` are the layer's pixels (lw×lh); `cmyk` says how to
// read them.
export function makeBorder(
  alpha: Uint8Array,
  channels: Uint8Array[],
  lw: number,
  lh: number,
  layerLeft: number,
  layerTop: number,
  cmyk: boolean,
  p: BorderParams,
): BorderResult | null {
  const pad = Math.ceil(p.insidePx + p.bleedPx + p.smoothPx) + 3;
  const w = lw + pad * 2;
  const h = lh + pad * 2;
  const art = new Uint8Array(w * h);
  let any = false;
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      if (alpha[y * lw + x] >= 128) {
        art[(y + pad) * w + x + pad] = 1;
        any = true;
      }
    }
  }
  if (!any) return null;

  // Die line: art grown by insidePx, holes filled, then a closing pass
  // (grow by smoothPx, shrink back) so narrow notches become smooth curves.
  const { dist: dArt } = distanceTransform(art, w, h);
  const grown = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) grown[i] = dArt[i] <= p.insidePx + p.smoothPx ? 1 : 0;
  fillHoles(grown, w, h);
  const notGrown = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) notGrown[i] = grown[i] ? 0 : 1;
  const { dist: dEdge } = distanceTransform(notGrown, w, h);
  const cut = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) cut[i] = grown[i] && (dEdge[i] > p.smoothPx || dArt[i] <= p.insidePx) ? 1 : 0;
  fillHoles(cut, w, h);

  const { dist: dCut } = distanceTransform(cut, w, h);
  const fill = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fill[i] = dCut[i] <= p.bleedPx ? 1 : 0;

  // Die line drawn just inside its edge.
  const outsideCut = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outsideCut[i] = cut[i] ? 0 : 1;
  const { dist: dIn } = distanceTransform(outsideCut, w, h);
  const line = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (cut[i] && dIn[i] <= p.linePx) line[i] = 255;

  // Colour: sampled from the art just inside its edge, skipping dark line
  // work and white sparkles, then carried outward to the nearest sample and
  // blended so neighbouring colours fade into each other.
  const nc = channels.length;
  const ink = (c: number, i: number) => (cmyk ? 255 - channels[c][i] : channels[c][i]) / 255;
  const { dist: dInArt } = distanceTransform(
    (() => {
      const m = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) m[i] = art[i] ? 0 : 1;
      return m;
    })(),
    w,
    h,
  );
  const ring = Math.max(6, p.insidePx * 0.6);
  const pickSeeds = (strict: boolean) => {
    const seeds = new Uint8Array(w * h);
    let n = 0;
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const s = y * lw + x;
        const i = (y + pad) * w + x + pad;
        if (alpha[s] < 200 || dInArt[i] > ring || dInArt[i] < 2) continue;
        if (strict) {
          if (cmyk) {
            const k = ink(3, s);
            const sum = ink(0, s) + ink(1, s) + ink(2, s) + k;
            if (k > 0.55 || sum > 2.6 || sum < 0.12) continue;
          } else {
            const r = ink(0, s);
            const g = ink(1, s);
            const bl = ink(2, s);
            const luma = 0.3 * r + 0.59 * g + 0.11 * bl;
            if (luma < 0.25 || Math.min(r, g, bl) > 0.92) continue;
          }
        }
        seeds[i] = 1;
        n++;
      }
    }
    return n > 0 ? seeds : null;
  };
  const seeds = pickSeeds(true) ?? pickSeeds(false) ?? art;
  const { nearest } = distanceTransform(seeds, w, h, true);
  const blurR = Math.max(4, Math.round(p.insidePx * 0.8));
  const color: Uint8Array[] = [];
  for (let c = 0; c < nc; c++) {
    const vals = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!fill[i]) continue;
      const src = nearest![i];
      const sx = (src % w) - pad;
      const sy = ((src / w) | 0) - pad;
      vals[i] = sx >= 0 && sy >= 0 && sx < lw && sy < lh ? ink(c, sy * lw + sx) : 0;
    }
    const soft = maskedBoxBlur(maskedBoxBlur(vals, fill, w, h, blurR), fill, w, h, blurR);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!fill[i]) {
        out[i] = cmyk ? 255 : 255;
        continue;
      }
      let v = soft[i];
      v = cmyk ? Math.min(1, v * p.deepen) : Math.max(0, 1 - (1 - v) * p.deepen); // more ink / darker
      out[i] = Math.round((cmyk ? 1 - v : v) * 255);
    }
    color.push(out);
  }
  const fill255 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fill255[i] = fill[i] ? 255 : 0;
  return { left: layerLeft - pad, top: layerTop - pad, w, h, color, fill: fill255, cut, line };
}

// Die-line outlines as closed polygons (marching squares on the cut mask,
// lightly simplified) for the SVG the printer cuts from.
export function traceOutlines(cut: Uint8Array, w: number, h: number, offX: number, offY: number): number[][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? cut[y * w + x] : 0);
  // Edge midpoints keyed on a doubled grid: (2x+1, 2y) etc.
  const segs: number[] = [];
  const key = (x2: number, y2: number) => y2 * (2 * w + 4) + x2;
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const T = key(2 * x + 3, 2 * y + 2);
      const R = key(2 * x + 4, 2 * y + 3);
      const B = key(2 * x + 3, 2 * y + 4);
      const L = key(2 * x + 2, 2 * y + 3);
      switch (c) {
        case 1: case 14: segs.push(L, B); break;
        case 2: case 13: segs.push(B, R); break;
        case 3: case 12: segs.push(L, R); break;
        case 4: case 11: segs.push(T, R); break;
        case 6: case 9: segs.push(T, B); break;
        case 7: case 8: segs.push(L, T); break;
        case 5: segs.push(L, T, B, R); break;
        case 10: segs.push(T, R, L, B); break;
      }
    }
  }
  const byPoint = new Map<number, number[]>();
  for (let s = 0; s < segs.length / 2; s++) {
    for (const k of [segs[s * 2], segs[s * 2 + 1]]) {
      const list = byPoint.get(k);
      if (list) list.push(s);
      else byPoint.set(k, [s]);
    }
  }
  const used = new Uint8Array(segs.length / 2);
  const stride = 2 * w + 4;
  const loops: number[][] = [];
  for (let s0 = 0; s0 < used.length; s0++) {
    if (used[s0]) continue;
    const pts: number[] = [];
    let s = s0;
    let cur = segs[s * 2];
    while (s !== -1 && !used[s]) {
      used[s] = 1;
      const next = segs[s * 2] === cur ? segs[s * 2 + 1] : segs[s * 2];
      pts.push(((cur % stride) - 2) / 2 + offX, (Math.floor(cur / stride) - 2) / 2 + offY);
      cur = next;
      s = (byPoint.get(cur) ?? []).find((t) => !used[t]) ?? -1;
    }
    if (pts.length >= 8) loops.push(simplify(pts, 0.6));
  }
  return loops;
}

function simplify(pts: number[], tol: number): number[] {
  const n = pts.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a * 2];
    const ay = pts[a * 2 + 1];
    const bx = pts[b * 2];
    const by = pts[b * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i * 2 + 1]) - (ax - pts[i * 2]) * (by - ay)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== -1) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}
