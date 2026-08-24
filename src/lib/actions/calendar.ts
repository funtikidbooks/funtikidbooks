"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, EventCategory } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_events").select("*").order("start_at", { ascending: true });
  return (data ?? []) as CalendarEvent[];
}

export async function createCalendarEvent(input: {
  title: string;
  note?: string;
  category: EventCategory;
  startAt: string;
  allDay: boolean;
}): Promise<CalendarEvent> {
  const { supabase, user } = await requireUser();

  const title = input.title.trim();
  if (!title) throw new Error("Vui lòng nhập tên sự kiện.");
  if (!input.startAt || Number.isNaN(Date.parse(input.startAt))) throw new Error("Ngày giờ không hợp lệ.");

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title,
      note: input.note?.trim() || null,
      category: input.category,
      start_at: input.startAt,
      all_day: input.allDay,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo sự kiện. Vui lòng thử lại.");
  revalidatePath("/workspace/lich");
  return data as CalendarEvent;
}

export async function updateCalendarEvent(
  id: string,
  patch: { title?: string; note?: string; category?: EventCategory; startAt?: string; allDay?: boolean },
): Promise<CalendarEvent> {
  const { supabase } = await requireUser();

  const update: Partial<CalendarEvent> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("Vui lòng nhập tên sự kiện.");
    update.title = title;
  }
  if (patch.note !== undefined) update.note = patch.note.trim() || null;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.startAt !== undefined) {
    if (Number.isNaN(Date.parse(patch.startAt))) throw new Error("Ngày giờ không hợp lệ.");
    update.start_at = patch.startAt;
  }
  if (patch.allDay !== undefined) update.all_day = patch.allDay;

  const { data, error } = await supabase.from("calendar_events").update(update).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể cập nhật sự kiện (có thể bạn không có quyền sửa).");
  revalidatePath("/workspace/lich");
  return data as CalendarEvent;
}

export async function deleteCalendarEvent(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw new Error("Không thể xoá sự kiện (có thể bạn không có quyền xoá).");
  revalidatePath("/workspace/lich");
}
