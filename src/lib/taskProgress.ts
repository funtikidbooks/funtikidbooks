// Progress is a time-urgency bar, not a manually-set completion percentage:
// it climbs automatically from the task's start date to its due date, and
// re-shortens on its own if the deadline gets pushed back — there is no
// stored value to edit. A task in the "done" column always reads 100%.
export function computeTaskProgress(startDate: string | null, dueDate: string | null, isDone: boolean): number {
  if (isDone) return 100;
  if (!startDate || !dueDate) return 0;

  const start = new Date(startDate + "T00:00:00").getTime();
  const due = new Date(dueDate + "T23:59:59").getTime();
  if (Number.isNaN(start) || Number.isNaN(due) || due <= start) return 0;

  const now = Date.now();
  if (now <= start) return 0;
  if (now >= due) return 100;
  return Math.round(((now - start) / (due - start)) * 100);
}

// 0–39% green (plenty of runway), 40–79% yellow (getting close), 80–100%
// red (due very soon or overdue).
export function taskProgressColor(pct: number): string {
  if (pct < 40) return "var(--status-green)";
  if (pct < 80) return "var(--status-yellow)";
  return "var(--status-red)";
}
