"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskWithAssignee } from "@/lib/types";
import { labelColor } from "@/lib/labelPalette";
import { computeTaskProgress, taskProgressColor } from "@/lib/taskProgress";
import { thumbnailUrl } from "@/lib/imageTransform";

function formatDueDate(dueDate: string | null) {
  if (!dueDate) return null;
  const d = new Date(dueDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// Trello-style due-date badge: red once overdue, orange within the next 24h,
// green (and struck through) once the card has landed in the "done" column.
function dueDateTone(dueDate: string | null, isDone: boolean): { bg: string; fg: string } {
  if (isDone) return { bg: "var(--color-accent-100)", fg: "var(--status-green)" };
  if (!dueDate) return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" };
  const due = new Date(dueDate + "T23:59:59").getTime();
  const now = Date.now();
  if (due < now) return { bg: "var(--badge-red-bg)", fg: "var(--badge-red-fg)" };
  if (due - now < 24 * 60 * 60 * 1000) return { bg: "var(--badge-orange-bg)", fg: "var(--badge-orange-fg)" };
  return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" };
}

export function TaskCard({
  task,
  isDone = false,
  onOpen,
}: {
  task: TaskWithAssignee;
  isDone?: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const dueLabel = formatDueDate(task.due_date);
  const dueTone = dueDateTone(task.due_date, isDone);
  const progressPct = computeTaskProgress(task.start_date, task.due_date, isDone);
  const checklistTotal = task.checklist_items?.length ?? 0;
  const checklistDone = task.checklist_items?.filter((i) => i.done).length ?? 0;
  const commentCount = task.comment_count?.[0]?.count ?? 0;
  const attachmentCount = task.attachment_count?.[0]?.count ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="fk-task-card card elev-sm p-2.5 flex flex-col gap-2 cursor-pointer select-none"
    >
      {task.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl(task.cover_image_url, 480, 180)}
          alt=""
          className="rounded-[6px] w-full object-cover"
          style={{ height: 90 }}
        />
      )}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((key) => (
            <span
              key={key}
              className="rounded-[4px]"
              style={{ width: 32, height: 8, background: labelColor(key) }}
            />
          ))}
        </div>
      )}
      <span className="text-[11px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
        {task.code}
      </span>
      <h4 className="text-[13px] font-bold leading-snug">{task.title}</h4>
      <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
        {task.assignees.length > 0 ? (
          <div className="flex items-center -space-x-1.5">
            {task.assignees.slice(0, 4).map((a) => (
              <span
                key={a.id}
                title={a.display_name}
                className="flex items-center justify-center rounded-full font-bold flex-none"
                style={{
                  width: 18,
                  height: 18,
                  fontSize: 9,
                  background: "var(--color-accent-100)",
                  color: "var(--color-accent-700)",
                  border: "1.5px solid var(--color-panel)",
                }}
              >
                {a.display_name.charAt(0).toUpperCase()}
              </span>
            ))}
            {task.assignees.length > 4 && (
              <span
                className="flex items-center justify-center rounded-full font-bold flex-none"
                style={{
                  width: 18,
                  height: 18,
                  fontSize: 8,
                  background: "var(--color-neutral-200)",
                  color: "var(--color-neutral-700)",
                  border: "1.5px solid var(--color-panel)",
                }}
              >
                +{task.assignees.length - 4}
              </span>
            )}
          </div>
        ) : (
          <span>Chưa giao</span>
        )}
        {dueLabel && (
          <span
            className="flex-none rounded-[4px] px-1.5 py-0.5 font-semibold"
            style={{ background: dueTone.bg, color: dueTone.fg, textDecoration: isDone ? "line-through" : "none" }}
          >
            🕐 {dueLabel}
          </span>
        )}
      </div>
      {(checklistTotal > 0 || commentCount > 0 || attachmentCount > 0) && (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
          {checklistTotal > 0 && (
            <span>
              ☑ {checklistDone}/{checklistTotal}
            </span>
          )}
          {commentCount > 0 && <span>💬 {commentCount}</span>}
          {attachmentCount > 0 && <span>📎 {attachmentCount}</span>}
        </div>
      )}
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "var(--color-neutral-200)" }}
        title={`Tiến độ theo thời hạn: ${progressPct}%`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${progressPct}%`, background: taskProgressColor(progressPct) }}
        />
      </div>
    </div>
  );
}
