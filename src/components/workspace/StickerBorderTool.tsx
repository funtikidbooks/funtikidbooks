"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Conflict,
  LayerInfo,
  StickerSettings,
  WorkerIn,
  WorkerOut,
} from "@/lib/sticker/worker";

// Sếp's print spec (20/10/2026) — see lib/sticker/border.ts.
const DEFAULTS: StickerSettings = {
  insideMm: 1.5,
  bleedMm: 2,
  gapMm: 3,
  edgeMm: 3,
  trimInsetMm: 0,
  smoothMm: 1,
  deepen: 1.6,
};
// v2: border colour model changed (27/10/2026) — old saved "deepen" values
// meant something else.
const SETTINGS_KEY = "funti-sticker-border-settings-v2";

const FIELDS: {
  key: keyof StickerSettings;
  label: string;
  hint: string;
  step: number;
  min: number;
  max: number;
}[] = [
  {
    key: "insideMm",
    label: "Bù nền trong khuôn",
    hint: "Từ mép hình tới đường cắt",
    step: 0.1,
    min: 0.5,
    max: 5,
  },
  {
    key: "bleedMm",
    label: "Bù nền ngoài khuôn",
    hint: "Màu viền tràn ra ngoài đường cắt",
    step: 0.1,
    min: 0,
    max: 5,
  },
  {
    key: "gapMm",
    label: "Khuôn cách nhau ít nhất",
    hint: "Báo đỏ chỗ hai khuôn sát hơn",
    step: 0.5,
    min: 0,
    max: 10,
  },
  {
    key: "edgeMm",
    label: "Khuôn cách mép xén ít nhất",
    hint: "Báo đỏ chỗ khuôn sát mép xén",
    step: 0.5,
    min: 0,
    max: 10,
  },
  {
    key: "trimInsetMm",
    label: "Mép xén cách mép file",
    hint: "0 nếu file đúng bằng khổ xén; file có tràn lề 3mm thì nhập 3",
    step: 0.5,
    min: 0,
    max: 10,
  },
  {
    key: "smoothMm",
    label: "Bo mượt khuôn",
    hint: "Lấp các khe hẹp dao không cắt được",
    step: 0.1,
    min: 0,
    max: 4,
  },
];

type Status = "idle" | "loading" | "running" | "ready" | "exporting";

type Doc = {
  name: string;
  size: number;
  width: number;
  height: number;
  dpi: number;
  mode: string;
};

function loadSettings(): StickerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw)
      return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<StickerSettings>) };
  } catch {}
  return DEFAULTS;
}

export function StickerBorderTool() {
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [enabled, setEnabled] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<StickerSettings>(DEFAULTS);
  const [status, setStatusState] = useState<Status>("idle");
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [bordered, setBordered] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  // Read from the worker's message handler, which is set up once.
  const statusRef = useRef<Status>("idle");
  const latest = useRef({ settings: DEFAULTS, enabled: new Set<number>() });
  const docName = useRef("sticker");
  const pendingRun = useRef(false);
  const lastRunKey = useRef("");

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  useEffect(() => {
    latest.current = { settings, enabled };
  }, [settings, enabled]);

  useEffect(() => {
    // localStorage only exists in the browser, after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
  }, []);

  const startRun = useCallback(() => {
    if (statusRef.current !== "ready") {
      if (statusRef.current !== "idle") pendingRun.current = true;
      return;
    }
    const { settings: s, enabled: en } = latest.current;
    lastRunKey.current = JSON.stringify([s, [...en]]);
    setStatus("running");
    setProgress(null);
    setError(null);
    setSvgUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    const m: WorkerIn = {
      type: "run",
      settings: s,
      enabled: [...en],
      previewWidth: 2400,
    };
    workerRef.current?.postMessage(m);
  }, [setStatus]);

  useEffect(() => {
    const worker = new Worker(
      new URL("../../lib/sticker/worker.ts", import.meta.url),
    );
    workerRef.current = worker;
    const settle = () => {
      setStatus("ready");
      if (pendingRun.current) {
        pendingRun.current = false;
        startRun();
      }
    };
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "loaded") {
        setDoc((d) =>
          d
            ? {
                ...d,
                width: m.width,
                height: m.height,
                dpi: m.dpi,
                mode: m.mode,
              }
            : d,
        );
        setLayers(m.layers);
        const en = new Set(m.layers.filter((l) => l.auto).map((l) => l.index));
        setEnabled(en);
        latest.current = { ...latest.current, enabled: en };
        setStatus("ready");
        startRun();
      } else if (m.type === "progress") {
        setProgress({ done: m.done, total: m.total });
      } else if (m.type === "result") {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = m.pw;
          canvas.height = m.ph;
          const ctx = canvas.getContext("2d")!;
          ctx.putImageData(
            new ImageData(new Uint8ClampedArray(m.preview), m.pw, m.ph),
            0,
            0,
          );
          ctx.strokeStyle = "#e00000";
          ctx.lineWidth = Math.max(3, m.pw / 500);
          for (const c of m.conflicts) {
            ctx.beginPath();
            ctx.arc(
              c.x * m.scale,
              c.y * m.scale,
              Math.max(14, m.pw / 90),
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
        }
        setConflicts(m.conflicts);
        setBordered(m.bordered);
        settle();
      } else if (m.type === "exported") {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(m.psd);
        a.download = `${docName.current} - co vien.psd`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
        setSvgUrl(
          URL.createObjectURL(new Blob([m.svg], { type: "image/svg+xml" })),
        );
        settle();
      } else if (m.type === "error") {
        setError(m.message);
        pendingRun.current = false;
        setStatus(statusRef.current === "loading" ? "idle" : "ready");
      }
    };
    worker.onerror = () => {
      setError(
        "Máy không đủ bộ nhớ hoặc gặp lỗi khi xử lý file — thử lại trên máy tính.",
      );
      pendingRun.current = false;
      setStatus("idle");
    };
    return () => worker.terminate();
  }, [startRun, setStatus]);

  // Settings and layer picks re-run on their own, a moment after the last change.
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
    if (
      statusRef.current === "idle" ||
      JSON.stringify([settings, [...enabled]]) === lastRunKey.current
    )
      return;
    const t = setTimeout(startRun, 700);
    return () => clearTimeout(t);
  }, [settings, enabled, startRun]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!/\.psd$/i.test(file.name)) {
      setError("Chỉ nhận file Photoshop .psd.");
      return;
    }
    setError(null);
    setConflicts([]);
    setBordered(0);
    setLayers([]);
    setStatus("loading");
    docName.current = file.name.replace(/\.psd$/i, "");
    setDoc({
      name: file.name,
      size: file.size,
      width: 0,
      height: 0,
      dpi: 0,
      mode: "",
    });
    const buf = await file.arrayBuffer();
    const m: WorkerIn = { type: "load", file: buf };
    workerRef.current?.postMessage(m, [buf]);
  }

  function download() {
    if (statusRef.current !== "ready") return;
    setStatus("exporting");
    const m: WorkerIn = { type: "export", baseName: docName.current };
    workerRef.current?.postMessage(m);
  }

  const busy =
    status === "loading" || status === "running" || status === "exporting";
  const mm = (px: number) =>
    doc?.dpi ? ((px / doc.dpi) * 25.4).toFixed(0) : "–";
  const gaps = conflicts.filter((c) => c.kind === "gap");
  const edges = conflicts.filter((c) => c.kind === "edge");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="px-4 sm:px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <h1 className="text-xl">Tạo viền sticker</h1>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--color-neutral-500)" }}
        >
          Chọn file PSD dàn sticker — mỗi món đồ tự có viền màu theo màu của nó,
          kèm đường khuôn cắt cho nhà in. Lớp gốc giữ nguyên, chỉ thêm lớp mới.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start">
        <div className="card elev-sm p-4 flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".psd,image/vnd.adobe.photoshop,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {doc ? "Chọn file PSD khác" : "Chọn file PSD"}
          </button>
          {doc && (
            <div
              className="text-xs flex flex-col gap-0.5"
              style={{ color: "var(--color-neutral-600)" }}
            >
              <span
                className="font-semibold break-all"
                style={{ color: "var(--color-text)" }}
              >
                {doc.name}
              </span>
              <span className="tabular-nums">
                {(doc.size / 1048576).toFixed(1)} MB
                {doc.width > 0 &&
                  ` · ${mm(doc.width)}×${mm(doc.height)} mm · ${Math.round(doc.dpi)} dpi · ${doc.mode}`}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          {error && (
            <p
              className="text-sm font-semibold p-3 rounded-[var(--radius-sm)]"
              style={{
                background: "var(--color-accent-2-100)",
                color: "var(--color-accent-2-800)",
              }}
            >
              {error}
            </p>
          )}

          {doc && (
            <div className="card elev-sm p-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold flex-1 min-w-[12rem]">
                {status === "loading" && "Đang đọc file…"}
                {status === "running" &&
                  `Đang tạo viền${progress ? ` ${progress.done}/${progress.total}` : "…"}`}
                {status === "exporting" && "Đang xuất file PSD…"}
                {status === "ready" && (
                  <>
                    {bordered} sticker có viền ·{" "}
                    {conflicts.length === 0 ? (
                      <span style={{ color: "var(--status-green, #2a8a3a)" }}>
                        khoảng cách đạt chuẩn ✓
                      </span>
                    ) : (
                      <span style={{ color: "#c22" }}>
                        {gaps.length > 0 && `${gaps.length} chỗ khuôn quá sát`}
                        {gaps.length > 0 && edges.length > 0 && ", "}
                        {edges.length > 0 &&
                          `${edges.length} chỗ sát mép xén`}{" "}
                        (khoanh đỏ)
                      </span>
                    )}
                  </>
                )}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || bordered === 0}
                onClick={download}
              >
                ⬇ Tải PSD có viền
              </button>
              {svgUrl && (
                <a
                  className="btn btn-secondary btn-sm"
                  href={svgUrl}
                  download={`${doc.name.replace(/\.psd$/i, "")} - khuon cat.svg`}
                >
                  ⬇ Khuôn cắt (SVG)
                </a>
              )}
            </div>
          )}

          <div
            className={`card elev-sm p-2 ${zoomed ? "overflow-auto" : "overflow-hidden"}`}
            style={{
              display: doc ? "block" : "none",
              maxHeight: zoomed ? "75vh" : undefined,
              background: "#fff",
            }}
          >
            <canvas
              ref={canvasRef}
              onClick={() => setZoomed((z) => !z)}
              className="block"
              style={{
                width: zoomed ? "auto" : "100%",
                height: "auto",
                maxWidth: zoomed ? "none" : "100%",
                cursor: zoomed ? "zoom-out" : "zoom-in",
                opacity: status === "running" ? 0.5 : 1,
              }}
            />
          </div>
          {doc && (
            <p
              className="text-[11px]"
              style={{ color: "var(--color-neutral-500)" }}
            >
              Bấm vào hình để phóng to. Đường hồng là khuôn cắt. Màu xem trước
              trên màn hình chỉ gần đúng — file tải về giữ đúng màu CMYK.
            </p>
          )}

          {conflicts.length > 0 && status === "ready" && (
            <details className="card elev-sm p-4">
              <summary className="text-sm font-bold cursor-pointer">
                Chỗ cần dời ({conflicts.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {conflicts.slice(0, 40).map((c, i) => (
                  <li key={i}>
                    {c.kind === "gap"
                      ? `Khuôn quá sát: ${c.layers[0]} ↔ ${c.layers[1]}`
                      : `Sát mép xén: ${c.layers[0]}`}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!doc && (
            <div
              className="card elev-sm p-6 text-sm flex flex-col gap-2"
              style={{ color: "var(--color-neutral-600)" }}
            >
              <span
                className="font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Cách dùng
              </span>
              <span>
                1. Mỗi món đồ (váy, giày, phụ kiện…) để trên lớp riêng, nền để
                lớp riêng.
              </span>
              <span>
                2. Chọn file PSD — web tự tạo viền và khuôn, khoanh đỏ chỗ nào
                đặt quá sát.
              </span>
              <span>
                3. Tải PSD có viền: thêm lớp “Viền - …” dưới mỗi món và lớp
                “KHUÔN CẮT” trên cùng. Gửi nhà in kèm file khuôn SVG.
              </span>
            </div>
          )}
        </div>

        <div className="card elev-sm p-4 flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Thông số in (mm)</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSettings(DEFAULTS)}
            >
              ↺ Mặc định
            </button>
          </div>
          {FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex flex-col min-w-0">
                <span className="text-xs font-semibold">{f.label}</span>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--color-neutral-500)" }}
                >
                  {f.hint}
                </span>
              </span>
              <input
                type="number"
                inputMode="decimal"
                className="input tabular-nums text-right flex-none"
                style={{ width: 76 }}
                step={f.step}
                min={f.min}
                max={f.max}
                value={settings[f.key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= f.min && v <= f.max)
                    setSettings((s) => ({ ...s, [f.key]: v }));
                }}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs font-semibold">
              Màu viền đậm hơn hình (chỗ da: viền trắng)
              <span
                className="tabular-nums"
                style={{ color: "var(--color-neutral-500)" }}
              >
                {settings.deepen <= 1 ? "như màu hình" : `đậm ${settings.deepen.toFixed(1)}×`}
              </span>
            </span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.1}
              value={settings.deepen}
              onChange={(e) =>
                setSettings((s) => ({ ...s, deepen: Number(e.target.value) }))
              }
            />
          </label>
        </div>

        {layers.length > 0 && (
          <details className="card elev-sm p-4 lg:col-start-1 lg:row-start-3">
            <summary className="text-sm font-bold cursor-pointer">
              Lớp được tạo viền ({enabled.size}/{layers.length})
            </summary>
            <p
              className="text-[11px] mt-2"
              style={{ color: "var(--color-neutral-500)" }}
            >
              Nền và lớp ẩn được bỏ qua sẵn. Các lớp chồng lên nhau được gộp
              thành một sticker.
            </p>
            <div className="flex flex-col gap-1 mt-2 max-h-80 overflow-y-auto">
              {layers.map((l) => (
                <label
                  key={l.index}
                  className="flex items-center gap-2 text-xs py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={enabled.has(l.index)}
                    onChange={(e) =>
                      setEnabled((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(l.index);
                        else next.delete(l.index);
                        return next;
                      })
                    }
                  />
                  <span className="truncate">
                    {l.group && (
                      <span style={{ color: "var(--color-neutral-400)" }}>
                        {l.group} ›{" "}
                      </span>
                    )}
                    {l.name}
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
