"use client";

import { useState } from "react";
import type { BoardLabel } from "@/lib/types";
import { LABEL_SWATCHES } from "@/lib/labelPalette";

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; labelId: string };

export function LabelPicker({
  labels,
  selectedIds,
  onToggle,
  onCreate,
  onRename,
  onRecolor,
  onDelete,
  onClose,
}: {
  labels: BoardLabel[];
  selectedIds: string[];
  onToggle: (labelId: string) => void;
  onCreate: (name: string, color: string) => void;
  onRename: (labelId: string, name: string) => void;
  onRecolor: (labelId: string, color: string) => void;
  onDelete: (labelId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>({ mode: "list" });
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<string>(LABEL_SWATCHES[0]);

  const filtered = labels.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()));

  function openCreate() {
    const unused = LABEL_SWATCHES.find((c) => !labels.some((l) => l.color === c)) ?? LABEL_SWATCHES[0];
    setDraftName("");
    setDraftColor(unused);
    setView({ mode: "create" });
  }

  function openEdit(label: BoardLabel) {
    setDraftName(label.name);
    setDraftColor(label.color);
    setView({ mode: "edit", labelId: label.id });
  }

  function saveDraft() {
    const name = draftName.trim();
    if (!name) return;
    if (view.mode === "edit") {
      onRename(view.labelId, name);
      onRecolor(view.labelId, draftColor);
    } else {
      onCreate(name, draftColor);
    }
    setView({ mode: "list" });
  }

  if (view.mode === "create" || view.mode === "edit") {
    return (
      <div className="card elev-md absolute left-0 top-9 z-20 flex flex-col gap-3 p-3" style={{ width: 240 }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView({ mode: "list" })}
            className="ws-nav-link flex items-center justify-center rounded-[6px] flex-none"
            style={{ width: 22, height: 22 }}
            aria-label="Quay lại"
          >
            ←
          </button>
          <span className="text-[13px] font-bold flex-1 text-center">
            {view.mode === "edit" ? "Sửa nhãn" : "Tạo nhãn mới"}
          </span>
          <span style={{ width: 22 }} />
        </div>

        <div
          className="rounded-[6px] flex items-center px-2.5"
          style={{ height: 40, background: draftColor, color: "#fff" }}
        >
          <span className="text-[12px] font-bold truncate">{draftName || "Xem trước"}</span>
        </div>

        <div className="field">
          <label className="text-[11px]">Tên nhãn</label>
          <input
            autoFocus
            className="input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveDraft()}
            placeholder="VD: GẤP, KH Series…"
          />
        </div>

        <div className="field">
          <label className="text-[11px]">Màu</label>
          <div className="flex flex-wrap gap-2">
            {LABEL_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDraftColor(color)}
                className="flex items-center justify-center rounded-[6px] flex-none"
                style={{
                  width: 28,
                  height: 28,
                  background: color,
                  outline: draftColor === color ? "2px solid var(--color-neutral-700)" : "none",
                  outlineOffset: 2,
                }}
                aria-label={color}
              >
                {draftColor === color && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {view.mode === "edit" ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("Xoá nhãn này khỏi mọi thẻ công việc?")) {
                  onDelete(view.labelId);
                  setView({ mode: "list" });
                }
              }}
              className="btn btn-ghost btn-sm mt-2"
              style={{ color: "var(--status-red)" }}
            >
              Xoá
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={saveDraft} className="btn btn-primary btn-sm mt-2" disabled={!draftName.trim()}>
            Lưu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card elev-md absolute left-0 top-9 z-20 flex flex-col gap-2 p-2" style={{ width: 240 }}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[13px] font-bold">Nhãn</span>
        <button
          type="button"
          onClick={onClose}
          className="ws-nav-link flex items-center justify-center rounded-[6px] flex-none"
          style={{ width: 20, height: 20 }}
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>
      <input
        autoFocus
        className="input"
        placeholder="Tìm nhãn…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
        {filtered.map((label) => (
          <div key={label.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggle(label.id)}
              className="flex-1 min-w-0 rounded-[6px] flex items-center justify-between px-2.5 text-left"
              style={{ height: 32, background: label.color, color: "#fff" }}
            >
              <span className="text-[12px] font-bold truncate">{label.name || "(chưa đặt tên)"}</span>
              {selectedIds.includes(label.id) && <span aria-hidden className="flex-none ml-1">✓</span>}
            </button>
            <button
              type="button"
              onClick={() => openEdit(label)}
              className="ws-nav-link flex items-center justify-center rounded-[6px] flex-none"
              style={{ width: 32, height: 32 }}
              aria-label={`Sửa nhãn ${label.name}`}
            >
              ✎
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[12px] text-center py-2" style={{ color: "var(--color-neutral-500)" }}>
            Không tìm thấy nhãn nào
          </p>
        )}
      </div>
      <button type="button" onClick={openCreate} className="btn btn-ghost btn-sm w-full">
        + Tạo nhãn mới
      </button>
    </div>
  );
}
