"use client";

import { useState } from "react";
import { addTaskLink, deleteTaskLink } from "@/lib/actions/task-detail";
import type { TaskLink } from "@/lib/types";

export function TaskLinks({
  taskId,
  links,
  onChange,
  adding,
  onRequestAdd,
  onCancelAdd,
}: {
  taskId: string;
  links: TaskLink[];
  onChange: (links: TaskLink[]) => void;
  adding: boolean;
  onRequestAdd: () => void;
  onCancelAdd: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    if (!trimmedLabel || !trimmedUrl) return;
    setSaving(true);

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: TaskLink = {
      id: tempId,
      task_id: taskId,
      label: trimmedLabel,
      url: trimmedUrl,
      created_by: null,
      created_at: new Date().toISOString(),
    };
    onChange([...links, optimistic]);
    setLabel("");
    setUrl("");
    onCancelAdd();

    try {
      const created = await addTaskLink(taskId, trimmedLabel, trimmedUrl);
      onChange([...links, optimistic].map((l) => (l.id === tempId ? (created ?? l) : l)));
    } catch {
      // optimistic link stays as-is when there is no live Supabase backend
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    onChange(links.filter((l) => l.id !== id));
    deleteTaskLink(id).catch(() => {
      // optimistic removal stays as-is
    });
  }

  return (
    <div className="field">
      <div className="flex items-center justify-between !mb-0">
        <label className="!mb-0">🔗 Liên kết</label>
        {!adding && (
          <button type="button" onClick={onRequestAdd} className="btn btn-ghost btn-sm">
            + Thêm
          </button>
        )}
      </div>

      {links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {links.map((l) => (
            <div
              key={l.id}
              className="group flex items-center gap-2 rounded-[8px] px-2.5 py-2"
              style={{ background: "var(--color-surface)" }}
            >
              <span aria-hidden>🔗</span>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 text-[13px] font-semibold truncate"
                style={{ color: "var(--color-accent-700)" }}
              >
                {l.label}
              </a>
              <button
                type="button"
                onClick={() => remove(l.id)}
                className="hidden text-xs group-hover:block flex-none"
                style={{ color: "var(--color-neutral-500)" }}
                aria-label="Xoá liên kết"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            className="input"
            placeholder="Tên liên kết…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <input
            className="input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !label.trim() || !url.trim()}>
              Lưu
            </button>
            <button type="button" onClick={onCancelAdd} className="btn btn-ghost btn-sm">
              Huỷ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
