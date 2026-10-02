"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A tap on a chat notification: sw.js focuses a window of the site that's
// already open and posts the conversation's link here. Mounted in the root
// layout so it works from any page — workspace, Quản trị or the public site
// (it used to live in the workspace layout only, so a tap while sếp Phúc
// was in Quản trị just brought that page forward and went nowhere).
// Following the link with Next's router is an in-app transition, no reload;
// the reply tells sw.js the link was taken — without one (a page still
// waking up) sw.js loads the link itself.
export function NotificationClickRouter() {
  const router = useRouter();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "notification-click" || typeof event.data.url !== "string") return;
      const target = new URL(event.data.url, window.location.origin);
      if (target.origin !== window.location.origin) return;
      event.ports?.[0]?.postMessage("ok");
      // A đơn xin nghỉ link: the workspace top bar opens its panel in place
      // (LeaveTopBar listens to this same message) — no need to leave the page.
      if (target.searchParams.has("don-nghi") && window.location.pathname.startsWith("/workspace")) return;
      const path = `${target.pathname}${target.search}${target.hash}`;
      // Already there: the chat page switches rooms itself off this same
      // message (MeetingHub), no navigation needed.
      if (`${window.location.pathname}${window.location.search}` !== `${target.pathname}${target.search}`) router.push(path);
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
