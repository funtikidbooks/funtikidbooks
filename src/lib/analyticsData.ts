import "server-only";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { ANALYTICS_START, bucketFrames, comparisonRanges, grainFor, isRealDate, type BucketFrame, type Grain } from "@/lib/analyticsRange";
import { vnToday } from "@/lib/constants/attendance";

// Reading Google Analytics for Lượt truy cập web. No sign-in check here —
// the page goes through getAnalyticsOverview (lib/actions/analytics.ts),
// which requires one.

// Service account funti-web-analytics@funti-kidbooks, granted "Viewer" on
// the GA4 property directly in Google Analytics (Admin → Property Access
// Management) — no Google Cloud IAM role needed for that part, just the
// Data API enabled on the project. See .env.local's own comment for how
// sếp Phúc set this up (2026-09-23/24).
function getClient() {
  const client_email = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!client_email || !rawKey) throw new Error("Chưa cấu hình Google Analytics (thiếu service account).");
  // A key pasted from the downloaded JSON file often keeps its `\n`s as the
  // two literal characters backslash+n (that's how JSON escapes a newline
  // inside a string) instead of a real line break — harmless in the JSON
  // file itself, but OpenSSL can't parse a PEM key on one line and fails
  // with "DECODER routines::unsupported". Vercel's env var UI doesn't
  // preserve real newlines reliably either, so this normalizes either form
  // back to real newlines regardless of how it was pasted.
  const private_key = rawKey.replace(/\\n/g, "\n");
  return new BetaAnalyticsDataClient({ credentials: { client_email, private_key } });
}

// GA4's own channel-group labels, translated — shown as-is otherwise (a
// channel Google adds later just falls back to its English name instead
// of breaking).
const CHANNEL_LABELS: Record<string, string> = {
  "Direct": "Truy cập trực tiếp",
  "Organic Search": "Tìm kiếm tự nhiên (Google...)",
  "Organic Social": "Mạng xã hội (tự nhiên)",
  "Paid Social": "Mạng xã hội (quảng cáo)",
  "Paid Search": "Quảng cáo tìm kiếm",
  "Referral": "Từ trang khác giới thiệu",
  "Email": "Email",
  "Display": "Quảng cáo hiển thị",
  "Unassigned": "Chưa xác định",
};

type Totals = { sessions: number; users: number; pageViews: number };

export type TrafficBucket = BucketFrame & Totals;

export type AnalyticsOverview = {
  activeNow: number;
  grain: Grain;
  // One bar per day / week / month of the span, empty ones included.
  buckets: TrafficBucket[];
  // Users counted once across the whole span — not the bars added up.
  totals: Totals;
  // "↑ x% so với kỳ trước": the span's whole days against as many days just
  // before them, when Google Analytics has all of those (comparisonRanges).
  comparison: { now: Totals; before: Totals; withoutToday: boolean } | null;
  topPages: { path: string; views: number; users: number }[];
  channels: { channel: string; sessions: number }[];
};

function dv(row: { dimensionValues?: { value?: string | null }[] | null }, i = 0): string {
  return row.dimensionValues?.[i]?.value ?? "";
}
function mv(row: { metricValues?: { value?: string | null }[] | null }, i = 0): number {
  return Number(row.metricValues?.[i]?.value ?? 0);
}

const TOTAL_METRICS = [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }];
const totalsOf = (row: { metricValues?: { value?: string | null }[] | null } | undefined): Totals =>
  row ? { sessions: mv(row, 0), users: mv(row, 1), pageViews: mv(row, 2) } : { sessions: 0, users: 0, pageViews: 0 };

// Lượt truy cập web for a span of days (VN dates, both included) — the page
// resolves ?ky= / ?tu=&den= into one (lib/analyticsRange.ts).
export async function fetchAnalyticsOverview(range: { start: string; end: string }): Promise<AnalyticsOverview> {
  // Same bounds as resolveRange, whoever the caller: real days, none before
  // Google started counting, none after today.
  const today = vnToday();
  if (!isRealDate(range.start) || !isRealDate(range.end)) throw new Error("Khoảng ngày không hợp lệ.");
  const start = range.start < ANALYTICS_START ? ANALYTICS_START : range.start;
  const end = range.end > today ? today : range.end;
  if (start > end) throw new Error("Khoảng ngày không hợp lệ.");

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("Chưa cấu hình GA4_PROPERTY_ID.");
  const client = getClient();
  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate: start, endDate: end }];

  const grain = grainFor(start, end);
  const bucketDimension = grain === "day" ? "date" : grain === "week" ? "isoYearIsoWeek" : "yearMonth";
  const compare = comparisonRanges(start, end, today);

  const [[realtimeResp], [seriesResp], [totalsResp], [pagesResp], [channelsResp]] = await Promise.all([
    client.runRealtimeReport({ property, metrics: [{ name: "activeUsers" }] }),
    // Grouped by Google itself, so a week's or month's "người" counts each
    // visitor once instead of once per day.
    client.runReport({ property, dateRanges, dimensions: [{ name: bucketDimension }], metrics: TOTAL_METRICS, limit: 1000 }),
    // The span, then the two sides of the comparison; with more than one
    // range each row is labelled date_range_0, _1, _2.
    client.runReport({
      property,
      dateRanges: compare
        ? [...dateRanges, { startDate: compare.current.start, endDate: compare.current.end }, { startDate: compare.previous.start, endDate: compare.previous.end }]
        : dateRanges,
      metrics: TOTAL_METRICS,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      // Users alongside views: a page with thousands of views from one
      // person is a stuck browser (see PortalContent's reload guard), not
      // real interest — showing both makes that obvious at a glance.
      metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 8,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
  ]);

  const activeNow = Number(realtimeResp.rows?.[0]?.metricValues?.[0]?.value ?? 0);

  const byKey = new Map((seriesResp.rows ?? []).map((row) => [dv(row), totalsOf(row)]));
  const buckets = bucketFrames(start, end, grain).map((frame) => ({ ...frame, ...totalsOf(undefined), ...byKey.get(frame.key) }));

  const totalRows = totalsResp.rows ?? [];
  const rangeRow = (i: number) => (compare ? totalRows.find((row) => dv(row) === `date_range_${i}`) : i === 0 ? totalRows[0] : undefined);
  const totals = totalsOf(rangeRow(0));
  const comparison = compare ? { now: totalsOf(rangeRow(1)), before: totalsOf(rangeRow(2)), withoutToday: compare.withoutToday } : null;

  const topPages = (pagesResp.rows ?? []).map((row) => ({ path: dv(row) || "/", views: mv(row, 0), users: mv(row, 1) }));

  const channels = (channelsResp.rows ?? []).map((row) => {
    const raw = dv(row);
    return { channel: CHANNEL_LABELS[raw] ?? (raw || "Chưa xác định"), sessions: mv(row) };
  });

  return { activeNow, grain, buckets, totals, comparison, topPages, channels };
}
