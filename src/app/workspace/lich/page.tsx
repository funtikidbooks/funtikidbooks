import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "@/components/workspace/CalendarView";
import { listCalendarEvents } from "@/lib/actions/calendar";

export const metadata: Metadata = { title: "Lịch" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [events, { data: me }] = await Promise.all([
    listCalendarEvents(),
    user
      ? supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <CalendarView
      currentUserId={user?.id ?? ""}
      isDirector={me?.access_role === "director"}
      initialEvents={events}
    />
  );
}
