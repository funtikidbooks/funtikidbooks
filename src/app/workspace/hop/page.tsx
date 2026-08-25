import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MeetingHub } from "@/components/workspace/MeetingHub";
import { listChannels } from "@/lib/actions/meetings";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Họp" };

export default async function MeetingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [channels, { data: profiles }] = await Promise.all([
    listChannels(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at"),
  ]);

  const me = (profiles ?? []).find((p) => p.id === user?.id);

  return (
    <MeetingHub
      currentUser={{ id: user?.id ?? "", display_name: me?.display_name ?? user?.email ?? "Bạn" }}
      profiles={(profiles ?? []) as Profile[]}
      initialChannels={channels}
    />
  );
}
