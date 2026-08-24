"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Profile } from "@/lib/types";

type ChatManagerValue = {
  openChats: Profile[];
  openChat: (profile: Profile) => void;
  closeChat: (profileId: string) => void;
};

const ChatManagerContext = createContext<ChatManagerValue | null>(null);

export function ChatManagerProvider({ children }: { children: React.ReactNode }) {
  const [openChats, setOpenChats] = useState<Profile[]>([]);

  const openChat = useCallback((profile: Profile) => {
    setOpenChats((prev) => (prev.some((p) => p.id === profile.id) ? prev : [...prev, profile]));
  }, []);

  const closeChat = useCallback((profileId: string) => {
    setOpenChats((prev) => prev.filter((p) => p.id !== profileId));
  }, []);

  return <ChatManagerContext.Provider value={{ openChats, openChat, closeChat }}>{children}</ChatManagerContext.Provider>;
}

export function useChatManager() {
  const ctx = useContext(ChatManagerContext);
  if (!ctx) throw new Error("useChatManager must be used within ChatManagerProvider");
  return ctx;
}
