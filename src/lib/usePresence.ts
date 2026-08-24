"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Tracks who's currently signed into the workspace via a Supabase Realtime
// Presence channel — everyone who mounts this hook "checks in" under their
// own user id, and the returned set updates live as people join/leave.
export function usePresence(userId: string) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("workspace-presence", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return onlineIds;
}
