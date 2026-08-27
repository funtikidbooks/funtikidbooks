"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type CallParticipant = { id: string; display_name: string };

// One Supabase Realtime presence channel per room/DM call, shared across
// every hook consumer for that same key (VideoCallModal announcing "I'm in
// this call" and any chat view just watching for a banner) — calling
// `.channel(name)` twice for the same name returns the same object, and
// subscribing an already-subscribed channel again throws, so bookkeeping
// here (refCount, subscribed, pendingTrack) makes sure only the first
// consumer ever subscribes and everyone else just reuses it.
type Entry = {
  channel: RealtimeChannel;
  participants: CallParticipant[];
  listeners: Set<() => void>;
  refCount: number;
  subscribed: boolean;
  pendingTrack: CallParticipant | null;
};

const entries = new Map<string, Entry>();
const EMPTY: CallParticipant[] = [];

function ensureEntry(roomKey: string): Entry {
  const existing = entries.get(roomKey);
  if (existing) return existing;

  const supabase = createClient();
  const channel = supabase.channel(`call-${roomKey}`, {
    config: { presence: { key: crypto.randomUUID() } },
  });
  const entry: Entry = {
    channel,
    participants: EMPTY,
    listeners: new Set(),
    refCount: 0,
    subscribed: false,
    pendingTrack: null,
  };
  entries.set(roomKey, entry);

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<CallParticipant>();
      entry.participants = Object.values(state).flat();
      entry.listeners.forEach((notify) => notify());
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        entry.subscribed = true;
        if (entry.pendingTrack) channel.track(entry.pendingTrack);
      }
    });

  return entry;
}

function releaseEntry(roomKey: string, entry: Entry) {
  entry.refCount -= 1;
  if (entry.refCount === 0) {
    createClient().removeChannel(entry.channel);
    entries.delete(roomKey);
  }
}

// Pass `trackAs` only from the component that's actually in the call (the
// video call modal) — everything else (a room's chat header, a DM's header)
// should call this with no second argument, purely to watch for a banner.
export function useCallPresence(roomKey: string | null, trackAs?: CallParticipant): CallParticipant[] {
  const trackAsId = trackAs?.id;
  const trackAsName = trackAs?.display_name;

  // Announcing "I'm on this call" is a pure side effect on the external
  // Realtime channel, not React state — a plain effect, no setState involved.
  useEffect(() => {
    if (!roomKey || !trackAsId || !trackAsName) return;
    const entry = ensureEntry(roomKey);
    const me = { id: trackAsId, display_name: trackAsName };
    entry.pendingTrack = me;
    if (entry.subscribed) entry.channel.track(me);
    return () => {
      entry.pendingTrack = null;
      if (entry.subscribed) entry.channel.untrack();
    };
  }, [roomKey, trackAsId, trackAsName]);

  // subscribe/getSnapshot must stay referentially stable across renders —
  // useSyncExternalStore resubscribes whenever either identity changes, and
  // since subscribing here has the side effect of creating/ref-counting the
  // shared channel, a fresh closure every render was tearing the channel
  // down and recreating it in a loop instead of ever settling on one.
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!roomKey) return () => {};
      const entry = ensureEntry(roomKey);
      entry.refCount += 1;
      entry.listeners.add(callback);
      return () => {
        entry.listeners.delete(callback);
        releaseEntry(roomKey, entry);
      };
    },
    [roomKey],
  );
  const getSnapshot = useCallback(
    () => (roomKey ? (entries.get(roomKey)?.participants ?? EMPTY) : EMPTY),
    [roomKey],
  );

  // The list of who's currently on the call is external state (Supabase
  // Realtime presence), so it's read via useSyncExternalStore rather than
  // mirrored into a useState — same reasoning as useTheme.ts's DOM read.
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
