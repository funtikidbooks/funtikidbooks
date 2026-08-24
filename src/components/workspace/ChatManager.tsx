"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadCounts, markConversationRead } from "@/lib/actions/messages";
import { ensureNotificationPermission, showChatNotification } from "@/lib/browserNotify";
import type { DirectMessage, Profile } from "@/lib/types";

type ChatManagerValue = {
  openChats: Profile[];
  openChat: (profile: Profile) => void;
  closeChat: (profileId: string) => void;
  unreadCounts: Record<string, number>;
};

const ChatManagerContext = createContext<ChatManagerValue | null>(null);

export function ChatManagerProvider({
  currentUserId,
  profiles,
  initialUnreadCounts = {},
  children,
}: {
  currentUserId: string;
  profiles: Profile[];
  initialUnreadCounts?: Record<string, number>;
  children: React.ReactNode;
}) {
  const [openChats, setOpenChats] = useState<Profile[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(initialUnreadCounts);
  // Mirrors openChats without forcing the realtime effect below to
  // re-subscribe every time a chat window opens or closes.
  const openChatIdsRef = useRef<Set<string>>(new Set());
  // Same idea for the teammate list — the realtime effect below needs it
  // only to resolve a sender_id to a display name for the OS notification.
  const profilesRef = useRef<Profile[]>(profiles);

  useEffect(() => {
    openChatIdsRef.current = new Set(openChats.map((p) => p.id));
  }, [openChats]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  const openChat = useCallback((profile: Profile) => {
    setOpenChats((prev) => (prev.some((p) => p.id === profile.id) ? prev : [...prev, profile]));
    setUnreadCounts((prev) => {
      if (!prev[profile.id]) return prev;
      const next = { ...prev };
      delete next[profile.id];
      return next;
    });
    markConversationRead(profile.id).catch(() => {});
  }, []);

  const closeChat = useCallback((profileId: string) => {
    setOpenChats((prev) => prev.filter((p) => p.id !== profileId));
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
          if (!openChatIdsRef.current.has(row.sender_id)) {
            setUnreadCounts((prev) => ({ ...prev, [row.sender_id]: (prev[row.sender_id] ?? 0) + 1 }));
          }

          // Fires an OS-level notification too — showChatNotification itself
          // only shows one if this tab is actually hidden/unfocused right
          // now, so it stays quiet while the person is already looking.
          const sender = profilesRef.current.find((p) => p.id === row.sender_id);
          showChatNotification(
            row.sender_id,
            sender?.display_name ?? "Tin nhắn mới",
            row.content || (row.attachment_url ? "📎 Đã gửi một tệp đính kèm" : ""),
            () => sender && openChat(sender),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, openChat]);

  return (
    <ChatManagerContext.Provider value={{ openChats, openChat, closeChat, unreadCounts }}>
      {children}
    </ChatManagerContext.Provider>
  );
}

export function useChatManager() {
  const ctx = useContext(ChatManagerContext);
  if (!ctx) throw new Error("useChatManager must be used within ChatManagerProvider");
  return ctx;
}
