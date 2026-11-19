// "Một đường giữa nét": thin bands (die lines, cut lines) come out as one path
// along their middle, measured against the exact line they were drawn from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findCenterlines } from "../src/lib/vector/centerline.ts";
import { blurField, fitPolylines } from "../src/lib/vector/trace.ts";

// ink (0..1) of a band of the given width around a polyline: round dabs along
// it, found through a grid so only nearby dabs are looked at
function band(w, h, line, widthAt, ss = 4) {
  const dabs = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      dabs.push([ax + (bx - ax) * t, ay + (by - ay) * t, widthAt((i + t) / (line.length - 1)) / 2]);
    }
  }
  const G = 8;
  const grid = new Map();
  for (const d of dabs) {
    for (let gy = Math.floor((d[1] - d[2]) / G); gy <= Math.floor((d[1] + d[2]) / G); gy++)
      for (let gx = Math.floor((d[0] - d[2]) / G); gx <= Math.floor((d[0] + d[2]) / G); gx++) {
        const key = gy * 100000 + gx;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(d);
      }
  }
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const near = grid.get(Math.floor(y / G) * 100000 + Math.floor(x / G));
      if (!near) continue;
      let n = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (near.some(([dx, dy, r]) => (px - dx) ** 2 + (py - dy) ** 2 <= r * r)) n++;
        }
      f[y * w + x] = n / (ss * ss);
    }
  }
  return f;
}
const circle = (cx, cy, r, n = 720) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
const blob = (cx, cy, r, a, k, n = 720) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    const rr = r + a * Math.sin(k * t) + (a / 2) * Math.cos((k + 2) * t);
    return [cx + rr * Math.cos(t), cy + rr * Math.sin(t)];
  });

function distToLine(line, x, y) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}
function flat(o, per = 20) {
  const pts = [];
  let x0 = o[0];
  let y0 = o[1];
  for (let i = 2; i < o.length; i += 6) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const s = 1 - t;
      pts.push([
        s * s * s * x0 + 3 * s * s * t * o[i] + 3 * s * t * t * o[i + 2] + t * t * t * o[i + 4],
        s * s * s * y0 + 3 * s * s * t * o[i + 1] + 3 * s * t * t * o[i + 3] + t * t * t * o[i + 5],
      ]);
    }
    x0 = o[i + 4];
    y0 = o[i + 5];
  }
  pts.push([x0, y0]);
  return pts;
}
const C = { level: 0.3, minLengthPx: 6, spurPx: 8 };
const F = { level: 0.5, blurPx: 0.7, minAreaPx: 3, tolerancePx: 0.4, cornerDeg: 60 };
function run(f, w, h, c = C) {
  const field = blurField(f, w, h, 0.7);
  const res = findCenterlines(field, w, h, c);
  return { res, fit: fitPolylines(res.lines, F) };
}

test("a ring band: one closed path, along the middle, with the width measured", () => {
  const line = circle(100, 100, 60);
  const f = band(200, 200, line, () => 3);
  const { res, fit } = run(f, 200, 200);
  assert.equal(res.lines.length, 1);
  assert.ok(res.lines[0].closed);
  assert.ok(Math.abs(res.widthPx - 3) < 0.5, `width ${res.widthPx}`);
  let worst = 0;
  for (let i = 0; i < res.lines[0].pts.length; i += 2) worst = Math.max(worst, distToLine(line, res.lines[0].pts[i], res.lines[0].pts[i + 1]));
  assert.ok(worst < 0.25, `points ${worst.toFixed(3)}px off the middle`);
  assert.equal(fit.outlines.length, 1);
  assert.ok(fit.closed[0]);
  assert.ok(fit.nodes <= 8, `nodes ${fit.nodes}`);
  const dev = Math.max(...flat(fit.outlines[0]).map(([x, y]) => distToLine(line, x, y)));
  assert.ok(dev < 0.4, `curve ${dev.toFixed(3)}px off`);
});

test("a hand-drawn blob die line, 3px and 1px wide, hairline and aliased: all closed, all on the line", () => {
  const line = blob(150, 150, 80, 10, 3);
  for (const width of [3, 2, 1]) {
    const f = band(300, 300, line, () => width);
    const { res, fit } = run(f, 300, 300);
    assert.equal(res.lines.length, 1, `width ${width}: lines ${res.lines.length}`);
    assert.ok(res.lines[0].closed, `width ${width}: closed`);
    const dev = Math.max(...flat(fit.outlines[0]).map(([x, y]) => distToLine(line, x, y)));
    assert.ok(dev < 0.5, `width ${width}: curve ${dev.toFixed(3)}px off the middle`);
    assert.ok(fit.nodes < 40, `width ${width}: nodes ${fit.nodes}`);
  }
});

test("a binary (aliased) 3px band — what the sticker tool paints — still gives one smooth path", () => {
  const line = blob(150, 150, 80, 10, 3);
  const f = band(300, 300, line, () => 3, 1); // ss = 1: hard edges
  const { res, fit } = run(f, 300, 300);
  assert.equal(res.lines.length, 1);
  assert.ok(res.lines[0].closed);
  const dev = Math.max(...flat(fit.outlines[0]).map(([x, y]) => distToLine(line, x, y)));
  assert.ok(dev < 0.7, `curve ${dev.toFixed(3)}px off`);
});

test("two lines crossing: a meeting in the middle with four lines out of it, all on the lines", () => {
  const a = [[20, 20], [180, 180]];
  const b = [[180, 25], [20, 175]];
  const f = band(200, 200, a, () => 3);
  const g = band(200, 200, b, () => 3);
  for (let i = 0; i < f.length; i++) f[i] = Math.max(f[i], g[i]);
  const { res } = run(f, 200, 200);
  assert.equal(res.lines.length, 4, `lines ${res.lines.length}`);
  for (const l of res.lines) {
    assert.ok(!l.closed);
    let worst = 0;
    for (let i = 0; i < l.pts.length; i += 2) worst = Math.min(Math.max(worst, Math.min(distToLine(a, l.pts[i], l.pts[i + 1]), distToLine(b, l.pts[i], l.pts[i + 1]))), 99);
    assert.ok(worst < 0.6, `off by ${worst.toFixed(2)}`);
  }
});

test("a tapering open stroke: one open path, its middle kept", () => {
  const line = Array.from({ length: 201 }, (_, i) => [20 + i * 0.8, 60 + 22 * Math.sin((i / 200) * 6)]);
  const f = band(200, 120, line, (t) => 1.5 + 5 * Math.sin(Math.PI * t));
  const { res, fit } = run(f, 200, 120);
  assert.equal(res.lines.length, 1);
  assert.ok(!res.lines[0].closed);
  const dev = Math.max(...flat(fit.outlines[0]).map(([x, y]) => distToLine(line, x, y)));
  assert.ok(dev < 0.8, `curve ${dev.toFixed(3)}px off`);
});

test("specks and short stubs are not kept", () => {
  const line = circle(80, 80, 50);
  const f = band(160, 160, line, () => 3);
  const dot = band(160, 160, [[10, 10], [11, 10]], () => 2);
  for (let i = 0; i < f.length; i++) f[i] = Math.max(f[i], dot[i]);
  const { res } = run(f, 160, 160);
  assert.equal(res.lines.length, 1);
});

test("a thick bar next to a thin line does not grow side branches", () => {
  const f = band(120, 120, [[20, 40], [100, 40]], () => 9);
  const { res } = run(f, 120, 120);
  assert.equal(res.lines.length, 1, `lines ${res.lines.length}`);
});
