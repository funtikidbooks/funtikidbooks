"use client";

// Fire-and-forget push trigger for a message this browser just inserted —
// see src/app/api/chat/notify/route.ts for why this is a plain fetch and
// not a Server Action. `keepalive` lets it finish even if the tab is closed
// or the phone app is backgrounded right after tapping send.
export function notifyNewMessage(type: "meeting" | "dm", messageId: string) {
  fetch("/api/chat/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, messageId }),
    keepalive: true,
  }).catch(() => {});
}
