"use client";

import { useEffect, useRef } from "react";
import { useChatManager } from "@/components/workspace/ChatManager";

const BASE_FAVICON = "/favicon.ico";

// Messenger/Facebook-style "you have unread messages" signal on the browser
// tab itself — a "(3) " prefix on the title and a red badge drawn onto the
// favicon — for staff who don't have the tab focused, don't have a headset
// for the notification sound, or just don't reliably notice either. Purely
// a side-effecting component, renders nothing.
export function TabNotificationBadge() {
  const { totalUnreadCount } = useChatManager();
  const baseTitleRef = useRef<string | null>(null);
  const baseIconImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (baseTitleRef.current === null) baseTitleRef.current = document.title;
    const baseTitle = baseTitleRef.current;
    document.title = totalUnreadCount > 0 ? `(${totalUnreadCount > 99 ? "99+" : totalUnreadCount}) ${baseTitle}` : baseTitle;
  }, [totalUnreadCount]);

  useEffect(() => {
    let cancelled = false;

    async function updateFavicon() {
      if (!baseIconImageRef.current) {
        const img = new Image();
        img.src = BASE_FAVICON;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("favicon failed to load"));
        });
        baseIconImageRef.current = img;
      }
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(baseIconImageRef.current, 0, 0, 32, 32);

      if (totalUnreadCount > 0) {
        ctx.beginPath();
        ctx.arc(23, 9, 9, 0, Math.PI * 2);
        ctx.fillStyle = "#e0245e";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#fff";
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(totalUnreadCount > 9 ? "9+" : String(totalUnreadCount), 23, 10);
      }

      const dataUrl = canvas.toDataURL("image/png");
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.type = "image/png";
      link.href = dataUrl;
    }

    updateFavicon().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [totalUnreadCount]);

  return null;
}
