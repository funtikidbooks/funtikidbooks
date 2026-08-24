"use client";

// Desktop OS-level notification for a new chat message — fires even while
// the tab is unfocused (another tab, or another app like Photoshop) as long
// as the browser process is still running with this tab open. Note: this
// does NOT work reliably on iPad/iOS Safari unless the site is installed as
// a PWA with real Web Push — Safari mostly ignores Notification() calls
// from a plain background tab there.
export function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function showChatNotification(senderId: string, title: string, body: string, onClick?: () => void) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Only notify while the tab is actually hidden/unfocused — if the staff
  // member is already looking at the workspace, the on-screen unread badge
  // is enough and a popup would just be noise.
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  const notification = new Notification(title, {
    body,
    icon: "/brand/funti-logo.jpg",
    tag: `funti-dm-${senderId}`,
  });
  notification.onclick = () => {
    window.focus();
    onClick?.();
    notification.close();
  };
}
