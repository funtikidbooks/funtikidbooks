"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/actions/auth";
import { useChatManager } from "@/components/workspace/ChatManager";
import { resetThemeOnSignOut, useTheme } from "@/lib/useTheme";
import { useShowsIphoneAppNav } from "@/lib/useIsStandalone";

// The 4 most-used sections get a permanent thumb-reachable tab; everything
// else (plus theme + sign out, previously only reachable from the
// desktop-only Sidebar) lives behind "Thêm" — phones don't have room for
// Sidebar's full 8-item list as a bottom bar.
const PRIMARY_NAV = [
  { href: "/workspace", label: "Công việc", icon: "📊" },
  { href: "/workspace/hop", label: "Trò chuyện", icon: "💬" },
  { href: "/workspace/thanh-vien", label: "Thành viên", icon: "👥" },
  { href: "/workspace/lich", label: "Lịch", icon: "📅" },
];

const MORE_NAV = [
  { href: "/workspace/bao-cao-gio", label: "Báo cáo giờ", icon: "⏱️" },
  { href: "/workspace/kho-font", label: "Kho font & brush", icon: "🔤" },
  { href: "/workspace/tinh-kho-sach", label: "Tính khổ sách", icon: "📐" },
  { href: "/workspace/bien-tap", label: "Biên tập", icon: "🖊️" },
  { href: "/workspace/hop-dong", label: "Hợp đồng", icon: "📄" },
  { href: "/workspace/cham-cong", label: "Chấm công", icon: "🕐" },
  { href: "/workspace/du-an", label: "Dự án", icon: "📁" },
  { href: "/workspace/luot-truy-cap", label: "Lượt truy cập web", icon: "🌐" },
];

// The installed iPhone app trades the "4 most-used + everything else behind
// Thêm" tradeoff for just the sections the director actually wants on the
// home screen. iPad keeps the regular nav even when installed the same way
// (see useShowsIphoneAppNav). Danh bạ points at its own route (Thành viên,
// which has its own phone-friendly tap-to-chat/tap-to-call list — see
// MembersDirectory.tsx) rather than sharing /workspace/hop with Trò chuyện:
// same pathname on both tabs meant usePathname() (which ignores the query
// string) always lit up "Trò chuyện" regardless of which one was tapped,
// so it visually looked like Danh bạ did nothing.
const PRIMARY_NAV_IPHONE_APP = [
  { href: "/workspace/hop", label: "Trò chuyện", icon: "💬" },
  { href: "/workspace/thanh-vien", label: "Danh bạ", icon: "📇" },
  { href: "/workspace/bao-cao-gio", label: "Báo cáo giờ", icon: "⏱️" },
];

const MORE_NAV_IPHONE_APP = [
  { href: "/workspace", label: "Bảng công việc", icon: "📊" },
  { href: "/workspace/lich", label: "Lịch", icon: "📅" },
  { href: "/workspace/cham-cong", label: "Chấm công", icon: "🕐" },
];

// Text fields that bring up the on-screen keyboard.
const TYPING_SELECTOR =
  'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"])';

function isTypingOnTouch() {
  const el = document.activeElement;
  return !!el && el.matches(TYPING_SELECTOR) && window.matchMedia("(pointer: coarse)").matches;
}

// The on-screen keyboard shrinks the visual viewport by far more than any
// toolbar animation does.
const KEYBOARD_MIN_PX = 120;

export function MobileNav({ canOpenAdmin }: { canOpenAdmin: boolean }) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { totalUnreadCount } = useChatManager();
  const showsIphoneAppNav = useShowsIphoneAppNav();
  const primaryNav = showsIphoneAppNav ? PRIMARY_NAV_IPHONE_APP : PRIMARY_NAV;
  const moreNav = showsIphoneAppNav ? MORE_NAV_IPHONE_APP : MORE_NAV;
  // While the on-screen keyboard is up the bar is hidden, like a native
  // app's tab bar, so the composer sits right on the keyboard.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // The bar hides only while the on-screen keyboard is really up — the
    // visual viewport shrinks by its height. A focused field alone isn't
    // enough: the chat keeps its composer focused after sending, focuses it
    // itself, and an iPad with a hardware keyboard never shows one, and in
    // all of those the bar must stay.
    //
    // A tap on a field hides the bar straight away (EARLY_MS) so it doesn't
    // ride up on the keyboard while it slides in; if the viewport hasn't
    // shrunk by then, there's no keyboard and the bar comes back.
    //
    // Two ways a keyboard shows up: older iOS / most Android keep the page's
    // height and only shrink the visual viewport (offset below), while newer
    // iOS — the installed app included — shrinks the whole page with it, so
    // the two heights stay equal and that check alone never fired (the bar
    // hid for the first 800ms, then came back on top of the keyboard). So
    // the visible height is also compared with the tallest it has been in
    // this orientation: a typing field focused and 120px+ gone is a keyboard.
    const EARLY_MS = 800;
    let touchAt = 0;
    let tapFocusAt = 0;
    let full = { width: 0, height: 0 };
    function sync() {
      if (Math.abs(window.innerWidth - full.width) > 40) full = { width: window.innerWidth, height: 0 }; // first run, or rotated
      full.height = Math.max(full.height, vv!.height);
      const offset = window.innerHeight - (vv!.height + vv!.offsetTop);
      const shrunk = full.height - vv!.height;
      const typing = isTypingOnTouch();
      const early = typing && Date.now() - tapFocusAt < EARLY_MS;
      setKeyboardOpen(offset > KEYBOARD_MIN_PX || (typing && shrunk > KEYBOARD_MIN_PX) || early);
    }
    let recheck: ReturnType<typeof setTimeout> | undefined;
    function onPointerDown() {
      touchAt = Date.now();
    }
    function onFocusIn() {
      if (Date.now() - touchAt < EARLY_MS && isTypingOnTouch()) tapFocusAt = Date.now();
      sync();
      clearTimeout(recheck);
      recheck = setTimeout(sync, EARLY_MS + 50);
    }
    function onFocusOut() {
      clearTimeout(recheck);
      recheck = setTimeout(sync, 150);
    }
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(recheck);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <>
      {/* An ordinary last row of the workspace's 100dvh shell (see
          app/workspace/layout.tsx), not a `position: fixed` bar. The fixed
          version needed a JS-measured spacer to keep content out from under
          it, and on iPhone the home-indicator padding (safe-area-inset-
          bottom) often resolved after that measurement — the spacer came up
          ~34px short and the bar covered the chat composer. In flow, the
          content above simply ends where the bar begins. */}
      <nav
        className={`md:hidden no-print flex-none relative z-40 items-stretch ${keyboardOpen ? "hidden" : "flex"}`}
        style={{
          background: "var(--color-panel)",
          borderTop: "1px solid var(--color-neutral-200)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {primaryNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
              style={{ color: active ? "var(--color-accent-700)" : "var(--color-neutral-500)" }}
            >
              <span className="relative" style={{ fontSize: 20 }} aria-hidden>
                {item.icon}
                {item.href === "/workspace/hop" && totalUnreadCount > 0 && (
                  <span
                    className="absolute rounded-full"
                    style={{ width: 8, height: 8, top: -1, right: -3, background: "var(--status-red)", border: "1.5px solid var(--color-panel)" }}
                  />
                )}
              </span>
              <span className="text-[10px] font-bold">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
          style={{ color: "var(--color-neutral-500)" }}
        >
          <span style={{ fontSize: 20 }} aria-hidden>
            ⋯
          </span>
          <span className="text-[10px] font-bold">Thêm</span>
        </button>
      </nav>

      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowMore(false)}
        >
          {/* A grid of tiles like a phone's app drawer — every section is
              one tap, and the sheet stays short instead of a long list. */}
          <div
            className="w-full flex flex-col gap-3 p-3"
            style={{ background: "var(--color-panel)", borderRadius: "16px 16px 0 0", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold">Thêm</span>
              <button type="button" onClick={() => setShowMore(false)} className="btn-icon" style={{ width: 32, height: 32, padding: 0 }} aria-label="Đóng">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[...moreNav, ...(canOpenAdmin ? [{ href: "/quan-tri", label: "Quản trị", icon: "🛠" }] : [])].map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className="flex flex-col items-center justify-start gap-1 rounded-[12px] px-1 py-2.5 text-center"
                    style={{
                      background: active ? "var(--color-accent-100)" : "var(--color-neutral-100)",
                      color: active ? "var(--color-accent-700)" : "var(--color-text)",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>
                      {item.icon}
                    </span>
                    <span className="text-[11px] font-semibold leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              <button
                type="button"
                onClick={toggleTheme}
                className="ws-nav-link flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-semibold"
              >
                <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span> {theme === "dark" ? "Chuyển ban ngày" : "Chuyển ban đêm"}
              </button>
              <form action={signOut} onSubmit={resetThemeOnSignOut} className="flex-1">
                <button
                  type="submit"
                  className="ws-nav-link w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-semibold"
                  style={{ color: "var(--color-neutral-600)" }}
                >
                  <span aria-hidden>↩</span> Đăng xuất
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
