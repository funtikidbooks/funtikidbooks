"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import type { Board, BoardColumn, BoardLabel, Profile, Task, TaskWithAssignee } from "@/lib/types";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";
import { AddTaskDialog } from "./AddTaskDialog";
import { EditTaskDialog } from "./EditTaskDialog";
import {
  createBoardLabel,
  createColumn,
  deleteBoardLabel,
  deleteColumn,
  reorderTasks,
  updateBoardLabel,
} from "@/lib/actions/board";
import { isDoneColumnTitle } from "@/lib/taskProgress";

export function WorkspaceBoard({
  board,
  initialColumns,
  initialTasks,
  profiles,
  initialBoardLabels = [],
  currentUserId,
}: {
  board: Board;
  initialColumns: BoardColumn[];
  initialTasks: TaskWithAssignee[];
  profiles: Profile[];
  initialBoardLabels?: BoardLabel[];
  currentUserId: string;
}) {
  const [columns, setColumns] = useState(
    [...initialColumns].sort((a, b) => a.position - b.position),
  );
  const [tasksByColumn, setTasksByColumn] = useState<Record<string, TaskWithAssignee[]>>(() => {
    const map: Record<string, TaskWithAssignee[]> = {};
    for (const col of initialColumns) {
      map[col.id] = initialTasks
        .filter((t) => t.column_id === col.id)
        .sort((a, b) => a.position - b.position);
    }
    return map;
  });
  const [boardLabels, setBoardLabels] = useState(
    [...initialBoardLabels].sort((a, b) => a.position - b.position),
  );

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [addTaskColumn, setAddTaskColumn] = useState<BoardColumn | null>(null);
  const [editingTask, setEditingTask] = useState<TaskWithAssignee | null>(null);
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [, startTransition] = useTransition();

  // A plain PointerSensor's distance-based activation also fires for touch
  // scroll gestures — a few px of finger movement while scrolling a column
  // gets misread as a drag start, which is what was making iPad scrolling
  // feel like it was "sticking" to cards. Splitting mouse and touch lets
  // touch require a short hold (delay) before a drag activates, so a quick
  // scroll swipe never triggers it.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const allTasks = useMemo(() => Object.values(tasksByColumn).flat(), [tasksByColumn]);
  // Read from inside the realtime subscription below, which only subscribes
  // once per board — a plain closure over allTasks/profiles would keep
  // seeing whatever those were at mount, not their current values.
  const allTasksRef = useRef(allTasks);
  useEffect(() => {
    allTasksRef.current = allTasks;
  }, [allTasks]);
  const profilesRef = useRef(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  const doneColumn = columns.find((c) => isDoneColumnTitle(c.title));
  const doneCount = doneColumn ? (tasksByColumn[doneColumn.id]?.length ?? 0) : 0;
  const activeTask = activeTaskId ? allTasks.find((t) => t.id === activeTaskId) : null;

  // One "Final <year>" column per year of archived work (renamed every year,
  // per isDoneColumnTitle) — surface how many cards landed in each year
  // rather than only the grand total, in board column order (newest first).
  const yearStats = columns
    .map((c) => {
      const match = c.title.match(/final\s*(\d{4})/i);
      if (!match) return null;
      return { year: match[1], count: tasksByColumn[c.id]?.length ?? 0 };
    })
    .filter((v): v is { year: string; count: number } => v !== null);

  // A "Final <year>" board tracks work by archive year, so the header badge
  // should read as "N/N hoàn thành" for whichever year is currently active
  // (the first Final column in board order) — it climbs to 119, 120, ... as
  // more cards land there, rather than comparing against the whole board's
  // all-time total across every past year. Boards without any Final column
  // (e.g. a plain "Hoàn thành" column) keep the classic done/total reading.
  const currentYearStat = yearStats[0];
  const headerDoneCount = currentYearStat ? currentYearStat.count : doneCount;
  const headerTotalCount = currentYearStat ? currentYearStat.count : allTasks.length;

  function findColumnIdOfTask(taskId: string) {
    for (const [colId, tasks] of Object.entries(tasksByColumn)) {
      if (tasks.some((t) => t.id === taskId)) return colId;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTaskId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const fromColumnId = findColumnIdOfTask(activeId);
    if (!fromColumnId) return;

    const toColumnId = columns.some((c) => c.id === overId) ? overId : findColumnIdOfTask(overId);
    if (!toColumnId) return;

    const fromTasks = [...tasksByColumn[fromColumnId]];
    const activeIndex = fromTasks.findIndex((t) => t.id === activeId);
    if (activeIndex === -1) return;
    const [moved] = fromTasks.splice(activeIndex, 1);

    const toTasks = fromColumnId === toColumnId ? fromTasks : [...(tasksByColumn[toColumnId] ?? [])];
    let overIndex = toTasks.findIndex((t) => t.id === overId);
    if (overIndex === -1) overIndex = toTasks.length;
    toTasks.splice(overIndex, 0, { ...moved, column_id: toColumnId });

    const next = { ...tasksByColumn };
    next[fromColumnId] = fromColumnId === toColumnId ? toTasks : fromTasks;
    next[toColumnId] = toTasks;
    setTasksByColumn(next);

    // Calling startTransition from inside a setState updater is not allowed
    // ("Cannot call startTransition while rendering") — it has to run here,
    // after the state update above, not nested inside it.
    const updates: { id: string; column_id: string; position: number }[] = [];
    next[fromColumnId].forEach((t, i) => updates.push({ id: t.id, column_id: fromColumnId, position: i }));
    if (toColumnId !== fromColumnId) {
      next[toColumnId].forEach((t, i) => updates.push({ id: t.id, column_id: toColumnId, position: i }));
    }
    startTransition(async () => {
      try {
        await reorderTasks(updates);
      } catch {
        // Local order stays as-is (e.g. workspace-demo has no real backend).
      }
    });
  }

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
      position: columns.length,
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
    setTasksByColumn((prev) => ({ ...prev, [columnId]: [...(prev[columnId] ?? []), task] }));
  }

  function handleTaskReconciled(columnId: string, tempId: string, task: TaskWithAssignee) {
    setTasksByColumn((prev) => ({
      ...prev,
      [columnId]: (prev[columnId] ?? []).map((t) => (t.id === tempId ? task : t)),
    }));
  }

  function handleTaskUpdated(updated: TaskWithAssignee) {
    setTasksByColumn((prev) => {
      const fromColumnId = Object.entries(prev).find(([, tasks]) => tasks.some((t) => t.id === updated.id))?.[0];

      // Same column — update in place so position doesn't shift.
      if (fromColumnId === updated.column_id) {
        return {
          ...prev,
          [updated.column_id]: (prev[updated.column_id] ?? []).map((t) => (t.id === updated.id ? updated : t)),
        };
      }

      // Column changed — remove from wherever it was, append to the new one.
      const next = { ...prev };
      if (fromColumnId) next[fromColumnId] = prev[fromColumnId].filter((t) => t.id !== updated.id);
      next[updated.column_id] = [...(prev[updated.column_id] ?? []), updated];
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

  // Split from handleColumnDeleted so the realtime subscription below can
  // reuse just the local cleanup when a teammate deletes a column, without
  // also re-issuing the delete action that already happened on their end.
  function removeColumnLocally(columnId: string) {
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    setTasksByColumn((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => id !== columnId)),
    );
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

  // A card someone else added/moved/edited/deleted, a column they added/
  // renamed/deleted, or a label they added/recolored/deleted — this is the
  // one screen the whole team has open side by side all day, so none of
  // that should ever need a reload to show up. A raw `tasks` row (from
  // realtime) is missing the joined assignee profile and checklist/comment/
  // attachment counts a TaskWithAssignee needs; the assignee is resolved
  // from the `profiles` prop already on hand (same trick AddTaskDialog uses
  // reconciling its own optimistic create), and the count fields are just
  // left undefined — they render as 0 until the card is actually opened,
  // which already re-fetches full detail.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`board-${board.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as Task;
          if (allTasksRef.current.some((t) => t.id === row.id)) return; // already added optimistically in this tab
          const assignee = profilesRef.current.find((p) => p.id === row.assignee_id) ?? null;
          handleTaskCreated(row.column_id, { ...row, assignee, assignees: assignee ? [assignee] : [] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as Task;
          const existing = allTasksRef.current.find((t) => t.id === row.id);
          const assignee =
            existing && existing.assignee_id === row.assignee_id
              ? existing.assignee
              : (profilesRef.current.find((p) => p.id === row.assignee_id) ?? null);
          handleTaskUpdated({ ...(existing ?? {}), ...row, assignee, assignees: assignee ? [assignee] : [] } as TaskWithAssignee);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        (payload) => {
          const old = payload.old as { id: string };
          handleTaskDeleted(old.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_columns", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as BoardColumn;
          setColumns((prev) =>
            prev.some((c) => c.id === row.id) ? prev : [...prev, row].sort((a, b) => a.position - b.position),
          );
          setTasksByColumn((prev) => (row.id in prev ? prev : { ...prev, [row.id]: [] }));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "board_columns", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as BoardColumn;
          setColumns((prev) =>
            prev.map((c) => (c.id === row.id ? row : c)).sort((a, b) => a.position - b.position),
          );
        },
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_columns" }, (payload) => {
        const old = payload.old as { id: string };
        removeColumnLocally(old.id);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_labels", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as BoardLabel;
          setBoardLabels((prev) =>
            prev.some((l) => l.id === row.id) ? prev : [...prev, row].sort((a, b) => a.position - b.position),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "board_labels", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as BoardLabel;
          setBoardLabels((prev) => prev.map((l) => (l.id === row.id ? row : l)));
        },
      )
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
    const optimistic: BoardLabel = {
      id: tempId,
      board_id: board.id,
      name,
      color,
      position: boardLabels.length,
      created_at: new Date().toISOString(),
    };
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
        next[colId] = tasks.map((t) =>
          t.labels.includes(labelId) ? { ...t, labels: t.labels.filter((id) => id !== labelId) } : t,
        );
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-6 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">{board.title}</h1>
        <div className="flex items-center gap-5 text-sm" style={{ color: "var(--color-neutral-600)" }}>
          <span>✅ {headerDoneCount}/{headerTotalCount} hoàn thành</span>
        </div>
        {yearStats.length > 0 && (
          <div className="flex items-center gap-5 text-sm" style={{ color: "var(--color-neutral-600)" }}>
            {yearStats.map((y) => (
              <span key={y.year}>
                Năm {y.year}: <strong style={{ color: "var(--color-neutral-800)" }}>{y.count}</strong> dự án
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center -space-x-2 ml-auto">
          {profiles.slice(0, 6).map((p) => (
            <div
              key={p.id}
              title={p.display_name}
              className="flex items-center justify-center rounded-full font-bold flex-none"
              style={{
                width: 28,
                height: 28,
                fontSize: 11,
                background: "var(--color-accent-100)",
                color: "var(--color-accent-700)",
                border: "2px solid var(--color-bg)",
              }}
            >
              {p.display_name.charAt(0).toUpperCase()}
            </div>
          ))}
          {profiles.length > 6 && (
            <div
              className="flex items-center justify-center rounded-full font-bold flex-none"
              style={{
                width: 28,
                height: 28,
                fontSize: 10,
                background: "var(--color-neutral-200)",
                color: "var(--color-neutral-700)",
                border: "2px solid var(--color-bg)",
              }}
            >
              +{profiles.length - 6}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6 fk-board-scroll">
        <DndContext
          id={`board-${board.id}`}
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 items-start min-w-fit">
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                tasks={tasksByColumn[col.id] ?? []}
                boardLabels={boardLabels}
                onOpenTask={setEditingTask}
                onAddTask={() => setAddTaskColumn(col)}
                onDeleteColumn={() => handleColumnDeleted(col.id)}
              />
            ))}

            <div className="flex-none w-[220px]">
              {newColumnOpen ? (
                <form
                  onSubmit={handleAddColumn}
                  className="p-3 rounded-[var(--radius-md)] flex flex-col gap-2"
                  style={{ border: "1.5px dashed var(--color-neutral-300)" }}
                >
                  <input
                    autoFocus
                    className="input"
                    placeholder="Tên cột mới…"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onBlur={() => !newColumnTitle && setNewColumnOpen(false)}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary btn-sm">
                      Thêm cột
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
                  className="ws-add-btn w-full h-12 rounded-[var(--radius-md)] text-sm font-semibold"
                  style={{ border: "1.5px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
                >
                  + Thêm cột
                </button>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div style={{ width: 250 }}>
                <TaskCard task={activeTask} boardLabels={boardLabels} onOpen={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {addTaskColumn && (
        <AddTaskDialog
          boardId={board.id}
          columnId={addTaskColumn.id}
          columnTitle={addTaskColumn.title}
          profiles={profiles}
          onCreated={(task) => handleTaskCreated(addTaskColumn.id, task)}
          onReconciled={(tempId, task) => handleTaskReconciled(addTaskColumn.id, tempId, task)}
          onClose={() => setAddTaskColumn(null)}
        />
      )}

      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          columns={columns}
          profiles={profiles}
          boardLabels={boardLabels}
          currentUserId={currentUserId}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
          onCreateLabel={handleCreateLabel}
          onRenameLabel={handleRenameLabel}
          onRecolorLabel={handleRecolorLabel}
          onDeleteLabel={handleDeleteLabel}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
