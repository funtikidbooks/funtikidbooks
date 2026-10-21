// Off the main thread: a 2000px sketch is a second or two of maths.
import { extractStrokes, inkMap, type ExtractParams, type Stroke } from "./extract";

export type LineWorkerIn =
  | { type: "load"; rgba: ArrayBuffer; width: number; height: number }
  | { type: "extract"; params: ExtractParams };

export type LineWorkerOut =
  | { type: "loaded" }
  | { type: "strokes"; strokes: Stroke[]; sketchWidthPx: number; ms: number }
  | { type: "error"; message: string };

// The ink map depends only on the picture, so it's worked out once per
// picture and reused for every change of settings.
let ink: Float32Array | null = null;
let size = { w: 0, h: 0 };

const post = (m: LineWorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<LineWorkerIn>) => {
  try {
    const m = e.data;
    if (m.type === "load") {
      ink = inkMap(new Uint8Array(m.rgba), m.width, m.height);
      size = { w: m.width, h: m.height };
      post({ type: "loaded" });
      return;
    }
    if (!ink) throw new Error("Chưa có hình phác thảo.");
    const t0 = performance.now();
    const res = extractStrokes(ink, size.w, size.h, m.params);
    post(
      { type: "strokes", strokes: res.strokes, sketchWidthPx: res.sketchWidthPx, ms: Math.round(performance.now() - t0) },
      [...new Set(res.strokes.map((s) => s.pts.buffer as ArrayBuffer))],
    );
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
