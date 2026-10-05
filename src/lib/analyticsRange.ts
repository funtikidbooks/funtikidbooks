// The time span on Lượt truy cập web (workspace/luot-truy-cap) and how its
// chart groups the days. No runtime imports, so tests/analyticsRange.test.mjs
// can load it in plain Node.

// The first day Google Analytics recorded (the GA4 property was set up on
// 23–24/09/2026). Nothing earlier exists, so a span reaching further back
// starts here.
export const ANALYTICS_START = "2026-09-23";

export const RANGE_PRESETS = [
  { key: "7", label: "7 ngày", days: 7 },
  { key: "30", label: "30 ngày", days: 30 },
  { key: "90", label: "3 tháng", days: 90 },
  { key: "365", label: "12 tháng", days: 365 },
  { key: "tat-ca", label: "Tất cả", days: null },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"] | "tu-chon";
export type Grain = "day" | "week" | "month";

export type ResolvedRange = {
  key: RangeKey;
  start: string;
  end: string;
  // The span asked for began before ANALYTICS_START and was cut to it.
  clipped: boolean;
  // "7 ngày", or "01/10/2026 – 05/10/2026" for a chosen span.
  label: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A day that exists: "2026-09-31" passes the pattern, and Date rolls it over
// to 1/10 instead of refusing it, so it has to read back the same.
export function isRealDate(s: string | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}
const isIsoDate = isRealDate;

export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Days from start to end, both counted.
export function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400e3) + 1;
}

const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dmy = (date: string) => `${dm(date)}/${date.slice(0, 4)}`;

// ?ky=30 (a preset), ?tu=2026-09-25&den=2026-10-01 (a chosen span), or
// nothing (7 ngày). Never past today, never before ANALYTICS_START.
export function resolveRange(params: { ky?: string; tu?: string; den?: string }, today: string): ResolvedRange {
  if (isIsoDate(params.tu) && isIsoDate(params.den)) {
    let [start, end] = params.tu <= params.den ? [params.tu, params.den] : [params.den, params.tu];
    if (end > today) end = today;
    const clipped = start < ANALYTICS_START;
    if (clipped) start = ANALYTICS_START;
    if (start <= end) return { key: "tu-chon", start, end, clipped, label: `${dmy(start)} – ${dmy(end)}` };
  }
  const preset = RANGE_PRESETS.find((p) => p.key === params.ky) ?? RANGE_PRESETS[0];
  const wanted = preset.days === null ? ANALYTICS_START : addDaysIso(today, -(preset.days - 1));
  const clipped = preset.days !== null && wanted < ANALYTICS_START;
  return { key: preset.key, start: clipped ? ANALYTICS_START : wanted, end: today, clipped, label: preset.label };
}

// Up to a month: one bar a day. Up to four months: a week (Monday–Sunday,
// as Google Analytics counts them). Longer: a month.
export function grainFor(start: string, end: string): Grain {
  const n = daysInclusive(start, end);
  return n <= 31 ? "day" : n <= 120 ? "week" : "month";
}

// The span of the same length just before this one — for "so với kỳ
// trước" — or null when part of it predates ANALYTICS_START (no data, so the
// comparison would be meaningless).
export function previousRange(start: string, end: string): { start: string; end: string } | null {
  const prevEnd = addDaysIso(start, -1);
  const prevStart = addDaysIso(prevEnd, -(daysInclusive(start, end) - 1));
  return prevStart >= ANALYTICS_START ? { start: prevStart, end: prevEnd } : null;
}

// What "↑ x% so với kỳ trước" compares: whole days only. Today is still
// going (and Google takes a few hours to count it), so set against full
// earlier days it would always look like a drop — it's left out of both
// sides. Null when there's nothing whole to compare.
export function comparisonRanges(
  start: string,
  end: string,
  today: string,
): { current: { start: string; end: string }; previous: { start: string; end: string }; withoutToday: boolean } | null {
  const withoutToday = end >= today;
  const currentEnd = withoutToday ? addDaysIso(today, -1) : end;
  if (currentEnd < start) return null;
  const previous = previousRange(start, currentEnd);
  return previous ? { current: { start, end: currentEnd }, previous, withoutToday } : null;
}

// Google Analytics' isoYearIsoWeek for a day: "202641" for 05/10/2026.
export function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // that week's Thursday
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / (7 * 86400e3));
  return `${year}${String(week).padStart(2, "0")}`;
}

export type BucketFrame = {
  // The value Google Analytics reports for it: date "20261005",
  // isoYearIsoWeek "202641" or yearMonth "202610".
  key: string;
  // Under the bar: "05/10", "28/09" (the week's first day here), "10/2026".
  label: string;
  // In the tooltip and table: "05/10/2026", "Tuần 28/09 – 04/10", "Tháng 10/2026".
  title: string;
};

// Every bar the span needs, empty ones included (Google Analytics leaves
// out a day nobody visited). A week or month cut by the span's edges covers
// only its days inside it.
export function bucketFrames(start: string, end: string, grain: Grain): BucketFrame[] {
  const keyOf = (d: string) => (grain === "day" ? d.replaceAll("-", "") : grain === "week" ? isoWeekKey(d) : d.slice(0, 7).replace("-", ""));
  const spans: { key: string; from: string; to: string }[] = [];
  // Capped at about 11 years of days, whatever the caller passes.
  for (let d = start, i = 0; d <= end && i < 4000; d = addDaysIso(d, 1), i++) {
    const key = keyOf(d);
    const last = spans[spans.length - 1];
    if (last?.key === key) last.to = d;
    else spans.push({ key, from: d, to: d });
  }
  return spans.map(({ key, from, to }) => {
    if (grain === "day") return { key, label: dm(from), title: dmy(from) };
    if (grain === "week") return { key, label: dm(from), title: from === to ? `Tuần ${dm(from)}` : `Tuần ${dm(from)} – ${dm(to)}` };
    const my = `${from.slice(5, 7)}/${from.slice(0, 4)}`;
    // A month cut by the span's edges says which days it holds, so a short
    // one doesn't read as traffic falling off.
    const whole = from.endsWith("-01") && addDaysIso(to, 1).endsWith("-01");
    return { key, label: my, title: whole ? `Tháng ${my}` : `Tháng ${my} (${dm(from)} – ${dm(to)})` };
  });
}
