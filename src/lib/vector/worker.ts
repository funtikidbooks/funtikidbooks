// Off the main thread: a big line drawing is a few seconds of maths.
import { inkMap } from "../lineart/extract";
import { findCenterlines } from "./centerline";
import { blurField, findLoops, fitLoops, fitPolylines, type Loop, type Polyline, type TraceParams } from "./trace";

export type VectorSettings = {
  mode: "auto" | "outline" | "centerline";
  level: number; // outline: ink level of the edge
  levelThin: number; // centre line: ink level that counts as line
  blurPx: number;
  minAreaPx: number; // outline: smaller specks and pin-holes dropped
  minLengthPx: number; // centre line: shorter lines dropped
  spurPx: number; // centre line: shorter dead-end stubs cut
  tolerancePx: number;
  cornerDeg: number;
  autoWidthPx: number; // "auto": lines up to this wide are read as centre lines
};

export type VectorWorkerIn =
  | { type: "load"; rgba: ArrayBuffer; width: number; height: number; invert: boolean }
  | { type: "trace"; id: number; s: VectorSettings };

export type VectorWorkerOut =
  | { type: "loaded"; color: string }
  | {
      type: "result";
      id: number;
      mode: "outline" | "centerline";
      outlines: Float32Array[];
      closed: boolean[];
      nodes: number;
      islands: number;
      holes: number;
      maxDevPx: number;
      widthPx: number; // how wide the lines in the picture are
      ms: number;
    }
  | { type: "error"; message: string };

let ink: Float32Array | null = null;
let size = { w: 0, h: 0 };
let field: Float32Array | null = null;
let fieldKey = "";
let loops: Loop[] = [];
let loopsKey = "";
let centre: { lines: Polyline[]; widthPx: number } | null = null;
let centreKey = "";

const post = (m: VectorWorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

const blurred = (sigma: number) => {
  const key = String(sigma);
  if (!field || fieldKey !== key) {
    field = blurField(ink!, size.w, size.h, sigma);
    fieldKey = key;
  }
  return field;
};

// How wide the lines are: ink area over half the edge length.
function widthOf(list: Loop[]): number {
  let area = 0;
  let edge = 0;
  for (const l of list) {
    area -= l.area;
    const p = l.pts;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      edge += Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
    }
  }
  return edge > 0 ? (2 * area) / edge : 0;
}

// The colour the lines are drawn in: the average of the pixels that are fully
// line (transparent ones have no colour). Near-black becomes pure black so it
// prints as plain K ink. White lines on black (inverted) are a knockout look:
// the file gets black lines.
function lineColor(px: Uint8Array, inkValues: Float32Array, inverted: boolean): string {
  if (inverted) return "#000000";
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < inkValues.length; i++) {
    if (inkValues[i] < 0.9 || px[i * 4 + 3] < 128) continue;
    r += px[i * 4];
    g += px[i * 4 + 1];
    b += px[i * 4 + 2];
    n++;
  }
  if (!n) return "#000000";
  const c = [r, g, b].map((v) => v / n);
  if (Math.max(...c) <= 56) return "#000000";
  return "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

self.onmessage = (e: MessageEvent<VectorWorkerIn>) => {
  try {
    const m = e.data;
    if (m.type === "load") {
      const px = new Uint8Array(m.rgba);
      if (m.invert) for (let i = 0; i < px.length; i += 4) {
        px[i] = 255 - px[i];
        px[i + 1] = 255 - px[i + 1];
        px[i + 2] = 255 - px[i + 2];
      }
      ink = inkMap(px, m.width, m.height);
      size = { w: m.width, h: m.height };
      const color = lineColor(px, ink, m.invert);
      field = null;
      fieldKey = "";
      loopsKey = "";
      centreKey = "";
      centre = null;
      loops = [];
      post({ type: "loaded", color });
      return;
    }
    if (!ink) throw new Error("Chưa có hình.");
    const t0 = performance.now();
    const s = m.s;
    const { w, h } = size;
    const params: TraceParams = { level: s.level, blurPx: s.blurPx, minAreaPx: s.minAreaPx, tolerancePx: s.tolerancePx, cornerDeg: s.cornerDeg };

    const edgeLoops = () => {
      const key = `${s.blurPx}|${s.level}`;
      if (loopsKey !== key) {
        loops = findLoops(blurred(s.blurPx), w, h, s.level);
        loopsKey = key;
      }
      return loops;
    };
    let mode: "outline" | "centerline";
    let widthPx = 0;
    if (s.mode === "auto") {
      widthPx = widthOf(edgeLoops());
      mode = widthPx > 0 && widthPx <= s.autoWidthPx ? "centerline" : "outline";
    } else mode = s.mode;

    let res;
    if (mode === "outline") {
      const list = edgeLoops();
      if (!widthPx) widthPx = widthOf(list);
      res = fitLoops(list, params);
    } else {
      const key = `${s.blurPx}|${s.levelThin}|${s.minLengthPx}|${s.spurPx}`;
      if (!centre || centreKey !== key) {
        const c = findCenterlines(blurred(s.blurPx), w, h, { level: s.levelThin, minLengthPx: s.minLengthPx, spurPx: s.spurPx });
        centre = { lines: c.lines, widthPx: c.widthPx };
        centreKey = key;
      }
      widthPx = centre.widthPx;
      // A band's middle is not where its corner is, and hard-edged lines have
      // pixel steps: look for each corner's tip further along the edges, and
      // smooth the lines between corners.
      res = fitPolylines(centre.lines, { ...params, smoothPx: 1, cornerClearPx: Math.min(6, centre.widthPx) });
    }
    post(
      {
        type: "result",
        id: m.id,
        mode,
        outlines: res.outlines,
        closed: res.closed,
        nodes: res.nodes,
        islands: res.islands,
        holes: res.holes,
        maxDevPx: res.maxDevPx,
        widthPx,
        ms: Math.round(performance.now() - t0),
      },
      res.outlines.map((o) => o.buffer as ArrayBuffer),
    );
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
