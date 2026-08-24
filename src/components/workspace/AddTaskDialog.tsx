"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { createTask } from "@/lib/actions/board";
import type { Profile, TaskWithAssignee } from "@/lib/types";

export function AddTaskDialog({
  boardId,
  columnId,
  columnTitle,
  profiles,
  onCreated,
  onReconciled,
  onClose,
}: {
  boardId: string;
  columnId: string;
  columnTitle: string;
  profiles: Profile[];
  onCreated: (task: TaskWithAssignee) => void;
  onReconciled: (tempId: string, task: TaskWithAssignee) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const assignee = profiles.find((p) => p.id === assigneeId) ?? null;
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    onCreated({
      id: tempId,
      board_id: boardId,
      column_id: columnId,
      code: "#" + String(Math.floor(Math.random() * 900) + 100),
      title: trimmedTitle,
      description: description.trim() || null,
      assignee_id: assigneeId || null,
      assignee,
      assignees: assignee ? [assignee] : [],
      start_date: startDate || null,
      due_date: dueDate || null,
      progress: 0,
      position: 9999,
      cover_image_url: null,
      labels: [],
      created_by: null,
      created_at: now,
      updated_at: now,
    });
    onClose();

    startTransition(async () => {
      try {
        const task = await createTask({
          boardId,
          columnId,
          title: trimmedTitle,
          description,
          assigneeId: assigneeId || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
        });
        if (task) {
          const resolvedAssignee = profiles.find((p) => p.id === task.assignee_id) ?? null;
          onReconciled(tempId, { ...task, assignee: resolvedAssignee, assignees: resolvedAssignee ? [resolvedAssignee] : [] });
        }
      } catch {
        // Optimistic task stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <span className="tag tag-accent">{columnTitle}</span>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <input
          className="input"
          style={{ fontSize: 18, fontWeight: 700, border: "none", padding: "4px 0" }}
          placeholder="Tên công việc…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="field">
            <label htmlFor="assignee">👤 Thành viên</label>
            <select
              id="assignee"
              className="input"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Chưa giao</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="startDate">🕐 Ngày bắt đầu</label>
            <input
              id="startDate"
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="dueDate">🕐 Ngày hết hạn</label>
            <input
              id="dueDate"
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="description">Mô tả</label>
          <textarea
            id="description"
            className="input"
            rows={4}
            placeholder="Chi tiết công việc…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={!title.trim()}>
          Lưu công việc
        </button>
      </form>
    </Modal>
  );
}
