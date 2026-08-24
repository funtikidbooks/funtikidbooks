"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Modal } from "@/components/ui/Modal";
import { addTaskAssignee, moveTaskColumn, removeTaskAssignee, updateTask, updateTaskLabels, deleteTask } from "@/lib/actions/board";
import { getTaskDetail, uploadTaskAttachment } from "@/lib/actions/task-detail";
import { LABEL_PALETTE, labelColor } from "@/lib/labelPalette";
import { computeTaskProgress, taskProgressColor } from "@/lib/taskProgress";
import { ChecklistSection } from "./ChecklistSection";
import { TaskAttachments } from "./TaskAttachments";
import { TaskCommentChat } from "./TaskCommentChat";
import { TaskCover } from "./TaskCover";
import { TaskLinks } from "./TaskLinks";
import type {
  BoardColumn,
  ChecklistItem,
  Profile,
  TaskActivity,
  TaskAttachment,
  TaskComment,
  TaskLink,
  TaskWithAssignee,
} from "@/lib/types";

// Code-split: TipTap is heavy and only opens once someone edits a
// description, so it shouldn't bloat the workspace's initial bundle.
const RichTextEditor = dynamic(() => import("@/components/admin/RichTextEditor").then((m) => m.RichTextEditor), {
  ssr: false,
});

export function EditTaskDialog({
  task,
  columns,
  profiles,
  currentUserId,
  onUpdated,
  onDeleted,
  onClose,
}: {
  task: TaskWithAssignee;
  columns: BoardColumn[];
  profiles: Profile[];
  currentUserId: string;
  onUpdated: (task: TaskWithAssignee) => void;
  onDeleted: (taskId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [descEditing, setDescEditing] = useState(false);
  const [assignees, setAssignees] = useState(task.assignees ?? []);
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [coverUrl, setCoverUrl] = useState(task.cover_image_url);
  const [labels, setLabels] = useState<string[]>(task.labels ?? []);
  const [columnId, setColumnId] = useState(task.column_id);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pending, startTransition] = useTransition();
  const columnTitle = columns.find((c) => c.id === columnId)?.title ?? "";
  const isDone = columnTitle.toLowerCase().includes("hoàn thành");
  const progressPct = computeTaskProgress(startDate || null, dueDate || null, isDone);

  const checklistRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const checklistInputRef = useRef<HTMLInputElement>(null);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);

  // The board only passes `task` in once, when the dialog opens — it never
  // refreshes this prop while the dialog stays open. Every onUpdated() call
  // below must therefore build on the latest known state (this ref), not on
  // the original stale `task` prop, or a later edit silently reverts every
  // earlier one (e.g. ticking a checklist item, then clicking "Lưu thay đổi",
  // used to wipe the checklist progress back to what it was on open).
  const currentTaskRef = useRef<TaskWithAssignee>(task);
  function pushUpdate(patch: Partial<TaskWithAssignee>) {
    currentTaskRef.current = { ...currentTaskRef.current, ...patch };
    onUpdated(currentTaskRef.current);
  }

  function toggleAssignee(profile: Profile) {
    const isMember = assignees.some((a) => a.id === profile.id);
    const next = isMember ? assignees.filter((a) => a.id !== profile.id) : [...assignees, profile];
    setAssignees(next);
    pushUpdate({ assignees: next });
    startTransition(async () => {
      try {
        if (isMember) await removeTaskAssignee(task.id, profile.id);
        else await addTaskAssignee(task.id, profile.id);
      } catch {
        // Local toggle stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function toggleLabel(key: string) {
    const next = labels.includes(key) ? labels.filter((k) => k !== key) : [...labels, key];
    setLabels(next);
    pushUpdate({ labels: next });
    startTransition(async () => {
      try {
        await updateTaskLabels(task.id, next);
      } catch {
        // Local toggle stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function moveToColumn(newColumnId: string) {
    if (newColumnId === columnId) return;
    setColumnId(newColumnId);
    setColumnMenuOpen(false);
    pushUpdate({ column_id: newColumnId });
    startTransition(async () => {
      try {
        await moveTaskColumn(task.id, newColumnId);
      } catch {
        // Local move stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function updateDates(patch: { startDate?: string; dueDate?: string }) {
    const nextStart = patch.startDate ?? startDate;
    const nextDue = patch.dueDate ?? dueDate;
    if (patch.startDate !== undefined) setStartDate(patch.startDate);
    if (patch.dueDate !== undefined) setDueDate(patch.dueDate);
    pushUpdate({ start_date: nextStart || null, due_date: nextDue || null });
    startTransition(async () => {
      try {
        await updateTask(task.id, { startDate: nextStart || null, dueDate: nextDue || null });
      } catch {
        // Local edit stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  const [detailLoaded, setDetailLoaded] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);

  useEffect(() => {
    let cancelled = false;
    getTaskDetail(task.id)
      .then((detail) => {
        if (cancelled || !detail) return;
        setChecklistItems(detail.checklist_items);
        setAttachments(detail.attachments);
        setComments(detail.comments);
        setLinks(detail.links);
        setActivity(detail.activity);
      })
      .catch(() => {
        // no live backend yet — sections just start empty
      })
      .finally(() => !cancelled && setDetailLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // TaskCard's "☑ X/Y" badge reads task.checklist_items from the board's own
  // state, which is separate from this dialog's local checklistItems — sync
  // every add/toggle/delete back up so the badge doesn't go stale until Save.
  function handleChecklistChange(next: ChecklistItem[]) {
    setChecklistItems(next);
    pushUpdate({ checklist_items: next.map((i) => ({ id: i.id, done: i.done })) });
  }

  async function handleDescriptionImageUpload(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const attachment = await uploadTaskAttachment(task.id, formData);
    return attachment.url;
  }

  const currentUser = profiles.find((p) => p.id === currentUserId) ?? {
    id: currentUserId,
    display_name: "Bạn",
    email: "",
    avatar_url: null,
    role: null,
    created_at: "",
  };

  function save() {
    pushUpdate({ title, description: description || null });
    onClose();
    startTransition(async () => {
      try {
        await updateTask(task.id, { title, description });
      } catch {
        // Local edit stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function saveDescription() {
    setDescEditing(false);
    pushUpdate({ description: description || null });
    startTransition(async () => {
      try {
        await updateTask(task.id, { description });
      } catch {
        // Local edit stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function remove() {
    if (!confirm("Xoá thẻ công việc này?")) return;
    onDeleted(task.id);
    onClose();
    startTransition(async () => {
      try {
        await deleteTask(task.id);
      } catch {
        // Local delete stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  return (
    <Modal onClose={onClose} maxWidth={1280}>
      <div className="flex flex-col">
        <div className="relative">
          <TaskCover
            taskId={task.id}
            coverUrl={coverUrl}
            onChange={(url) => {
              setCoverUrl(url);
              pushUpdate({ cover_image_url: url });
            }}
          />

          <div className="absolute top-3 left-3">
            <button
              type="button"
              onClick={() => setColumnMenuOpen((v) => !v)}
              className="rounded-full px-3 py-1.5 text-xs font-bold"
              style={{ background: "rgba(255,255,255,.92)", color: "#201e1d", boxShadow: "var(--shadow-sm)" }}
            >
              {columnTitle} ⌄
            </button>
            {columnMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setColumnMenuOpen(false)} />
                <div className="card elev-md absolute left-0 top-9 z-20 flex flex-col gap-0.5 p-1" style={{ width: 180 }}>
                  {columns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => moveToColumn(c.id)}
                      className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px] flex items-center justify-between"
                    >
                      {c.title}
                      {c.id === columnId && <span aria-hidden>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="icon-btn-dark absolute top-3 right-3 flex items-center justify-center rounded-full"
            style={{ width: 32, height: 32, background: "rgba(20,18,17,.65)", color: "#fff" }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 p-6">
          {/* Left column — title, metadata, description, checklist, attachments */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <span className="text-[11px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
              {task.code}
            </span>

            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((key) => (
                  <span
                    key={key}
                    className="rounded-[4px] px-2.5 py-1 text-[11px] font-bold"
                    style={{ background: labelColor(key), color: "#fff" }}
                  >
                    {LABEL_PALETTE.find((l) => l.key === key)?.name ?? key}
                  </span>
                ))}
              </div>
            )}

            <input
              className="input"
              style={{ fontSize: 19, fontWeight: 700, border: "none", padding: "3px 0" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {columnTitle && (
              <p className="text-xs -mt-3" style={{ color: "var(--color-neutral-500)" }}>
                trong danh sách <strong>{columnTitle}</strong>
                {isDone && " · ✓ đã hoàn thành"}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <button type="button" onClick={() => setAddMenuOpen((v) => !v)} className="btn btn-ghost btn-sm">
                  + Thêm
                </button>
                {addMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
                    <div className="card elev-md absolute left-0 top-9 z-20 flex flex-col gap-0.5 p-1" style={{ width: 190 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setAddMenuOpen(false);
                          setAssigneeMenuOpen(true);
                        }}
                        className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]"
                      >
                        👤 Thành viên
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddMenuOpen(false);
                          startDateInputRef.current?.focus();
                          startDateInputRef.current?.showPicker?.();
                        }}
                        className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]"
                      >
                        🕐 Ngày bắt đầu
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddMenuOpen(false);
                          dueDateInputRef.current?.focus();
                          dueDateInputRef.current?.showPicker?.();
                        }}
                        className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]"
                      >
                        🕐 Ngày hết hạn
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddMenuOpen(false);
                          setAddingLink(true);
                          linksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px]"
                      >
                        🔗 Liên kết
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button type="button" onClick={() => setLabelMenuOpen((v) => !v)} className="btn btn-ghost btn-sm">
                  🏷 Nhãn
                </button>
                {labelMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLabelMenuOpen(false)} />
                    <div className="card elev-md absolute left-0 top-9 z-20 flex flex-col gap-1 p-2" style={{ width: 200 }}>
                      {LABEL_PALETTE.map((l) => (
                        <button
                          key={l.key}
                          type="button"
                          onClick={() => toggleLabel(l.key)}
                          className="ws-nav-link flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[13px] font-semibold"
                        >
                          <span className="rounded-[4px] flex-1 text-left px-2 py-1" style={{ background: l.color, color: "#fff" }}>
                            {l.name}
                          </span>
                          {labels.includes(l.key) && <span aria-hidden>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  checklistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  checklistInputRef.current?.focus();
                }}
                className="btn btn-ghost btn-sm"
              >
                ☑ Việc cần làm
              </button>
              <button
                type="button"
                onClick={() => attachmentsInputRef.current?.click()}
                className="btn btn-ghost btn-sm"
              >
                📎 Đính kèm
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="field relative">
                <label>👤 Thành viên</label>
                <button
                  type="button"
                  onClick={() => setAssigneeMenuOpen((v) => !v)}
                  className="input flex items-center gap-1 flex-wrap"
                  style={{ borderRadius: 999, minHeight: 42, cursor: "pointer" }}
                >
                  {assignees.length === 0 ? (
                    <span style={{ color: "var(--color-neutral-500)" }}>Chưa giao</span>
                  ) : (
                    assignees.map((a) => (
                      <span
                        key={a.id}
                        title={a.display_name}
                        className="flex items-center justify-center rounded-full font-bold flex-none"
                        style={{ width: 22, height: 22, fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
                      >
                        {a.display_name.charAt(0).toUpperCase()}
                      </span>
                    ))
                  )}
                  <span className="ml-auto text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    +
                  </span>
                </button>
                {assigneeMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAssigneeMenuOpen(false)} />
                    <div className="card elev-md absolute left-0 top-[68px] z-20 flex flex-col gap-0.5 p-1" style={{ width: 220 }}>
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleAssignee(p)}
                          className="ws-nav-link flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[13px] font-semibold"
                        >
                          <span
                            className="flex items-center justify-center rounded-full font-bold flex-none"
                            style={{ width: 22, height: 22, fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
                          >
                            {p.display_name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 text-left truncate">{p.display_name}</span>
                          {assignees.some((a) => a.id === p.id) && <span aria-hidden>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="field">
                <label htmlFor="edit-start">🕐 Ngày bắt đầu</label>
                <input
                  id="edit-start"
                  ref={startDateInputRef}
                  type="date"
                  className="input"
                  style={{ borderRadius: 999 }}
                  value={startDate}
                  onChange={(e) => updateDates({ startDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-due">🕐 Ngày hết hạn</label>
                <input
                  id="edit-due"
                  ref={dueDateInputRef}
                  type="date"
                  className="input"
                  style={{ borderRadius: 999 }}
                  value={dueDate}
                  onChange={(e) => updateDates({ dueDate: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>
                ⚡ Tiến độ theo thời hạn — <span style={{ color: taskProgressColor(progressPct) }}>{progressPct}%</span>
                {!startDate || !dueDate ? (
                  <span className="font-normal" style={{ color: "var(--color-neutral-500)" }}>
                    {" "}
                    (cần cả ngày bắt đầu và ngày hết hạn)
                  </span>
                ) : null}
              </label>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-neutral-200)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${progressPct}%`, background: taskProgressColor(progressPct), transition: "width .3s ease" }}
                />
              </div>
              <p className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                Tự động tính theo ngày, không chỉnh tay được — dời deadline thì thanh này tự tính lại.
              </p>
            </div>

            <div className="field">
              <div className="flex items-center justify-between !mb-0">
                <label className="!mb-0">☰ Mô tả</label>
                {!descEditing && (
                  <button type="button" onClick={() => setDescEditing(true)} className="btn btn-ghost btn-sm">
                    Chỉnh sửa
                  </button>
                )}
              </div>
              {descEditing ? (
                <div className="flex flex-col gap-2">
                  <RichTextEditor content={description} onChange={setDescription} onUploadImage={handleDescriptionImageUpload} />
                  <div className="flex gap-2">
                    <button type="button" onClick={saveDescription} className="btn btn-primary btn-sm">
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDescription(task.description ?? "");
                        setDescEditing(false);
                      }}
                      className="btn btn-ghost btn-sm"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : description ? (
                <div
                  onClick={() => setDescEditing(true)}
                  className="rich-content cursor-text rounded-[8px] px-2.5 py-2 -mx-2.5"
                  style={{ background: "var(--color-surface)" }}
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              ) : (
                <p
                  onClick={() => setDescEditing(true)}
                  className="text-[13.5px] cursor-text rounded-[8px] px-2.5 py-2 -mx-2.5"
                  style={{ color: "var(--color-neutral-500)", background: "var(--color-surface)" }}
                >
                  Thêm mô tả chi tiết hơn…
                </p>
              )}
            </div>

            {detailLoaded && (
              <>
                <div ref={checklistRef}>
                  <ChecklistSection
                    taskId={task.id}
                    items={checklistItems}
                    onChange={handleChecklistChange}
                    inputRef={checklistInputRef}
                  />
                </div>
                <div ref={linksRef}>
                  <TaskLinks
                    taskId={task.id}
                    links={links}
                    onChange={setLinks}
                    adding={addingLink}
                    onRequestAdd={() => setAddingLink(true)}
                    onCancelAdd={() => setAddingLink(false)}
                  />
                </div>
                <TaskAttachments
                  taskId={task.id}
                  attachments={attachments}
                  onChange={setAttachments}
                  inputRef={attachmentsInputRef}
                />
              </>
            )}

            <div className="flex items-center justify-between gap-3 mt-1">
              <button type="button" onClick={remove} className="btn btn-danger" disabled={pending}>
                🗑 Xoá thẻ công việc này
              </button>
              <button type="button" onClick={save} className="btn btn-primary" disabled={pending || !title.trim()}>
                {pending ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </div>

          {/* Right column — comments & activity, always visible */}
          <div className="lg:w-[300px] flex-none flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold" style={{ color: "var(--color-neutral-600)" }}>
                💬 Nhận xét và hoạt động
              </h3>
              <button type="button" onClick={() => setShowDetails((v) => !v)} className="btn btn-ghost btn-sm">
                {showDetails ? "Ẩn chi tiết" : "Hiện chi tiết"}
              </button>
            </div>
            {detailLoaded && (
              <TaskCommentChat
                taskId={task.id}
                currentUser={currentUser}
                initialComments={comments}
                initialActivity={activity}
                showDetails={showDetails}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
