"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardColumn, TaskWithAssignee } from "@/lib/types";
import { TaskCard } from "./TaskCard";
import { renameColumn } from "@/lib/actions/board";

export function Column({
  column,
  tasks,
  onOpenTask,
  onAddTask,
  onDeleteColumn,
}: {
  column: BoardColumn;
  tasks: TaskWithAssignee[];
  onOpenTask: (task: TaskWithAssignee) => void;
  onAddTask: () => void;
  onDeleteColumn: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const [title, setTitle] = useState(column.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const isDone = column.title.toLowerCase().includes("hoàn thành");

  return (
    <div
      className="flex flex-col gap-2.5 flex-none w-[250px] max-h-[640px] p-3 rounded-[var(--radius-md)]"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-neutral-200)" }}
    >
      <div className="relative flex items-center justify-between gap-2 px-0.5">
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const next = e.currentTarget.textContent?.trim() || column.title;
            setTitle(next);
            if (next !== column.title) renameColumn(column.id, next);
          }}
          className="text-[13px] font-bold outline-none flex-1 min-w-0"
          style={{ color: column.color }}
        >
          {title}
        </span>
        <span className="tag tag-neutral flex-none">{tasks.length}</span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ws-nav-link flex items-center justify-center rounded-[6px] flex-none"
          style={{ width: 20, height: 20, color: "var(--color-neutral-500)" }}
          aria-label="Tuỳ chọn danh sách"
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div
              className="card elev-md absolute right-0 top-6 z-20 flex flex-col p-1"
              style={{ width: 180 }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAddTask();
                }}
                className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]"
              >
                + Thêm thẻ
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Xoá danh sách "${column.title}"? Toàn bộ thẻ trong danh sách sẽ bị xoá.`)) {
                    onDeleteColumn();
                  }
                }}
                className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]"
                style={{ color: "var(--status-red)" }}
              >
                🗑 Xoá danh sách này
              </button>
            </div>
          </>
        )}
      </div>

      <div ref={setNodeRef} className="flex flex-col gap-2 overflow-y-auto fk-col-scroll min-h-[40px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} isDone={isDone} onOpen={() => onOpenTask(task)} />
          ))}
        </SortableContext>
      </div>

      <button
        type="button"
        onClick={onAddTask}
        className="ws-add-btn text-[12.5px] font-semibold text-left px-2 py-1.5 rounded-[8px]"
        style={{ color: "var(--color-neutral-500)" }}
      >
        + Thêm công việc
      </button>
    </div>
  );
}
