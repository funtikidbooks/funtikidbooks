"use client";

import { usePresence } from "@/lib/usePresence";

export function TeamOnlineBadge({ currentUserId, totalMembers }: { currentUserId: string; totalMembers: number }) {
  const onlineIds = usePresence(currentUserId);

  return (
    <span
      className="card elev-md flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 30,
        background: "var(--color-surface)",
        color: "var(--color-neutral-700)",
      }}
    >
      <span aria-hidden>👥</span>
      {onlineIds.size}/{totalMembers} thành viên online
    </span>
  );
}
