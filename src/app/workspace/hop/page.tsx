import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { MeetingHub } from "@/components/workspace/MeetingHub";
import { HydrationProbe } from "@/components/workspace/HydrationProbe";
import { getDmTabLabel, getGeneralChannelId, getRoomSync, listChannels } from "@/lib/actions/meetings";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Trò chuyện & họp" };

// ?room=<id> / ?dm=<peerId>[&call=1] — where a notification, the corner
// popup or Danh bạ's call button wants to land.
type OpenParams = { room?: string | string[]; dm?: string | string[]; call?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MeetingPage({ searchParams }: { searchParams: Promise<OpenParams> }) {
  const sp = await searchParams;
  const askedRoom = one(sp.room);
  const askedDm = one(sp.dm);
  // The parent layout already redirects an unauthenticated visitor away
  // before this ever renders — requireUser() here just reuses that same
  // per-request-cached auth check (see its comment in lib/supabase/server.ts)
  // instead of re-verifying the JWT against Supabase's auth server again.
  const { supabase, user } = await requireUser();

  // getGeneralChannelId runs in this SAME batch — not chained after
  // listChannels() just to read its is_general id off the result — so
  // getRoomSync below only ever waits on one extra round trip, not two.
  // See getGeneralChannelId's own comment for why that mattered.
  // The general room's first page starts loading the moment its id is known,
  // alongside listChannels/profiles, instead of after all of them finish.
  const generalChannelIdPromise = getGeneralChannelId().catch(() => null);
  const generalSyncPromise = generalChannelIdPromise.then((id) => (id ? getRoomSync(id).catch(() => null) : null));
  // The room a link asks for starts loading in the same batch too, so a
  // notification opens on that room's messages with no extra wait.
  const askedSyncPromise = askedRoom && UUID.test(askedRoom) ? getRoomSync(askedRoom).catch(() => null) : Promise.resolve(null);
  const [channels, { data: profiles }, dmTabLabel, generalChannelId, generalSync, askedSync] = await Promise.all([
    listChannels(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at"),
    getDmTabLabel().catch(() => "Riêng"),
    generalChannelIdPromise,
    generalSyncPromise,
    askedSyncPromise,
  ]);
  const openRoomId = askedRoom && channels.some((c) => c.id === askedRoom) ? askedRoom : null;
  const openDmPeerId = askedDm && UUID.test(askedDm) ? askedDm : null;

  const me = (profiles ?? []).find((p) => p.id === user?.id);

  // Same default-room lookup MeetingHub's own useState initializer runs
  // client-side — mirrored here (not passed down as "the" answer some other
  // way) so a mismatch between the two would show up as a real bug rather
  // than silently prefetching the wrong room. Pre-fetching this room's first
  // page here means the very first paint already has real messages instead
  // of an empty list while the client makes its own round trip — the client
  // still re-syncs on mount, but as a cheap delta off this data rather than
  // a full fetch from nothing. Failure here just means MeetingHub falls back
  // to fetching everything itself, same as before this existed. Falls back
  // to channels[0] only if getGeneralChannelId itself failed/returned null.
  const generalRoomId = generalChannelId ?? channels.find((c) => c.is_general)?.id ?? channels[0]?.id ?? null;
  const firstRoomId = openRoomId ?? generalRoomId;
  const initialRoomSync =
    openRoomId && askedSync
      ? askedSync
      : generalChannelId && generalRoomId === generalChannelId
        ? generalSync
        : generalRoomId
          ? await getRoomSync(generalRoomId).catch(() => null)
          : null;

  return (
    <>
      <MeetingHub
        currentUser={{ id: user?.id ?? "", display_name: me?.display_name ?? user?.email ?? "Bạn" }}
        profiles={(profiles ?? []) as Profile[]}
        initialChannels={channels}
        initialDmTabLabel={dmTabLabel}
        initialRoomId={initialRoomSync ? (openRoomId && askedSync ? firstRoomId : generalRoomId) : null}
        initialMessages={initialRoomSync?.messages}
        initialReactions={initialRoomSync?.reactions}
        initialReads={initialRoomSync?.reads}
        initialPinnedMessages={initialRoomSync?.pinnedMessages}
        openRoomId={openRoomId}
        openDmPeerId={openDmPeerId}
        openAutoCall={one(sp.call) === "1"}
      />
      <HydrationProbe />
    </>
  );
}
