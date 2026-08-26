"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { markConversationRead } from "@/lib/actions/messages";
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

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
