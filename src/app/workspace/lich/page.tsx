import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { CalendarView } from "@/components/workspace/CalendarView";
import { listCalendarEvents } from "@/lib/actions/calendar";

export const metadata: Metadata = { title: "Lịch" };

export default async function CalendarPage() {
  const { supabase, user } = await requireUser();

  const [events, { data: me }] = await Promise.all([
    listCalendarEvents(),
    supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <CalendarView
      currentUserId={user.id}
      isDirector={me?.access_role === "director"}
      initialEvents={events}
    />
  );
}
