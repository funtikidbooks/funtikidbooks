"use client";

import { useChatManager } from "./ChatManager";
import { ChatWindow } from "./ChatWindow";
import type { Profile } from "@/lib/types";

const WINDOW_WIDTH = 280;
const GAP = 12;

export function ChatDock({ currentUser }: { currentUser: Pick<Profile, "id" | "display_name"> }) {
  const { openChats, closeChat } = useChatManager();

  return (
    <>
      {openChats.map((peer, i) => (
        <ChatWindow
          key={peer.id}
          peer={peer}
          currentUser={currentUser}
          onClose={() => closeChat(peer.id)}
          offsetRight={24 + i * (WINDOW_WIDTH + GAP)}
        />
      ))}
    </>
  );
}
