"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Tracks who's currently signed into the workspace via a Supabase Realtime
// Presence channel. Multiple components (Sidebar, the topbar badge, ...) all
// call this hook, and Supabase's browser client is a singleton — calling
// `.channel("workspace-presence")` a second time returns the *same* channel
// object, so a second `.on(...)` after it's already subscribed throws. To
// avoid that, only the first mounted consumer opens the channel; everyone
// else just subscribes to its broadcasts via this in-module listener set.
let sharedChannel: RealtimeChannel | null = null;
let sharedOnlineIds = new Set<string>();
const listeners = new Set<(ids: Set<string>) => void>();
let refCount = 0;

function ensureChannel(userId: string) {
  if (sharedChannel) return;
  const supabase = createClient();
  const channel = supabase.channel("workspace-presence", {
    config: { presence: { key: userId } },
  });
  sharedChannel = channel;

  channel
    .on("presence", { event: "sync" }, () => {
      sharedOnlineIds = new Set(Object.keys(channel.presenceState()));
      listeners.forEach((notify) => notify(sharedOnlineIds));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ online_at: new Date().toISOString() });
      }
    });
}

export function usePresence(userId: string) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(sharedOnlineIds);

  useEffect(() => {
    refCount += 1;
    ensureChannel(userId);
    listeners.add(setOnlineIds);

    return () => {
      listeners.delete(setOnlineIds);
      refCount -= 1;
      if (refCount === 0 && sharedChannel) {
        createClient().removeChannel(sharedChannel);
        sharedChannel = null;
        sharedOnlineIds = new Set();
      }
    };
  }, [userId]);

  return onlineIds;
}
