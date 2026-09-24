"use server";

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { requireUser } from "@/lib/supabase/server";

// Moved out of /quan-tri into the general workspace ("Dự án" section) per
// sếp Phúc — any signed-in staff account can see traffic numbers now, not
// just director/admin. Still requires a real session, just no role check.
async function requireStaff() {
  await requireUser();
}

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

export type AnalyticsOverview = {
  activeNow: number;
  last7Days: { date: string; sessions: number; users: number; pageViews: number }[];
  topPages: { path: string; views: number }[];
  channels: { channel: string; sessions: number }[];
};

function dv(row: { dimensionValues?: { value?: string | null }[] | null }, i = 0): string {
  return row.dimensionValues?.[i]?.value ?? "";
}
function mv(row: { metricValues?: { value?: string | null }[] | null }, i = 0): number {
  return Number(row.metricValues?.[i]?.value ?? 0);
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  await requireStaff();

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("Chưa cấu hình GA4_PROPERTY_ID.");
  const client = getClient();
  const property = `properties/${propertyId}`;

  const [[realtimeResp], [dailyResp], [pagesResp], [channelsResp]] = await Promise.all([
    client.runRealtimeReport({ property, metrics: [{ name: "activeUsers" }] }),
    client.runReport({
      property,
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    client.runReport({
      property,
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 6,
    }),
    client.runReport({
      property,
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }),
  ]);

  const activeNow = Number(realtimeResp.rows?.[0]?.metricValues?.[0]?.value ?? 0);

  const last7Days = (dailyResp.rows ?? []).map((row) => {
    const raw = dv(row); // YYYYMMDD
    const date = `${raw.slice(6, 8)}/${raw.slice(4, 6)}`;
    return { date, sessions: mv(row, 0), users: mv(row, 1), pageViews: mv(row, 2) };
  });

  const topPages = (pagesResp.rows ?? []).map((row) => ({ path: dv(row) || "/", views: mv(row) }));

  const channels = (channelsResp.rows ?? []).map((row) => {
    const raw = dv(row);
    return { channel: CHANNEL_LABELS[raw] ?? (raw || "Chưa xác định"), sessions: mv(row) };
  });

  return { activeNow, last7Days, topPages, channels };
}
