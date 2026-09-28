"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardLabel, TaskWithAssignee } from "@/lib/types";
import { computeTaskProgress, taskProgressColor } from "@/lib/taskProgress";
import { thumbnailUrl } from "@/lib/imageTransform";

// dueDate is a plain calendar date with no time-of-day meaning — parsed
// and read/formatted both as UTC (paired "Z" + timeZone: "UTC") below so
// the round-trip stays consistent regardless of the runtime's own local
// timezone. Without that pairing, the server (UTC) and a browser in
// Vietnam (UTC+7) could parse "end of day" as two different absolute
// instants — a real hydration mismatch on the board's default page, since
// it can flip which color dueDateTone below renders. See MeetingHub.tsx's
// own comment on this same root cause elsewhere in the app.
function formatDueDate(dueDate: string | null) {
  if (!dueDate) return null;
  const d = new Date(dueDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

// Trello-style due-date badge: red once overdue, orange within the next 24h,
// green (and struck through) once the card has landed in the "done" column.
function dueDateTone(dueDate: string | null, isDone: boolean): { bg: string; fg: string } {
  if (isDone) return { bg: "var(--color-accent-100)", fg: "var(--status-green)" };
  if (!dueDate) return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" };
  const due = new Date(dueDate + "T23:59:59Z").getTime();
  const now = Date.now();
  if (due < now) return { bg: "var(--badge-red-bg)", fg: "var(--badge-red-fg)" };
  if (due - now < 24 * 60 * 60 * 1000) return { bg: "var(--badge-orange-bg)", fg: "var(--badge-orange-fg)" };
  return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" };
}

export function TaskCard({
  task,
  boardLabels = [],
  isDone = false,
  onOpen,
}: {
  task: TaskWithAssignee;
  boardLabels?: BoardLabel[];
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
      className="fk-task-card card elev-sm p-2.5 flex flex-col gap-1.5 cursor-pointer select-none"
    >
      {task.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl(task.cover_image_url, 480, 180)}
          alt=""
          className="rounded-[6px] w-full object-cover"
          style={{ height: 96 }}
        />
      )}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((id) => {
            const label = boardLabels.find((l) => l.id === id);
            if (!label) return null;
            return (
              <span
                key={id}
                title={label.name}
                className="rounded-[4px]"
                style={{ width: 32, height: 8, background: label.color }}
              />
            );
          })}
        </div>
      )}
      <h4 className="text-[13.5px] font-semibold leading-snug break-words">{task.title}</h4>
      {/* One Trello-style badge row: due · checklist · comments · files ·
          description, members on the right, the card code last. */}
      <div className="flex items-center gap-2 text-[11px] min-w-0" style={{ color: "var(--color-neutral-500)" }}>
        {dueLabel && (
          <span
            className="flex-none rounded-[4px] px-1.5 py-0.5 font-semibold"
            style={{ background: dueTone.bg, color: dueTone.fg, textDecoration: isDone ? "line-through" : "none" }}
          >
            🕐 {dueLabel}
          </span>
        )}
        {checklistTotal > 0 && (
          <span className="flex-none" style={checklistDone === checklistTotal ? { color: "var(--status-green)", fontWeight: 700 } : undefined}>
            ☑ {checklistDone}/{checklistTotal}
          </span>
        )}
        {commentCount > 0 && <span className="flex-none">💬 {commentCount}</span>}
        {attachmentCount > 0 && <span className="flex-none">📎 {attachmentCount}</span>}
        {!!task.description && task.description.replace(/<[^>]+>/g, "").trim().length > 0 && (
          <span className="flex-none" title="Có mô tả">
            ≡
          </span>
        )}
        <span className="flex-1" />
        {task.assignees.length > 0 && (
          <div className="flex items-center -space-x-1.5 flex-none">
            {task.assignees.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.display_name}
                className="flex items-center justify-center rounded-full font-bold flex-none"
                style={{
                  width: 20,
                  height: 20,
                  fontSize: 9,
                  background: "var(--color-accent-100)",
                  color: "var(--color-accent-700)",
                  border: "1.5px solid var(--color-panel)",
                }}
              >
                {a.display_name.charAt(0).toUpperCase()}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span
                className="flex items-center justify-center rounded-full font-bold flex-none"
                style={{
                  width: 20,
                  height: 20,
                  fontSize: 8,
                  background: "var(--color-neutral-200)",
                  color: "var(--color-neutral-700)",
                  border: "1.5px solid var(--color-panel)",
                }}
              >
                +{task.assignees.length - 3}
              </span>
            )}
          </div>
        )}
        <span className="flex-none text-[10px] tabular-nums" style={{ color: "var(--color-neutral-400)" }}>
          {task.code}
        </span>
      </div>
      <div
        className="h-[3px] rounded-full overflow-hidden"
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
