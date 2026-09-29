// Tìm khách (Upwork) → Hiệu quả → Yêu cầu đầu vào: the numbers sếp sets
// for which jobs are worth a proposal at all. The hourly run is told them
// (they ride along in the SOP it reads) and scripts/upwork-night.mjs
// enforces them again on what it's handed, so a job below them never
// reaches the page. The page also runs them over past jobs to preview.
// Pure — shared by the page, the script and tests/calculations.test.mjs.

export type UpworkFilters = {
  // USD; "" = no floor. Kept as text so "1,500" or "$300" read naturally.
  minFixedBudget: string;
  minHourlyRate: string;
  // Only jobs scored at least this many stars (1–5) get a proposal.
  minFitScore: number;
  // A job whose email shows no budget: still draft it, or skip it.
  noBudget: "keep" | "skip";
  // Comma-separated; a job whose title has any of them is skipped.
  excludeKeywords: string;
};

export const DEFAULT_UPWORK_FILTERS: UpworkFilters = {
  minFixedBudget: "",
  minHourlyRate: "",
  minFitScore: 3,
  noBudget: "keep",
  excludeKeywords: "",
};

export function normalizeFilters(raw: unknown): UpworkFilters {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const score = Math.round(Number(src.minFitScore));
  return {
    minFixedBudget: text(src.minFixedBudget, 20),
    minHourlyRate: text(src.minHourlyRate, 20),
    minFitScore: score >= 1 && score <= 5 ? score : DEFAULT_UPWORK_FILTERS.minFitScore,
    noBudget: src.noBudget === "skip" ? "skip" : "keep",
    excludeKeywords: text(src.excludeKeywords, 500),
  };
}

const money = (text: string) => {
  const digits = String(text ?? "").replace(/[^0-9.]/g, "");
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

// "$1,500 fixed · Intermediate" → fixed 1500; "$25–40/hr" → hourly 25–40;
// "Hourly: $15.00 - $30.00" → hourly 15–30; nothing in dollars → no budget.
export function parseBudget(text: string | null | undefined): { type: "fixed" | "hourly" | null; min: number | null; max: number | null } {
  const t = String(text ?? "");
  const amounts = [...t.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?/gi)].map((m) => Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1));
  // "$25–40/hr": the second number of a range often has no "$" of its own.
  const tail = /\$\s?\d[\d,.]*\s*[-–—]\s*(\d[\d,]*(?:\.\d+)?)/.exec(t);
  if (tail && amounts.length === 1) amounts.push(Number(tail[1].replace(/,/g, "")));
  const valid = amounts.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0) return { type: null, min: null, max: null };
  const hourly = /\/\s*h(ou)?r|hourly|per hour|\/giờ|theo giờ/i.test(t);
  return { type: hourly ? "hourly" : "fixed", min: Math.min(...valid), max: Math.max(...valid) };
}

export const keywordsOf = (text: string) =>
  text
    .split(/[,;\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 2);

export type FilterJob = { job_title: string; budget_text?: string | null; fit_score?: number | null };

// Why a job falls short of sếp's numbers, or null when it passes. A job
// with no score yet (older leads) isn't judged on stars.
export function filterReason(job: FilterJob, f: UpworkFilters): string | null {
  const title = job.job_title.toLowerCase();
  const hit = keywordsOf(f.excludeKeywords).find((k) => title.includes(k));
  if (hit) return `có từ "${hit}"`;
  if (job.fit_score != null && job.fit_score < f.minFitScore) return `dưới ${f.minFitScore}★`;
  const b = parseBudget(job.budget_text);
  if (b.type === null) return f.noBudget === "skip" ? "chưa ghi ngân sách" : null;
  const top = b.max ?? b.min ?? 0;
  const minFixed = money(f.minFixedBudget);
  const minHourly = money(f.minHourlyRate);
  if (b.type === "fixed" && minFixed !== null && top < minFixed) return `ngân sách $${top} < $${minFixed}`;
  if (b.type === "hourly" && minHourly !== null && top < minHourly) return `$${top}/giờ < $${minHourly}/giờ`;
  return null;
}

// Run the numbers over past jobs: how many would still have made it, and
// the most common reasons the rest wouldn't.
export function previewFilters(jobs: FilterJob[], f: UpworkFilters) {
  const reasons = new Map<string, number>();
  let kept = 0;
  for (const j of jobs) {
    const r = filterReason(j, f);
    if (r === null) kept += 1;
    else {
      const kind = r.startsWith("có từ") ? r : r.startsWith("dưới") ? r : r.startsWith("chưa") ? r : r.includes("/giờ") ? "giá theo giờ thấp" : "ngân sách thấp";
      reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
    }
  }
  return {
    total: jobs.length,
    kept,
    dropped: jobs.length - kept,
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
