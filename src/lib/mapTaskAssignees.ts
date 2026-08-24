import type { Profile } from "@/lib/types";

type RawAssigneeRow = { profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null };

// Supabase's nested select for task_assignees(profile:profiles(...)) comes
// back as [{ profile: {...} }, ...] — flatten to the plain profile list the
// UI actually wants, dropping any row whose profile failed to join.
export function mapTaskAssignees(raw: unknown): Pick<Profile, "id" | "display_name" | "avatar_url">[] {
  return ((raw ?? []) as RawAssigneeRow[])
    .map((row) => row.profile)
    .filter((p): p is Pick<Profile, "id" | "display_name" | "avatar_url"> => p !== null);
}
