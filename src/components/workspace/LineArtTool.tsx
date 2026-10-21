"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke } from "@/lib/lineart/extract";
import { BRUSHES, drawLineArt, lineArtSvg, photoshopPath, strokeAt, type BrushStyle, type RenderStyle } from "@/lib/lineart/render";
import { readSketch } from "@/lib/lineart/readImage";
import { buildLinePsd } from "@/lib/lineart/psdOut";
import type { LineWorkerIn, LineWorkerOut } from "@/lib/lineart/worker";

type Settings = {
  widthMm: number;
  byWeight: boolean;
  brush: BrushStyle;
  color: string;
  mergeMm: number;
  sensitivity: number;
  smoothMm: number;
  gapMm: number;
  minMm: number;
  sketchOpacity: number;
};

const DEFAULTS: Settings = {
  widthMm: 0.5,
  byWeight: true,
  brush: "round",
  color: "#000000",
  mergeMm: 0.2,
  sensitivity: 0.5,
  smoothMm: 0.7,
  gapMm: 1.5,
  minMm: 0.8,
  sketchOpacity: 0.25,
};
const SETTINGS_KEY = "funti-line-art-settings";

type Status = "idle" | "loading" | "running" | "ready";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {}
  return DEFAULTS;
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2 text-xs font-semibold">
        {label}
        <span className="tabular-nums" style={{ color: "var(--color-neutral-500)" }}>
          {value.toFixed(step < 0.1 ? 2 : 1)}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      {hint && (
        <span className="text-[11px] -mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
          {hint}
        </span>
      )}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function LineArtTool() {
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sketchRef = useRef<{ rgba: Uint8ClampedArray<ArrayBuffer>; canvas: HTMLCanvasElement; name: string } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fileName, setFileName] = useState("");
  const [dpi, setDpi] = useState(300);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [sketchHalf, setSketchHalf] = useState(0);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [status, setStatusState] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [lastMs, setLastMs] = useState(0);
  const statusRef = useRef<Status>("idle");
  const pending = useRef(false);
  const latest = useRef({ settings: DEFAULTS, dpi: 300 });

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  useEffect(() => {
    latest.current = { settings, dpi };
  }, [settings, dpi]);

  useEffect(() => {
    // localStorage exists only in the browser, after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
  }, []);

  const extract = useCallback(() => {
    if (statusRef.current === "running" || statusRef.current === "loading") {
      pending.current = true;
      return;
    }
    if (!sketchRef.current) return;
    const { settings: s, dpi: d } = latest.current;
    const mm = d / 25.4;
    setStatus("running");
    setError(null);
    const m: LineWorkerIn = {
      type: "extract",
      params: {
        sigmaPx: s.mergeMm * mm,
        sensitivity: s.sensitivity,
        minLengthPx: s.minMm * mm,
        gapPx: s.gapMm * mm,
        smoothPx: s.smoothMm * mm,
      },
    };
    workerRef.current?.postMessage(m);
  }, [setStatus]);

  useEffect(() => {
    const worker = new Worker(new URL("../../lib/lineart/worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<LineWorkerOut>) => {
      const m = e.data;
      if (m.type === "loaded") {
        setStatus("ready");
        extract();
      } else if (m.type === "strokes") {
        setStrokes(m.strokes);
        setSketchHalf(m.sketchWidthPx / 2);
        setHidden(new Set());
        setLastMs(m.ms);
        setStatus("ready");
        if (pending.current) {
          pending.current = false;
          extract();
        }
      } else {
        setError(m.message);
        pending.current = false;
        setStatus(sketchRef.current ? "ready" : "idle");
      }
    };
    worker.onerror = () => {
      setError("Máy không đủ bộ nhớ cho hình này — thử hình nhỏ hơn hoặc dùng máy tính.");
      setStatus(sketchRef.current ? "ready" : "idle");
    };
    return () => worker.terminate();
  }, [extract, setStatus]);

  // Settings that change how lines are found re-run the extraction.
  const extractKey = `${settings.mergeMm}|${settings.sensitivity}|${settings.smoothMm}|${settings.gapMm}|${settings.minMm}|${dpi}`;
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    if (statusRef.current === "idle" || statusRef.current === "loading") return;
    const t = setTimeout(extract, 450);
    return () => clearTimeout(t);
  }, [extractKey, extract]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const style: RenderStyle = {
    widthPx: (settings.widthMm * dpi) / 25.4,
    byWeight: settings.byWeight,
    brush: settings.brush,
    color: settings.color,
  };
  const styleKey = `${style.widthPx}|${style.byWeight}|${style.brush}|${style.color}`;

  // Preview: the sketch faintly underneath, the line art on top.
  useEffect(() => {
    const canvas = canvasRef.current;
    const sk = sketchRef.current;
    if (!canvas || !sk || !size) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.w, size.h);
    if (settings.sketchOpacity > 0) {
      ctx.globalAlpha = settings.sketchOpacity;
      ctx.drawImage(sk.canvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    const [widthPx, byWeight, brush, color] = styleKey.split("|");
    drawLineArt(ctx, strokes, sketchHalf, { widthPx: Number(widthPx), byWeight: byWeight === "true", brush: brush as BrushStyle, color }, hidden);
  }, [strokes, sketchHalf, hidden, styleKey, settings.sketchOpacity, size]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStatus("loading");
    setStrokes([]);
    try {
      const img = await readSketch(file);
      if (img.width * img.height > 16_000_000) throw new Error("Hình quá lớn (trên 16 triệu điểm ảnh) — xuất nhỏ lại khoảng 4000px rồi thử.");
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d")!.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
      sketchRef.current = { rgba: img.rgba, canvas: c, name: file.name.replace(/\.[^.]+$/, "") };
      setSize({ w: img.width, h: img.height });
      setFileName(file.name);
      if (img.dpi) setDpi(img.dpi);
      const copy = img.rgba.slice().buffer;
      const m: LineWorkerIn = { type: "load", rgba: copy, width: img.width, height: img.height };
      workerRef.current?.postMessage(m, [copy]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không mở được file này.");
      setStatus(sketchRef.current ? "ready" : "idle");
    }
  }

  function renderLines(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = size!.w;
    c.height = size!.h;
    drawLineArt(c.getContext("2d")!, strokes, sketchHalf, style, hidden);
    return c;
  }

  function savePng() {
    const sk = sketchRef.current;
    if (!sk || !size) return;
    renderLines().toBlob((b) => b && download(b, `${sk.name} - line.png`), "image/png");
  }

  function savePsd() {
    const sk = sketchRef.current;
    if (!sk || !size) return;
    const c = renderLines();
    const line = c.getContext("2d")!.getImageData(0, 0, size.w, size.h).data;
    const blob = buildLinePsd({ width: size.w, height: size.h, dpi, sketch: sk.rgba, line, path: photoshopPath(strokes, hidden, size.w, size.h) });
    download(blob, `${sk.name} - line.psd`);
  }

  function saveSvg() {
    const sk = sketchRef.current;
    if (!sk || !size) return;
    download(new Blob([lineArtSvg(strokes, sketchHalf, style, hidden, size.w, size.h, dpi)], { type: "image/svg+xml" }), `${sk.name} - line.svg`);
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!erasing) {
      setZoomed((z) => !z);
      return;
    }
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    const x = (e.clientX - r.left) * k;
    const y = (e.clientY - r.top) * k;
    const i = strokeAt(strokes, x, y, Math.max(8, 14 * k));
    if (i < 0) return;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const busy = status === "loading" || status === "running";
  const lines = strokes.filter((s) => !s.fill).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 sm:px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Đi line tự động</h1>
        <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Chọn hình phác thảo — web đi lại thành line sạch, đều nét, khép kín kiểu tranh tô màu. Chỉnh độ dày (mm), kiểu nét, chạm để xoá nét thừa, rồi tải
          PNG / PSD / SVG.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start">
        <div className="card elev-sm p-4 flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,.psd,image/vnd.adobe.photoshop"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {size ? "Chọn hình phác thảo khác" : "Chọn hình phác thảo"}
          </button>
          {size && (
            <div className="text-xs flex flex-col gap-1" style={{ color: "var(--color-neutral-600)" }}>
              <span className="font-semibold break-all" style={{ color: "var(--color-text)" }}>
                {fileName}
              </span>
              <span className="flex items-center gap-2 tabular-nums">
                {size.w}×{size.h} px ·
                <label className="flex items-center gap-1">
                  <input
                    type="number"
                    className="input tabular-nums text-right"
                    style={{ width: 64, padding: "2px 6px" }}
                    value={dpi}
                    min={72}
                    max={1200}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 72 && v <= 1200) setDpi(v);
                    }}
                  />
                  dpi
                </label>
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          {error && (
            <p className="text-sm font-semibold p-3 rounded-[var(--radius-sm)]" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>
              {error}
            </p>
          )}
          {size && (
            <div className="card elev-sm p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold flex-1 min-w-[10rem]">
                {status === "loading" && "Đang mở hình…"}
                {status === "running" && "Đang đi line…"}
                {status === "ready" && `${lines} nét${hidden.size ? ` · đã xoá ${hidden.size}` : ""} · ${(lastMs / 1000).toFixed(1)} giây`}
              </span>
              <button
                type="button"
                className={`btn btn-sm ${erasing ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setErasing((v) => !v)}
                title="Bật rồi chạm vào nét thừa để xoá, chạm lần nữa để lấy lại"
              >
                {erasing ? "✓ Đang xoá nét" : "✂ Xoá nét thừa"}
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !strokes.length} onClick={savePsd}>
                ⬇ PSD
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !strokes.length} onClick={savePng}>
                ⬇ PNG
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !strokes.length} onClick={saveSvg}>
                ⬇ SVG
              </button>
            </div>
          )}
          <div
            className={`card elev-sm p-2 ${zoomed ? "overflow-auto" : "overflow-hidden"}`}
            style={{ display: size ? "block" : "none", maxHeight: zoomed ? "78vh" : undefined, background: "#fff" }}
          >
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className="block"
              style={{
                width: zoomed ? "auto" : "100%",
                height: "auto",
                maxWidth: zoomed ? "none" : "100%",
                cursor: erasing ? "crosshair" : zoomed ? "zoom-out" : "zoom-in",
                opacity: status === "running" ? 0.55 : 1,
              }}
            />
          </div>
          {size && (
            <p className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              {erasing
                ? "Chạm vào nét thừa để xoá, chạm lại để lấy lại. Đổi thông số sẽ đi line lại từ đầu."
                : "Bấm vào hình để phóng to. PSD có 2 lớp (Phác thảo + Line) và đường path “Line art” — trong Photoshop chọn brush bất kỳ → Stroke Path để đi lại bằng brush riêng."}
            </p>
          )}
          {!size && (
            <div className="card elev-sm p-6 text-sm flex flex-col gap-2" style={{ color: "var(--color-neutral-600)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                Cách dùng
              </span>
              <span>1. Xuất bản phác thảo ra PNG/JPG (hoặc chọn thẳng file PSD) — nét màu gì cũng được, nền trắng.</span>
              <span>2. Web tự đi line: gom nét phác thảo chồng nhau thành 1 nét, nối chỗ hở, giữ góc nhọn, mắt tô đặc.</span>
              <span>3. Chỉnh độ dày nét (mm) và kiểu nét, chạm xoá nét thừa, rồi tải PSD / PNG / SVG.</span>
            </div>
          )}
        </div>

        <div className="card elev-sm p-4 flex flex-col gap-3.5 lg:col-start-1 lg:row-start-2">
          <span className="text-sm font-bold">Nét line</span>
          <Slider label="Độ dày nét" value={settings.widthMm} min={0.1} max={2} step={0.05} unit="mm" onChange={(v) => set("widthMm", v)} />
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={settings.byWeight} onChange={(e) => set("byWeight", e.target.checked)} />
            <span>
              <span className="font-semibold">Dày mỏng theo phác thảo</span>
              <span className="block text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                Nét phác thảo đậm (khung, viền ngoài) ra nét dày; nét nhẹ (chi tiết, râu mèo) ra nét mảnh.
              </span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Kiểu nét</span>
            <div className="flex flex-wrap gap-1.5">
              {BRUSHES.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => set("brush", b.id)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: settings.brush === b.id ? "var(--color-accent-700)" : "var(--color-surface)",
                    color: settings.brush === b.id ? "#fff" : "var(--color-text)",
                    border: `1.5px solid ${settings.brush === b.id ? "var(--color-accent-700)" : "var(--color-neutral-200)"}`,
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between text-xs font-semibold">
            Màu nét
            <input type="color" value={settings.color} onChange={(e) => set("color", e.target.value)} style={{ width: 40, height: 26 }} />
          </label>
          <Slider label="Hiện phác thảo bên dưới" value={settings.sketchOpacity} min={0} max={1} step={0.05} onChange={(v) => set("sketchOpacity", v)} />
        </div>

        <div className="card elev-sm p-4 flex flex-col gap-3.5 lg:col-start-1 lg:row-start-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Cách đi line</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettings(DEFAULTS)}>
              ↺ Mặc định
            </button>
          </div>
          <Slider
            label="Gom nét"
            hint="Nét phác thảo vẽ chồng, vẽ đôi cách nhau bao nhiêu thì gom thành 1 nét"
            value={settings.mergeMm}
            min={0.05}
            max={0.8}
            step={0.05}
            unit="mm"
            onChange={(v) => set("mergeMm", v)}
          />
          <Slider label="Lấy cả nét mờ" hint="Cao: giữ nét phác nhạt; thấp: chỉ nét đậm" value={settings.sensitivity} min={0} max={1} step={0.05} onChange={(v) => set("sensitivity", v)} />
          <Slider label="Độ mượt" hint="Cao: đường cong trơn hơn, bớt run tay" value={settings.smoothMm} min={0.1} max={2} step={0.1} unit="mm" onChange={(v) => set("smoothMm", v)} />
          <Slider label="Nối chỗ hở" hint="Đầu nét gần nét khác trong khoảng này thì nối lại cho khép kín" value={settings.gapMm} min={0} max={4} step={0.1} unit="mm" onChange={(v) => set("gapMm", v)} />
          <Slider label="Bỏ nét vụn" hint="Nét lẻ ngắn hơn khoảng này bị bỏ" value={settings.minMm} min={0} max={4} step={0.1} unit="mm" onChange={(v) => set("minMm", v)} />
        </div>
      </div>
    </div>
  );
}
