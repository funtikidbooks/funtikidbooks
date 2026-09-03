import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { MeetingHub } from "@/components/workspace/MeetingHub";
import { getDmTabLabel, listChannels } from "@/lib/actions/meetings";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Trò chuyện & họp" };

export default async function MeetingPage() {
  // The parent layout already redirects an unauthenticated visitor away
  // before this ever renders — requireUser() here just reuses that same
  // per-request-cached auth check (see its comment in lib/supabase/server.ts)
  // instead of re-verifying the JWT against Supabase's auth server again.
  const { supabase, user } = await requireUser();

  const [channels, { data: profiles }, dmTabLabel] = await Promise.all([
    listChannels(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at"),
    getDmTabLabel().catch(() => "Riêng"),
  ]);

  const me = (profiles ?? []).find((p) => p.id === user?.id);

  return (
    <MeetingHub
      currentUser={{ id: user?.id ?? "", display_name: me?.display_name ?? user?.email ?? "Bạn" }}
      profiles={(profiles ?? []) as Profile[]}
      initialChannels={channels}
      initialDmTabLabel={dmTabLabel}
    />
  );
}
