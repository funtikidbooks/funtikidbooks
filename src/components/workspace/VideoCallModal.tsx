"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCallPresence } from "@/lib/useCallPresence";
import { getJaasCallCredentials } from "@/lib/actions/jaas";

type JitsiMeetAPI = {
  dispose: () => void;
  addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiMeetAPI;
  }
}

// The public meet.jit.si server now requires whoever starts a room to log
// into a Google/Jitsi account to become moderator, which just stalls things
// for a work chat. JaaS (8x8.vc) issues a signed JWT instead so the first
// person in is trusted as moderator with no login prompt — used whenever
// JAAS credentials are configured (see jaas.ts), falling back to the plain
// meet.jit.si embed otherwise.
const PUBLIC_JITSI_DOMAIN = "meet.jit.si";
const JAAS_DOMAIN = "8x8.vc";

function scriptSrcFor(domain: string, appId: string | null) {
  return appId ? `https://${domain}/${appId}/external_api.js` : `https://${domain}/external_api.js`;
}

function loadJitsiScript(domain: string, appId: string | null): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  const src = scriptSrcFor(domain, appId);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Không thể tải Jitsi")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
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
  selfId,
  displayName,
  onClose,
}: {
  roomKey: string;
  label: string;
  selfId: string;
  displayName: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Announces "I'm in this call" on the shared presence channel for this
  // room — see useCallPresence.ts. Any chat view watching the same roomKey
  // (without joining) picks this up and shows a "📹 X đang gọi — Tham gia"
  // banner, which is how someone finds out a call has started at all.
  useCallPresence(roomKey, { id: selfId, display_name: displayName });

  useEffect(() => {
    let cancelled = false;
    // Channel/DM ids are UUIDs, so this is effectively unguessable — nobody
    // lands in this room without already being in the app.
    const bareRoomName = `funtikidbooks-${roomKey}`;

    getJaasCallCredentials()
      .catch(() => null)
      .then((creds) => {
        if (cancelled) return;
        const domain = creds ? JAAS_DOMAIN : PUBLIC_JITSI_DOMAIN;
        const roomName = creds ? `${creds.appId}/${bareRoomName}` : bareRoomName;
        return loadJitsiScript(domain, creds?.appId ?? null).then(() => {
          if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
          const api = new window.JitsiMeetExternalAPI(domain, {
            roomName,
            parentNode: containerRef.current,
            width: "100%",
            height: "100%",
            userInfo: { displayName },
            ...(creds ? { jwt: creds.jwt } : {}),
          });
          api.addEventListener("readyToClose", onClose);
          apiRef.current = api;
        });
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
