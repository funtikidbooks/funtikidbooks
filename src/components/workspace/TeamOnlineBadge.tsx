"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePresence } from "@/lib/usePresence";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { Profile } from "@/lib/types";

// A quick "who's online" peek — click to open, click again (or click
// elsewhere) to close. Deliberately read-only, no chat action on a row:
// this is for a fast glance, not another way into Messenger.
export function TeamOnlineBadge({
  currentUserId,
  totalMembers,
  profiles,
}: {
  currentUserId: string;
  totalMembers: number;
  profiles: Profile[];
}) {
  const onlineIds = usePresence(currentUserId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const onlineProfiles = useMemo(
    () =>
      profiles
        .filter((p) => onlineIds.has(p.id))
        .sort((a, b) => {
          if (a.id === currentUserId) return -1;
          if (b.id === currentUserId) return 1;
          return a.display_name.localeCompare(b.display_name);
        }),
    [profiles, onlineIds, currentUserId],
  );

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold flex-none"
        style={{ background: "var(--color-neutral-100)", color: "var(--color-neutral-700)" }}
        aria-label="Xem ai đang online"
        title="Xem ai đang online"
      >
        <span aria-hidden>👥</span>
        {onlineIds.size}/{totalMembers}
        <span className="hidden sm:inline"> thành viên online</span>
      </button>

      {open && (
        <div
          className="card elev-lg flex flex-col"
          style={{ position: "absolute", left: 0, top: "calc(100% + 8px)", width: 240, maxHeight: 360, zIndex: 50 }}
        >
          <div className="px-3.5 py-3 font-bold text-sm" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            Đang online ({onlineIds.size})
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {onlineProfiles.length === 0 ? (
              <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                Không có ai đang online.
              </p>
            ) : (
              onlineProfiles.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 px-3.5 py-2">
                  <span className="relative flex-none">
                    <span
                      className="flex items-center justify-center rounded-full text-[12px] font-bold overflow-hidden"
                      style={{ width: 30, height: 30, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                    >
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbnailUrl(p.avatar_url, 64)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.display_name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span
                      className="absolute rounded-full"
                      style={{ width: 8, height: 8, right: -1, bottom: -1, background: "var(--status-green)", border: "2px solid var(--color-panel)" }}
                    />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">
                      {p.display_name}
                      {p.id === currentUserId && (
                        <span style={{ color: "var(--color-neutral-500)", fontWeight: 400 }}> (bạn)</span>
                      )}
                    </span>
                    <span className="block text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                      {p.role ?? ""}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
