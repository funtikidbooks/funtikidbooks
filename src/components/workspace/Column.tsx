"use client";

import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardColumn, BoardLabel, TaskWithAssignee } from "@/lib/types";
import { TaskCard } from "./TaskCard";
import { renameColumn } from "@/lib/actions/board";
import { isDoneColumnTitle } from "@/lib/taskProgress";
import { SORT_LABELS, type SortMode } from "@/lib/boardTools";

// One Trello-style list. Long lists render in pages of PAGE cards (the
// "Final" archive lists hold hundreds) so the board opens fast on an iPad;
// a filter shows every match.
const PAGE = 40;

// Lists are sortable under this id so they never clash with a card's id or
// with the list's own drop zone (the plain column id).
export const listDndId = (columnId: string) => `list:${columnId}`;

export function Column({
  column,
  tasks,
  totalCount,
  filtering,
  boardLabels,
  showLabelNames,
  collapsed,
  otherColumns,
  canMoveLeft,
  canMoveRight,
  onMove,
  onOpenTask,
  onQuickAdd,
  onSort,
  onArchiveAll,
  onMoveAll,
  onDeleteColumn,
  onToggleCollapse,
  onToggleDue,
  onQuickEdit,
  onHoverTask,
  onToggleLabelNames,
}: {
  column: BoardColumn;
  tasks: TaskWithAssignee[];
  totalCount: number;
  filtering: boolean;
  boardLabels: BoardLabel[];
  showLabelNames: boolean;
  collapsed: boolean;
  otherColumns: BoardColumn[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (dir: -1 | 1) => void;
  onOpenTask: (task: TaskWithAssignee) => void;
  onQuickAdd: (title: string) => void;
  onSort: (mode: SortMode) => void;
  onArchiveAll: () => void;
  onMoveAll: (toColumnId: string) => void;
  onDeleteColumn: () => void;
  onToggleCollapse: () => void;
  onToggleDue: (task: TaskWithAssignee) => void;
  onQuickEdit: (task: TaskWithAssignee, at: { x: number; y: number }) => void;
  onHoverTask: (taskId: string | null) => void;
  onToggleLabelNames: () => void;
}) {
  const { setNodeRef: setDropRef } = useDroppable({ id: column.id, data: { type: "list" } });
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: listDndId(column.id), data: { type: "column" } });
  const [title, setTitle] = useState(column.title);
  const [menu, setMenu] = useState<null | "main" | "sort" | "moveAll">(null);
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
  const sortStyle: React.CSSProperties = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  function submit() {
    const t = draft.trim();
    if (!t) return;
    onQuickAdd(t);
    setDraft("");
    // Keep the composer open for the next card, like Trello.
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  }

  // Collapsed (Trello's "Thu gọn danh sách"): a slim strip with the name
  // running down it. Still a drop target — a card dropped here goes on top.
  if (collapsed) {
    return (
      <div
        ref={(el) => {
          setSortRef(el);
          setDropRef(el);
        }}
        data-col-id={column.id}
        style={{ ...sortStyle, background: "var(--color-bg)", border: "1px solid var(--color-neutral-200)" }}
        className="fk-list flex-none w-11 max-h-full rounded-[12px] snap-start"
        {...attributes}
        {...listeners}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ws-nav-link w-full h-full flex flex-col items-center gap-2 py-3 rounded-[12px]"
          title={`Mở rộng "${column.title}"`}
          aria-label={`Mở rộng danh sách ${column.title}`}
        >
          <span className="text-[13px]" aria-hidden>
            ⇔
          </span>
          <span className="tag tag-neutral tabular-nums text-[11px]">{totalCount}</span>
          <span className="text-[13px] font-bold whitespace-nowrap" style={{ writingMode: "vertical-rl", color: column.color }}>
            {column.title}
          </span>
        </button>
      </div>
    );
  }

  const menuItem = "ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]";
  const closeMenu = () => setMenu(null);

  return (
    <div
      ref={setSortRef}
      data-col-id={column.id}
      className="fk-list flex flex-col flex-none w-[84vw] max-w-[300px] sm:w-[272px] max-h-full rounded-[12px] snap-center"
      style={{ ...sortStyle, background: "var(--color-bg)", border: "1px solid var(--color-neutral-200)" }}
    >
      {/* The header is the handle for dragging the whole list (hold on a
          phone/iPad, like a card). */}
      <div className="relative flex items-center gap-2 px-3 pt-2.5 pb-1.5 touch-manipulation" style={{ cursor: "grab" }} {...attributes} {...listeners}>
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const next = e.currentTarget.textContent?.trim() || column.title;
            setTitle(next);
            if (next !== column.title) renameColumn(column.id, next);
          }}
          onKeyDown={(e) => {
            e.stopPropagation(); // typing a space must not pick the list up
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          // While the name is being edited, a mouse drag selects text
          // instead of moving the list.
          onMouseDown={(e) => {
            if (document.activeElement === e.currentTarget) e.stopPropagation();
          }}
          className="text-[13.5px] font-bold outline-none flex-1 min-w-0 break-words cursor-text"
          style={{ color: column.color }}
        >
          {title}
        </span>
        <span className="tag tag-neutral flex-none tabular-nums" title={filtering ? "Thẻ khớp bộ lọc / tổng" : "Số thẻ"}>
          {filtering ? `${tasks.length}/${totalCount}` : totalCount}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ws-nav-link hidden sm:flex items-center justify-center rounded-[6px] flex-none"
          style={{ width: 28, height: 28, color: "var(--color-neutral-500)" }}
          aria-label="Thu gọn danh sách"
          title="Thu gọn danh sách"
        >
          ⇤
        </button>
        <button
          type="button"
          onClick={() => setMenu((m) => (m ? null : "main"))}
          className="ws-nav-link flex items-center justify-center rounded-[6px] flex-none"
          style={{ width: 28, height: 28, color: "var(--color-neutral-500)" }}
          aria-label="Tuỳ chọn danh sách"
        >
          ⋯
        </button>
        {menu && (
          // Presses inside the menu never start dragging the list.
          <div onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <div className="fixed inset-0 z-30" onClick={closeMenu} />
            <div
              className="card elev-md absolute right-2 top-10 z-40 flex flex-col p-1 overflow-y-auto cursor-default"
              style={{ width: 240, maxHeight: "60vh" }}
              role="menu"
            >
              {menu === "main" && (
                <>
                  <button type="button" className={menuItem} onClick={() => (closeMenu(), setAdding(true))}>
                    + Thêm thẻ
                  </button>
                  <button type="button" className={menuItem} onClick={() => (closeMenu(), onToggleCollapse())}>
                    ⇤ Thu gọn danh sách
                  </button>
                  <button type="button" className={menuItem} onClick={() => setMenu("sort")}>
                    ⇅ Sắp xếp thẻ…
                  </button>
                  <button
                    type="button"
                    className={menuItem}
                    disabled={totalCount === 0}
                    style={{ opacity: totalCount ? 1 : 0.4 }}
                    onClick={() => setMenu("moveAll")}
                  >
                    ➜ Chuyển mọi thẻ sang…
                  </button>
                  <button type="button" className={menuItem} disabled={!canMoveLeft} style={{ opacity: canMoveLeft ? 1 : 0.4 }} onClick={() => (closeMenu(), onMove(-1))}>
                    ← Chuyển danh sách sang trái
                  </button>
                  <button type="button" className={menuItem} disabled={!canMoveRight} style={{ opacity: canMoveRight ? 1 : 0.4 }} onClick={() => (closeMenu(), onMove(1))}>
                    → Chuyển danh sách sang phải
                  </button>
                  <p className="px-2.5 py-1 text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                    Hoặc giữ và kéo phần tên danh sách để đổi chỗ.
                  </p>
                  <div className="my-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }} />
                  <button
                    type="button"
                    className={menuItem}
                    disabled={totalCount === 0}
                    style={{ opacity: totalCount ? 1 : 0.4 }}
                    onClick={() => {
                      closeMenu();
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
                      closeMenu();
                      if (confirm(`Xoá danh sách "${column.title}"? Toàn bộ ${totalCount} thẻ trong danh sách sẽ bị xoá vĩnh viễn.`)) onDeleteColumn();
                    }}
                  >
                    🗑 Xoá danh sách
                  </button>
                </>
              )}
              {menu === "sort" && (
                <>
                  <button type="button" className={menuItem} onClick={() => setMenu("main")} style={{ color: "var(--color-neutral-500)" }}>
                    ← Sắp xếp theo
                  </button>
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                    <button key={m} type="button" className={menuItem} onClick={() => (closeMenu(), onSort(m))}>
                      {SORT_LABELS[m]}
                    </button>
                  ))}
                </>
              )}
              {menu === "moveAll" && (
                <>
                  <button type="button" className={menuItem} onClick={() => setMenu("main")} style={{ color: "var(--color-neutral-500)" }}>
                    ← Chuyển {totalCount} thẻ sang
                  </button>
                  {otherColumns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={menuItem}
                      onClick={() => {
                        closeMenu();
                        if (confirm(`Chuyển cả ${totalCount} thẻ từ "${column.title}" sang đầu "${c.title}"?`)) onMoveAll(c.id);
                      }}
                    >
                      {c.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        ref={(el) => {
          setDropRef(el);
          listRef.current = el;
        }}
        className="flex flex-col gap-2 overflow-y-auto fk-col-scroll min-h-[24px] px-2 pb-1"
      >
        <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {shown.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              boardLabels={boardLabels}
              isDone={isDone}
              showLabelNames={showLabelNames}
              onOpen={() => onOpenTask(task)}
              onToggleDue={() => onToggleDue(task)}
              onQuickEdit={(at) => onQuickEdit(task, at)}
              onHover={onHoverTask}
              onToggleLabelNames={onToggleLabelNames}
            />
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
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}
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
