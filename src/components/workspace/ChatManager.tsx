"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadCounts, markConversationRead } from "@/lib/actions/messages";
import { getUnreadMeetingCounts } from "@/lib/actions/meetings";
import type { DirectMessage, MeetingMessage, Profile } from "@/lib/types";

type ChatManagerValue = {
  openChats: Profile[];
  openChat: (profile: Profile) => void;
  closeChat: (profileId: string) => void;
  // Clears a DM sender's unread badge + marks it read server-side, without
  // opening the floating ChatWindow — used by the embedded "Riêng" panel in
  // Trò chuyện & họp, which shows the conversation inline instead.
  clearDmUnread: (profileId: string) => void;
  unreadCounts: Record<string, number>;
  meetingUnreadCounts: Record<string, number>;
  setActiveMeetingChannel: (channelId: string | null) => void;
  totalUnreadCount: number;
  // Sender ids in "most recently messaged me" order, for the Messenger-style
  // dropdown to bubble a conversation to the top the moment a DM arrives.
  recentSenderOrder: string[];
  // Rows patched by the profiles-realtime subscription below, keyed by id —
  // profiles is otherwise a static array fetched once server-side and handed
  // down as a prop, so a colleague changing their name/avatar mid-session
  // would sit stale everywhere it's shown until a reload. See useLiveProfiles.
  profileOverrides: Record<string, Profile>;
};

const ChatManagerContext = createContext<ChatManagerValue | null>(null);

export function ChatManagerProvider({
  currentUserId,
  initialUnreadCounts = {},
  children,
}: {
  currentUserId: string;
  initialUnreadCounts?: Record<string, number>;
  children: React.ReactNode;
}) {
  const [openChats, setOpenChats] = useState<Profile[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(initialUnreadCounts);
  const [meetingUnreadCounts, setMeetingUnreadCounts] = useState<Record<string, number>>({});
  const [recentSenderOrder, setRecentSenderOrder] = useState<string[]>([]);
  const [profileOverrides, setProfileOverrides] = useState<Record<string, Profile>>({});
  // Mirrors openChats without forcing the realtime effect below to
  // re-subscribe every time a chat window opens or closes.
  const openChatIdsRef = useRef<Set<string>>(new Set());
  // Whichever "Trò chuyện & họp" room MeetingHub currently has open, if any
  // — a message arriving there shouldn't bump the tab badge since the user
  // is already looking at it (MeetingHub reports this via
  // setActiveMeetingChannel whenever its own activeId changes).
  const activeMeetingChannelIdRef = useRef<string | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    openChatIdsRef.current = new Set(openChats.map((p) => p.id));
  }, [openChats]);

  useEffect(() => {
    notificationAudioRef.current = new Audio("/sounds/dm-message.mp3");
  }, []);

  const clearDmUnread = useCallback((profileId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[profileId]) return prev;
      const next = { ...prev };
      delete next[profileId];
      return next;
    });
    markConversationRead(profileId).catch(() => {});
  }, []);

  const openChat = useCallback(
    (profile: Profile) => {
      setOpenChats((prev) => (prev.some((p) => p.id === profile.id) ? prev : [...prev, profile]));
      clearDmUnread(profile.id);
    },
    [clearDmUnread],
  );

  const closeChat = useCallback((profileId: string) => {
    setOpenChats((prev) => prev.filter((p) => p.id !== profileId));
  }, []);

  const setActiveMeetingChannel = useCallback((channelId: string | null) => {
    activeMeetingChannelIdRef.current = channelId;
    if (!channelId) return;
    setMeetingUnreadCounts((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  }, []);

  // Re-fetches both unread counts from the server and replaces local state
  // wholesale — the source of truth (dm_reads / meeting_channel_reads)
  // already reflects any conversation the user has actually opened, so this
  // is safe to just overwrite with, no merging needed. Exists because the
  // realtime subscription below can silently miss messages sent while the
  // websocket was disconnected (phone screen locked, tab backgrounded, a
  // network blip...) — staff reported only ever seeing a new-message badge
  // after reloading the page, which is exactly that gap. Called on tab
  // focus/visibility and whenever the realtime channel (re)subscribes.
  const resync = useCallback(async () => {
    const [dm, meeting] = await Promise.all([
      getUnreadCounts().catch(() => null),
      getUnreadMeetingCounts().catch(() => null),
    ]);
    if (dm) {
      for (const id of openChatIdsRef.current) delete dm[id];
      setUnreadCounts(dm);
    }
    if (meeting) {
      if (activeMeetingChannelIdRef.current) delete meeting[activeMeetingChannelIdRef.current];
      setMeetingUnreadCounts(meeting);
    }
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") resync();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", resync);
    };
  }, [resync]);

  // Global inbox subscription — separate from each ChatWindow's own
  // conversation subscription, so a badge shows up even for teammates whose
  // chat window isn't currently open.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dm-inbox-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as DirectMessage;
          // Plays for every incoming DM regardless of whether that chat
          // window happens to be open — this is the one subscription that
          // sees all of them, unlike each ChatWindow's own per-conversation
          // subscription.
          const audio = notificationAudioRef.current;
          if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }
          setRecentSenderOrder((prev) => [row.sender_id, ...prev.filter((id) => id !== row.sender_id)]);
          if (openChatIdsRef.current.has(row.sender_id)) return;
          setUnreadCounts((prev) => ({ ...prev, [row.sender_id]: (prev[row.sender_id] ?? 0) + 1 }));
        },
      )
      // No channel_id filter — Realtime enforces the same "member of the
      // room, or it's #Chung" RLS select policy as a normal query, so this
      // naturally only ever sees rooms this user is actually in.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages" },
        (payload) => {
          const row = payload.new as MeetingMessage;
          if (row.sender_id === currentUserId) return;
          if (row.channel_id === activeMeetingChannelIdRef.current) return;
          setMeetingUnreadCounts((prev) => ({ ...prev, [row.channel_id]: (prev[row.channel_id] ?? 0) + 1 }));
        },
      )
      // Fires with "SUBSCRIBED" both on the initial connect and after any
      // reconnect — resyncing here is what catches up on messages that
      // arrived during a drop, since Realtime doesn't replay missed events.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resync();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, resync]);

  // Global — everyone's profile card, message sender labels, and DM roster
  // read from this, so it's one subscription here rather than duplicated in
  // every component that takes a `profiles` prop.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("profiles-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new as Profile;
        setProfileOverrides((prev) => ({ ...prev, [row.id]: row }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalUnreadCount = useMemo(() => {
    const dmTotal = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
    const meetingTotal = Object.values(meetingUnreadCounts).reduce((sum, n) => sum + n, 0);
    return dmTotal + meetingTotal;
  }, [unreadCounts, meetingUnreadCounts]);

  return (
    <ChatManagerContext.Provider
      value={{
        openChats,
        openChat,
        closeChat,
        clearDmUnread,
        unreadCounts,
        meetingUnreadCounts,
        setActiveMeetingChannel,
        totalUnreadCount,
        recentSenderOrder,
        profileOverrides,
      }}
    >
      {children}
    </ChatManagerContext.Provider>
  );
}

export function useChatManager() {
  const ctx = useContext(ChatManagerContext);
  if (!ctx) throw new Error("useChatManager must be used within ChatManagerProvider");
  return ctx;
}

// Patches a server-fetched `profiles` array with any live updates a
// colleague has made since — a display name or avatar change shows up
// immediately everywhere instead of only after a reload. Returns the same
// array reference when nothing's changed, so it's safe to feed straight
// into a component's existing profiles-derived useMemo calls.
export function useLiveProfiles(baseProfiles: Profile[]): Profile[] {
  const { profileOverrides } = useChatManager();
  return useMemo(() => {
    if (Object.keys(profileOverrides).length === 0) return baseProfiles;
    let changed = false;
    const next = baseProfiles.map((p) => {
      const override = profileOverrides[p.id];
      if (!override) return p;
      changed = true;
      return override;
    });
    return changed ? next : baseProfiles;
  }, [baseProfiles, profileOverrides]);
}
