"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Modal } from "@/components/ui/Modal";
import {
  addTaskAssignee,
  removeTaskAssignee,
  removeTaskCover,
  setDueComplete,
  setTaskCoverUrl,
  updateTask,
  updateTaskLabels,
  deleteTask,
} from "@/lib/actions/board";
import { getTaskDetail } from "@/lib/actions/task-detail";
import { computeTaskProgress, isDoneColumnTitle, taskProgressColor } from "@/lib/taskProgress";
import { descriptionToHtml } from "@/lib/descriptionHtml";
import { filesFrom, uploadTaskFile } from "@/lib/taskUpload";
import { taskLink } from "@/lib/boardTools";
import { ChecklistSection } from "./ChecklistSection";
import { LabelPicker } from "./LabelPicker";
import { TaskAttachments } from "./TaskAttachments";
import { TaskCommentChat } from "./TaskCommentChat";
import { TaskCover } from "./TaskCover";
import { TaskLinks } from "./TaskLinks";
import type {
  BoardColumn,
  BoardLabel,
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
  boardLabels,
  currentUserId,
  onUpdated,
  onDeleted,
  onArchive,
  onCopy,
  onMove,
  onCreateLabel,
  onRenameLabel,
  onRecolorLabel,
  onDeleteLabel,
  onClose,
}: {
  task: TaskWithAssignee;
  columns: BoardColumn[];
  profiles: Profile[];
  boardLabels: BoardLabel[];
  currentUserId: string;
  onUpdated: (task: TaskWithAssignee) => void;
  onDeleted: (taskId: string) => void;
  onArchive?: (taskId: string) => void;
  onCopy?: (taskId: string) => Promise<void>;
  onMove: (taskId: string, toColumnId: string) => void;
  onCreateLabel: (name: string, color: string) => void;
  onRenameLabel: (labelId: string, name: string) => void;
  onRecolorLabel: (labelId: string, color: string) => void;
  onDeleteLabel: (labelId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [descEditing, setDescEditing] = useState(false);
  const [assignees, setAssignees] = useState(task.assignees ?? []);
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [dueDone, setDueDone] = useState(!!task.due_complete);
  const [dueError, setDueError] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState(task.cover_image_url);
  const [labels, setLabels] = useState<string[]>(task.labels ?? []);
  // See toggleLabel below — kept in sync with `labels` state, but also
  // written to synchronously inside toggleLabel itself so back-to-back
  // toggles in the same tick read the truly-latest array instead of
  // whatever `labels` still closed over from the last completed render.
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);
  const [columnId, setColumnId] = useState(task.column_id);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pending, startTransition] = useTransition();
  const columnTitle = columns.find((c) => c.id === columnId)?.title ?? "";
  const isDone = isDoneColumnTitle(columnTitle);
  const progressPct = computeTaskProgress(startDate || null, dueDate || null, isDone);

  const checklistRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
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

  function toggleLabel(labelId: string) {
    // Reads/writes labelsRef rather than the closed-over `labels` variable —
    // picking two labels in a quick pair of clicks (exactly the reported
    // repro: tagging a task both "gấp" and "dự án giá cao") fires this
    // twice before the first click's setLabels has actually committed and
    // re-rendered, so the second call was building `next` off the same
    // stale array the first call started from and silently overwriting it.
    // The ref is updated synchronously here, so the very next call in the
    // same tick already sees it — state alone can't offer that.
    const current = labelsRef.current;
    const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId];
    labelsRef.current = next;
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

  // The board moves it (to the top of the new list) and syncs; this only
  // keeps the dialog's own copy in step.
  function moveToColumn(newColumnId: string) {
    setColumnMenuOpen(false);
    if (newColumnId === columnId) return;
    setColumnId(newColumnId);
    currentTaskRef.current = { ...currentTaskRef.current, column_id: newColumnId };
    onMove(task.id, newColumnId);
  }

  function toggleDueDone(next: boolean) {
    setDueDone(next);
    setDueError(null);
    pushUpdate({ due_complete: next });
    setDueComplete(task.id, next).catch((err) => {
      setDueDone(!next);
      pushUpdate({ due_complete: !next });
      setDueError(err instanceof Error ? err.message : "Không lưu được dấu hoàn tất.");
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
  const commentFilesRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getTaskDetail(task.id)
      .then((detail) => {
        if (cancelled || !detail) return;
        setChecklistItems(detail.checklist_items);
        commentFilesRef.current = Math.max(0, (task.attachment_count?.[0]?.count ?? 0) - detail.attachments.length);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaded once per card; the count is only read as the starting point
  }, [task.id]);

  // TaskCard's "☑ X/Y" badge reads task.checklist_items from the board's own
  // state, which is separate from this dialog's local checklistItems — sync
  // every add/toggle/delete back up so the badge doesn't go stale until Save.
  function handleChecklistChange(next: ChecklistItem[]) {
    setChecklistItems(next);
    pushUpdate({ checklist_items: next.map((i) => ({ id: i.id, done: i.done })) });
  }

  async function handleDescriptionImageUpload(file: File): Promise<string> {
    const attachment = await uploadTaskFile(task.id, file);
    setAttachments((prev) => [...prev, attachment]);
    return attachment.url;
  }

  // Keeps the card front's 📎 count in step with this dialog (the board
  // counts comment photos too, which this list leaves out).
  useEffect(() => {
    if (detailLoaded) pushUpdate({ attachment_count: [{ count: commentFilesRef.current + attachments.length }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushUpdate is a plain function recreated every render
  }, [attachments, detailLoaded]);

  function setCover(url: string | null) {
    setCoverUrl(url);
    pushUpdate({ cover_image_url: url });
    (url ? setTaskCoverUrl(task.id, url) : removeTaskCover(task.id)).catch(() => {
      // Local change stays as-is (e.g. workspace-demo has no real backend).
    });
  }

  // One way in for the picker, a paste and a drop: files go up one at a
  // time, and the first image becomes the cover when the card has none —
  // what Trello does.
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const coverRef = useRef(coverUrl);
  useEffect(() => {
    coverRef.current = coverUrl;
  }, [coverUrl]);
  async function uploadFiles(files: File[]) {
    if (files.length === 0 || uploadingLabel) return;
    setUploadError(null);
    attachmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setUploadingLabel(files.length > 1 ? `Đang tải ${i + 1}/${files.length}…` : "Đang tải lên…");
      try {
        const att = await uploadTaskFile(task.id, files[i]);
        setAttachments((prev) => [...prev, att]);
        if (!coverRef.current && (att.mime_type ?? "").startsWith("image/")) {
          coverRef.current = att.url;
          setCover(att.url);
        }
      } catch (err) {
        failed.push(err instanceof Error ? err.message : files[i].name);
      }
    }
    setUploadingLabel(null);
    if (failed.length) setUploadError(failed.join(" · "));
  }

  const [dropping, setDropping] = useState(false);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  function handlePaste(e: React.ClipboardEvent) {
    // The comment box and the description editor handle their own pastes.
    if (e.defaultPrevented || (e.target as HTMLElement).closest?.("[contenteditable=true]")) return;
    const files = filesFrom(e.clipboardData?.files);
    if (files.length === 0) return;
    e.preventDefault();
    uploadFiles(files);
  }

  const [linkCopied, setLinkCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(taskLink(window.location.origin, task.code));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      prompt("Sao chép liên kết thẻ:", taskLink(window.location.origin, task.code));
    }
  }

  // Trello saves the title as soon as you leave it.
  function saveTitle() {
    const t = title.trim();
    if (!t || t === currentTaskRef.current.title) return;
    pushUpdate({ title: t });
    updateTask(task.id, { title: t }).catch(() => {
      // Local edit stays as-is (e.g. workspace-demo has no real backend).
    });
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

  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!onCopy) return;
    try {
      await onCopy(task.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert("Không sao chép được thẻ.");
    }
  }

  function archive() {
    if (!onArchive) return;
    pushUpdate({ title, description: description || null });
    onArchive(task.id);
    onClose();
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
    <Modal onClose={onClose} maxWidth={1280} sheetOnPhone>
      <div
        className="relative flex flex-col"
        onPaste={handlePaste}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          if (!dropping) setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDropping(false);
          uploadFiles(filesFrom(e.dataTransfer.files));
        }}
      >
        {dropping && (
          <div
            className="absolute inset-2 z-30 flex items-center justify-center rounded-[14px] text-base font-bold pointer-events-none"
            style={{
              background: "color-mix(in srgb, var(--color-accent-100) 88%, transparent)",
              border: "2px dashed var(--color-accent-500)",
              color: "var(--color-accent-800)",
            }}
          >
            Thả tệp vào đây để đính kèm
          </div>
        )}
        <div className="relative">
          <TaskCover
            taskId={task.id}
            coverUrl={coverUrl}
            onChange={(url) => {
              setCoverUrl(url);
              pushUpdate({ cover_image_url: url });
            }}
            onRemove={() => setCover(null)}
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
                {labels.map((id) => {
                  const label = boardLabels.find((l) => l.id === id);
                  if (!label) return null;
                  return (
                    <span
                      key={id}
                      className="rounded-[4px] px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: label.color, color: "#fff" }}
                    >
                      {label.name}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2.5">
              {/* Trello's "Đánh dấu thẻ hoàn thành" circle in front of the title. */}
              <button
                type="button"
                onClick={() => toggleDueDone(!dueDone)}
                className="flex-none flex items-center justify-center rounded-full text-[13px] font-bold"
                style={{
                  width: 22,
                  height: 22,
                  background: dueDone ? "#22a06b" : "transparent",
                  border: dueDone ? "none" : "2px solid var(--color-neutral-400)",
                  color: "#fff",
                }}
                aria-pressed={dueDone}
                aria-label={dueDone ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu thẻ hoàn thành"}
                title={dueDone ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu thẻ hoàn thành"}
              >
                {dueDone ? "✓" : ""}
              </button>
              <input
                className="input flex-1 min-w-0"
                style={{ fontSize: 19, fontWeight: 700, border: "none", padding: "3px 0" }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                }}
                aria-label="Tên thẻ"
              />
            </div>

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
                    <LabelPicker
                      labels={boardLabels}
                      selectedIds={labels}
                      onToggle={toggleLabel}
                      onCreate={onCreateLabel}
                      onRename={onRenameLabel}
                      onRecolor={onRecolorLabel}
                      onDelete={onDeleteLabel}
                      onClose={() => setLabelMenuOpen(false)}
                    />
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
              <button type="button" onClick={() => attachmentsInputRef.current?.click()} className="btn btn-ghost btn-sm">
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
                        style={{
                          width: 22,
                          height: 22,
                          fontSize: 10,
                          background: "var(--color-accent-100)",
                          color: "var(--color-accent-700)",
                        }}
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
                    <div
                      className="card elev-md absolute left-0 top-[68px] z-20 flex flex-col gap-0.5 p-1"
                      style={{ width: 220 }}
                    >
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleAssignee(p)}
                          className="ws-nav-link flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[13px] font-semibold"
                        >
                          <span
                            className="flex items-center justify-center rounded-full font-bold flex-none"
                            style={{
                              width: 22,
                              height: 22,
                              fontSize: 10,
                              background: "var(--color-accent-100)",
                              color: "var(--color-accent-700)",
                            }}
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
                {dueDate && (
                  <label
                    className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer select-none"
                    style={{ color: dueDone ? "var(--status-green)" : "var(--color-neutral-600)" }}
                  >
                    <input
                      type="checkbox"
                      checked={dueDone}
                      onChange={(e) => toggleDueDone(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    {dueDone ? "✓ Đã hoàn tất" : "Đánh dấu hoàn tất"}
                  </label>
                )}
              </div>
            </div>
            {dueError && (
              <p className="text-[12px] -mt-2" style={{ color: "var(--status-red)" }}>
                {dueError}
              </p>
            )}

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
                  <RichTextEditor
                    content={descriptionToHtml(description)}
                    onChange={setDescription}
                    onUploadImage={handleDescriptionImageUpload}
                  />
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
                  onClick={(e) => {
                    // A link opens; anywhere else starts editing, like Trello.
                    if (!(e.target as HTMLElement).closest("a")) setDescEditing(true);
                  }}
                  className="rich-content fk-desc cursor-text rounded-[8px] px-2.5 py-2 -mx-2.5"
                  style={{ background: "var(--color-surface)" }}
                  dangerouslySetInnerHTML={{ __html: descriptionToHtml(description) }}
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
                <div ref={attachmentsRef}>
                  <TaskAttachments
                    attachments={attachments}
                    onChange={setAttachments}
                    inputRef={attachmentsInputRef}
                    onPickFiles={uploadFiles}
                    uploadingLabel={uploadingLabel}
                    error={uploadError}
                    currentUserId={currentUserId}
                    coverUrl={coverUrl}
                    onSetCover={setCover}
                  />
                </div>
              </>
            )}

            {/* Trello's card actions: link, copy, archive (restorable), delete. */}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <button
                type="button"
                onClick={copyLink}
                className="btn btn-ghost btn-sm"
                title="Gửi link này cho đồng đội để mở thẳng thẻ"
              >
                {linkCopied ? "✓ Đã chép liên kết" : "🔗 Sao chép liên kết"}
              </button>
              {onCopy && (
                <button type="button" onClick={copy} className="btn btn-ghost btn-sm">
                  {copied ? "✓ Đã sao chép" : "⧉ Sao chép thẻ"}
                </button>
              )}
              {onArchive && (
                <button
                  type="button"
                  onClick={archive}
                  className="btn btn-ghost btn-sm"
                  title="Cất thẻ khỏi bảng, khôi phục được ở mục 📦"
                >
                  📦 Lưu trữ
                </button>
              )}
              <button type="button" onClick={remove} className="btn btn-danger btn-sm" disabled={pending}>
                🗑 Xoá
              </button>
            </div>
            <div className="flex items-center justify-end gap-3">
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
