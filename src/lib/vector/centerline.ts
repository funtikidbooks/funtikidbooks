// Thin lines → their centre lines ("một đường giữa nét").
//
// A die line or cut line is drawn as a band a few pixels wide, but what the
// printer wants is the line itself: one closed path along the middle of the
// band, not the two edges of a ribbon. This finds that middle:
//   1. the line pixels are thinned to a one-pixel skeleton (Zhang–Suen),
//   2. the skeleton is read as a graph — loops, open lines, and the places
//      where lines meet — and stray stubs shorter than a few widths are cut,
//   3. every point is then moved across the line to the weighted middle of
//      the soft ink profile, which puts it within a tenth of a pixel of the
//      true centre instead of the half a pixel the skeleton can promise.
// The result goes through the same curve fitting as the outlines.
//
// Pure typed-array maths with no runtime imports, so it runs in a Web Worker
// and in Node for the tests.
import type { Polyline } from "./trace";

export type CenterlineParams = {
  level: number; // ink level that counts as line
  minLengthPx: number; // lines shorter than this are dropped as specks
  spurPx: number; // dead-end stubs shorter than this, off a longer line, are cut
};

export type CenterlineResult = { lines: Polyline[]; widthPx: number; lengthPx: number };

// ------------------------------------------------------------- thinning

// `m` is a padded 0/1 picture, `s` its row stride. Thinned in place.
function thin(m: Uint8Array, s: number, rows: number) {
  const stamp = new Uint32Array(m.length);
  let tick = 0;
  let cand: number[] = [];
  const last = s * (rows - 1) - 1;
  for (let p = s + 1; p < last; p++) {
    if (m[p] && (!m[p - 1] || !m[p + 1] || !m[p - s] || !m[p + s])) cand.push(p);
  }
  const del: number[] = [];
  let quiet = 0;
  for (let step = 0; quiet < 2; step ^= 1) {
    del.length = 0;
    for (let c = 0; c < cand.length; c++) {
      const p = cand[c];
      if (!m[p]) continue;
      const p2 = m[p - s];
      const p3 = m[p - s + 1];
      const p4 = m[p + 1];
      const p5 = m[p + s + 1];
      const p6 = m[p + s];
      const p7 = m[p + s - 1];
      const p8 = m[p - 1];
      const p9 = m[p - s - 1];
      const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      if (b < 2 || b > 6) continue;
      const a =
        (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
        (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
      if (a !== 1) continue;
      if (step === 0) {
        if ((p2 && p4 && p6) || (p4 && p6 && p8)) continue;
      } else if ((p2 && p4 && p8) || (p2 && p6 && p8)) continue;
      del.push(p);
    }
    if (del.length === 0) {
      quiet++;
      continue;
    }
    quiet = 0;
    for (const p of del) m[p] = 0;
    tick++;
    const next: number[] = [];
    for (const p of cand) {
      if (m[p] && stamp[p] !== tick) {
        stamp[p] = tick;
        next.push(p);
      }
    }
    for (const d of del) {
      for (const q of [d - s - 1, d - s, d - s + 1, d - 1, d + 1, d + s - 1, d + s, d + s + 1]) {
        if (m[q] && stamp[q] !== tick) {
          stamp[q] = tick;
          next.push(q);
        }
      }
    }
    cand = next;
  }
}

// Takes off pixels that only make a staircase: removing one leaves its
// neighbours still joined, and it isn't the tip of a line.
function tidySkeleton(m: Uint8Array, s: number, rows: number) {
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0;
    const last = s * (rows - 1) - 1;
    for (let p = s + 1; p < last; p++) {
      if (!m[p]) continue;
      const p2 = m[p - s];
      const p3 = m[p - s + 1];
      const p4 = m[p + 1];
      const p5 = m[p + s + 1];
      const p6 = m[p + s];
      const p7 = m[p + s - 1];
      const p8 = m[p - 1];
      const p9 = m[p - s - 1];
      const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      if (b < 2) continue;
      const a =
        (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
        (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
      if (a === 1) {
        m[p] = 0;
        changed++;
      }
    }
    if (!changed) break;
  }
}

// ---------------------------------------------------------------- graph

type Edge = { a: number; b: number; pts: number[]; alive: boolean };

function pathLength(pts: number[]): number {
  let l = 0;
  for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return l;
}

export function findCenterlines(field: Float32Array, w: number, h: number, p: CenterlineParams): CenterlineResult {
  const s = w + 2;
  const rows = h + 2;
  const m = new Uint8Array(s * rows);
  let area = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (field[y * w + x] >= p.level) {
        m[(y + 1) * s + x + 1] = 1;
        area++;
      }
    }
  }
  if (area === 0) return { lines: [], widthPx: 0, lengthPx: 0 };
  thin(m, s, rows);
  tidySkeleton(m, s, rows);

  // Neighbours in the graph: the four straight ones, and a diagonal one only
  // when no straight pixel already links them (so a corner is not a triangle).
  const nb = [0, 0, 0, 0, 0, 0, 0, 0];
  const neighbours = (q: number): number => {
    let c = 0;
    const n = m[q - s];
    const e = m[q + 1];
    const so = m[q + s];
    const we = m[q - 1];
    if (n) nb[c++] = q - s;
    if (e) nb[c++] = q + 1;
    if (so) nb[c++] = q + s;
    if (we) nb[c++] = q - 1;
    if (m[q - s + 1] && !n && !e) nb[c++] = q - s + 1;
    if (m[q + s + 1] && !so && !e) nb[c++] = q + s + 1;
    if (m[q + s - 1] && !so && !we) nb[c++] = q + s - 1;
    if (m[q - s - 1] && !n && !we) nb[c++] = q - s - 1;
    return c;
  };
  const deg = new Uint8Array(m.length);
  const skeleton: number[] = [];
  for (let q = s + 1; q < s * (rows - 1) - 1; q++) {
    if (!m[q]) continue;
    skeleton.push(q);
    deg[q] = neighbours(q);
  }
  const cx = (q: number) => (q % s) - 1 + 0.5;
  const cy = (q: number) => Math.floor(q / s) - 1 + 0.5;

  // Nodes: line ends, and clusters of pixels where lines meet.
  const nodeOf = new Map<number, number>();
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const addNode = (x: number, y: number) => {
    nodeX.push(x);
    nodeY.push(y);
    return nodeX.length - 1;
  };
  for (const q of skeleton) if (deg[q] === 1) nodeOf.set(q, addNode(cx(q), cy(q)));
  const seen = new Set<number>();
  for (const q of skeleton) {
    if (deg[q] < 3 || seen.has(q)) continue;
    const stack = [q];
    const members: number[] = [];
    seen.add(q);
    while (stack.length) {
      const c = stack.pop()!;
      members.push(c);
      const k = neighbours(c);
      for (let i = 0; i < k; i++) {
        const o = nb[i];
        if (deg[o] >= 3 && !seen.has(o)) {
          seen.add(o);
          stack.push(o);
        }
      }
    }
    let sx = 0;
    let sy = 0;
    for (const c of members) {
      sx += cx(c);
      sy += cy(c);
    }
    const id = addNode(sx / members.length, sy / members.length);
    for (const c of members) nodeOf.set(c, id);
  }

  // Walk from every node along every line leaving it.
  const used = new Uint8Array(m.length);
  const edges: Edge[] = [];
  const loops: number[][] = [];
  const stepOn = (prev: number, cur: number) => {
    const k = neighbours(cur);
    for (let i = 0; i < k; i++) if (nb[i] !== prev) return nb[i];
    return -1;
  };
  for (const [q, id] of nodeOf) {
    const k0 = neighbours(q);
    const starts = nb.slice(0, k0);
    for (const first of starts) {
      if (nodeOf.get(first) === id) continue; // inside the same cluster
      const pts: number[] = [nodeX[id], nodeY[id]];
      let prev = q;
      let cur = first;
      let guard = 0;
      let ok = true;
      while (deg[cur] === 2) {
        if (used[cur]) {
          ok = false; // this line was already walked from its other end
          break;
        }
        used[cur] = 1;
        pts.push(cx(cur), cy(cur));
        const next = stepOn(prev, cur);
        if (next < 0 || ++guard > m.length) {
          ok = false;
          break;
        }
        prev = cur;
        cur = next;
      }
      if (!ok) continue;
      const end = nodeOf.get(cur);
      if (end === undefined) continue; // a lone speck
      if (pts.length === 2 && end === id) continue;
      if (pts.length === 2 && edges.some((e) => e.alive && ((e.a === id && e.b === end) || (e.a === end && e.b === id)) && e.pts.length === 4)) continue;
      pts.push(nodeX[end], nodeY[end]);
      edges.push({ a: id, b: end, pts, alive: true });
    }
  }
  // Whatever is left over is a loop with no node on it.
  for (const q of skeleton) {
    if (deg[q] !== 2 || used[q]) continue;
    const pts: number[] = [];
    let prev = -1;
    let cur = q;
    let guard = 0;
    do {
      used[cur] = 1;
      pts.push(cx(cur), cy(cur));
      const k = neighbours(cur);
      let next = -1;
      for (let i = 0; i < k; i++) if (nb[i] !== prev && !(prev === -1 && i > 0)) next = nb[i];
      if (prev === -1 && k > 0) next = nb[0];
      if (next < 0) break;
      prev = cur;
      cur = next;
    } while (cur !== q && ++guard < m.length);
    if (pts.length >= 6) loops.push(pts);
  }

  // Cut short stubs off longer lines, then join lines through a meeting that
  // no longer has anything else at it.
  const degree = new Int32Array(nodeX.length);
  for (const e of edges) {
    degree[e.a]++;
    degree[e.b]++;
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of edges) {
      if (!e.alive || e.a === e.b) continue;
      if ((degree[e.a] === 1 && degree[e.b] >= 3) || (degree[e.b] === 1 && degree[e.a] >= 3)) {
        if (pathLength(e.pts) < p.spurPx) {
          e.alive = false;
          degree[e.a]--;
          degree[e.b]--;
          changed = true;
        }
      }
    }
    for (let id = 0; id < degree.length; id++) {
      if (degree[id] !== 2) continue;
      const at = edges.filter((e) => e.alive && (e.a === id || e.b === id));
      if (at.length === 0) continue;
      const e1 = at[0];
      const e2 = at.length > 1 ? at[1] : at[0];
      if (at.length === 1 && !(e1.a === id && e1.b === id)) continue;
      const rev = (e: Edge) => {
        const r: number[] = [];
        for (let i = e.pts.length - 2; i >= 0; i -= 2) r.push(e.pts[i], e.pts[i + 1]);
        e.pts = r;
        const t = e.a;
        e.a = e.b;
        e.b = t;
      };
      if (e1 === e2) {
        // a line that comes back to itself through this meeting: a loop
        e1.alive = false;
        degree[id] = 0;
        loops.push(e1.pts.slice(0, -2));
        changed = true;
        continue;
      }
      if (e1.b !== id) rev(e1);
      if (e2.a !== id) rev(e2);
      e1.pts = e1.pts.concat(e2.pts.slice(2));
      e1.b = e2.b;
      e2.alive = false;
      degree[id] = 0;
      changed = true;
    }
  }

  // Lines to keep.
  type Line = { pts: number[]; closed: boolean; endA: boolean; endB: boolean; na: number; nb: number };
  const lines: Line[] = [];
  for (const e of edges) {
    if (!e.alive) continue;
    if (e.a === e.b) {
      lines.push({ pts: e.pts.slice(0, -2), closed: true, endA: false, endB: false, na: -1, nb: -1 });
      continue;
    }
    lines.push({ pts: e.pts, closed: false, endA: degree[e.a] >= 3, endB: degree[e.b] >= 3, na: e.a, nb: e.b });
  }
  for (const l of loops) lines.push({ pts: l, closed: true, endA: false, endB: false, na: -1, nb: -1 });
  const kept = lines.filter((l) => pathLength(l.pts) + (l.closed ? Math.hypot(l.pts[0] - l.pts[l.pts.length - 2], l.pts[1] - l.pts[l.pts.length - 1]) : 0) >= p.minLengthPx);
  let length = 0;
  for (const l of kept) {
    length += pathLength(l.pts);
    if (l.closed) length += Math.hypot(l.pts[0] - l.pts[l.pts.length - 2], l.pts[1] - l.pts[l.pts.length - 1]);
  }
  const widthPx = length > 0 ? area / length : 0;

  // Put each meeting where its lines really cross: the middle of the pixels
  // that joined them can be most of a pixel off. Each line arriving there is
  // read for its direction a little way back, and the meeting is the point
  // closest to all of them; the lines then run straight into it.
  {
    const r0 = widthPx / 2 + 1.5;
    const ends = new Map<number, { l: Line; start: boolean }[]>();
    for (const l of kept) {
      if (l.closed) continue;
      if (l.endA) (ends.get(l.na) ?? ends.set(l.na, []).get(l.na)!).push({ l, start: true });
      if (l.endB) (ends.get(l.nb) ?? ends.set(l.nb, []).get(l.nb)!).push({ l, start: false });
    }
    for (const [id, list] of ends) {
      if (list.length < 2) continue;
      const fits: { mx: number; my: number; dx: number; dy: number; cut: number }[] = [];
      for (const { l, start } of list) {
        const n = l.pts.length / 2;
        const at = (i: number) => (start ? i : n - 1 - i);
        let arc = 0;
        let from = -1;
        const win: number[] = [];
        for (let i = 1; i < n; i++) {
          arc += Math.hypot(l.pts[at(i) * 2] - l.pts[at(i - 1) * 2], l.pts[at(i) * 2 + 1] - l.pts[at(i - 1) * 2 + 1]);
          if (from < 0 && arc >= r0) from = i;
          if (from >= 0 && arc <= r0 + 7) win.push(at(i));
        }
        if (from < 0 || win.length < 3 || n - from < 3) continue;
        let mx = 0;
        let my = 0;
        for (const j of win) {
          mx += l.pts[j * 2];
          my += l.pts[j * 2 + 1];
        }
        mx /= win.length;
        my /= win.length;
        let sxx = 0;
        let sxy = 0;
        let syy = 0;
        for (const j of win) {
          const dx = l.pts[j * 2] - mx;
          const dy = l.pts[j * 2 + 1] - my;
          sxx += dx * dx;
          sxy += dx * dy;
          syy += dy * dy;
        }
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        fits.push({ mx, my, dx: Math.cos(ang), dy: Math.sin(ang), cut: from });
      }
      if (fits.length !== list.length) continue;
      let a11 = 0;
      let a12 = 0;
      let a22 = 0;
      let b1 = 0;
      let b2 = 0;
      for (const f of fits) {
        const p11 = 1 - f.dx * f.dx;
        const p12 = -f.dx * f.dy;
        const p22 = 1 - f.dy * f.dy;
        a11 += p11;
        a12 += p12;
        a22 += p22;
        b1 += p11 * f.mx + p12 * f.my;
        b2 += p12 * f.mx + p22 * f.my;
      }
      const det = a11 * a22 - a12 * a12;
      if (det < 0.2) continue; // lines that run side by side have no crossing to find
      const X = (a22 * b1 - a12 * b2) / det;
      const Y = (a11 * b2 - a12 * b1) / det;
      if (Math.hypot(X - nodeX[id], Y - nodeY[id]) > 2.5 + widthPx) continue;
      list.forEach(({ l, start }, k) => {
        const n = l.pts.length / 2;
        const cut = fits[k].cut;
        if (start) l.pts = [X, Y, ...l.pts.slice(cut * 2)];
        else l.pts = [...l.pts.slice(0, (n - 1 - cut) * 2 + 2), X, Y];
      });
    }
  }

  // Move each point across the line to the middle of the ink profile.
  const sampleAt = (X: number, Y: number) => {
    const fx = X - 0.5;
    const fy = Y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]);
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  const reach = Math.max(1.5, widthPx / 2 + 1.5);
  const keepOff = Math.ceil(widthPx / 2 + 1);
  const out: Polyline[] = [];
  for (const l of kept) {
    const src = l.pts;
    const n = src.length / 2;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = src[i * 2];
      py[i] = src[i * 2 + 1];
    }
    if (n >= 7) {
      const nx = new Float64Array(n);
      const ny = new Float64Array(n);
      const at = (i: number) => (l.closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          if (!l.closed && ((l.endA && i < keepOff) || (l.endB && i >= n - keepOff) || i < 1 || i >= n - 1)) {
            nx[i] = px[i];
            ny[i] = py[i];
            continue;
          }
          const a = at(i - 3);
          const b = at(i + 3);
          const tx = px[b] - px[a];
          const ty = py[b] - py[a];
          const tl = Math.hypot(tx, ty) || 1;
          const ox = -ty / tl;
          const oy = tx / tl;
          let sw = 0;
          let st = 0;
          for (let t = -reach; t <= reach + 1e-6; t += 0.5) {
            const v = sampleAt(px[i] + ox * t, py[i] + oy * t) - 0.1;
            if (v > 0) {
              sw += v;
              st += v * t;
            }
          }
          const d = sw > 0 ? Math.max(-1, Math.min(1, st / sw)) : 0;
          nx[i] = px[i] + ox * d;
          ny[i] = py[i] + oy * d;
        }
        px.set(nx);
        py.set(ny);
      }
    }
    const pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pts[i * 2] = px[i];
      pts[i * 2 + 1] = py[i];
    }
    out.push({ pts, closed: l.closed });
  }
  return { lines: out, widthPx, lengthPx: length };
}
