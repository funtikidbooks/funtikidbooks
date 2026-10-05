"use server";

import { requireUser } from "@/lib/supabase/server";
import { fetchAnalyticsOverview, type AnalyticsOverview } from "@/lib/analyticsData";

export type { AnalyticsOverview, TrafficBucket } from "@/lib/analyticsData";

// Moved out of /quan-tri into the general workspace ("Dự án" section) per
// sếp Phúc — any signed-in staff account can see traffic numbers now, not
// just director/admin. Still requires a real session, just no role check.
export async function getAnalyticsOverview(range: { start: string; end: string }): Promise<AnalyticsOverview> {
  await requireUser();
  return fetchAnalyticsOverview(range);
}
