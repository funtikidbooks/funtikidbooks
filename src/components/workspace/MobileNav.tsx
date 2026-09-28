"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState(60);
  // While the on-screen keyboard is up the bar is hidden, like a native
  // app's tab bar — otherwise sync() below lifts it to sit right on top of
  // the keyboard, exactly where the chat composer is, and covers it.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // iOS Safari pins `position: fixed` elements to the *layout* viewport,
  // which doesn't change size as its toolbar/tab-bar chrome animates away —
  // meanwhile the *visual* viewport (what's actually on screen) pans
  // independently during that animation, which is why a plain `bottom: 0`
  // bar visibly slides as you drag even though the page itself never
  // scrolls. Watching `window.visualViewport` and translating the bar by
  // the live gap between the two viewports keeps it glued to the true
  // bottom edge instead of the stale layout one.
  useEffect(() => {
    const vv = window.visualViewport;
    const nav = navRef.current;
    if (!vv || !nav) return;
    // The bar hides only while the on-screen keyboard is really up — the
    // visual viewport shrinks by its height. A focused field alone isn't
    // enough: the chat keeps its composer focused after sending, focuses it
    // itself, and an iPad with a hardware keyboard never shows one, and in
    // all of those the bar must stay.
    //
    // A tap on a field hides the bar straight away (EARLY_MS) so it doesn't
    // ride up on the keyboard while it slides in; if the viewport hasn't
    // shrunk by then, there's no keyboard and the bar comes back.
    const EARLY_MS = 800;
    let touchAt = 0;
    let tapFocusAt = 0;
    function sync() {
      const offset = window.innerHeight - (vv!.height + vv!.offsetTop);
      const early = isTypingOnTouch() && Date.now() - tapFocusAt < EARLY_MS;
      const kb = offset > KEYBOARD_MIN_PX || early;
      setKeyboardOpen(kb);
      nav!.style.transform = !kb && offset > 0.5 ? `translateY(-${offset}px)` : "";
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
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(recheck);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Measures the bar's real rendered height so the spacer below can
  // reserve exactly that much space — avoids hand-picking a pixel value
  // that could drift out of sync with font/safe-area changes.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // A hidden bar measures 0 — keep the last real height for its return.
    const ro = new ResizeObserver(() => {
      if (nav.offsetHeight > 0) setNavHeight(nav.offsetHeight);
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {/* Sits in normal flow purely to reserve the fixed bar's height so
          page content doesn't render underneath it. */}
      <div className="md:hidden no-print flex-none" style={{ height: keyboardOpen ? 0 : navHeight }} aria-hidden />
      <nav
        ref={navRef}
        className={`md:hidden no-print fixed inset-x-0 bottom-0 z-40 items-stretch ${keyboardOpen ? "hidden" : "flex"}`}
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
          <div
            className="w-full flex flex-col gap-1 p-3"
            style={{ background: "var(--color-panel)", borderRadius: "16px 16px 0 0", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-sm font-bold">Thêm</span>
              <button type="button" onClick={() => setShowMore(false)} className="btn-icon" aria-label="Đóng">
                ✕
              </button>
            </div>
            {moreNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMore(false)}
                className="ws-nav-link flex items-center gap-2.5 px-2 py-2.5 rounded-[8px] text-[14px] font-semibold"
              >
                <span aria-hidden>{item.icon}</span> {item.label}
              </Link>
            ))}
            {canOpenAdmin && (
              <Link
                href="/quan-tri"
                onClick={() => setShowMore(false)}
                className="ws-nav-link flex items-center gap-2.5 px-2 py-2.5 rounded-[8px] text-[14px] font-semibold"
              >
                <span aria-hidden>🛠</span> Quản trị
              </Link>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="ws-nav-link flex items-center gap-2.5 px-2 py-2.5 rounded-[8px] text-[14px] font-semibold text-left"
            >
              <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span> {theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
            </button>
            <form action={signOut} onSubmit={resetThemeOnSignOut}>
              <button
                type="submit"
                className="ws-nav-link flex items-center gap-2.5 px-2 py-2.5 rounded-[8px] text-[14px] font-semibold w-full text-left"
                style={{ color: "var(--color-neutral-600)" }}
              >
                <span aria-hidden>↩</span> Đăng xuất
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
