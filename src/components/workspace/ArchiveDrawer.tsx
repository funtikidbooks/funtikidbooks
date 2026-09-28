"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { BoardColumn, TaskWithAssignee } from "@/lib/types";
import { fold } from "@/lib/boardTools";

// "📦 Lưu trữ": cards put away from the board (one at a time or a whole
// list), searchable, and restorable into any list — or removed for good.
export function ArchiveDrawer({
  tasks,
  columns,
  onRestore,
  onDeleteForever,
  onOpen,
  onClose,
}: {
  tasks: TaskWithAssignee[];
  columns: BoardColumn[];
  onRestore: (taskId: string, toColumnId: string) => void;
  onDeleteForever: (taskId: string) => void;
  onOpen: (task: TaskWithAssignee) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState(columns[0]?.id ?? "");
  const shown = [...tasks]
    .reverse()
    .filter((t) => !q.trim() || fold(`${t.title} ${t.code}`).includes(fold(q.trim())));

  return (
    <Modal onClose={onClose} maxWidth={620}>
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-lg flex-1">📦 Thẻ đã lưu trữ · {tasks.length}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
            <input
              id="archive-search"
              className="input font-normal"
              placeholder="Tìm trong lưu trữ…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
              Khôi phục vào
              <select id="archive-target" className="input font-normal" style={{ width: "auto", padding: "8px 10px" }} value={target} onChange={(e) => setTarget(e.target.value)}>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--color-neutral-500)" }}>
              {tasks.length === 0 ? "Chưa có thẻ nào được lưu trữ." : "Không có thẻ nào khớp."}
            </p>
          ) : (
            <div className="flex flex-col">
              {shown.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 py-2.5" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                  <button type="button" className="flex-1 min-w-[160px] text-left" onClick={() => onOpen(t)}>
                    <span className="text-[13.5px] font-semibold block truncate">{t.title}</span>
                    <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                      {t.code}
                    </span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!target} onClick={() => onRestore(t.id, target)}>
                    ↩ Khôi phục
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(`Xoá vĩnh viễn thẻ "${t.title}"? Không thể hoàn tác.`)) onDeleteForever(t.id);
                    }}
                  >
                    Xoá hẳn
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
