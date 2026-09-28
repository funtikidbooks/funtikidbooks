"use client";

import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardColumn, BoardLabel, TaskWithAssignee } from "@/lib/types";
import { TaskCard } from "./TaskCard";
import { renameColumn } from "@/lib/actions/board";
import { isDoneColumnTitle } from "@/lib/taskProgress";
import { SORT_LABELS, type SortMode } from "@/lib/boardTools";

// One Trello-style list. Long lists render in pages of PAGE cards (the
// "Final" archive lists hold hundreds) so the board opens fast on an iPad;
// a filter shows every match.
const PAGE = 40;

export function Column({
  column,
  tasks,
  totalCount,
  filtering,
  boardLabels,
  canMoveLeft,
  canMoveRight,
  onOpenTask,
  onQuickAdd,
  onMove,
  onSort,
  onArchiveAll,
  onDeleteColumn,
}: {
  column: BoardColumn;
  tasks: TaskWithAssignee[];
  totalCount: number;
  filtering: boolean;
  boardLabels: BoardLabel[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onOpenTask: (task: TaskWithAssignee) => void;
  onQuickAdd: (title: string) => void;
  onMove: (dir: -1 | 1) => void;
  onSort: (mode: SortMode) => void;
  onArchiveAll: () => void;
  onDeleteColumn: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const [title, setTitle] = useState(column.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  const isDone = isDoneColumnTitle(column.title);

  // A rename from another device.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirroring a realtime rename
    setTitle(column.title);
  }, [column.title]);

  const shown = filtering ? tasks : tasks.slice(0, limit);
  const hidden = tasks.length - shown.length;

  function submit() {
    const t = draft.trim();
    if (!t) return;
    onQuickAdd(t);
    setDraft("");
    // Keep the composer open for the next card, like Trello.
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  }

  const menuItem = "ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]";

  return (
    <div
      className="fk-list flex flex-col flex-none w-[84vw] max-w-[300px] sm:w-[272px] max-h-full rounded-[12px] snap-center"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-neutral-200)" }}
    >
      <div className="relative flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const next = e.currentTarget.textContent?.trim() || column.title;
            setTitle(next);
            if (next !== column.title) renameColumn(column.id, next);
          }}
          className="text-[13.5px] font-bold outline-none flex-1 min-w-0 break-words"
          style={{ color: column.color }}
        >
          {title}
        </span>
        <span className="tag tag-neutral flex-none tabular-nums" title={filtering ? "Thẻ khớp bộ lọc / tổng" : "Số thẻ"}>
          {filtering ? `${tasks.length}/${totalCount}` : totalCount}
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ws-nav-link flex items-center justify-center rounded-[6px] flex-none"
          style={{ width: 28, height: 28, color: "var(--color-neutral-500)" }}
          aria-label="Tuỳ chọn danh sách"
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => { setMenuOpen(false); setSortOpen(false); }} />
            <div className="card elev-md absolute right-2 top-10 z-40 flex flex-col p-1" style={{ width: 236 }} role="menu">
              {!sortOpen ? (
                <>
                  <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); setAdding(true); }}>
                    + Thêm thẻ
                  </button>
                  <button type="button" className={menuItem} disabled={!canMoveLeft} style={{ opacity: canMoveLeft ? 1 : 0.4 }} onClick={() => { setMenuOpen(false); onMove(-1); }}>
                    ← Chuyển danh sách sang trái
                  </button>
                  <button type="button" className={menuItem} disabled={!canMoveRight} style={{ opacity: canMoveRight ? 1 : 0.4 }} onClick={() => { setMenuOpen(false); onMove(1); }}>
                    → Chuyển danh sách sang phải
                  </button>
                  <button type="button" className={menuItem} onClick={() => setSortOpen(true)}>
                    ⇅ Sắp xếp thẻ…
                  </button>
                  <div className="my-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }} />
                  <button
                    type="button"
                    className={menuItem}
                    disabled={totalCount === 0}
                    style={{ opacity: totalCount ? 1 : 0.4 }}
                    onClick={() => {
                      setMenuOpen(false);
                      if (confirm(`Lưu trữ tất cả ${totalCount} thẻ trong "${column.title}"? Xem lại hoặc khôi phục ở mục 📦 Lưu trữ.`)) onArchiveAll();
                    }}
                  >
                    📦 Lưu trữ tất cả thẻ
                  </button>
                  <button
                    type="button"
                    className={menuItem}
                    style={{ color: "var(--status-red)" }}
                    onClick={() => {
                      setMenuOpen(false);
                      if (confirm(`Xoá danh sách "${column.title}"? Toàn bộ ${totalCount} thẻ trong danh sách sẽ bị xoá vĩnh viễn.`)) onDeleteColumn();
                    }}
                  >
                    🗑 Xoá danh sách
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={menuItem} onClick={() => setSortOpen(false)} style={{ color: "var(--color-neutral-500)" }}>
                    ← Sắp xếp theo
                  </button>
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                    <button key={m} type="button" className={menuItem} onClick={() => { setMenuOpen(false); setSortOpen(false); onSort(m); }}>
                      {SORT_LABELS[m]}
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div ref={(el) => { setNodeRef(el); listRef.current = el; }} className="flex flex-col gap-2 overflow-y-auto fk-col-scroll min-h-[24px] px-2 pb-1">
        <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {shown.map((task) => (
            <TaskCard key={task.id} task={task} boardLabels={boardLabels} isDone={isDone} onOpen={() => onOpenTask(task)} />
          ))}
        </SortableContext>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="ws-add-btn text-[12.5px] font-semibold py-2 rounded-[8px]"
            style={{ color: "var(--color-accent-700)", border: "1px dashed var(--color-neutral-300)" }}
          >
            Hiện thêm {Math.min(PAGE, hidden)} thẻ ({hidden} thẻ nữa)
          </button>
        )}
        {adding && (
          <div className="flex flex-col gap-2 pt-0.5">
            <textarea
              autoFocus
              rows={2}
              className="input font-normal text-[13.5px]"
              style={{ resize: "none" }}
              placeholder="Nhập tiêu đề thẻ…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
            />
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
                Thêm thẻ
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 30, height: 30, padding: 0 }}
                aria-label="Đóng"
                onClick={() => { setAdding(false); setDraft(""); }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ws-add-btn text-[13px] font-semibold text-left mx-2 mb-2 mt-1 px-2 py-2 rounded-[8px]"
          style={{ color: "var(--color-neutral-500)" }}
        >
          + Thêm thẻ
        </button>
      )}
    </div>
  );
}
