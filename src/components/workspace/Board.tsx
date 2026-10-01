"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import type { Board, BoardColumn, BoardLabel, Profile, Task, TaskWithAssignee } from "@/lib/types";
import { Column, listDndId } from "./Column";
import { TaskCardOverlay } from "./TaskCard";
import { EditTaskDialog } from "./EditTaskDialog";
import { BoardFilterMenu } from "./BoardFilterMenu";
import { ArchiveDrawer } from "./ArchiveDrawer";
import { QuickCardMenu } from "./QuickCardMenu";
import { BoardActivityPanel, BoardMenu } from "./BoardMenu";
import { boardBackground } from "@/lib/boardBackgrounds";
import {
  addTaskAssignee,
  archiveTasks,
  copyTask,
  createBoardLabel,
  createColumn,
  createTask,
  deleteBoardLabel,
  deleteColumn,
  deleteTask,
  moveTaskColumn,
  removeTaskAssignee,
  reorderColumns,
  reorderTasks,
  restoreTask,
  setBoardBackground,
  setDueComplete,
  updateBoardLabel,
  updateTaskLabels,
} from "@/lib/actions/board";
import { isDoneColumnTitle } from "@/lib/taskProgress";
import { vnToday } from "@/lib/constants/attendance";
import { mapTaskAssignees } from "@/lib/mapTaskAssignees";
import {
  ARCHIVE_COLUMN_TITLE,
  BOARD_TASK_SELECT,
  CARD_PARAM,
  EMPTY_FILTER,
  codeFromParam,
  filterCount,
  isArchiveColumnTitle,
  matchesFilter,
  sortTasks,
  type BoardFilter,
  type SortMode,
} from "@/lib/boardTools";

// Archived cards wait under this key until the server has created the
// hidden "📦 Lưu trữ" list and told us its id.
const PENDING_ARCHIVE = "__archive_pending";

const isListDndId = (id: UniqueIdentifier) => String(id).startsWith("list:");
const columnOfListDndId = (id: UniqueIdentifier) => String(id).slice("list:".length);
const byPosition = (list: TaskWithAssignee[]) => [...list].sort((a, b) => a.position - b.position);

// Per-browser board preferences (collapsed lists, label names on cards).
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / storage full — the preference just won't stick
  }
}

const SHORTCUTS: [string, string][] = [
  ["/", "Tìm thẻ"],
  ["F", "Mở bộ lọc"],
  ["Q", "Chỉ hiện thẻ của tôi"],
  ["X", "Xoá bộ lọc"],
  ["E", "Sửa nhanh thẻ đang trỏ chuột"],
  ["C", "Lưu trữ thẻ đang trỏ chuột"],
  ["Space", "Thêm/bỏ mình khỏi thẻ đang trỏ chuột"],
  ["Esc", "Đóng"],
];

export function WorkspaceBoard({
  board,
  initialColumns,
  initialTasks,
  profiles,
  initialBoardLabels = [],
  deferredCounts = {},
  currentUserId,
}: {
  board: Board;
  initialColumns: BoardColumn[];
  initialTasks: TaskWithAssignee[];
  profiles: Profile[];
  initialBoardLabels?: BoardLabel[];
  // Finished-work lists that arrived without their cards (lib/data/board.ts)
  // → how many each holds; their cards are fetched right after mount.
  deferredCounts?: Record<string, number>;
  currentUserId: string;
}) {
  const [columns, setColumns] = useState([...initialColumns].sort((a, b) => a.position - b.position));
  const [tasksByColumn, setTasksByColumn] = useState<Record<string, TaskWithAssignee[]>>(() => {
    const map: Record<string, TaskWithAssignee[]> = {};
    for (const col of initialColumns) {
      map[col.id] = byPosition(initialTasks.filter((t) => t.column_id === col.id));
    }
    return map;
  });
  const [boardLabels, setBoardLabels] = useState([...initialBoardLabels].sort((a, b) => a.position - b.position));

  // The "Final …" lists' cards: fetched straight from the database once the
  // board is on screen, so opening the workspace doesn't wait for (and the
  // page doesn't carry) ~500 finished cards nobody is about to look at.
  // Until then each shows its count and "Đang tải".
  const [pendingLists, setPendingLists] = useState<string[]>(() => Object.keys(deferredCounts));
  useEffect(() => {
    const ids = Object.keys(deferredCounts);
    if (ids.length === 0) return;
    let cancelled = false;
    async function load(attempt: number) {
      // One request per list, side by side — and each stays well under the
      // database's 1000-rows-per-request cap as the years add up.
      const supabase = createClient();
      const results = await Promise.all(
        ids.map((id) => supabase.from("tasks").select(BOARD_TASK_SELECT).eq("column_id", id).order("position", { ascending: true })),
      );
      if (cancelled) return;
      if (results.some((r) => r.error || !r.data)) {
        if (attempt < 3) setTimeout(() => load(attempt + 1), 2000 * attempt);
        return;
      }
      const fetched = results
        .flatMap((r) => (r.data ?? []) as unknown as (TaskWithAssignee & { assignees: unknown })[])
        .map((t) => ({ ...t, assignees: mapTaskAssignees(t.assignees) }));
      setTasksByColumn((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          // Anything that landed here meanwhile (moved in, realtime) is newer.
          const here = prev[id] ?? [];
          const seen = new Set(here.map((t) => t.id));
          next[id] = byPosition([...here, ...fetched.filter((t) => t.column_id === id && !seen.has(t.id))]);
        }
        return next;
      });
      setPendingLists([]);
    }
    void load(1);
    return () => {
      cancelled = true;
    };
    // Once, on open — the counts never change identity after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A list's card count: while its cards are still on their way, the count
  // the server sent.
  const countOf = (columnId: string) => {
    const have = tasksByColumn[columnId]?.length ?? 0;
    return pendingLists.includes(columnId) ? Math.max(have, deferredCounts[columnId] ?? 0) : have;
  };
  const stillLoading = (columnId: string) => {
    if (!pendingLists.includes(columnId)) return false;
    alert("Danh sách này đang tải thẻ — thử lại sau một giây.");
    return true;
  };

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskWithAssignee | null>(null);
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [quick, setQuick] = useState<{ taskId: string; at: { x: number; y: number } } | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [showLabelNames, setShowLabelNames] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [boardColor, setBoardColor] = useState(board.color);
  const background = boardBackground(boardColor);
  const [inView, setInView] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const chipBarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hoveredTaskRef = useRef<string | null>(null);

  const collapsedKey = `funti-board-collapsed-${board.id}`;
  useEffect(() => {
    // Per-browser prefs only exist after mount (reading them during render
    // would mismatch the server's HTML).
    setCollapsed(readPref<string[]>(collapsedKey, []));
    setShowLabelNames(readPref("funti-board-label-names", false));
  }, [collapsedKey]);
  function toggleCollapsed(columnId: string) {
    setCollapsed((prev) => {
      const next = prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId];
      writePref(collapsedKey, next);
      return next;
    });
  }
  function handlePickBackground(key: string) {
    const prev = boardColor;
    setBoardColor(key);
    setBoardBackground(board.id, key).catch(() => setBoardColor(prev));
  }
  function toggleLabelNames() {
    setShowLabelNames((v) => {
      writePref("funti-board-label-names", !v);
      return !v;
    });
  }

  // A plain PointerSensor's distance-based activation also fires for touch
  // scroll gestures — a few px of finger movement while scrolling a column
  // gets misread as a drag start. Mouse drags after 4px; a finger has to
  // hold still for a moment first (Trello app style), so any swipe — up,
  // down or sideways — scrolls instead.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  // The hidden archive list never shows as a column.
  const archiveColumn = columns.find((c) => isArchiveColumnTitle(c.title)) ?? null;
  const visibleColumns = useMemo(() => columns.filter((c) => !isArchiveColumnTitle(c.title)), [columns]);
  const archivedTasks = [...(archiveColumn ? (tasksByColumn[archiveColumn.id] ?? []) : []), ...(tasksByColumn[PENDING_ARCHIVE] ?? [])];

  const allTasks = useMemo(() => Object.values(tasksByColumn).flat(), [tasksByColumn]);
  const boardTasks = useMemo(() => visibleColumns.flatMap((c) => tasksByColumn[c.id] ?? []), [visibleColumns, tasksByColumn]);
  // Read from inside the realtime subscription and the drag collision
  // check, which only see what these were when they were created.
  const allTasksRef = useRef(allTasks);
  const tasksByColumnRef = useRef(tasksByColumn);
  useEffect(() => {
    allTasksRef.current = allTasks;
    tasksByColumnRef.current = tasksByColumn;
  }, [allTasks, tasksByColumn]);
  const profilesRef = useRef(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  const doneColumn = visibleColumns.find((c) => isDoneColumnTitle(c.title));
  const doneCount = doneColumn ? (tasksByColumn[doneColumn.id]?.length ?? 0) : 0;
  const activeTask = activeTaskId ? allTasks.find((t) => t.id === activeTaskId) : null;
  const activeColumn = activeColumnId ? visibleColumns.find((c) => c.id === activeColumnId) : null;

  const filtering = filterCount(filter) > 0;
  const today = vnToday();
  const visibleTasksOf = (columnId: string) => {
    const list = tasksByColumn[columnId] ?? [];
    return filtering ? list.filter((t) => matchesFilter(t, filter, today)) : list;
  };
  const matchCount = filtering ? boardTasks.filter((t) => matchesFilter(t, filter, today)).length : boardTasks.length;

  // One "Final <year>" column per year of archived work (renamed every year,
  // per isDoneColumnTitle) — surface how many cards landed in each year
  // rather than only the grand total, in board column order (newest first).
  const yearStats = visibleColumns
    .map((c) => {
      const match = c.title.match(/final\s*(\d{4})/i);
      if (!match) return null;
      return { year: match[1], count: countOf(c.id) };
    })
    .filter((v): v is { year: string; count: number } => v !== null);

  // A "Final <year>" board tracks work by archive year, so the header badge
  // reads "N/N hoàn thành" for the current year's Final column; boards
  // without one keep the classic done/total reading.
  const currentYearStat = yearStats[0];
  const headerDoneCount = currentYearStat ? currentYearStat.count : doneCount;
  const headerTotalCount = currentYearStat ? currentYearStat.count : boardTasks.length;

  function findColumnIdOfTask(taskId: string, source = tasksByColumn) {
    for (const [colId, tasks] of Object.entries(source)) {
      if (tasks.some((t) => t.id === taskId)) return colId;
    }
    return null;
  }
  const columnTitle = (id: string | null) => columns.find((c) => c.id === id)?.title ?? "";

  // ---------------------------------------------------------------------
  // Drag and drop: cards within/between lists, and whole lists.
  // ---------------------------------------------------------------------
  const snapshotRef = useRef<Record<string, TaskWithAssignee[]> | null>(null);
  const originColumnRef = useRef<string | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);

  // Lists only collide with lists. A card over a list's open space snaps to
  // the nearest card in it, so the drop lands where the finger is rather
  // than at the end — and a collapsed or empty list takes it on top.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (args.active.data.current?.type === "column") {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "column") });
    }
    const containers = args.droppableContainers.filter((c) => c.data.current?.type !== "column");
    const hits = pointerWithin({ ...args, droppableContainers: containers });
    const collisions = hits.length > 0 ? hits : rectIntersection({ ...args, droppableContainers: containers });
    let overId = getFirstCollision(collisions, "id");
    if (overId != null) {
      const listTasks = tasksByColumnRef.current[String(overId)];
      if (listTasks?.length) {
        const ids = new Set(listTasks.map((t) => t.id));
        const nearest = closestCenter({ ...args, droppableContainers: containers.filter((c) => ids.has(String(c.id))) });
        if (nearest.length) overId = nearest[0].id;
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  }, []);

  function handleDragStart(event: DragStartEvent) {
    snapshotRef.current = tasksByColumn;
    setQuick(null);
    if (event.active.data.current?.type === "column") {
      setActiveColumnId(columnOfListDndId(event.active.id));
    } else {
      setActiveTaskId(String(event.active.id));
      originColumnRef.current = findColumnIdOfTask(String(event.active.id));
    }
    try {
      navigator.vibrate?.(8);
    } catch {
      // not supported — fine
    }
  }

  // Crossing into another list moves the card there right away, so the
  // other cards open a gap under the finger like Trello.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.data.current?.type === "column") return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const from = findColumnIdOfTask(activeId);
    const to = overId in tasksByColumn ? overId : findColumnIdOfTask(overId);
    if (!from || !to || from === to) return;
    setTasksByColumn((prev) => {
      const fromList = prev[from] ?? [];
      const toList = prev[to] ?? [];
      const card = fromList.find((t) => t.id === activeId);
      if (!card) return prev;
      const overIndex = toList.findIndex((t) => t.id === overId);
      const dragged = active.rect.current.translated;
      const below = overIndex >= 0 && !!dragged && dragged.top > over.rect.top + over.rect.height / 2;
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : 0;
      return {
        ...prev,
        [from]: fromList.filter((t) => t.id !== activeId),
        [to]: [...toList.slice(0, index), { ...card, column_id: to }, ...toList.slice(index)],
      };
    });
  }

  function endDrag() {
    setActiveTaskId(null);
    setActiveColumnId(null);
    lastOverId.current = null;
    originColumnRef.current = null;
    snapshotRef.current = null;
  }

  function handleDragCancel() {
    if (snapshotRef.current) setTasksByColumn(snapshotRef.current);
    endDrag();
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (active.data.current?.type === "column") {
      if (over && isListDndId(over.id)) {
        const order = visibleColumns.map((c) => c.id);
        const from = order.indexOf(columnOfListDndId(active.id));
        const to = order.indexOf(columnOfListDndId(over.id));
        if (from >= 0 && to >= 0 && from !== to) applyColumnOrder(arrayMove(order, from, to));
      }
      endDrag();
      return;
    }

    const activeId = String(active.id);
    const colId = findColumnIdOfTask(activeId);
    const origin = originColumnRef.current;
    const before = new Map(Object.values(snapshotRef.current ?? {}).flat().map((t) => [t.id, t]));
    if (!over || !colId) {
      handleDragCancel();
      return;
    }

    const next = { ...tasksByColumn };
    const list = next[colId] ?? [];
    const from = list.findIndex((t) => t.id === activeId);
    const to = list.findIndex((t) => t.id === String(over.id));
    if (from >= 0 && to >= 0 && from !== to) next[colId] = arrayMove(list, from, to);

    // Only rows whose list or position actually changed get written.
    const updates: { id: string; column_id: string; position: number }[] = [];
    for (const cid of new Set([colId, origin].filter((x): x is string => !!x))) {
      next[cid] = (next[cid] ?? []).map((t, i) => {
        const was = before.get(t.id);
        if (!t.id.startsWith("temp-") && (!was || was.column_id !== cid || was.position !== i)) {
          updates.push({ id: t.id, column_id: cid, position: i });
        }
        return t.position === i && t.column_id === cid ? t : { ...t, column_id: cid, position: i };
      });
    }
    setTasksByColumn(next);
    endDrag();
    if (updates.length === 0) return;
    const moved = origin && origin !== colId ? { taskId: activeId, from: columnTitle(origin), to: columnTitle(colId) } : undefined;
    startTransition(async () => {
      try {
        await reorderTasks(updates, moved);
      } catch {
        // Local order stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function applyColumnOrder(order: string[]) {
    setColumns((prev) =>
      prev.map((c) => (order.includes(c.id) ? { ...c, position: order.indexOf(c.id) } : c)).sort((a, b) => a.position - b.position),
    );
    startTransition(async () => {
      try {
        await reorderColumns(order.filter((id) => !id.startsWith("temp-")));
      } catch {
        // Local order stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  // "← / →" in a list's menu: swap it with its neighbour.
  function handleMoveColumn(columnId: string, dir: -1 | 1) {
    const order = visibleColumns.map((c) => c.id);
    const i = order.indexOf(columnId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    applyColumnOrder(arrayMove(order, i, j));
  }

  // ---------------------------------------------------------------------
  // Cards and lists
  // ---------------------------------------------------------------------
  function handleAddColumn(e: React.FormEvent) {
    e.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;
    setNewColumnTitle("");
    setNewColumnOpen(false);

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticColumn: BoardColumn = {
      id: tempId,
      board_id: board.id,
      title,
      color: "#78776F",
      position: visibleColumns.length,
      created_at: new Date().toISOString(),
    };
    setColumns((prev) => [...prev, optimisticColumn]);
    setTasksByColumn((prev) => ({ ...prev, [tempId]: [] }));

    startTransition(async () => {
      try {
        const column = await createColumn(board.id, title);
        if (!column) return;
        setColumns((prev) => prev.map((c) => (c.id === tempId ? column : c)));
        setTasksByColumn((prev) => {
          const { [tempId]: tasks, ...rest } = prev;
          return { ...rest, [column.id]: tasks ?? [] };
        });
      } catch {
        // Optimistic column stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function handleTaskCreated(columnId: string, task: TaskWithAssignee) {
    setTasksByColumn((prev) =>
      Object.values(prev).some((list) => list.some((t) => t.id === task.id)) ? prev : { ...prev, [columnId]: [...(prev[columnId] ?? []), task] },
    );
  }

  function handleTaskReconciled(columnId: string, tempId: string, task: TaskWithAssignee) {
    setTasksByColumn((prev) => {
      const list = prev[columnId] ?? [];
      // Realtime may already have delivered the saved row — then just drop the placeholder.
      if (list.some((t) => t.id === task.id)) return { ...prev, [columnId]: list.filter((t) => t.id !== tempId) };
      return { ...prev, [columnId]: list.map((t) => (t.id === tempId ? task : t)) };
    });
  }

  // Trello's "Thêm thẻ" at the bottom of a list: title only, straight in.
  function handleQuickAdd(columnId: string, title: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const list = tasksByColumn[columnId] ?? [];
    const optimistic: TaskWithAssignee = {
      id: tempId,
      board_id: board.id,
      column_id: columnId,
      code: "…",
      title,
      description: null,
      assignee_id: null,
      start_date: null,
      due_date: null,
      progress: 0,
      position: list.length ? Math.max(...list.map((t) => t.position)) + 1 : 0,
      cover_image_url: null,
      labels: [],
      created_by: currentUserId,
      created_at: now,
      updated_at: now,
      assignee: null,
      assignees: [],
    };
    handleTaskCreated(columnId, optimistic);
    startTransition(async () => {
      try {
        const saved = await createTask({ boardId: board.id, columnId, title });
        if (saved) handleTaskReconciled(columnId, tempId, { ...saved, assignee: null, assignees: [] } as TaskWithAssignee);
      } catch {
        // Optimistic card stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  // fromServer: a realtime row — its position is the truth, so the list is
  // re-sorted (a teammate's reorder shows up here without a reload).
  function handleTaskUpdated(updated: TaskWithAssignee, fromServer = false) {
    setTasksByColumn((prev) => {
      const fromColumnId = Object.entries(prev).find(([, tasks]) => tasks.some((t) => t.id === updated.id))?.[0];

      if (fromColumnId === updated.column_id) {
        const list = (prev[updated.column_id] ?? []).map((t) => (t.id === updated.id ? updated : t));
        return { ...prev, [updated.column_id]: fromServer ? byPosition(list) : list };
      }

      const next = { ...prev };
      if (fromColumnId) next[fromColumnId] = prev[fromColumnId].filter((t) => t.id !== updated.id);
      next[updated.column_id] = byPosition([...(prev[updated.column_id] ?? []), updated]);
      return next;
    });
  }

  // A small change to one card that doesn't move it (label, member, tick).
  function patchTask(taskId: string, patch: Partial<TaskWithAssignee>) {
    setTasksByColumn((prev) => {
      const next: Record<string, TaskWithAssignee[]> = {};
      for (const [colId, tasks] of Object.entries(prev)) next[colId] = tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
      return next;
    });
  }

  function handleTaskDeleted(taskId: string) {
    setTasksByColumn((prev) => {
      const next: Record<string, TaskWithAssignee[]> = {};
      for (const [colId, tasks] of Object.entries(prev)) {
        next[colId] = tasks.filter((t) => t.id !== taskId);
      }
      return next;
    });
  }

  // From the card or its quick menu: to the top of the other list.
  function handleMoveCard(taskId: string, toColumnId: string) {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task || task.column_id === toColumnId) return;
    const list = tasksByColumn[toColumnId] ?? [];
    const position = list.length ? Math.min(0, Math.min(...list.map((t) => t.position)) - 1) : 0;
    handleTaskUpdated({ ...task, column_id: toColumnId, position }, true);
    startTransition(async () => {
      try {
        await moveTaskColumn(taskId, toColumnId);
      } catch {
        // Local move stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  // Trello's "Chuyển mọi thẻ trong danh sách": all of them, on top, in order.
  function handleMoveAll(fromColumnId: string, toColumnId: string) {
    const moving = tasksByColumn[fromColumnId] ?? [];
    if (moving.length === 0 || fromColumnId === toColumnId) return;
    const target = [...moving, ...(tasksByColumn[toColumnId] ?? [])];
    const updates: { id: string; column_id: string; position: number }[] = [];
    const renumbered = target.map((t, i) => {
      if (!t.id.startsWith("temp-") && (t.column_id !== toColumnId || t.position !== i)) updates.push({ id: t.id, column_id: toColumnId, position: i });
      return { ...t, column_id: toColumnId, position: i };
    });
    setTasksByColumn((prev) => ({ ...prev, [fromColumnId]: [], [toColumnId]: renumbered }));
    startTransition(async () => {
      try {
        await reorderTasks(updates);
      } catch {
        // Local move stays as-is.
      }
    });
  }

  function handleToggleDue(task: TaskWithAssignee) {
    const done = !task.due_complete;
    patchTask(task.id, { due_complete: done });
    setDueComplete(task.id, done).catch((err) => {
      patchTask(task.id, { due_complete: !done });
      alert(err instanceof Error ? err.message : "Không lưu được dấu hoàn tất.");
    });
  }

  function handleToggleLabel(taskId: string, labelId: string) {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    const labels = task.labels.includes(labelId) ? task.labels.filter((id) => id !== labelId) : [...task.labels, labelId];
    patchTask(taskId, { labels });
    updateTaskLabels(taskId, labels).catch(() => {
      // Local toggle stays as-is (e.g. workspace-demo has no real backend).
    });
  }

  function handleToggleMember(taskId: string, profile: Pick<Profile, "id" | "display_name" | "avatar_url">) {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    const isMember = task.assignees.some((a) => a.id === profile.id);
    const assignees = isMember
      ? task.assignees.filter((a) => a.id !== profile.id)
      : [...task.assignees, { id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url }];
    patchTask(taskId, { assignees });
    (isMember ? removeTaskAssignee(taskId, profile.id) : addTaskAssignee(taskId, profile.id)).catch(() => {
      // Local toggle stays as-is (e.g. workspace-demo has no real backend).
    });
  }

  // Split from handleColumnDeleted so the realtime subscription below can
  // reuse just the local cleanup when a teammate deletes a column.
  function removeColumnLocally(columnId: string) {
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    setTasksByColumn((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== columnId)));
  }

  function handleColumnDeleted(columnId: string) {
    removeColumnLocally(columnId);
    startTransition(async () => {
      try {
        await deleteColumn(columnId);
      } catch {
        // Local removal stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function handleSortColumn(columnId: string, mode: SortMode) {
    const sorted = sortTasks(tasksByColumn[columnId] ?? [], mode).map((t, i) => ({ ...t, position: i }));
    setTasksByColumn((prev) => ({ ...prev, [columnId]: sorted }));
    startTransition(async () => {
      try {
        await reorderTasks(sorted.filter((t) => !t.id.startsWith("temp-")).map((t) => ({ id: t.id, column_id: columnId, position: t.position })));
      } catch {
        // Local order stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  // Archive = move into the hidden list; restorable from 📦 Lưu trữ.
  function handleArchive(taskIds: string[]) {
    if (taskIds.length === 0) return;
    const target = archiveColumn?.id ?? PENDING_ARCHIVE;
    setTasksByColumn((prev) => {
      const next: Record<string, TaskWithAssignee[]> = {};
      const moving: TaskWithAssignee[] = [];
      for (const [colId, tasks] of Object.entries(prev)) {
        next[colId] = tasks.filter((t) => {
          if (taskIds.includes(t.id) && colId !== target) {
            moving.push({ ...t, column_id: target });
            return false;
          }
          return true;
        });
      }
      next[target] = [...(next[target] ?? []), ...moving];
      return next;
    });
    startTransition(async () => {
      try {
        const archiveId = await archiveTasks(taskIds.filter((id) => !id.startsWith("temp-")));
        if (archiveId && target === PENDING_ARCHIVE) {
          setColumns((prev) =>
            prev.some((c) => c.id === archiveId)
              ? prev
              : [...prev, { id: archiveId, board_id: board.id, title: ARCHIVE_COLUMN_TITLE, color: "#78776F", position: 9999, created_at: new Date().toISOString() }],
          );
          setTasksByColumn((prev) => {
            const pending = (prev[PENDING_ARCHIVE] ?? []).map((t) => ({ ...t, column_id: archiveId }));
            const { [PENDING_ARCHIVE]: _drop, ...rest } = prev;
            void _drop;
            const existing = rest[archiveId] ?? [];
            return { ...rest, [archiveId]: [...existing, ...pending.filter((t) => !existing.some((e) => e.id === t.id))] };
          });
        }
      } catch {
        // Local move stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function handleRestore(taskId: string, toColumnId: string) {
    const task = archivedTasks.find((t) => t.id === taskId);
    if (!task) return;
    handleTaskUpdated({ ...task, column_id: toColumnId });
    startTransition(async () => {
      try {
        await restoreTask(taskId, toColumnId);
      } catch {
        // Local move stays as-is.
      }
    });
  }

  function handleDeleteForever(taskId: string) {
    handleTaskDeleted(taskId);
    startTransition(async () => {
      try {
        await deleteTask(taskId);
      } catch {
        // Local removal stays as-is.
      }
    });
  }

  async function handleCopy(taskId: string) {
    const src = allTasks.find((t) => t.id === taskId);
    const copy = await copyTask(taskId);
    if (copy && src) {
      handleTaskCreated(copy.column_id as string, {
        ...(copy as unknown as TaskWithAssignee),
        assignee: src.assignee,
        assignees: src.assignees,
        checklist_items: src.checklist_items?.map((c) => ({ ...c })),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Card links: /workspace?the=1546 opens that card; the address follows
  // whichever card is open so it can be copied or reloaded.
  // ---------------------------------------------------------------------
  function setCardParam(code: string | null) {
    try {
      const url = new URL(window.location.href);
      if (code) url.searchParams.set(CARD_PARAM, code.replace(/^#/, ""));
      else url.searchParams.delete(CARD_PARAM);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // address bar just doesn't follow — the card still opens
    }
  }
  function openTask(task: TaskWithAssignee) {
    setQuick(null);
    setEditingTask(task);
    if (!task.id.startsWith("temp-")) setCardParam(task.code);
  }
  function closeTask() {
    setEditingTask(null);
    setCardParam(null);
  }
  // The card a shared link points at, once on load — and again when the
  // finished lists arrive, in case it's one of theirs.
  const linkedCardOpenedRef = useRef(false);
  const listsLoaded = pendingLists.length === 0;
  useEffect(() => {
    if (linkedCardOpenedRef.current) return;
    const code = codeFromParam(new URLSearchParams(window.location.search).get(CARD_PARAM));
    if (!code) return;
    const task = allTasksRef.current.find((t) => t.code === code);
    if (task) {
      linkedCardOpenedRef.current = true;
      setEditingTask(task);
    }
  }, [listsLoaded]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`board-${board.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `board_id=eq.${board.id}` }, (payload) => {
        const row = payload.new as Task;
        if (allTasksRef.current.some((t) => t.id === row.id)) return; // already added optimistically in this tab
        const assignee = profilesRef.current.find((p) => p.id === row.assignee_id) ?? null;
        handleTaskCreated(row.column_id, { ...row, assignee, assignees: assignee ? [assignee] : [] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `board_id=eq.${board.id}` }, (payload) => {
        const row = payload.new as Task;
        const existing = allTasksRef.current.find((t) => t.id === row.id);
        const assignee =
          existing && existing.assignee_id === row.assignee_id ? existing.assignee : (profilesRef.current.find((p) => p.id === row.assignee_id) ?? null);
        // Members live in task_assignees, not on this row — keep what we have.
        const assignees = existing?.assignees ?? (assignee ? [assignee] : []);
        handleTaskUpdated({ ...(existing ?? {}), ...row, assignee, assignees } as TaskWithAssignee, true);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (payload) => {
        const old = payload.old as { id: string };
        handleTaskDeleted(old.id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${board.id}` }, (payload) => {
        setBoardColor((payload.new as Board).color);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "board_columns", filter: `board_id=eq.${board.id}` }, (payload) => {
        const row = payload.new as BoardColumn;
        setColumns((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row].sort((a, b) => a.position - b.position)));
        setTasksByColumn((prev) => (row.id in prev ? prev : { ...prev, [row.id]: [] }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "board_columns", filter: `board_id=eq.${board.id}` }, (payload) => {
        const row = payload.new as BoardColumn;
        setColumns((prev) => prev.map((c) => (c.id === row.id ? row : c)).sort((a, b) => a.position - b.position));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_columns" }, (payload) => {
        const old = payload.old as { id: string };
        removeColumnLocally(old.id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "board_labels", filter: `board_id=eq.${board.id}` }, (payload) => {
        const row = payload.new as BoardLabel;
        setBoardLabels((prev) => (prev.some((l) => l.id === row.id) ? prev : [...prev, row].sort((a, b) => a.position - b.position)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "board_labels", filter: `board_id=eq.${board.id}` }, (payload) => {
        const row = payload.new as BoardLabel;
        setBoardLabels((prev) => prev.map((l) => (l.id === row.id ? row : l)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_labels" }, (payload) => {
        const old = payload.old as { id: string };
        setBoardLabels((prev) => prev.filter((l) => l.id !== old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [board.id]);

  async function handleCreateLabel(name: string, color: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: BoardLabel = { id: tempId, board_id: board.id, name, color, position: boardLabels.length, created_at: new Date().toISOString() };
    setBoardLabels((prev) => [...prev, optimistic]);
    try {
      const created = await createBoardLabel(board.id, name, color);
      if (created) setBoardLabels((prev) => prev.map((l) => (l.id === tempId ? created : l)));
      return created ?? optimistic;
    } catch {
      // Optimistic label stays as-is (e.g. workspace-demo has no real backend).
      return optimistic;
    }
  }

  function handleRenameLabel(labelId: string, name: string) {
    setBoardLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, name } : l)));
    startTransition(async () => {
      try {
        await updateBoardLabel(labelId, { name });
      } catch {
        // Local rename stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function handleRecolorLabel(labelId: string, color: string) {
    setBoardLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, color } : l)));
    startTransition(async () => {
      try {
        await updateBoardLabel(labelId, { color });
      } catch {
        // Local recolor stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  function handleDeleteLabel(labelId: string) {
    setBoardLabels((prev) => prev.filter((l) => l.id !== labelId));
    setTasksByColumn((prev) => {
      const next: Record<string, TaskWithAssignee[]> = {};
      for (const [colId, tasks] of Object.entries(prev)) {
        next[colId] = tasks.map((t) => (t.labels.includes(labelId) ? { ...t, labels: t.labels.filter((id) => id !== labelId) } : t));
      }
      return next;
    });
    setEditingTask((prev) => (prev && prev.labels.includes(labelId) ? { ...prev, labels: prev.labels.filter((id) => id !== labelId) } : prev));
    startTransition(async () => {
      try {
        await deleteBoardLabel(labelId);
      } catch {
        // Local removal stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

  // ---------------------------------------------------------------------
  // Getting around: list chips, drag-to-pan, keyboard shortcuts.
  // ---------------------------------------------------------------------
  const listCount = visibleColumns.length;
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    let raf = 0;
    // Chips light up for every list at least half on screen.
    const update = () => {
      raf = 0;
      const left = sc.scrollLeft;
      const right = left + sc.clientWidth;
      const ids: string[] = [];
      sc.querySelectorAll<HTMLElement>("[data-col-id]").forEach((el) => {
        const visible = Math.min(right, el.offsetLeft + el.offsetWidth) - Math.max(left, el.offsetLeft);
        if (visible >= el.offsetWidth * 0.5) ids.push(el.dataset.colId ?? "");
      });
      setInView((prev) => (prev.join() === ids.join() ? prev : ids));
      const bar = chipBarRef.current;
      const chip = ids[0] ? bar?.querySelector<HTMLElement>(`[data-chip="${ids[0]}"]`) : null;
      if (bar && chip && (chip.offsetLeft < bar.scrollLeft || chip.offsetLeft + chip.offsetWidth > bar.scrollLeft + bar.clientWidth)) {
        bar.scrollTo({ left: chip.offsetLeft - 12, behavior: "smooth" });
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    sc.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      sc.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [listCount, collapsed]);

  function jumpTo(columnId: string) {
    if (collapsed.includes(columnId)) toggleCollapsed(columnId);
    requestAnimationFrame(() => {
      const sc = scrollerRef.current;
      const el = sc?.querySelector<HTMLElement>(`[data-col-id="${columnId}"]`);
      if (!sc || !el) return;
      sc.scrollTo({ left: el.offsetLeft - parseFloat(getComputedStyle(sc).paddingLeft || "0"), behavior: "smooth" });
    });
  }

  // Desktop: press on empty board space and drag to slide the lists, like Trello.
  function handleBoardMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".fk-list, button, input, textarea, a, form, [contenteditable]")) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    const startX = e.clientX;
    const startLeft = sc.scrollLeft;
    sc.classList.add("fk-panning");
    const move = (ev: MouseEvent) => {
      sc.scrollLeft = startLeft - (ev.clientX - startX);
    };
    const up = () => {
      sc.classList.remove("fk-panning");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    e.preventDefault();
  }

  function openQuickFor(taskId: string) {
    const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    const r = el?.getBoundingClientRect();
    setQuick({ taskId, at: r ? { x: r.right, y: r.top } : { x: 120, y: 120 } });
  }

  // Trello's single-key shortcuts (desktop keyboards; ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.key === "Escape") {
        setFilterOpen(false);
        setShortcutsOpen(false);
        setMenuOpen(false);
        setQuick(null);
        return;
      }
      if (editingTask || archiveOpen || quick || activityOpen) return;
      const hovered = hoveredTaskRef.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === "f") {
        setFilterOpen((v) => !v);
      } else if (key === "q") {
        setFilter((f) => ({ ...f, members: f.members.includes(currentUserId) ? f.members.filter((m) => m !== currentUserId) : [...f.members, currentUserId] }));
      } else if (key === "x") {
        setFilter(EMPTY_FILTER);
      } else if (key === "?") {
        setShortcutsOpen((v) => !v);
      } else if (hovered && key === "e") {
        e.preventDefault();
        openQuickFor(hovered);
      } else if (hovered && key === "c") {
        handleArchive([hovered]);
        hoveredTaskRef.current = null;
      } else if (hovered && key === " ") {
        e.preventDefault();
        const me = profiles.find((p) => p.id === currentUserId);
        if (me) handleToggleMember(hovered, me);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nFilters = filterCount(filter);
  const quickTask = quick ? allTasks.find((t) => t.id === quick.taskId) : null;
  const dragging = !!activeTaskId || !!activeColumnId;

  return (
    <div className={`fk-board flex-1 flex flex-col min-h-0 ${background.plain ? "is-plain" : ""}`} style={{ background: background.css }}>
      {/* Trello's board bar: translucent over the background — name, search,
          filter, the board menu. */}
      <div className="fk-board-bar flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 flex-none">
        <h1 className="text-base sm:text-lg font-bold truncate min-w-0" style={{ color: "var(--bar-fg)" }}>
          {board.title}
        </h1>
        <span className="hidden md:inline text-[13px] whitespace-nowrap opacity-90">
          ✅ {headerDoneCount}/{headerTotalCount}
        </span>
        {yearStats.length > 0 && (
          <span className="hidden xl:flex items-center gap-3 text-[13px] whitespace-nowrap opacity-90">
            {yearStats.map((y) => (
              <span key={y.year}>
                Năm {y.year}: <strong>{y.count}</strong>
              </span>
            ))}
          </span>
        )}
        <span className="flex-1" />
        <label className="relative flex items-center flex-none">
          <span aria-hidden className="absolute left-2.5 text-[13px] pointer-events-none">
            🔍
          </span>
          <input
            ref={searchRef}
            id="board-search"
            type="search"
            className="fk-bar-search"
            style={{ width: "min(200px, 32vw)" }}
            placeholder="Tìm thẻ…"
            value={filter.text}
            onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            aria-label="Tìm thẻ"
          />
        </label>
        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`fk-bar-btn rounded-[8px] px-3 h-8 text-[13px] font-semibold ${nFilters ? "is-on" : ""}`}
            aria-expanded={filterOpen}
          >
            ⚲ Lọc{nFilters ? ` · ${nFilters}` : ""}
          </button>
          {filterOpen && (
            <BoardFilterMenu
              filter={filter}
              onChange={setFilter}
              profiles={profiles}
              labels={boardLabels}
              currentUserId={currentUserId}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>
        <div className="hidden lg:flex items-center -space-x-2 flex-none">
          {profiles.slice(0, 6).map((p) => (
            <div
              key={p.id}
              title={p.display_name}
              className="flex items-center justify-center rounded-full font-bold flex-none"
              style={{ width: 28, height: 28, fontSize: 11, background: "var(--color-accent-100)", color: "var(--color-accent-700)", border: "2px solid var(--bar-ring)" }}
            >
              {p.display_name.charAt(0).toUpperCase()}
            </div>
          ))}
          {profiles.length > 6 && (
            <div
              className="flex items-center justify-center rounded-full font-bold flex-none"
              style={{ width: 28, height: 28, fontSize: 10, background: "var(--bar-btn)", color: "var(--bar-fg)", border: "2px solid var(--bar-ring)" }}
            >
              +{profiles.length - 6}
            </div>
          )}
        </div>
        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="fk-bar-btn rounded-[8px] w-8 h-8 flex items-center justify-center text-[15px] font-bold"
            aria-expanded={menuOpen}
            aria-label="Menu bảng"
            title="Menu bảng"
          >
            ⋯
          </button>
          {menuOpen && (
            <BoardMenu
              boardColor={boardColor}
              archivedCount={archivedTasks.length}
              showLabelNames={showLabelNames}
              onOpenActivity={() => setActivityOpen(true)}
              onOpenArchive={() => setArchiveOpen(true)}
              onPickBackground={handlePickBackground}
              onToggleLabelNames={toggleLabelNames}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onClose={() => setMenuOpen(false)}
            />
          )}
          {shortcutsOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShortcutsOpen(false)} />
              <div className="card elev-md absolute right-0 top-full mt-1.5 z-40 p-3 flex flex-col gap-1.5" style={{ width: 300, color: "var(--color-text)" }}>
                <span className="text-sm font-bold pb-1">Phím tắt</span>
                {SHORTCUTS.map(([k, label]) => (
                  <span key={k} className="flex items-center gap-3 text-[13px]">
                    <kbd
                      className="inline-flex justify-center rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-bold min-w-[44px]"
                      style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-neutral-300)" }}
                    >
                      {k}
                    </kbd>
                    {label}
                  </span>
                ))}
                <span className="text-[11.5px] pt-1" style={{ color: "var(--color-neutral-500)" }}>
                  Chuột phải vào thẻ để sửa nhanh · kéo chỗ trống trên bảng để lướt ngang
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Every list by name — tap one to slide straight to it instead of
          swiping past the others. Lit up: the lists on screen now. */}
      <div
        ref={chipBarRef}
        className="fk-chipbar relative flex items-center gap-1.5 px-3 sm:px-5 pt-2 pb-0.5 overflow-x-auto flex-none"
        aria-label="Chuyển nhanh tới danh sách"
      >
        {visibleColumns.map((c) => {
          const on = inView.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              data-chip={c.id}
              onClick={() => jumpTo(c.id)}
              className={`fk-bar-btn flex-none rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${on ? "is-on" : ""}`}
            >
              {collapsed.includes(c.id) && <span aria-hidden>⇔ </span>}
              {c.title} <span className="tabular-nums opacity-70">{filtering ? visibleTasksOf(c.id).length : countOf(c.id)}</span>
            </button>
          );
        })}
      </div>

      {filtering && (
        <div className="flex items-center gap-3 px-3 sm:px-6 py-1.5 text-[12.5px] flex-none" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
          <span className="flex-1 min-w-0 truncate">
            Đang lọc: <b>{matchCount}</b> / {boardTasks.length} thẻ khớp
          </span>
          <button type="button" className="font-bold underline flex-none" onClick={() => setFilter(EMPTY_FILTER)}>
            Xoá bộ lọc
          </button>
        </div>
      )}

      {/* Lists side by side with horizontal scroll; on a phone each list is
          almost a screen wide and snaps into place, like the Trello app. */}
      <div
        ref={scrollerRef}
        onMouseDown={handleBoardMouseDown}
        className={`relative flex-1 min-h-0 overflow-x-auto overflow-y-hidden fk-board-scroll snap-x snap-mandatory sm:snap-none px-3 sm:px-6 py-3 ${dragging ? "fk-dragging" : ""}`}
      >
        <DndContext
          id={`board-${board.id}`}
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          autoScroll={{ threshold: { x: 0.15, y: 0.18 }, acceleration: 12 }}
        >
          <div className="flex gap-3 items-start h-full min-w-fit">
            <SortableContext items={visibleColumns.map((c) => listDndId(c.id))} strategy={horizontalListSortingStrategy}>
              {visibleColumns.map((col, i) => (
                <Column
                  key={col.id}
                  column={col}
                  tasks={visibleTasksOf(col.id)}
                  totalCount={countOf(col.id)}
                  loadingCards={pendingLists.includes(col.id)}
                  filtering={filtering}
                  boardLabels={boardLabels}
                  showLabelNames={showLabelNames}
                  collapsed={collapsed.includes(col.id)}
                  otherColumns={visibleColumns.filter((c) => c.id !== col.id)}
                  canMoveLeft={i > 0}
                  canMoveRight={i < visibleColumns.length - 1}
                  onMove={(dir) => handleMoveColumn(col.id, dir)}
                  onOpenTask={openTask}
                  onQuickAdd={(title) => handleQuickAdd(col.id, title)}
                  onSort={(mode) => handleSortColumn(col.id, mode)}
                  onArchiveAll={() => !stillLoading(col.id) && handleArchive((tasksByColumn[col.id] ?? []).map((t) => t.id))}
                  onMoveAll={(to) => !stillLoading(col.id) && handleMoveAll(col.id, to)}
                  onDeleteColumn={() => handleColumnDeleted(col.id)}
                  onToggleCollapse={() => toggleCollapsed(col.id)}
                  onToggleDue={handleToggleDue}
                  onQuickEdit={(task, at) => setQuick({ taskId: task.id, at })}
                  onHoverTask={(id) => {
                    hoveredTaskRef.current = id;
                  }}
                  onToggleLabelNames={toggleLabelNames}
                />
              ))}
            </SortableContext>

            <div className="flex-none w-[84vw] max-w-[300px] sm:w-[272px] snap-center">
              {newColumnOpen ? (
                <form onSubmit={handleAddColumn} className="p-3 rounded-[12px] flex flex-col gap-2" style={{ border: "1.5px dashed var(--color-neutral-300)" }}>
                  <input
                    autoFocus
                    className="input"
                    placeholder="Tên danh sách mới…"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onBlur={() => !newColumnTitle && setNewColumnOpen(false)}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary btn-sm">
                      Thêm danh sách
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setNewColumnOpen(false);
                        setNewColumnTitle("");
                      }}
                    >
                      Huỷ
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewColumnOpen(true)}
                  className="ws-add-btn w-full h-12 rounded-[12px] text-sm font-semibold"
                  style={{ border: "1.5px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
                >
                  + Thêm danh sách
                </button>
              )}
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
            {activeTask ? (
              <div style={{ width: "min(272px, calc(84vw - 16px))" }}>
                <TaskCardOverlay task={activeTask} boardLabels={boardLabels} showLabelNames={showLabelNames} />
              </div>
            ) : activeColumn ? (
              <div
                className="card elev-md rounded-[12px] px-3 py-2.5 flex items-center gap-2"
                style={{ width: "min(272px, 84vw)", transform: "rotate(2deg)", cursor: "grabbing" }}
              >
                <span className="text-[13.5px] font-bold flex-1 truncate" style={{ color: activeColumn.color }}>
                  {activeColumn.title}
                </span>
                <span className="tag tag-neutral tabular-nums">{countOf(activeColumn.id)}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {quick && quickTask && (
        <QuickCardMenu
          task={quickTask}
          at={quick.at}
          columns={visibleColumns}
          boardLabels={boardLabels}
          profiles={profiles}
          onOpen={() => openTask(quickTask)}
          onToggleLabel={(labelId) => handleToggleLabel(quickTask.id, labelId)}
          onToggleMember={(p) => handleToggleMember(quickTask.id, p)}
          onMove={(to) => handleMoveCard(quickTask.id, to)}
          onToggleDue={() => handleToggleDue(quickTask)}
          onCopy={() => handleCopy(quickTask.id).catch(() => alert("Không sao chép được thẻ."))}
          onArchive={() => handleArchive([quickTask.id])}
          onClose={() => setQuick(null)}
        />
      )}

      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          columns={visibleColumns}
          profiles={profiles}
          boardLabels={boardLabels}
          currentUserId={currentUserId}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
          onArchive={(id) => handleArchive([id])}
          onCopy={handleCopy}
          onMove={handleMoveCard}
          onCreateLabel={handleCreateLabel}
          onRenameLabel={handleRenameLabel}
          onRecolorLabel={handleRecolorLabel}
          onDeleteLabel={handleDeleteLabel}
          onClose={closeTask}
        />
      )}

      {activityOpen && (
        <BoardActivityPanel
          boardId={board.id}
          onOpenTask={(taskId) => {
            const task = allTasks.find((t) => t.id === taskId);
            if (!task) return;
            setActivityOpen(false);
            openTask(task);
          }}
          onClose={() => setActivityOpen(false)}
        />
      )}

      {archiveOpen && (
        <ArchiveDrawer
          tasks={archivedTasks}
          columns={visibleColumns}
          onRestore={handleRestore}
          onDeleteForever={handleDeleteForever}
          onOpen={(t) => {
            setArchiveOpen(false);
            openTask(t);
          }}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </div>
  );
}
