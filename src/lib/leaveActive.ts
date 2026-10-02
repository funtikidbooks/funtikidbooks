import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/constants/attendance";
import { LEAVE_SELECT } from "@/lib/leave";
import type { Database, LeaveRequest } from "@/lib/types";

// What the workspace top bar (LeaveTopBar) works from: every request still
// waiting, leave not over yet, and decisions from the last two weeks. RLS
// keeps it to the person's own unless they're a Giám đốc or PM, who get
// everyone's (their "Chờ duyệt" inbox). Shared by the layout's first render
// and the browser's live refresh.
export async function fetchActiveLeave(supabase: SupabaseClient<Database>, today: string): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select(LEAVE_SELECT)
    .neq("status", "cancelled")
    .or(`status.eq.pending,end_date.gte.${today},decided_at.gte.${addDays(today, -14)}`)
    .order("start_date", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as LeaveRequest[];
}
