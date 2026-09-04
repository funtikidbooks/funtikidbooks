import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { MeetingHub } from "@/components/workspace/MeetingHub";
import { getDmTabLabel, getRoomSync, listChannels } from "@/lib/actions/meetings";
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

  // Same default-room lookup MeetingHub's own useState initializer runs
  // client-side — mirrored here (not passed down as "the" answer some other
  // way) so a mismatch between the two would show up as a real bug rather
  // than silently prefetching the wrong room. Pre-fetching this room's first
  // page here means the very first paint already has real messages instead
  // of an empty list while the client makes its own round trip — the client
  // still re-syncs on mount, but as a cheap delta off this data rather than
  // a full fetch from nothing. Failure here just means MeetingHub falls back
  // to fetching everything itself, same as before this existed.
  const generalRoomId = channels.find((c) => c.is_general)?.id ?? channels[0]?.id ?? null;
  const initialRoomSync = generalRoomId ? await getRoomSync(generalRoomId).catch(() => null) : null;

  return (
    <MeetingHub
      currentUser={{ id: user?.id ?? "", display_name: me?.display_name ?? user?.email ?? "Bạn" }}
      profiles={(profiles ?? []) as Profile[]}
      initialChannels={channels}
      initialDmTabLabel={dmTabLabel}
      initialRoomId={initialRoomSync ? generalRoomId : null}
      initialMessages={initialRoomSync?.messages}
      initialReactions={initialRoomSync?.reactions}
      initialReads={initialRoomSync?.reads}
      initialPinnedMessages={initialRoomSync?.pinnedMessages}
    />
  );
}
