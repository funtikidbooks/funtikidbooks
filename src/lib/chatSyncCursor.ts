// How far back each catch-up fetch re-reads before its cursor. Rows are
// stamped with created_at when the insert starts but only become visible
// once it commits, so a fetch can momentarily miss a row stamped just before
// the newest one it saw. Re-reading a minute of overlap costs a handful of
// already-known rows (merged away by id) and closes that window for good.
const OVERLAP_MS = 60_000;

// Only fetch results may advance a sync cursor — never a message that
// arrived over Broadcast/realtime or one we sent ourselves. Before, the
// cursor was "the newest message on screen", so one message landing through
// those paths while an earlier one was missed moved the cursor past the
// missed one and it was never fetched again. Alice's room lost Lalune's
// 15:31/15:32 messages exactly that way once her own 18:05 message landed.
export type SyncCursor = { messages?: string; reactions?: string };

export function newestCreatedAt(rows: { created_at: string }[], current?: string): string | undefined {
  let max = current;
  for (const r of rows) if (!max || r.created_at > max) max = r.created_at;
  return max;
}

// Postgres timestamps carry microseconds ("…04.782068+00:00"), which not
// every Safari version will parse — trim to milliseconds first.
export function catchUpFrom(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(cursor);
  const normalized = m ? `${m[1]}${m[2] ? m[2].slice(0, 4) : ""}${m[3] ?? "Z"}` : cursor;
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? undefined : new Date(t - OVERLAP_MS).toISOString();
}

// Inserts a server row at its chronological spot instead of the bottom — a
// message fetched late (it was missed live) belongs where it was sent, not
// under everything that came after it. Unsent ("temp-") bubbles stay last.
export function insertByTime<T extends { id: string; created_at: string }>(list: T[], row: T): T[] {
  let i = list.length;
  while (i > 0 && (list[i - 1].id.startsWith("temp-") || list[i - 1].created_at > row.created_at)) i--;
  if (i === list.length) return [...list, row];
  return [...list.slice(0, i), row, ...list.slice(i)];
}
