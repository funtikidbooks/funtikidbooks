"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

type JitsiMeetAPI = {
  dispose: () => void;
  addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiMeetAPI;
  }
}

const JITSI_DOMAIN = "meet.jit.si";
const SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

function loadJitsiScript(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Không thể tải Jitsi")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Không thể tải Jitsi"));
    document.body.appendChild(script);
  });
}

// A single embedded call view, reused for both a meeting room's group call
// (roomKey namespaced by channel id, any headcount — Jitsi handles that on
// its own) and a 1:1 private-chat call (roomKey namespaced by both user
// ids, sorted so either side opens the same room regardless of who calls).
export function VideoCallModal({
  roomKey,
  label,
  displayName,
  onClose,
}: {
  roomKey: string;
  label: string;
  displayName: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          // Channel/DM ids are UUIDs, so this is effectively unguessable —
          // nobody lands in this room without already being in the app.
          roomName: `funtikidbooks-${roomKey}`,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName },
        });
        api.addEventListener("readyToClose", onClose);
        apiRef.current = api;
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // roomKey is the only input that should ever re-create the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);

  return (
    <Modal onClose={onClose} maxWidth={1000}>
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <span
          className="rounded-full flex-none"
          style={{ width: 8, height: 8, background: "var(--status-red)" }}
          aria-hidden
        />
        <span className="font-bold text-[13px] truncate flex-1">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="btn-icon flex-none"
          style={{ width: 28, height: 28, padding: 0 }}
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>
      <div style={{ aspectRatio: "16 / 10", background: "#000" }}>
        {loadError ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-center px-6" style={{ color: "#fff" }}>
            Không thể tải cuộc gọi video. Kiểm tra kết nối mạng rồi thử lại.
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
    </Modal>
  );
}
