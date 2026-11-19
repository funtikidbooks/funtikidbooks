// "Chuyển line sang vector": the traced outlines are drawn back to pixels and
// compared with the picture they came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blurField, findLoops, fitLoops, traceInk } from "../src/lib/vector/trace.ts";
import { epsOf, pdfOf, svgOf } from "../src/lib/vector/formats.ts";

// ---- synthetic line art: soft-edged ink (0..1), made by supersampling a shape
function ink(w, h, inside, ss = 5) {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) if (inside(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss)) n++;
      f[y * w + x] = n / (ss * ss);
    }
  }
  return f;
}
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const either = (...fs) => (x, y) => fs.some((f) => f(x, y));
const minus = (a, b) => (x, y) => a(x, y) && !b(x, y);
function rotatedRect(cx, cy, hw, hh, deg) {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return Math.abs(dx * c + dy * s) <= hw && Math.abs(-dx * s + dy * c) <= hh;
  };
}
// a brush stroke: round dabs along a path, the radius following `radius(t)`
function stroke(path, radius, steps = 200) {
  const dabs = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = path(t);
    dabs.push([x, y, radius(t)]);
  }
  return (x, y) => dabs.some(([dx, dy, r]) => (x - dx) ** 2 + (y - dy) ** 2 <= r * r);
}

// ---- the outlines drawn back: coverage 0..1 per pixel, non-zero winding
function flatten(o, per = 16) {
  const pts = [[o[0], o[1]]];
  let x0 = o[0];
  let y0 = o[1];
  for (let i = 2; i < o.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x, y] = [o[i], o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5]];
    for (let k = 1; k <= per; k++) {
      const t = k / per;
      const s = 1 - t;
      pts.push([
        s * s * s * x0 + 3 * s * s * t * c1x + 3 * s * t * t * c2x + t * t * t * x,
        s * s * s * y0 + 3 * s * s * t * c1y + 3 * s * t * t * c2y + t * t * t * y,
      ]);
    }
    x0 = x;
    y0 = y;
  }
  return pts;
}
const flattenAll = (o) => flatten(o, 24);
function paint(outlines, w, h, ss = 5) {
  const edges = [];
  for (const o of outlines) {
    const p = flatten(o);
    for (let i = 0; i < p.length - 1; i++) edges.push([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]);
  }
  const cov = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let sy = 0; sy < ss; sy++) {
      const yy = y + (sy + 0.5) / ss;
      const hits = [];
      for (const [ax, ay, bx, by] of edges) {
        if (ay === by) continue;
        if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) hits.push([ax + ((yy - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      let wind = 0;
      for (let k = 0; k < hits.length - 1; k++) {
        wind += hits[k][1];
        if (wind === 0) continue;
        const a = Math.max(0, hits[k][0]);
        const b = Math.min(w, hits[k + 1][0]);
        for (let x = Math.floor(a); x < b; x++) cov[y * w + x] += (Math.min(b, x + 1) - Math.max(a, x)) / ss;
      }
    }
  }
  return cov;
}
const sum = (a) => a.reduce((s, v) => s + v, 0);
// Average distance in pixels between the drawn outline and the ink's soft edge:
// the area they disagree on, per pixel of edge.
function deviation(cov, f) {
  let diff = 0;
  let edge = 0;
  for (let k = 0; k < f.length; k++) {
    diff += Math.abs(cov[k] - f[k]);
    if (f[k] > 0.02 && f[k] < 0.98) edge++;
  }
  return diff / Math.max(1, edge);
}
const P = { level: 0.5, blurPx: 0.7, minAreaPx: 3, tolerancePx: 0.5, cornerDeg: 60 };
const nodesOf = (r) => r.outlines.map((o) => (o.length - 2) / 6);

test("a disc becomes one smooth outline of a few nodes with the right area", () => {
  const f = ink(120, 120, disc(60.3, 59.8, 40));
  const r = traceInk(f, 120, 120, P);
  assert.equal(r.outlines.length, 1);
  assert.equal(r.islands, 1);
  assert.ok(r.nodes <= 8, `nodes ${r.nodes}`);
  const cov = paint(r.outlines, 120, 120);
  assert.ok(Math.abs(sum(cov) / (Math.PI * 1600) - 1) < 0.01, `area ${sum(cov)}`);
  assert.ok(deviation(cov, f) < 0.25, `deviation ${deviation(cov, f)}`);
});

test("walking direction: the ink's edge has a negative area, a hole's edge a positive one", () => {
  const f = ink(120, 120, minus(disc(60, 60, 45), disc(60, 60, 20)));
  const loops = findLoops(f, 120, 120, 0.5);
  assert.equal(loops.length, 2);
  const [outer, hole] = loops.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  assert.ok(outer.area < 0 && hole.area > 0);
  assert.ok(Math.abs(Math.abs(outer.area) / (Math.PI * 45 * 45) - 1) < 0.01);
  assert.ok(Math.abs(hole.area / (Math.PI * 20 * 20) - 1) < 0.02);
});

test("a ring keeps its hole; an island inside the hole is filled again", () => {
  const shape = either(minus(disc(70, 70, 60), disc(70, 70, 40)), disc(70, 70, 20));
  const f = ink(140, 140, shape);
  const r = traceInk(f, 140, 140, P);
  assert.equal(r.islands, 2);
  assert.equal(r.holes, 1);
  const cov = paint(r.outlines, 140, 140);
  assert.ok(deviation(cov, f) < 0.25, `deviation ${deviation(cov, f)}`);
  assert.ok(cov[70 * 140 + 70] > 0.99, "centre island filled");
  assert.ok(cov[70 * 140 + 70 + 30] < 0.01, "hole empty");
});

test("a rectangle stays a rectangle: four straight edges, sharp corners in the right place", () => {
  const f = ink(160, 120, rect(20.4, 30.2, 130.7, 90.6));
  const r = traceInk(f, 160, 120, P);
  assert.equal(r.outlines.length, 1);
  assert.equal(r.nodes, 4, `nodes ${r.nodes}`);
  const o = r.outlines[0];
  const corners = [[o[0], o[1]]];
  for (let i = 2; i < o.length - 6; i += 6) corners.push([o[i + 4], o[i + 5]]);
  for (const [tx, ty] of [[20.4, 30.2], [130.7, 30.2], [130.7, 90.6], [20.4, 90.6]]) {
    const d = Math.min(...corners.map(([x, y]) => Math.hypot(x - tx, y - ty)));
    assert.ok(d < 0.8, `corner ${tx},${ty} is ${d.toFixed(2)}px off`);
  }
  // the edges are straight: handles lie on the chord
  let x0 = o[0];
  let y0 = o[1];
  for (let i = 2; i < o.length; i += 6) {
    const x = o[i + 4];
    const y = o[i + 5];
    const len = Math.hypot(x - x0, y - y0);
    for (const [cx, cy] of [[o[i], o[i + 1]], [o[i + 2], o[i + 3]]]) {
      const off = Math.abs((x - x0) * (y0 - cy) - (x0 - cx) * (y - y0)) / len;
      assert.ok(off < 0.3, `handle ${off.toFixed(2)}px off its edge`);
    }
    x0 = x;
    y0 = y;
  }
});

test("a turned rectangle keeps four corners too", () => {
  const f = ink(160, 160, rotatedRect(80, 80, 55, 30, 28));
  const r = traceInk(f, 160, 160, P);
  assert.equal(r.nodes, 4, `nodes ${r.nodes}`);
  assert.ok(deviation(paint(r.outlines, 160, 160), f) < 0.4);
});

test("the cornerDeg setting: 180 rounds everything, a low one keeps gentle turns", () => {
  const f = ink(160, 120, rect(20, 30, 130, 90));
  const round = traceInk(f, 160, 120, { ...P, cornerDeg: 180 });
  assert.ok(round.nodes >= 2);
  // all joins smooth: the tangent leaving each node matches the one arriving
  const o = round.outlines[0];
  const n = (o.length - 2) / 6;
  for (let k = 0; k < n; k++) {
    const i = 2 + k * 6;
    const next = 2 + ((k + 1) % n) * 6;
    const px = o[i + 4];
    const py = o[i + 5];
    const inx = px - o[i + 2];
    const iny = py - o[i + 3];
    const outx = o[next] - px;
    const outy = o[next + 1] - py;
    const cos = (inx * outx + iny * outy) / (Math.hypot(inx, iny) * Math.hypot(outx, outy));
    assert.ok(cos > 0.97, `join ${k} not smooth (cos ${cos.toFixed(3)})`);
  }
});

test("a tapered brush stroke keeps its taper", () => {
  const path = (t) => [20 + 160 * t, 60 + 25 * Math.sin(t * 6.3)];
  const f = ink(200, 120, stroke(path, (t) => 1.2 + 6 * Math.sin(Math.PI * t)));
  const r = traceInk(f, 200, 120, P);
  assert.equal(r.outlines.length, 1);
  assert.ok(r.nodes < 70, `nodes ${r.nodes}`);
  const cov = paint(r.outlines, 200, 120);
  assert.ok(deviation(cov, f) < 0.4, `deviation ${deviation(cov, f)}`);
  assert.ok(Math.abs(sum(cov) / sum(f) - 1) < 0.03, `area ${sum(cov)} vs ${sum(f)}`);
});

test("a looser tolerance gives fewer nodes", () => {
  const path = (t) => [20 + 160 * t, 60 + 25 * Math.sin(t * 6.3)];
  const f = ink(200, 120, stroke(path, (t) => 2 + 5 * Math.sin(Math.PI * t)));
  const tight = traceInk(f, 200, 120, { ...P, tolerancePx: 0.25 });
  const loose = traceInk(f, 200, 120, { ...P, tolerancePx: 1.5 });
  assert.ok(loose.nodes < tight.nodes, `${loose.nodes} vs ${tight.nodes}`);
});

test("specks below the minimum area are dropped, bigger dots stay", () => {
  const f = ink(100, 100, either(disc(30, 30, 1.2), disc(70, 70, 5)));
  assert.equal(traceInk(f, 100, 100, { ...P, minAreaPx: 0 }).outlines.length, 2);
  const r = traceInk(f, 100, 100, { ...P, minAreaPx: 10 });
  assert.equal(r.outlines.length, 1);
  assert.ok(r.outlines[0][0] > 60);
});

test("a shape touching the edge of the picture is closed along the edge", () => {
  const f = ink(100, 80, rect(-10, 20, 40, 100));
  const r = traceInk(f, 100, 80, P);
  const cov = paint(r.outlines, 100, 80);
  assert.ok(deviation(cov, f) < 0.3);
  for (const o of r.outlines) for (let i = 0; i < o.length; i += 2) assert.ok(o[i] >= 0 && o[i] <= 100 && o[i + 1] >= 0 && o[i + 1] <= 80);
});

test("a hard-edged picture (no anti-aliasing) still comes out smooth", () => {
  const f = ink(120, 120, disc(60, 60, 35), 1);
  const r = traceInk(f, 120, 120, P);
  assert.ok(r.nodes <= 10, `nodes ${r.nodes}`);
  assert.ok(Math.abs(sum(paint(r.outlines, 120, 120)) / sum(f) - 1) < 0.015);
  // round: every point of the curve within a pixel of the true circle
  const dev = flattenAll(r.outlines[0]).map(([x, y]) => Math.abs(Math.hypot(x - 60, y - 60) - 35));
  assert.ok(Math.max(...dev) < 1, `worst ${Math.max(...dev)}`);
});

test("the level moves the edge: lower = bolder line", () => {
  const f = ink(120, 120, disc(60, 60, 30));
  const soft = blurField(f, 120, 120, 3);
  const bold = sum(paint(fitLoops(findLoops(soft, 120, 120, 0.3), P).outlines, 120, 120));
  const thin = sum(paint(fitLoops(findLoops(soft, 120, 120, 0.7), P).outlines, 120, 120));
  assert.ok(bold > thin * 1.1, `${bold} vs ${thin}`);
});

test("a saddle (two lines about to touch) is resolved without breaking the walk", () => {
  // two diagonal strokes that almost meet: marching squares saddle cells
  const f = ink(80, 80, either(rotatedRect(30, 40, 22, 3, 40), rotatedRect(52, 40, 22, 3, -40)));
  const r = traceInk(f, 80, 80, P);
  assert.ok(r.outlines.length >= 1);
  assert.ok(deviation(paint(r.outlines, 80, 80), f) < 0.4);
});

// ---- files

function sample() {
  const f = ink(200, 150, either(minus(rect(20.4, 30.2, 130.7, 120.6), rect(50, 60, 100, 90)), disc(165, 75, 20)));
  const r = traceInk(f, 200, 150, P);
  return { r, doc: { outlines: r.outlines, closed: r.closed, width: 200, height: 150, dpi: 300, mode: "fill", color: "#000000", strokeMm: 0.25 } };
}

// the path data of an SVG, back to absolute points
function svgPoints(svg) {
  const d = /\sd="([^"]+)"/.exec(svg)[1];
  const subs = [];
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([MmLlCcZz])([^MmLlCcZz]*)/g)) {
    const v = m[2].trim() === "" ? [] : m[2].trim().split(/[ ,]+/).map(Number);
    if (m[1] === "M") {
      [x, y] = v;
      subs.push([[x, y, "M"]]);
    } else if (m[1] === "l") {
      x += v[0];
      y += v[1];
      subs.at(-1).push([x, y, "l"]);
    } else if (m[1] === "c") {
      subs.at(-1).push([x + v[0], y + v[1], "c1"], [x + v[2], y + v[3], "c2"]);
      x += v[4];
      y += v[5];
      subs.at(-1).push([x, y, "c"]);
    } else if (m[1] === "z") subs.at(-1).closed = true;
  }
  return subs;
}

test("SVG: physical size from the dpi, every node where the outline has it, holes closed", () => {
  const { r, doc } = sample();
  const svg = svgOf(doc);
  assert.match(svg, /width="16\.933mm" height="12\.700mm" viewBox="0 0 16\.933 12\.700"/);
  assert.match(svg, /fill="#000000" fill-rule="nonzero"/);
  const subs = svgPoints(svg);
  assert.equal(subs.length, r.outlines.length);
  const mm = 25.4 / 300;
  r.outlines.forEach((o, k) => {
    assert.ok(subs[k].closed);
    assert.ok(Math.abs(subs[k][0][0] - o[0] * mm) < 0.002 && Math.abs(subs[k][0][1] - o[1] * mm) < 0.002);
    const ends = subs[k].filter((p) => p[2] === "l" || p[2] === "c");
    assert.equal(ends.length, (o.length - 2) / 6);
    ends.forEach((p, i) => {
      assert.ok(Math.abs(p[0] - o[2 + i * 6 + 4] * mm) < 0.002 && Math.abs(p[1] - o[2 + i * 6 + 5] * mm) < 0.002, "node " + i);
    });
  });
});

test("SVG: straight edges are written as lines, curves as curves", () => {
  const { doc } = sample();
  const svg = svgOf(doc);
  assert.ok(/l-?[0-9.]+ -?[0-9.]+/.test(svg), "has straight segments");
  assert.ok(/c-?[0-9.]+ -?[0-9.]+ -?[0-9.]+ -?[0-9.]+ -?[0-9.]+ -?[0-9.]+/.test(svg), "has curves");
});

test("SVG stroke mode: one path per line with the stroke width in mm", () => {
  const { r, doc } = sample();
  const svg = svgOf({ ...doc, mode: "stroke", color: "#EC008C" });
  assert.equal((svg.match(/<path /g) || []).length, r.outlines.length);
  assert.match(svg, /fill="none" stroke="#EC008C" stroke-width="0\.25"/);
  assert.match(svg, /<g id="CutContour" /, "the cut-line pink names its group like the sticker tool's cut file");
  assert.ok(!svgOf({ ...doc, mode: "stroke", color: "#000000" }).includes("CutContour"));
});

test("PDF: a valid file — offsets in the xref table point at their objects", () => {
  const { doc } = sample();
  const bytes = pdfOf(doc);
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.startsWith("%PDF-1.4\n") && text.trimEnd().endsWith("%%EOF"));
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const entries = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  assert.equal(entries.length, 4);
  entries.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  const len = Number(/\/Length (\d+)/.exec(text)[1]);
  const body = text.slice(text.indexOf("stream\n") + 7);
  assert.equal(body.indexOf("endstream"), len);
  assert.match(text, /\/MediaBox \[0 0 48 36\]/);
  assert.match(body, /0 0 0 1 k/);
  assert.ok(body.includes("\nf\n"));
});

test("PDF stroke mode: stroke width in points, round caps", () => {
  const { doc } = sample();
  const text = new TextDecoder("latin1").decode(pdfOf({ ...doc, mode: "stroke", color: "#EC008C" }));
  assert.match(text, /0\.709 w 1 J 1 j/);
  assert.match(text, /0\.925 0 0\.549 RG/);
  assert.ok(text.includes("\nS\n"));
});

test("EPS: bounding box and operators", () => {
  const { doc } = sample();
  const eps = epsOf(doc);
  assert.ok(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0"));
  assert.match(eps, /%%BoundingBox: 0 0 48 36/);
  assert.match(eps, /0 0 0 1 setcmykcolor/);
  assert.ok(eps.includes("\nf\n") && eps.trimEnd().endsWith("%%EOF"));
});
