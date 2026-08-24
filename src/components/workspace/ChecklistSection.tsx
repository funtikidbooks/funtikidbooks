"use client";

import { useState, useTransition } from "react";
import { addChecklistItem, deleteChecklistItem, toggleChecklistItem } from "@/lib/actions/task-detail";
import type { ChecklistItem } from "@/lib/types";

export function ChecklistSection({
  taskId,
  items,
  onChange,
  inputRef,
}: {
  taskId: string;
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const [, startTransition] = useTransition();

  const total = items.length;
  const done = items.filter((i) => i.done).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: ChecklistItem = {
      id: tempId,
      task_id: taskId,
      text: trimmed,
      done: false,
      position: items.length,
      created_at: new Date().toISOString(),
    };
    onChange([...items, optimistic]);

    startTransition(async () => {
      try {
        const created = await addChecklistItem(taskId, trimmed);
        if (created) onChange([...items, optimistic].map((i) => (i.id === tempId ? created : i)));
      } catch {
        // optimistic item stays as-is when there is no live Supabase backend
      }
    });
  }

  function toggle(item: ChecklistItem, next: boolean) {
    onChange(items.map((i) => (i.id === item.id ? { ...i, done: next } : i)));
    startTransition(async () => {
      try {
        await toggleChecklistItem(item.id, next);
      } catch {
        // optimistic toggle stays as-is
      }
    });
  }

  function remove(item: ChecklistItem) {
    onChange(items.filter((i) => i.id !== item.id));
    startTransition(async () => {
      try {
        await deleteChecklistItem(item.id);
      } catch {
        // optimistic removal stays as-is
      }
    });
  }

  return (
    <div className="field">
      <label>
        ☑ Việc cần làm {total > 0 && `(${done}/${total})`}
      </label>
      {total > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-neutral-200)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round((done / total) * 100)}%`, background: "var(--color-accent-500)" }}
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <label
            key={item.id}
            className="group flex items-center gap-2 rounded-[8px] px-1.5 py-1"
            style={{ background: "transparent" }}
          >
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => toggle(item, e.target.checked)}
              className="h-4 w-4 flex-none"
            />
            <span
              className="flex-1 text-[13.5px]"
              style={{
                color: item.done ? "var(--color-neutral-500)" : "var(--color-text)",
                textDecoration: item.done ? "line-through" : "none",
              }}
            >
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => remove(item)}
              className="hidden text-xs group-hover:block"
              style={{ color: "var(--color-neutral-500)" }}
              aria-label="Xoá mục"
            >
              ✕
            </button>
          </label>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Thêm mục…"
        />
        <button type="submit" className="btn btn-ghost btn-sm flex-none">
          Thêm
        </button>
      </form>
    </div>
  );
}
