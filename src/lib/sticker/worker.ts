// Runs the sticker-border tool off the main thread: a 60MB sheet with forty
// pieces is a few seconds of maths that would otherwise freeze the page.
import { makeBorder, distanceTransform, traceOutlines, type BorderParams } from "./border";
import { encodeChannel, parsePsd, readChannel, writePsdWithLayers, type NewLayer, type PsdFile, type PsdLayer } from "./psd";

export type StickerSettings = {
  insideMm: number;
  bleedMm: number;
  gapMm: number; // die lines at least this far apart
  edgeMm: number; // die lines at least this far from the trim edge
  trimInsetMm: number; // file edge → trim edge (0 = the file is the trimmed page)
  smoothMm: number;
  deepen: number;
};

export type LayerInfo = { index: number; name: string; group: string; w: number; h: number; auto: boolean };

export type Conflict = { x: number; y: number; kind: "gap" | "edge"; layers: string[] };

export type WorkerIn =
  | { type: "load"; file: ArrayBuffer }
  | { type: "run"; settings: StickerSettings; enabled: number[]; previewWidth: number }
  | { type: "export"; baseName: string };

export type WorkerOut =
  | { type: "loaded"; width: number; height: number; dpi: number; mode: "CMYK" | "RGB"; layers: LayerInfo[]; own: number }
  | { type: "progress"; done: number; total: number }
  | { type: "result"; preview: ArrayBuffer; pw: number; ph: number; scale: number; conflicts: Conflict[]; bordered: number }
  | { type: "exported"; psd: Blob; svg: string }
  | { type: "error"; message: string };

type Done = {
  name: string; // the sticker's layer names
  bottomIndex: number; // its border goes right under this layer
  dieAbove: number; // its die line goes right above this one
  border: NewLayer;
  cut: Uint8Array;
  line: Uint8Array;
  left: number;
  top: number;
  w: number;
  h: number;
};

let psd: PsdFile | null = null;
let results: Done[] = [];
let lastSettings: StickerSettings | null = null;

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

// This tool's own layers in a file it wrote earlier: the borders and the
// die lines (one per sticker; a single "KHUÔN CẮT" for the whole sheet
// before 29/10/2026). Loading that file again treats them as old output,
// not art, and the download swaps them for fresh ones — so a sheet
// rearranged in Photoshop just goes through the tool once more.
const OWN_LAYER = /^(Viền - |Vien - |Khuôn cắt - |Khuon cat - |KHUÔN CẮT$|KHUON CAT$)/;
const isOwnLayer = (l: PsdLayer) => l.section === 0 && OWN_LAYER.test(l.name.normalize("NFC"));

// The layer a sticker's die line goes right above: its top layer, or the
// last layer (or clipped group) clipped onto that — slipping a layer in
// under those would break their clipping.
function dieSlot(p: PsdFile, top: number) {
  let i = top;
  for (;;) {
    const next = p.layers[i + 1];
    if (!next) return i;
    if (next.section === 0 && next.clipping) {
      i++;
      continue;
    }
    if (next.section !== 3) return i;
    // A group starts above: skip it whole if it's clipped (the flag is on
    // its folder record, at the group's top).
    let depth = 0;
    let j = i + 1;
    for (; j < p.layers.length; j++) {
      if (p.layers[j].section === 3) depth++;
      else if (p.layers[j].section === 1 || p.layers[j].section === 2) depth--;
      if (depth === 0) break;
    }
    if (j >= p.layers.length || !p.layers[j].clipping) return i;
    i = j;
  }
}

function isCandidate(p: PsdFile, l: PsdLayer) {
  const w = l.right - l.left;
  const h = l.bottom - l.top;
  return (
    l.section === 0 &&
    !l.hidden &&
    !l.clipping &&
    w > 0 &&
    h > 0 &&
    l.channels.some((c) => c.id === -1) &&
    // A full-page background or texture isn't a sticker.
    w * h < p.width * p.height * 0.4
  );
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  try {
    const m = e.data;
    if (m.type === "load") {
      psd = parsePsd(new Uint8Array(m.file));
      results = [];
      post({
        type: "loaded",
        width: psd.width,
        height: psd.height,
        dpi: psd.dpi,
        mode: psd.mode === 4 ? "CMYK" : "RGB",
        own: psd.layers.filter(isOwnLayer).length,
        layers: psd.layers
          .filter((l) => l.section === 0 && !l.hidden && !l.clipping && l.right > l.left && !isOwnLayer(l))
          .map((l) => ({
            index: l.index,
            name: l.name,
            group: l.groupPath.join(" › "),
            w: l.right - l.left,
            h: l.bottom - l.top,
            auto: isCandidate(psd!, l),
          }))
          .reverse(),
      });
    } else if (m.type === "run") {
      run(m.settings, new Set(m.enabled), m.previewWidth);
    } else if (m.type === "export") {
      exportFiles(m.baseName);
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

function run(s: StickerSettings, enabled: Set<number>, previewWidth: number) {
  const p = psd!;
  lastSettings = s;
  const mm = p.dpi / 25.4;
  const params: BorderParams = {
    insidePx: s.insideMm * mm,
    bleedPx: s.bleedMm * mm,
    smoothPx: s.smoothMm * mm,
    linePx: Math.max(1.5, 0.25 * mm),
    deepen: s.deepen,
  };
  const cmyk = p.mode === 4;
  const colorIds = cmyk ? [0, 1, 2, 3] : [0, 1, 2];
  const drawable = (l: PsdLayer) => l.section === 0 && !l.hidden && l.right > l.left && l.bottom > l.top;
  const readColors = (l: PsdLayer) => {
    const n = (l.right - l.left) * (l.bottom - l.top);
    return colorIds.map((id) => readChannel(p, l, id) ?? new Uint8Array(n).fill(cmyk ? 255 : 0));
  };

  // 1. Pieces that touch or overlap — a bow on its own layer sitting on the
  // dress — are one sticker: one border, one die line.
  const alphas = new Map<number, Uint8Array>();
  for (const l of p.layers) {
    if (!enabled.has(l.index) || !drawable(l) || l.clipping || isOwnLayer(l)) continue;
    const a = readChannel(p, l, -1);
    if (a) alphas.set(l.index, a);
  }
  const pieces = p.layers.filter((l) => alphas.has(l.index));
  const parent = pieces.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const g = Math.max(1, Math.round(p.dpi / 150));
  const gw = Math.ceil(p.width / g) + 1;
  const grid = new Int32Array(gw * (Math.ceil(p.height / g) + 1));
  pieces.forEach((l, k) => {
    const a = alphas.get(l.index)!;
    const w = l.right - l.left;
    for (let y = 0; y < l.bottom - l.top; y += g) {
      const gy = Math.floor((l.top + y) / g);
      if (l.top + y < 0 || l.top + y >= p.height) continue;
      for (let x = 0; x < w; x += g) {
        if (a[y * w + x] < 128 || l.left + x < 0 || l.left + x >= p.width) continue;
        const cell = gy * gw + Math.floor((l.left + x) / g);
        if (grid[cell]) parent[find(k)] = find(grid[cell] - 1);
        grid[cell] = k + 1;
      }
    }
  });
  const groups = new Map<number, PsdLayer[]>();
  pieces.forEach((l, k) => {
    const r = find(k);
    groups.set(r, [...(groups.get(r) ?? []), l]);
  });

  // 2. A border per sticker, from all its layers stacked (top one wins).
  results = [];
  const shown = new Map<number, { left: number; top: number; w: number; h: number; color: Uint8Array[]; fill: Uint8Array }>();
  let done = 0;
  for (const members of groups.values()) {
    members.sort((a, b) => a.index - b.index);
    const left = Math.min(...members.map((l) => l.left));
    const top = Math.min(...members.map((l) => l.top));
    const w = Math.max(...members.map((l) => l.right)) - left;
    const h = Math.max(...members.map((l) => l.bottom)) - top;
    const alpha = new Uint8Array(w * h);
    const ch = colorIds.map(() => new Uint8Array(w * h).fill(cmyk ? 255 : 0));
    for (const l of members) {
      const a = alphas.get(l.index)!;
      const c = readColors(l);
      const lw = l.right - l.left;
      for (let y = 0; y < l.bottom - l.top; y++) {
        for (let x = 0; x < lw; x++) {
          const s0 = y * lw + x;
          if (!a[s0]) continue;
          const d = (l.top - top + y) * w + (l.left - left + x);
          if (a[s0] >= 128 || !alpha[d]) for (let k = 0; k < c.length; k++) ch[k][d] = c[k][s0];
          if (a[s0] > alpha[d]) alpha[d] = a[s0];
        }
      }
    }
    const b = makeBorder(alpha, ch, w, h, left, top, cmyk, params);
    done++;
    post({ type: "progress", done, total: groups.size });
    if (!b) continue;
    const full = members.map((l) => l.name).reverse().join(" + ");
    const name = full.length > 60 ? full.slice(0, 57) + "…" : full;
    results.push({
      name,
      bottomIndex: members[0].index,
      dieAbove: dieSlot(p, members[members.length - 1].index),
      border: {
        name: `Viền - ${name}`,
        top: b.top,
        left: b.left,
        bottom: b.top + b.h,
        right: b.left + b.w,
        channels: [
          { id: -1, data: encodeChannel(b.fill, b.w, b.h) },
          ...b.color.map((c, k) => ({ id: colorIds[k], data: encodeChannel(c, b.w, b.h) })),
        ],
      },
      cut: b.cut,
      line: b.line,
      left: b.left,
      top: b.top,
      w: b.w,
      h: b.h,
    });
    shown.set(members[0].index, { left: b.left, top: b.top, w: b.w, h: b.h, color: b.color, fill: b.fill });
  }

  // 3. Preview: each sticker's border under its lowest layer, the art (and
  // anything clipped onto it) on top, die lines over everything.
  const scale = Math.min(1, previewWidth / p.width);
  const pw = Math.max(1, Math.round(p.width * scale));
  const ph = Math.max(1, Math.round(p.height * scale));
  const rgb = new Float32Array(pw * ph * 3).fill(1);
  const baseAlpha = new Float32Array(pw * ph);
  const paint = (
    left: number,
    top: number,
    w: number,
    h: number,
    alpha: (i: number) => number,
    color: (i: number) => [number, number, number],
    clipToBase: boolean,
    setBase: boolean,
  ) => {
    const x0 = Math.max(0, Math.floor(left * scale));
    const y0 = Math.max(0, Math.floor(top * scale));
    const x1 = Math.min(pw, Math.ceil((left + w) * scale));
    const y1 = Math.min(ph, Math.ceil((top + h) * scale));
    if (setBase) baseAlpha.fill(0);
    for (let py = y0; py < y1; py++) {
      const sy = Math.floor((py + 0.5) / scale) - top;
      if (sy < 0 || sy >= h) continue;
      for (let px = x0; px < x1; px++) {
        const sx = Math.floor((px + 0.5) / scale) - left;
        if (sx < 0 || sx >= w) continue;
        const i = sy * w + sx;
        let a = alpha(i);
        const o = py * pw + px;
        if (clipToBase) a *= baseAlpha[o];
        if (setBase) baseAlpha[o] = a;
        if (a <= 0) continue;
        const c = color(i);
        rgb[o * 3] += (c[0] - rgb[o * 3]) * a;
        rgb[o * 3 + 1] += (c[1] - rgb[o * 3 + 1]) * a;
        rgb[o * 3 + 2] += (c[2] - rgb[o * 3 + 2]) * a;
      }
    }
  };
  const toRgb = (ch: Uint8Array[], i: number): [number, number, number] =>
    cmyk
      ? [(ch[0][i] * ch[3][i]) / 65025, (ch[1][i] * ch[3][i]) / 65025, (ch[2][i] * ch[3][i]) / 65025]
      : [ch[0][i] / 255, ch[1][i] / 255, ch[2][i] / 255];
  let baseOn = false;
  for (const l of p.layers) {
    if (!drawable(l)) continue;
    if (!l.clipping) baseOn = alphas.has(l.index);
    if (!baseOn) continue;
    const b = shown.get(l.index);
    if (b) paint(b.left, b.top, b.w, b.h, (i) => b.fill[i] / 255, (i) => toRgb(b.color, i), false, false);
    const alpha = l.clipping ? readChannel(p, l, -1) : alphas.get(l.index)!;
    const ch = readColors(l);
    const op = l.opacity / 255;
    paint(l.left, l.top, l.right - l.left, l.bottom - l.top, (i) => ((alpha ? alpha[i] : 255) / 255) * op, (i) => toRgb(ch, i), l.clipping, !l.clipping);
  }
  for (const r of results) {
    paint(r.left, r.top, r.w, r.h, (i) => r.line[i] / 255, () => [0.93, 0, 0.55], false, false);
  }

  const conflicts = checkSpacing(p, s);
  const out = new Uint8ClampedArray(pw * ph * 4);
  for (let i = 0; i < pw * ph; i++) {
    out[i * 4] = rgb[i * 3] * 255;
    out[i * 4 + 1] = rgb[i * 3 + 1] * 255;
    out[i * 4 + 2] = rgb[i * 3 + 2] * 255;
    out[i * 4 + 3] = 255;
  }
  post({ type: "result", preview: out.buffer, pw, ph, scale, conflicts, bordered: results.length }, [out.buffer]);
}

// Die lines closer than the spec to each other or to the trim edge, found
// on a half-resolution grid (plenty for millimetres).
function checkSpacing(p: PsdFile, s: StickerSettings): Conflict[] {
  const g = Math.max(1, Math.round(p.dpi / 150));
  const gw = Math.ceil(p.width / g);
  const gh = Math.ceil(p.height / g);
  const label = new Int32Array(gw * gh);
  const mmCells = p.dpi / 25.4 / g;
  const found: Conflict[] = [];
  const near = (x: number, y: number) => found.some((c) => Math.abs(c.x - x) < 6 * mmCells * g && Math.abs(c.y - y) < 6 * mmCells * g);
  const add = (c: Conflict) => {
    if (!near(c.x, c.y)) found.push(c);
  };

  results.forEach((r, k) => {
    for (let y = 0; y < r.h; y += g) {
      for (let x = 0; x < r.w; x += g) {
        if (!r.cut[y * r.w + x]) continue;
        const gx = Math.floor((r.left + x) / g);
        const gy = Math.floor((r.top + y) / g);
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) {
          add({ x: r.left + x, y: r.top + y, kind: "edge", layers: [r.name] });
          continue;
        }
        const i = gy * gw + gx;
        if (label[i] && label[i] !== k + 1) {
          add({ x: gx * g, y: gy * g, kind: "gap", layers: [results[label[i] - 1].name, r.name] });
        }
        label[i] = k + 1;
      }
    }
  });

  const feature = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) feature[i] = label[i] ? 1 : 0;
  const { dist, nearest } = distanceTransform(feature, gw, gh, true);
  const minGap = s.gapMm * mmCells - 0.5;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const a = label[nearest![i]];
      for (const j of [x + 1 < gw ? i + 1 : -1, y + 1 < gh ? i + gw : -1]) {
        if (j < 0) continue;
        const b = label[nearest![j]];
        if (a && b && a !== b && dist[i] + dist[j] + 1 < minGap) {
          add({ x: x * g, y: y * g, kind: "gap", layers: [results[a - 1].name, results[b - 1].name] });
        }
      }
    }
  }

  const edge = (s.trimInsetMm + s.edgeMm) * mmCells;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!label[i]) continue;
      if (x < edge || y < edge || gw - 1 - x < edge || gh - 1 - y < edge) {
        add({ x: x * g, y: y * g, kind: "edge", layers: [results[label[i] - 1].name] });
      }
    }
  }
  return found;
}

// A sticker's die line as a layer of its own, cropped to the line.
function dieLayer(r: Done, ink: number[]): NewLayer | null {
  let x0 = r.w;
  let y0 = r.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (!r.line[y * r.w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) alpha.set(r.line.subarray((y0 + y) * r.w + x0, (y0 + y) * r.w + x0 + w), y * w);
  const solid = (v: number) => encodeChannel(new Uint8Array(w * h).fill(v), w, h);
  return {
    name: `Khuôn cắt - ${r.name}`,
    top: r.top + y0,
    left: r.left + x0,
    bottom: r.top + y0 + h,
    right: r.left + x0 + w,
    channels: [{ id: -1, data: encodeChannel(alpha, w, h) }, ...ink.map((v, k) => ({ id: k, data: solid(v) }))],
  };
}

function exportFiles(baseName: string) {
  const p = psd!;
  const s = lastSettings!;
  const cmyk = p.mode === 4;
  const magenta = cmyk ? [255, 0, 255, 255] : [236, 0, 140]; // CMYK stored inverted: 100% M only

  // Each sticker comes out as one run of layers — its border right under
  // the art, its die line right above — so selecting the run moves the
  // whole sticker (staff had to cut die lines out of one shared layer).
  // Where two land in the same slot the die line goes first: one sticker's
  // die line, then the next sticker's border.
  const below = new Map<number, NewLayer[]>();
  const onTop: NewLayer[] = [];
  const place = (slot: number, l: NewLayer) => {
    if (slot < p.layers.length) below.set(slot, [...(below.get(slot) ?? []), l]);
    else onTop.push(l);
  };
  for (const r of results) {
    const die = dieLayer(r, magenta);
    if (die) place(r.dieAbove + 1, die);
  }
  for (const r of results) place(r.bottomIndex, r.border);
  const own = new Set(p.layers.filter(isOwnLayer).map((l) => l.index));
  const blob = writePsdWithLayers(p, below, onTop, own);

  const pxToMm = 25.4 / p.dpi;
  const paths = results
    .flatMap((r) => traceOutlines(r.cut, r.w, r.h, r.left + 0.5, r.top + 0.5))
    .map((pts) => {
      let d = "";
      for (let i = 0; i < pts.length; i += 2) d += `${i ? "L" : "M"}${(pts[i] * pxToMm).toFixed(3)} ${(pts[i + 1] * pxToMm).toFixed(3)}`;
      return `<path d="${d}Z"/>`;
    });
  const wmm = (p.width * pxToMm).toFixed(3);
  const hmm = (p.height * pxToMm).toFixed(3);
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- ${baseName} — khuôn cắt: ${s.insideMm}mm quanh hình, bù nền ngoài khuôn ${s.bleedMm}mm -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="0 0 ${wmm} ${hmm}">\n` +
    `<g id="CutContour" fill="none" stroke="#EC008C" stroke-width="0.25">\n${paths.join("\n")}\n</g>\n</svg>\n`;
  post({ type: "exported", psd: blob, svg });
}
