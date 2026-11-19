"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSketch } from "@/lib/lineart/readImage";
import type { PsdFile } from "@/lib/sticker/psd";
import { epsOf, pdfOf, svgOf, type VectorDoc } from "@/lib/vector/formats";
import { composeLayers, listLayers, type LayerChoice } from "@/lib/vector/psdLayers";
import type { VectorSettings, VectorWorkerIn, VectorWorkerOut } from "@/lib/vector/worker";
import { VectorPreview, type PreviewView, type PreviewZoom } from "./VectorPreview";

type Mode = "auto" | "outline" | "centerline";

type Settings = {
  mode: Mode;
  bold: number; // outline: -0.3 (thinner) … +0.3 (bolder) than the picture
  sensitivity: number; // centre line: 0 only dark lines … 1 faint ones too
  blurMm: number;
  dustMm: number; // outline: specks smaller than this across are dropped
  shortMm: number; // centre line: lines shorter than this are dropped
  corner: number; // 0 round everything … 1 keep every corner
  tolMm: number; // how far a curve may stray from the traced line
  strokeMm: number; // centre line: stroke width of the file; 0 = as wide as the picture's lines
  color: string;
};

const DEFAULTS: Settings = {
  mode: "auto",
  bold: 0,
  sensitivity: 0.5,
  blurMm: 0.05,
  dustMm: 0.15,
  shortMm: 0.6,
  corner: 0.78,
  tolMm: 0.05,
  strokeMm: 0,
  color: "#000000",
};
const SETTINGS_KEY = "funti-vector-settings";
const MAX_PIXELS = 30_000_000;
const CUT_PINK = "#EC008C"; // the die-line colour of the sticker tool

type Status = "idle" | "loading" | "running" | "ready";

type Result = Extract<VectorWorkerOut, { type: "result" }>;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {}
  return DEFAULTS;
}

function toWorker(s: Settings, dpi: number): VectorSettings {
  const mm = dpi / 25.4;
  return {
    mode: s.mode,
    level: 0.5 - s.bold,
    levelThin: 0.5 - 0.35 * s.sensitivity,
    blurPx: s.blurMm * mm,
    minAreaPx: Math.PI * ((s.dustMm * mm) / 2) ** 2,
    minLengthPx: s.shortMm * mm,
    spurPx: Math.max(5, 0.5 * mm),
    tolerancePx: Math.max(0.3, s.tolMm * mm),
    cornerDeg: 110 - 90 * s.corner,
    autoWidthPx: 0.6 * mm,
  };
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

const DIE_LAYER = /khu[oô]n\s*c[aắ]t|khuon\s*cat/i;
const LINE_LAYER = /(^|[^a-z])line(\s?art)?([^a-z]|$)|nét/i;

function defaultPick(layers: LayerChoice[]): number[] {
  const shown = layers.filter((l) => !l.hidden);
  const die = shown.filter((l) => DIE_LAYER.test(l.name));
  if (die.length) return die.map((l) => l.index);
  const line = shown.filter((l) => LINE_LAYER.test(l.name));
  if (line.length) return line.map((l) => l.index);
  return shown.map((l) => l.index);
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2 text-[15px] font-semibold">
        {label}
        <span className="tabular-nums text-[14px]" style={{ color: "var(--color-neutral-600)" }}>
          {format(value)}
        </span>
      </span>
      {hint && (
        <span className="text-[13px] -mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
          {hint}
        </span>
      )}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ minHeight: 28 }} />
    </label>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className="px-3 rounded-full text-[14px] font-semibold"
          style={{
            minHeight: 36,
            background: value === o.id ? "var(--color-accent-700)" : "var(--color-surface)",
            color: value === o.id ? "#fff" : "var(--color-text)",
            border: `1.5px solid ${value === o.id ? "var(--color-accent-700)" : "var(--color-neutral-200)"}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MODES: { id: Mode; title: string; hint: string }[] = [
  { id: "auto", title: "Tự nhận", hint: "Nét mảnh thì ra đường giữa nét, nét dày thì ra hình viền." },
  { id: "centerline", title: "Đường giữa nét", hint: "Mỗi nét ra 1 đường đơn, nằm đúng tâm nét. Dùng cho khuôn cắt, line mảnh." },
  { id: "outline", title: "Hình viền nét", hint: "Nét thành hình đặc, giữ nguyên chỗ dày chỗ mỏng như vẽ tay." },
];

export function VectorTool() {
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<{ rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } | null>(null);
  const psdRef = useRef<PsdFile | null>(null);
  const layerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [original, setOriginal] = useState<HTMLCanvasElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [baseName, setBaseName] = useState("vector");
  const [dpi, setDpi] = useState(300);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [invert, setInvert] = useState(false);
  const [colorAuto, setColorAuto] = useState(true); // the file takes the colour of the lines in the picture
  const [detected, setDetected] = useState("#000000");
  const [layers, setLayers] = useState<LayerChoice[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [status, setStatusState] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<PreviewView>("vector");
  const [zoom, setZoom] = useState<PreviewZoom>("fit");
  const [showNodes, setShowNodes] = useState(false);
  const statusRef = useRef<Status>("idle");
  const pending = useRef(false);
  const idRef = useRef(0);
  const latest = useRef({ settings: DEFAULTS, dpi: 300, invert: false, colorAuto: true });

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  useEffect(() => {
    latest.current = { settings, dpi, invert, colorAuto };
  }, [settings, dpi, invert, colorAuto]);

  useEffect(() => {
    // localStorage exists only in the browser, after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const trace = useCallback(() => {
    if (statusRef.current === "running" || statusRef.current === "loading") {
      pending.current = true;
      return;
    }
    if (!imageRef.current) return;
    setStatus("running");
    setError(null);
    const { settings: s, dpi: d } = latest.current;
    const m: VectorWorkerIn = { type: "trace", id: ++idRef.current, s: toWorker(s, d) };
    workerRef.current?.postMessage(m);
  }, [setStatus]);

  useEffect(() => {
    const worker = new Worker(new URL("../../lib/vector/worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<VectorWorkerOut>) => {
      const m = e.data;
      if (m.type === "loaded") {
        setDetected(m.color);
        if (latest.current.colorAuto) setSettings((s) => ({ ...s, color: m.color }));
        setStatus("ready");
        trace();
      } else if (m.type === "result") {
        setResult(m);
        setStatus("ready");
        if (pending.current) {
          pending.current = false;
          trace();
        }
      } else {
        setError(m.message);
        pending.current = false;
        setStatus(imageRef.current ? "ready" : "idle");
      }
    };
    worker.onerror = () => {
      setError("Máy không đủ bộ nhớ cho hình này — thử hình nhỏ hơn, chọn bớt lớp, hoặc dùng máy tính.");
      pending.current = false;
      setStatus(imageRef.current ? "ready" : "idle");
    };
    return () => worker.terminate();
  }, [trace, setStatus]);

  // Settings that change what is found re-run the trace, a moment after the last change.
  const traceKey = `${settings.mode}|${settings.bold}|${settings.sensitivity}|${settings.blurMm}|${settings.dustMm}|${settings.shortMm}|${settings.corner}|${settings.tolMm}|${dpi}`;
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    if (statusRef.current === "idle" || statusRef.current === "loading") return;
    const t = setTimeout(trace, 400);
    return () => clearTimeout(t);
  }, [traceKey, trace]);

  function postLoad(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, inv: boolean) {
    setStatus("loading");
    const copy = rgba.slice().buffer;
    const m: VectorWorkerIn = { type: "load", rgba: copy, width, height, invert: inv };
    workerRef.current?.postMessage(m, [copy]);
  }

  function applyImage(img: { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer>; dpi: number | null }) {
    if (img.width * img.height > MAX_PIXELS) {
      throw new Error("Hình quá lớn (trên 30 triệu điểm ảnh) — xuất nhỏ lại, hoặc với file PSD thì chỉ chọn lớp cần chuyển.");
    }
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
    imageRef.current = { rgba: img.rgba, width: img.width, height: img.height };
    setOriginal(c);
    setSize({ w: img.width, h: img.height });
    if (img.dpi) setDpi(img.dpi);
    postLoad(img.rgba, img.width, img.height, latest.current.invert);
  }

  function loadLayers(psd: PsdFile, indices: number[]) {
    try {
      if (!indices.length) throw new Error("Chọn ít nhất 1 lớp để chuyển.");
      setStatus("loading");
      setError(null);
      // let the screen say "Đang mở hình…" before the layers are put together
      setTimeout(() => {
        try {
          const img = composeLayers(psd, indices);
          applyImage(img);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Không mở được các lớp này.");
          setStatus(imageRef.current ? "ready" : "idle");
        }
      }, 30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không mở được các lớp này.");
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStatus("loading");
    setResult(null);
    if (layerTimer.current) clearTimeout(layerTimer.current);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPsd = /\.psd$/i.test(file.name) || (bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53);
      setFileName(file.name);
      setBaseName(file.name.replace(/\.[^.]+$/, ""));
      psdRef.current = null;
      setLayers([]);
      setPicked([]);
      if (isPsd) {
        try {
          const { psd, layers: list } = listLayers(bytes);
          const pick = defaultPick(list);
          psdRef.current = psd;
          setLayers(list);
          setPicked(pick);
          loadLayers(psd, pick);
          return;
        } catch {
          // layers could not be read: use the flattened picture instead
        }
      }
      applyImage(await readSketch(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không mở được file này.");
      setStatus(imageRef.current ? "ready" : "idle");
      // the picture that was open before is still there: trace it again
      if (imageRef.current) trace();
    }
  }

  function setPick(next: number[]) {
    setPicked(next);
    if (layerTimer.current) clearTimeout(layerTimer.current);
    layerTimer.current = setTimeout(() => {
      if (psdRef.current) loadLayers(psdRef.current, next);
    }, 450);
  }

  function changeInvert(v: boolean) {
    setInvert(v);
    latest.current.invert = v;
    const img = imageRef.current;
    if (img) postLoad(img.rgba, img.width, img.height, v);
  }

  const mmPx = dpi / 25.4;
  const effMode = result?.mode ?? (settings.mode === "auto" ? "outline" : settings.mode);
  const measuredMm = result && result.widthPx > 0 ? Math.round((result.widthPx / mmPx) * 100) / 100 : 0;
  const strokeMm = settings.strokeMm > 0 ? settings.strokeMm : measuredMm || 0.25;

  function doc(): VectorDoc | null {
    if (!result || !size) return null;
    return {
      outlines: result.outlines,
      closed: result.closed,
      width: size.w,
      height: size.h,
      dpi,
      mode: result.mode === "centerline" ? "stroke" : "fill",
      color: settings.color,
      strokeMm,
    };
  }
  function saveSvg() {
    const d = doc();
    if (d) download(new Blob([svgOf(d)], { type: "image/svg+xml" }), `${baseName} - vector.svg`);
  }
  function savePdf() {
    const d = doc();
    if (d) download(new Blob([pdfOf(d) as BlobPart], { type: "application/pdf" }), `${baseName} - vector.pdf`);
  }
  function saveEps() {
    const d = doc();
    if (d) download(new Blob([epsOf(d)], { type: "application/postscript" }), `${baseName} - vector.eps`);
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const busy = status === "loading" || status === "running";
  const ready = !!result && !busy;
  const devMm = result ? (result.maxDevPx + (result.mode === "centerline" ? 0.25 : 0.1)) / mmPx : 0;
  const mm2 = (v: number) => `${v.toFixed(2)} mm`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 sm:px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Chuyển line sang vector</h1>
        <p className="text-[15px] mt-1" style={{ color: "var(--color-neutral-600)" }}>
          Chọn file line (PNG / JPG / PSD) — web dò theo từng nét rồi vẽ lại thành đường vector bám sát nét gốc: góc nhọn vẫn nhọn, nét dày mỏng giữ nguyên, phóng to
          bao nhiêu cũng không vỡ. Tải về SVG / PDF / EPS để mở thẳng trong Illustrator.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        {/* file */}
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <div className="card elev-sm p-4 flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,.psd,image/vnd.adobe.photoshop"
              className="hidden"
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn btn-primary" style={{ fontSize: 15, minHeight: 44 }} disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {size ? "Chọn file line khác" : "Chọn file line"}
            </button>
            {size && (
              <div className="text-[14px] flex flex-col gap-1.5" style={{ color: "var(--color-neutral-600)" }}>
                <span className="font-semibold break-all text-[15px]" style={{ color: "var(--color-text)" }}>
                  {fileName}
                </span>
                <span className="flex flex-wrap items-center gap-2 tabular-nums">
                  {size.w}×{size.h} px ·
                  <label className="flex items-center gap-1.5">
                    <input
                      type="number"
                      className="input tabular-nums text-right"
                      style={{ width: 76, padding: "4px 8px", fontSize: 16 }}
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
                <span>
                  Cỡ thật: {((size.w * 25.4) / dpi).toFixed(1)} × {((size.h * 25.4) / dpi).toFixed(1)} mm
                </span>
              </div>
            )}
            <label className="flex items-start gap-2.5 text-[15px]">
              <input type="checkbox" className="mt-1" style={{ width: 18, height: 18 }} checked={invert} onChange={(e) => changeInvert(e.target.checked)} />
              <span>
                <span className="font-semibold">Nét trắng trên nền đen</span>
                <span className="block text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
                  Bật nếu file là nét sáng trên nền tối.
                </span>
              </span>
            </label>
          </div>

          {layers.length > 0 && (
            <div className="card elev-sm p-4 flex flex-col gap-3">
              <div>
                <span className="text-[15px] font-bold">Lớp cần chuyển ({picked.length}/{layers.length})</span>
                <span className="block text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
                  Tick đúng lớp line / khuôn cắt — các lớp hình, màu không cần tick.
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Lớp khuôn cắt", pick: layers.filter((l) => DIE_LAYER.test(l.name)).map((l) => l.index) },
                  { label: "Lớp line", pick: layers.filter((l) => LINE_LAYER.test(l.name)).map((l) => l.index) },
                  { label: "Tất cả lớp đang hiện", pick: layers.filter((l) => !l.hidden).map((l) => l.index) },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={!q.pick.length}
                    onClick={() => setPick(q.pick)}
                    className="px-3 rounded-full text-[14px] font-semibold"
                    style={{ minHeight: 36, background: "var(--color-surface)", border: "1.5px solid var(--color-neutral-200)", opacity: q.pick.length ? 1 : 0.45 }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 260, border: "1px solid var(--color-neutral-200)", borderRadius: "var(--radius-sm)" }}>
                {layers.map((l) => (
                  <label key={l.index} className="flex items-center gap-2.5 px-3 py-2 text-[15px]" style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18, flexShrink: 0 }}
                      checked={picked.includes(l.index)}
                      onChange={(e) => setPick(e.target.checked ? [...picked, l.index] : picked.filter((i) => i !== l.index))}
                    />
                    <span className="min-w-0 break-words">{l.name}</span>
                    {l.hidden && (
                      <span className="text-[12px] shrink-0" style={{ color: "var(--color-neutral-500)" }}>
                        (ẩn)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* preview */}
        <div className="min-w-0 flex flex-col gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          {error && (
            <p className="text-[15px] font-semibold p-3 rounded-[var(--radius-sm)]" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>
              {error}
            </p>
          )}
          {size && (
            <div className="card elev-sm p-3 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[15px] font-semibold flex-1 min-w-[12rem]">
                  {status === "loading" && "Đang mở hình…"}
                  {status === "running" && "Đang dò nét…"}
                  {status === "ready" &&
                    result &&
                    `${result.outlines.length.toLocaleString("vi-VN")} ${result.mode === "centerline" ? "đường" : "hình"} · ${result.nodes.toLocaleString("vi-VN")} điểm neo · ${(result.ms / 1000).toFixed(1)} giây`}
                </span>
                <button type="button" className="btn btn-primary" style={{ fontSize: 15, minHeight: 40, padding: "9px 18px" }} disabled={!ready} onClick={saveSvg}>
                  ⬇ SVG
                </button>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 15, minHeight: 40, padding: "9px 18px" }} disabled={!ready} onClick={savePdf}>
                  ⬇ PDF
                </button>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 15, minHeight: 40, padding: "9px 18px" }} disabled={!ready} onClick={saveEps}>
                  ⬇ EPS
                </button>
              </div>
              {ready && result && (
                <p className="text-[14px]" style={{ color: "var(--color-neutral-600)" }}>
                  {result.mode === "centerline" ? "Đường giữa nét" : "Hình viền nét"}
                  {settings.mode === "auto" && " (tự nhận)"} · nét trong ảnh rộng ≈ {mm2(result.widthPx / mmPx)} · đường vector lệch so với nét gốc tối đa ≈{" "}
                  <b style={{ color: "var(--color-text)" }}>{mm2(devMm)}</b>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Segmented
                  label="Cách xem"
                  value={view}
                  onChange={setView}
                  options={[
                    { id: "vector", label: "Vector" },
                    { id: "original", label: "Ảnh gốc" },
                    { id: "overlay", label: "Chồng lên nhau" },
                  ]}
                />
                <Segmented
                  label="Phóng to"
                  value={zoom}
                  onChange={setZoom}
                  options={[
                    { id: "fit", label: "Vừa khung" },
                    { id: 1, label: "100%" },
                    { id: 2, label: "200%" },
                    { id: 4, label: "400%" },
                    { id: 8, label: "800%" },
                  ]}
                />
                <label className="flex items-center gap-2 text-[14px] font-semibold">
                  <input type="checkbox" style={{ width: 18, height: 18 }} checked={showNodes} onChange={(e) => setShowNodes(e.target.checked)} />
                  Hiện điểm neo
                </label>
              </div>
            </div>
          )}
          {size && (
            <VectorPreview
              width={size.w}
              height={size.h}
              original={original}
              outlines={result?.outlines ?? []}
              closed={result?.closed ?? []}
              mode={effMode === "centerline" ? "stroke" : "fill"}
              color={settings.color}
              strokeMm={strokeMm}
              dpi={dpi}
              view={view}
              zoom={zoom}
              showNodes={showNodes}
              busy={busy}
            />
          )}
          {size && (
            <p className="text-[14px]" style={{ color: "var(--color-neutral-500)" }}>
              Chọn “Chồng lên nhau” rồi phóng to để soi từng chỗ: đường xanh lơ là vector, nằm trên ảnh gốc. Kéo để di chuyển (chuột) hoặc vuốt (iPad).
            </p>
          )}
          {!size && (
            <div className="card elev-sm p-5 text-[15px] flex flex-col gap-2.5" style={{ color: "var(--color-neutral-600)" }}>
              <span className="font-semibold text-[16px]" style={{ color: "var(--color-text)" }}>
                Cách dùng
              </span>
              <span>1. Chọn file line: PNG, JPG hoặc PSD. File PSD thì tick đúng lớp line / khuôn cắt cần chuyển.</span>
              <span>2. Web tự nhận nét mảnh (khuôn cắt, hairline) hay nét có dày mỏng và dò lại bằng đường cong bám sát nét gốc.</span>
              <span>3. Bấm “Chồng lên nhau” và phóng to để kiểm tra, rồi tải SVG / PDF / EPS.</span>
            </div>
          )}
        </div>

        {/* settings */}
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-2">
          <div className="card elev-sm p-4 flex flex-col gap-3">
            <span className="text-[15px] font-bold">Kiểu vector</span>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Kiểu vector">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.mode === m.id}
                  onClick={() => set("mode", m.id)}
                  className="text-left rounded-[var(--radius-sm)] px-3 py-2.5"
                  style={{
                    background: settings.mode === m.id ? "var(--color-accent-100)" : "var(--color-surface)",
                    border: `1.5px solid ${settings.mode === m.id ? "var(--color-accent-700)" : "var(--color-neutral-200)"}`,
                  }}
                >
                  <span className="block text-[15px] font-bold" style={{ color: settings.mode === m.id ? "var(--color-accent-800)" : "var(--color-text)" }}>
                    {m.title}
                  </span>
                  <span className="block text-[13px]" style={{ color: "var(--color-neutral-600)" }}>
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="card elev-sm p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold">Chỉnh nét</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 14, padding: "7px 14px" }} onClick={() => setSettings(DEFAULTS)}>
                ↺ Mặc định
              </button>
            </div>
            {effMode === "outline" ? (
              <Slider
                label="Độ dày nét"
                hint="Kéo sang phải: nét dày hơn ảnh gốc. Sang trái: mỏng đi."
                value={settings.bold}
                min={-0.3}
                max={0.3}
                step={0.02}
                format={(v) => (Math.abs(v) < 0.01 ? "như ảnh gốc" : v > 0 ? `dày hơn ${Math.round(v * 100)}` : `mỏng hơn ${Math.round(-v * 100)}`)}
                onChange={(v) => set("bold", v)}
              />
            ) : (
              <Slider
                label="Lấy cả nét mờ"
                hint="Cao: lấy cả nét nhạt, nét 1 điểm ảnh. Thấp: chỉ lấy nét đậm."
                value={settings.sensitivity}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set("sensitivity", v)}
              />
            )}
            <Slider
              label="Bám sát nét gốc"
              hint="Nhỏ: bám từng chỗ, nhiều điểm neo. Lớn: mượt hơn, ít điểm neo."
              value={settings.tolMm}
              min={0.01}
              max={0.3}
              step={0.01}
              format={mm2}
              onChange={(v) => set("tolMm", v)}
            />
            <Slider
              label="Giữ góc nhọn"
              hint="Cao: giữ cả góc tù. Thấp: bo tròn các góc."
              value={settings.corner}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => set("corner", v)}
            />
            <Slider
              label="Làm mượt viền"
              hint="Cao: bớt răng cưa, bớt gợn của ảnh JPG."
              value={settings.blurMm}
              min={0}
              max={0.3}
              step={0.01}
              format={mm2}
              onChange={(v) => set("blurMm", v)}
            />
            {effMode === "outline" ? (
              <Slider
                label="Bỏ chấm vụn"
                hint="Chấm bụi, lỗ nhỏ hơn cỡ này bị bỏ."
                value={settings.dustMm}
                min={0}
                max={1}
                step={0.05}
                format={mm2}
                onChange={(v) => set("dustMm", v)}
              />
            ) : (
              <Slider
                label="Bỏ nét ngắn"
                hint="Nét lẻ ngắn hơn cỡ này bị bỏ."
                value={settings.shortMm}
                min={0}
                max={5}
                step={0.1}
                format={mm2}
                onChange={(v) => set("shortMm", v)}
              />
            )}
          </div>

          <div className="card elev-sm p-4 flex flex-col gap-3.5">
            <span className="text-[15px] font-bold">File xuất ra</span>
            {effMode === "centerline" && (
              <div className="flex flex-col gap-2">
                <Slider
                  label="Độ dày đường"
                  hint="Đường xuất ra là nét có độ dày này, bo tròn đầu."
                  value={strokeMm}
                  min={0.05}
                  max={1}
                  step={0.05}
                  format={mm2}
                  onChange={(v) => set("strokeMm", v)}
                />
                <button
                  type="button"
                  className="btn btn-ghost self-start"
                  style={{ fontSize: 14, padding: "7px 14px" }}
                  disabled={settings.strokeMm === 0}
                  onClick={() => set("strokeMm", 0)}
                >
                  Theo nét trong ảnh{measuredMm ? ` (${mm2(measuredMm)})` : ""}
                </button>
              </div>
            )}
            <label className="flex items-center justify-between gap-3 text-[15px] font-semibold">
              Màu {effMode === "centerline" ? "đường" : "nét"}
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => {
                    setColorAuto(false);
                    set("color", e.target.value);
                  }}
                  style={{ width: 44, height: 32 }}
                />
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 14, padding: "7px 14px" }}
                disabled={colorAuto && settings.color === detected}
                onClick={() => {
                  setColorAuto(true);
                  set("color", detected);
                }}
              >
                Theo màu trong ảnh
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 14, padding: "7px 14px" }}
                onClick={() => {
                  setColorAuto(false);
                  set("color", CUT_PINK);
                }}
                title="Màu hồng khuôn cắt của tool Tạo viền sticker"
              >
                Hồng khuôn cắt
              </button>
            </div>
            <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
              Màu đen xuất ra mực đen K 100% (không pha 4 màu). Hồng khuôn cắt đặt tên nhóm CutContour trong SVG, giống file khuôn của tool Tạo viền sticker. File có
              kích thước thật theo dpi ở trên.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
