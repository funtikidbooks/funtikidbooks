"use server";

import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, mondayOf, vnToday } from "@/lib/constants/attendance";
import { isArchiveColumnTitle } from "@/lib/boardTools";
import { buildPm, type PmData, type PmHour, type PmPerson, type PmRoom, type PmTask } from "@/lib/pmMath";

// Quản trị → Quản lý dự án. Director or the Project Manager only (the same
// people who manage the rooms); read with the service role once that's been
// checked, since the page sums up every project room, not just the ones the
// viewer happens to be in.
export async function getPmData(): Promise<PmData> {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director" && me?.role !== "Project Manager") throw new Error("Chỉ Giám đốc và PM xem được trang này.");

  const admin = createAdminClient();
  const today = vnToday();
  const weekStart = mondayOf(today);
  const [{ data: rooms }, { data: members }, { data: people }, { data: tasks }, { data: hours }] = await Promise.all([
    admin.from("meeting_channels").select("*"),
    admin.from("meeting_channel_members").select("channel_id, profile_id"),
    admin.from("profiles").select("id, display_name, role, avatar_url, access_role"),
    admin.from("tasks").select("*, column:board_columns(title)"),
    admin.from("hour_reports").select("profile_id, project_channel_id, work_date, hours, minutes").gte("work_date", addDays(weekStart, -7)),
  ]);

  type RoomRow = PmRoom & { is_general: boolean; is_food_room?: boolean; closed_at?: string | null; parent_channel_id?: string | null };
  const projectRooms: PmRoom[] = ((rooms ?? []) as unknown as RoomRow[])
    .filter((r) => !r.is_general && !r.is_food_room && !r.closed_at)
    .map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      billing_type: r.billing_type ?? null,
      weekly_hour_cap: r.weekly_hour_cap ?? null,
      last_message_at: r.last_message_at ?? null,
      created_at: r.created_at,
      memberIds: (members ?? []).filter((m) => m.channel_id === r.id).map((m) => m.profile_id as string),
    }));

  // The artists: everyone but the director(s) and the PM, who sit in every room.
  const staff: PmPerson[] = ((people ?? []) as { id: string; display_name: string; role: string | null; avatar_url: string | null; access_role: string }[])
    .filter((p) => p.access_role !== "director" && p.role !== "Project Manager")
    .map((p) => ({ id: p.id, display_name: p.display_name, role: p.role, avatar_url: p.avatar_url }));

  const boardTasks: PmTask[] = ((tasks ?? []) as unknown as {
    id: string;
    code: string;
    title: string;
    due_date: string | null;
    due_complete?: boolean;
    created_at: string;
    column: { title: string } | null;
  }[])
    .filter((t) => t.column && !isArchiveColumnTitle(t.column.title))
    .map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      column_title: t.column?.title ?? "",
      due_date: t.due_date,
      due_complete: !!t.due_complete,
      created_at: t.created_at,
    }));

  return {
    today,
    weekStart,
    ...buildPm({ today, weekStart, rooms: projectRooms, tasks: boardTasks, staff, hours: (hours ?? []) as PmHour[] }),
  };
}
