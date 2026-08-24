"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { updateEditorProject, uploadEditorImage } from "@/lib/actions/editor";
import { exportEditorPng } from "@/lib/editorExport";
import { FONT_FORMAT_BY_EXT, fontFamilyFor } from "@/lib/fontFormat";
import type { EditorImageLayer, EditorLayer, EditorProject, EditorTextLayer, FontAsset } from "@/lib/types";

const MIN_SIZE = 20;
const DEFAULT_FONT_STACK = "Arial, sans-serif";

function newId() {
  return crypto.randomUUID();
}

function resolveFontFamily(fontId: string | null, fonts: FontAsset[]) {
  if (!fontId) return DEFAULT_FONT_STACK;
  const font = fonts.find((f) => f.id === fontId);
  return font ? `"${fontFamilyFor(font)}", ${DEFAULT_FONT_STACK}` : DEFAULT_FONT_STACK;
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 300, height: 300 });
    img.src = url;
  });
}

function LayerView({
  layer,
  scale,
  selected,
  editing,
  fonts,
  onSelect,
  onStartEdit,
  onStopEdit,
  onChange,
  onInteractionStart,
}: {
  layer: EditorLayer;
  scale: number;
  selected: boolean;
  editing: boolean;
  fonts: FontAsset[];
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChange: (patch: Partial<EditorLayer>) => void;
  onInteractionStart: () => void;
}) {
  const cssFontFamily = layer.type === "text" ? resolveFontFamily(layer.fontId, fonts) : DEFAULT_FONT_STACK;
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const resizeRef = useRef<{ startClientX: number; startClientY: number; startW: number; startH: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (editing) return;
    e.stopPropagation();
    onSelect();
    onInteractionStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: layer.x, startY: layer.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startClientX) / scale;
    const dy = (e.clientY - dragRef.current.startClientY) / scale;
    onChange({ x: dragRef.current.startX + dx, y: dragRef.current.startY + dy });
  }
  function endDrag() {
    dragRef.current = null;
  }

  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    onInteractionStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startClientX: e.clientX, startClientY: e.clientY, startW: layer.width, startH: layer.height };
  }
  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const dx = (e.clientX - resizeRef.current.startClientX) / scale;
    const dy = (e.clientY - resizeRef.current.startClientY) / scale;
    let width = resizeRef.current.startW + dx;
    let height = resizeRef.current.startH + dy;
    if (e.shiftKey) {
      // Photoshop-style constrained scale: keep the original aspect ratio,
      // driven by whichever axis the pointer moved further along.
      const ratio = resizeRef.current.startW / resizeRef.current.startH;
      if (Math.abs(dx) > Math.abs(dy)) {
        height = width / ratio;
      } else {
        width = height * ratio;
      }
    }
    onChange({ width: Math.max(MIN_SIZE, width), height: Math.max(MIN_SIZE, height) });
  }
  function endResize() {
    resizeRef.current = null;
  }

  const style: CSSProperties = {
    position: "absolute",
    left: layer.x * scale,
    top: layer.y * scale,
    width: layer.width * scale,
    height: layer.height * scale,
    outline: selected ? "2px solid var(--color-accent-600)" : "none",
    cursor: editing ? "text" : "move",
    touchAction: "none",
  };

  return (
    <div style={style} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onDoubleClick={() => layer.type === "text" && onStartEdit()}>
      {layer.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={layer.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", userSelect: "none" }} />
      ) : editing ? (
        <textarea
          autoFocus
          defaultValue={layer.text}
          onBlur={(e) => {
            onChange({ text: e.target.value });
            onStopEdit();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: "100%",
            fontSize: layer.fontSize * scale,
            color: layer.color,
            fontWeight: layer.bold ? 700 : 400,
            textAlign: layer.align,
            resize: "none",
            border: "1.5px dashed var(--color-accent-600)",
            outline: "none",
            background: "rgba(255,255,255,0.92)",
            padding: 2,
            fontFamily: cssFontFamily,
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            fontSize: layer.fontSize * scale,
            color: layer.color,
            fontWeight: layer.bold ? 700 : 400,
            textAlign: layer.align,
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            userSelect: "none",
            fontFamily: cssFontFamily,
          }}
        >
          {layer.text || "(nhấp đúp để nhập chữ)"}
        </div>
      )}
      {selected && !editing && (
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          style={{
            position: "absolute",
            right: -7,
            bottom: -7,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: "var(--color-accent-600)",
            border: "2px solid #fff",
            cursor: "nwse-resize",
            touchAction: "none",
          }}
        />
      )}
    </div>
  );
}

export function Editor({ project, fonts }: { project: EditorProject; fonts: FontAsset[] }) {
  const [name, setName] = useState(project.name);
  const [layers, setLayers] = useState<EditorLayer[]>(project.layers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [past, setPast] = useState<EditorLayer[][]>([]);
  const [future, setFuture] = useState<EditorLayer[][]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const layersRef = useRef(layers);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => {
      const available = wrapper.clientWidth;
      if (available > 0) setScale(Math.min(1, available / project.background_width));
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [project.background_width]);

  // Ghi lại trạng thái TRƯỚC một thao tác (kiểu Photoshop: một lần kéo/resize
  // hay một lần thêm/xoá layer = một bước Undo), không ghi theo từng pixel
  // di chuyển trong lúc kéo — updateLayerLive dùng khi đang kéo.
  function pushHistory() {
    setPast((p) => [...p, layersRef.current]);
    setFuture([]);
  }

  function undo() {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [layersRef.current, ...f]);
      setLayers(prev);
      setDirty(true);
      return p.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, layersRef.current]);
      setLayers(next);
      setDirty(true);
      return f.slice(1);
    });
  }

  useEffect(() => {
    function isEditableTarget(el: EventTarget | null) {
      const tag = (el as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (ctrlOrCmd && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.altKey && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;

  // Cập nhật có lưu lịch sử (Undo) — dùng cho mọi thay đổi rời rạc: đổi
  // font/cỡ/màu, thêm/xoá layer...
  function updateLayer(id: string, patch: Partial<EditorLayer>) {
    pushHistory();
    setDirty(true);
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as EditorLayer) : l)));
  }

  // Cập nhật KHÔNG lưu lịch sử mỗi pixel — dùng trong lúc đang kéo/resize;
  // pushHistory() đã được gọi một lần ở đầu thao tác (onInteractionStart).
  function updateLayerLive(id: string, patch: Partial<EditorLayer>) {
    setDirty(true);
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as EditorLayer) : l)));
  }

  function addTextLayer() {
    pushHistory();
    const layer: EditorTextLayer = {
      id: newId(),
      type: "text",
      x: Math.max(0, project.background_width / 2 - 120),
      y: Math.max(0, project.background_height / 2 - 20),
      width: 240,
      height: 50,
      text: "Ghi chú mới",
      fontSize: 28,
      color: "#e0483e",
      bold: true,
      align: "left",
      fontId: null,
    };
    setLayers((prev) => [...prev, layer]);
    setSelectedId(layer.id);
    setEditingId(layer.id);
    setDirty(true);
  }

  async function addImageLayer(file: File) {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const src = await uploadEditorImage(formData);
      const natural = await loadImageSize(src);
      const width = Math.min(natural.width, project.background_width * 0.4);
      const height = width * (natural.height / natural.width);
      const layer: EditorImageLayer = {
        id: newId(),
        type: "image",
        src,
        x: Math.max(0, project.background_width / 2 - width / 2),
        y: Math.max(0, project.background_height / 2 - height / 2),
        width,
        height,
      };
      pushHistory();
      setLayers((prev) => [...prev, layer]);
      setSelectedId(layer.id);
      setDirty(true);
    } finally {
      setUploadingImage(false);
    }
  }

  function deleteSelected() {
    if (!selectedId) return;
    pushHistory();
    setLayers((prev) => prev.filter((l) => l.id !== selectedId));
    setSelectedId(null);
    setEditingId(null);
    setDirty(true);
  }

  function reorderSelected(toFront: boolean) {
    if (!selectedId) return;
    pushHistory();
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === selectedId);
      if (!layer) return prev;
      const rest = prev.filter((l) => l.id !== selectedId);
      return toFront ? [...rest, layer] : [layer, ...rest];
    });
    setDirty(true);
  }

  function startEditing(id: string) {
    pushHistory();
    setEditingId(id);
  }

  async function save() {
    setSaving(true);
    try {
      await updateEditorProject(project.id, { name, layers });
      setSavedAt(new Date());
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function exportPng() {
    if (!project.background_url) return;
    setExporting(true);
    try {
      await exportEditorPng(
        { url: project.background_url, width: project.background_width, height: project.background_height },
        layers,
        fonts,
        `${name || "bien-tap"}.png`,
      );
    } finally {
      setExporting(false);
    }
  }

  const canvasWidth = project.background_width * scale;
  const canvasHeight = project.background_height * scale;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <style>
        {fonts
          .map(
            (f) =>
              `@font-face { font-family: "${fontFamilyFor(f)}"; src: url("${f.file_url}") format("${FONT_FORMAT_BY_EXT[f.file_ext] ?? "truetype"}"); font-display: swap; }`,
          )
          .join("\n")}
      </style>

      <div className="flex items-center justify-between gap-4 px-6 py-3 flex-wrap" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/workspace/bien-tap" className="btn-icon flex-none" aria-label="Quay lại">
            ←
          </Link>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, 100));
              setDirty(true);
            }}
          />
        </div>
        <div className="flex items-center gap-2 flex-none">
          {savedAt && !dirty && (
            <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              Đã lưu {savedAt.toLocaleTimeString("vi-VN")}
            </span>
          )}
          <button type="button" className="btn-icon" title="Hoàn tác (Ctrl+Z)" onClick={undo} disabled={past.length === 0}>
            ↶
          </button>
          <button type="button" className="btn-icon" title="Làm lại (Ctrl+Shift+Z / Alt+Shift+Z)" onClick={redo} disabled={future.length === 0}>
            ↷
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportPng} disabled={exporting}>
            {exporting ? "Đang xuất…" : "⬇ Xuất PNG"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "💾 Lưu"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2 flex-wrap" style={{ borderBottom: "1px solid var(--color-neutral-200)", background: "var(--color-surface)" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addTextLayer}>
          + Thêm chữ
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>
          {uploadingImage ? "Đang tải…" : "+ Thêm ảnh"}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) addImageLayer(file);
            e.target.value = "";
          }}
        />

        {selectedLayer && (
          <>
            <span className="w-px self-stretch" style={{ background: "var(--color-neutral-200)" }} />
            <button type="button" className="btn-icon" title="Đưa lên trên" onClick={() => reorderSelected(true)}>
              ⬆
            </button>
            <button type="button" className="btn-icon" title="Đưa xuống dưới" onClick={() => reorderSelected(false)}>
              ⬇
            </button>
            <button type="button" className="btn-icon" title="Xoá" onClick={deleteSelected}>
              🗑
            </button>

            {selectedLayer.type === "text" && (
              <>
                <span className="w-px self-stretch" style={{ background: "var(--color-neutral-200)" }} />
                <select
                  className="input"
                  style={{ width: 160, padding: "6px 8px" }}
                  value={selectedLayer.fontId ?? ""}
                  onChange={(e) => updateLayer(selectedLayer.id, { fontId: e.target.value || null })}
                  aria-label="Font chữ"
                >
                  <option value="">Font mặc định</option>
                  {fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs font-semibold">
                  Cỡ chữ
                  <input
                    type="number"
                    min={8}
                    max={200}
                    className="input"
                    style={{ width: 64, padding: "6px 8px" }}
                    value={selectedLayer.fontSize}
                    onChange={(e) => updateLayer(selectedLayer.id, { fontSize: parseInt(e.target.value, 10) || 8 })}
                  />
                </label>
                <input
                  type="color"
                  aria-label="Màu chữ"
                  value={selectedLayer.color}
                  onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                  style={{ width: 32, height: 32, padding: 0, border: "none", background: "none", cursor: "pointer" }}
                />
                <button
                  type="button"
                  className="btn-icon"
                  title="In đậm"
                  onClick={() => updateLayer(selectedLayer.id, { bold: !selectedLayer.bold })}
                  style={{ fontWeight: 700, color: selectedLayer.bold ? "var(--color-accent-700)" : undefined }}
                >
                  B
                </button>
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="btn-icon"
                    title={a}
                    onClick={() => updateLayer(selectedLayer.id, { align: a })}
                    style={{ color: selectedLayer.align === a ? "var(--color-accent-700)" : undefined }}
                  >
                    {a === "left" ? "⟸" : a === "center" ? "⟺" : "⟹"}
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6" ref={wrapperRef} onPointerDown={() => setSelectedId(null)}>
        {project.background_url ? (
          <div style={{ position: "relative", width: canvasWidth, height: canvasHeight, background: "#fff", boxShadow: "var(--shadow-md)", margin: "0 auto" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={project.background_url} alt={name} draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", userSelect: "none" }} />
            {layers.map((layer) => (
              <LayerView
                key={layer.id}
                layer={layer}
                scale={scale}
                selected={selectedId === layer.id}
                editing={editingId === layer.id}
                fonts={fonts}
                onSelect={() => setSelectedId(layer.id)}
                onStartEdit={() => startEditing(layer.id)}
                onStopEdit={() => setEditingId(null)}
                onChange={(patch) => updateLayerLive(layer.id, patch)}
                onInteractionStart={pushHistory}
              />
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có file nền.</p>
        )}
      </div>
    </div>
  );
}
