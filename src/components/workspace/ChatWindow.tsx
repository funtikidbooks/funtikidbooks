"use client";

import { useState } from "react";
import { DirectConversation } from "@/components/workspace/DirectConversation";
import type { Profile } from "@/lib/types";

export function ChatWindow({
  peer,
  currentUser,
  onClose,
  offsetRight,
}: {
  peer: Profile;
  currentUser: Pick<Profile, "id" | "display_name">;
  onClose: () => void;
  offsetRight: number;
}) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div
      className="card elev-lg fixed flex flex-col z-40"
      style={{ right: offsetRight, bottom: 0, width: 280, height: minimized ? "auto" : 380 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer flex-none"
        style={{ borderBottom: minimized ? "none" : "1px solid var(--color-neutral-200)" }}
        onClick={() => setMinimized((v) => !v)}
      >
        <span
          className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
          style={{ width: 26, height: 26, fontSize: 11, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
        >
          {peer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            peer.display_name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="text-[13px] font-bold flex-1 truncate">{peer.display_name}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="btn-icon flex-none"
          aria-label="Đóng"
          style={{ width: 26, height: 26, padding: 0 }}
        >
          ✕
        </button>
      </div>

      {!minimized && <DirectConversation peer={peer} currentUser={currentUser} />}
    </div>
  );
}
