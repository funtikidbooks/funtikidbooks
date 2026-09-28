// Trello-style board helpers shared by the workspace board, its server
// actions and tests/calculations.test.mjs. Pure — no imports at runtime.
//
// Archive: an archived card moves into one hidden list with this exact
// title (created the first time something is archived). The board never
// shows that list as a column; it's what the "📦 Lưu trữ" drawer lists and
// where "Khôi phục" takes cards back from. No database changes needed.
export const ARCHIVE_COLUMN_TITLE = "📦 Lưu trữ";

export const isArchiveColumnTitle = (title: string) => title.trim() === ARCHIVE_COLUMN_TITLE;

// "#1546" ↔ /workspace?the=1546 — a link that opens the board on that card.
export const CARD_PARAM = "the";
export const taskLink = (origin: string, code: string) => `${origin}/workspace?${CARD_PARAM}=${encodeURIComponent(code.replace(/^#/, ""))}`;
export const codeFromParam = (value: string | null) => (value?.trim() ? `#${value.trim().replace(/^#/, "")}` : null);

export type DueFilter = "any" | "overdue" | "week" | "none" | "complete" | "incomplete";

export type BoardFilter = {
  text: string;
  members: string[]; // profile ids; "none" = cards with nobody on them
  labels: string[]; // label ids
  due: DueFilter;
};

export const EMPTY_FILTER: BoardFilter = { text: "", members: [], labels: [], due: "any" };

export const filterCount = (f: BoardFilter) =>
  (f.text.trim() ? 1 : 0) + f.members.length + f.labels.length + (f.due !== "any" ? 1 : 0);

type FilterableTask = {
  title: string;
  code: string;
  description: string | null;
  due_date: string | null;
  due_complete?: boolean | null;
  labels: string[];
  assignees: { id: string }[];
};

// Strip Vietnamese accents so "hoan thanh" finds "Hoàn thành".
export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// today: "YYYY-MM-DD" (Vietnam date). Every active part must match.
export function matchesFilter(task: FilterableTask, f: BoardFilter, today: string): boolean {
  const q = fold(f.text.trim());
  if (q) {
    const hay = fold(`${task.title} ${task.code} ${(task.description ?? "").replace(/<[^>]+>/g, " ")}`);
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (f.members.length) {
    const ids = task.assignees.map((a) => a.id);
    const ok = f.members.some((m) => (m === "none" ? ids.length === 0 : ids.includes(m)));
    if (!ok) return false;
  }
  if (f.labels.length && !f.labels.some((l) => task.labels.includes(l))) return false;
  if (f.due !== "any") {
    if (f.due === "none") return !task.due_date;
    if (!task.due_date) return false;
    // Like Trello, a due date ticked "hoàn tất" is never overdue or coming up.
    if (f.due === "complete") return !!task.due_complete;
    if (f.due === "incomplete") return !task.due_complete;
    if (task.due_complete) return false;
    if (f.due === "overdue") return task.due_date < today;
    if (f.due === "week") return task.due_date >= today && task.due_date <= addDaysIso(today, 7);
  }
  return true;
}

function addDaysIso(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type SortMode = "due" | "title" | "newest" | "oldest";

export const SORT_LABELS: Record<SortMode, string> = {
  due: "Hạn chót gần nhất trước",
  title: "Tên (A → Z)",
  newest: "Mới tạo trước",
  oldest: "Cũ nhất trước",
};

// Cards without a due date go last when sorting by due date.
export function sortTasks<T extends { title: string; due_date: string | null; created_at: string }>(tasks: T[], mode: SortMode): T[] {
  const list = [...tasks];
  if (mode === "due") list.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.title.localeCompare(b.title, "vi"));
  if (mode === "title") list.sort((a, b) => a.title.localeCompare(b.title, "vi"));
  if (mode === "newest") list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (mode === "oldest") list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return list;
}
