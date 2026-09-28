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

// Trello-style due-date badge: green once ticked "hoàn tất" (or the card is
// in a done list), red once overdue, orange within the next 24h.
function dueDateTone(dueDate: string | null, complete: boolean): { bg: string; fg: string } {
  if (complete) return { bg: "var(--status-green)", fg: "#fff" };
  if (!dueDate) return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" };
  const due = new Date(dueDate + "T23:59:59Z").getTime();
  const now = Date.now();
  if (due < now) return { bg: "var(--badge-red-bg)", fg: "var(--badge-red-fg)" };
  if (due - now < 24 * 60 * 60 * 1000) return { bg: "var(--badge-orange-bg)", fg: "var(--badge-orange-fg)" };
  return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" };
}

type CardProps = {
  task: TaskWithAssignee;
  boardLabels?: BoardLabel[];
  isDone?: boolean;
  showLabelNames?: boolean;
  onOpen: () => void;
  onToggleDue?: () => void;
  onQuickEdit?: (at: { x: number; y: number }) => void;
  onHover?: (taskId: string | null) => void;
  onToggleLabelNames?: () => void;
};

export function TaskCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
    data: { type: "card" },
  });
  return (
    <CardBody
      {...props}
      nodeRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
    />
  );
}

// The copy that follows the finger/cursor while dragging — not sortable
// itself, so it never registers a second draggable under the same id.
export function TaskCardOverlay(props: Pick<CardProps, "task" | "boardLabels" | "isDone" | "showLabelNames">) {
  return <CardBody {...props} onOpen={() => {}} style={{ transform: "rotate(3deg)", boxShadow: "var(--shadow-lg)", cursor: "grabbing" }} />;
}

function CardBody({
  task,
  boardLabels = [],
  isDone = false,
  showLabelNames = true,
  onOpen,
  onToggleDue,
  onQuickEdit,
  onHover,
  onToggleLabelNames,
  nodeRef,
  dragProps,
  style,
}: CardProps & {
  nodeRef?: (el: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
  style: React.CSSProperties;
}) {

  const complete = isDone || !!task.due_complete;
  const dueLabel = formatDueDate(task.due_date);
  const dueTone = dueDateTone(task.due_date, complete);
  const progressPct = computeTaskProgress(task.start_date, task.due_date, complete);
  const checklistTotal = task.checklist_items?.length ?? 0;
  const checklistDone = task.checklist_items?.filter((i) => i.done).length ?? 0;
  const commentCount = task.comment_count?.[0]?.count ?? 0;
  const attachmentCount = task.attachment_count?.[0]?.count ?? 0;
  const labels = task.labels.map((id) => boardLabels.find((l) => l.id === id)).filter((l): l is BoardLabel => !!l);

  return (
    <div
      ref={nodeRef}
      style={style}
      data-task-id={task.id}
      {...dragProps}
      onClick={onOpen}
      onContextMenu={
        onQuickEdit
          ? (e) => {
              e.preventDefault();
              onQuickEdit({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
      onMouseEnter={onHover ? () => onHover(task.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      className="fk-task-card group relative card elev-sm p-2.5 flex flex-col gap-1.5 cursor-pointer select-none"
    >
      {onQuickEdit && (
        <button
          type="button"
          className="fk-hover-only absolute top-1.5 right-1.5 z-[1] items-center justify-center rounded-[6px]"
          style={{ width: 26, height: 26, background: "var(--color-panel)", boxShadow: "var(--shadow-sm)", color: "var(--color-neutral-600)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onQuickEdit({ x: r.right, y: r.bottom + 4 });
          }}
          aria-label="Sửa nhanh thẻ"
          title="Sửa nhanh (E)"
        >
          ✎
        </button>
      )}
      {task.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl(task.cover_image_url, 480, 180)}
          alt=""
          draggable={false}
          className="rounded-[6px] w-full object-cover"
          style={{ height: 96 }}
        />
      )}
      {labels.length > 0 && (
        // Like Trello: tap a label to show or hide label names on every card.
        <div
          className="flex flex-wrap gap-1"
          onClick={
            onToggleLabelNames
              ? (e) => {
                  e.stopPropagation();
                  onToggleLabelNames();
                }
              : undefined
          }
        >
          {labels.map((label) =>
            showLabelNames && label.name ? (
              <span
                key={label.id}
                title={label.name}
                className="rounded-[4px] px-1.5 text-[10.5px] font-bold leading-[17px] max-w-full truncate"
                style={{ background: label.color, color: "#fff" }}
              >
                {label.name}
              </span>
            ) : (
              <span key={label.id} title={label.name} className="rounded-[4px]" style={{ width: 36, height: 8, background: label.color }} />
            ),
          )}
        </div>
      )}
      <h4 className="text-[13.5px] font-semibold leading-snug break-words">{task.title}</h4>
      {/* One Trello-style badge row: due · checklist · comments · files ·
          description, members on the right, the card code last. */}
      <div className="flex items-center gap-2 text-[11px] min-w-0" style={{ color: "var(--color-neutral-500)" }}>
        {dueLabel &&
          (onToggleDue && !isDone ? (
            <button
              type="button"
              className="flex-none rounded-[4px] px-1.5 py-0.5 font-semibold"
              style={{ background: dueTone.bg, color: dueTone.fg }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleDue();
              }}
              title={task.due_complete ? "Bỏ dấu hoàn tất" : "Đánh dấu hoàn tất"}
            >
              {task.due_complete ? "☑" : "🕐"} {dueLabel}
            </button>
          ) : (
            <span className="flex-none rounded-[4px] px-1.5 py-0.5 font-semibold" style={{ background: dueTone.bg, color: dueTone.fg }}>
              {complete ? "☑" : "🕐"} {dueLabel}
            </span>
          ))}
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
        <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: taskProgressColor(progressPct) }} />
      </div>
    </div>
  );
}
