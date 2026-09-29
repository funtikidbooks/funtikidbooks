"use client";

import { useEffect, useState } from "react";

// "Cài Funti lên taskbar": installs the workspace as an app (Chrome / Edge
// on a computer, Chrome on Android) so it gets its own taskbar icon — which
// is where the unread-message number shows (see lib/appBadge.ts). Hidden
// once installed, and wherever the browser can't install (Safari, where the
// iPad/iPhone way is Chia sẻ → Thêm vào MH chính).
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// The browser offers the install once, often before this button has
// mounted — kept here at module level so it isn't missed.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export function InstallAppButton() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const sync = () => setCanInstall(!!deferred && !window.matchMedia("(display-mode: standalone)").matches);
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  if (!canInstall) return null;

  async function install() {
    const prompt = deferred;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") {
      deferred = null;
      setCanInstall(false);
    }
  }

  return (
    <button
      type="button"
      onClick={install}
      className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12.5px] font-bold text-left"
      style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}
      title="Cài Funti thành ứng dụng: có biểu tượng riêng trên taskbar, hiện số tin nhắn chưa đọc"
    >
      <span aria-hidden>📌</span>
      <span className="flex-1">Cài Funti lên taskbar</span>
    </button>
  );
}
