// Quản trị → Tìm khách (Upwork) → Hiệu quả: how well the hourly job hunt
// works — did it run every hour, how many jobs in the emails were worth a
// proposal, how many of those sếp kept, and how far they went (sent →
// replied → hired). Pure; shared by the page and tests/calculations.test.mjs.

export type StatsBatch = { id: string; ran_at: string; jobs_found: number | null; leads_drafted: number | null };
export type StatsLead = {
  batch_id: string;
  status: string;
  fit_score?: number | null;
  template_name?: string | null;
  created_at: string;
};

const HOUR = 3600e3;
const DAY = 86400e3;
const VN_OFFSET = 7 * HOUR;
export const vnDayKey = (ms: number) => new Date(ms + VN_OFFSET).toISOString().slice(0, 10);

const KEPT = ["approved", "sent", "replied", "hired"];
const SENT = ["sent", "replied", "hired"];
const REPLIED = ["replied", "hired"];

const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

export function upworkStats(batches: StatsBatch[], leads: StatsLead[], rangeDays: number | null, now: number) {
  const from = rangeDays ? now - rangeDays * DAY : -Infinity;
  const inRange = batches.filter((b) => Date.parse(b.ran_at) >= from);
  const batchIds = new Set(inRange.map((b) => b.id));
  const ls = leads.filter((l) => batchIds.has(l.batch_id));
  const count = (...statuses: string[]) => ls.filter((l) => statuses.includes(l.status)).length;

  // Every hour since the range (or the first check ever) began.
  const firstEver = batches.reduce((m, b) => Math.min(m, Date.parse(b.ran_at)), Infinity);
  const start = Math.max(from, firstEver);
  const expectedChecks = Number.isFinite(start) ? Math.max(inRange.length, Math.floor((now - start) / HOUR)) : 0;

  const found = inRange.reduce((s, b) => s + Number(b.jobs_found ?? 0), 0);
  const drafted = ls.length;
  const kept = count(...KEPT);
  const rejected = count("rejected");
  const sent = count(...SENT);
  const replied = count(...REPLIED);

  // One column per day for the chart — the last 14 days, or the range if
  // shorter, and never before the first check ever ran.
  const sinceFirst = Number.isFinite(firstEver)
    ? Math.round((Date.parse(`${vnDayKey(now)}T00:00:00Z`) - Date.parse(`${vnDayKey(firstEver)}T00:00:00Z`)) / DAY) + 1
    : 1;
  const chartDays = Math.max(1, Math.min(rangeDays ?? 14, 14, sinceFirst));
  const byDay = Array.from({ length: chartDays }, (_, i) => {
    const key = vnDayKey(now - (chartDays - 1 - i) * DAY);
    return { key, found: 0, drafted: 0, checks: 0 };
  });
  const dayIndex = new Map(byDay.map((d, i) => [d.key, i]));
  for (const b of batches) {
    const i = dayIndex.get(vnDayKey(Date.parse(b.ran_at)));
    if (i === undefined) continue;
    byDay[i].checks += 1;
    byDay[i].found += Number(b.jobs_found ?? 0);
  }
  const dayOfBatch = new Map(batches.map((b) => [b.id, vnDayKey(Date.parse(b.ran_at))]));
  for (const l of leads) {
    const i = dayIndex.get(dayOfBatch.get(l.batch_id) ?? "");
    if (i !== undefined) byDay[i].drafted += 1;
  }

  // Is the fit score right? Of the jobs sếp has looked at, how many he kept, per score.
  const byScore = [5, 4, 3].map((score) => {
    const at = ls.filter((l) => Number(l.fit_score) === score);
    const reviewedAt = at.filter((l) => l.status !== "pending");
    const keptAt = reviewedAt.filter((l) => KEPT.includes(l.status)).length;
    return { score, drafted: at.length, reviewed: reviewedAt.length, kept: keptAt, keptRate: rate(keptAt, reviewedAt.length) };
  });

  const templateMap = new Map<string, { sent: number; replied: number }>();
  for (const l of ls) {
    if (!l.template_name || !SENT.includes(l.status)) continue;
    const t = templateMap.get(l.template_name) ?? { sent: 0, replied: 0 };
    t.sent += 1;
    if (REPLIED.includes(l.status)) t.replied += 1;
    templateMap.set(l.template_name, t);
  }

  return {
    checks: inRange.length,
    expectedChecks,
    uptime: rate(inRange.length, expectedChecks),
    found,
    drafted,
    pending: count("pending"),
    kept,
    rejected,
    sent,
    replied,
    hired: count("hired"),
    // Of the jobs in the emails, the share worth a proposal.
    fitRate: rate(drafted, found),
    // Of the proposals sếp has decided on, the share he kept — how good the picking is.
    keptRate: rate(kept, kept + rejected),
    replyRate: rate(replied, sent),
    funnel: [
      { label: "Job trong email", value: found },
      { label: "Hợp SOP", value: drafted },
      { label: "Sếp duyệt", value: kept },
      { label: "Đã gửi", value: sent },
      { label: "Khách trả lời", value: replied },
      { label: "Chốt hợp đồng", value: count("hired") },
    ],
    byDay,
    byScore,
    templates: [...templateMap.entries()].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.sent - a.sent),
  };
}

export type UpworkStats = ReturnType<typeof upworkStats>;
