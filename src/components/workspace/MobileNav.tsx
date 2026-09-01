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
  { href: "/workspace/kho-font", label: "Kho font & brush", icon: "🔤" },
  { href: "/workspace/tinh-kho-sach", label: "Tính khổ sách", icon: "📐" },
  { href: "/workspace/bien-tap", label: "Biên tập", icon: "🖊️" },
  { href: "/workspace/hop-dong", label: "Hợp đồng", icon: "📄" },
  { href: "/workspace/cham-cong", label: "Chấm công", icon: "🕐" },
];

// The installed iPhone app trades the "4 most-used + everything else behind
// Thêm" tradeoff for just the sections the director actually wants on the
// home screen — Chấm công moves up to a primary tab, Thành viên and the
// other MORE_NAV sections drop out of the nav entirely. iPad keeps the
// regular nav even when installed the same way (see useShowsIphoneAppNav).
const PRIMARY_NAV_IPHONE_APP = [
  { href: "/workspace", label: "Công việc", icon: "📊" },
  { href: "/workspace/hop", label: "Trò chuyện", icon: "💬" },
  { href: "/workspace/lich", label: "Lịch", icon: "📅" },
  { href: "/workspace/cham-cong", label: "Chấm công", icon: "🕐" },
];

export function MobileNav({ isDirector }: { isDirector: boolean }) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { totalUnreadCount } = useChatManager();
  const showsIphoneAppNav = useShowsIphoneAppNav();
  const primaryNav = showsIphoneAppNav ? PRIMARY_NAV_IPHONE_APP : PRIMARY_NAV;
  const moreNav = showsIphoneAppNav ? [] : MORE_NAV;
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState(60);

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
    function sync() {
      const offset = window.innerHeight - (vv!.height + vv!.offsetTop);
      nav!.style.transform = offset > 0.5 ? `translateY(-${offset}px)` : "";
    }
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  // Measures the bar's real rendered height so the spacer below can
  // reserve exactly that much space — avoids hand-picking a pixel value
  // that could drift out of sync with font/safe-area changes.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => setNavHeight(nav.offsetHeight));
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {/* Sits in normal flow purely to reserve the fixed bar's height so
          page content doesn't render underneath it. */}
      <div className="md:hidden no-print flex-none" style={{ height: navHeight }} aria-hidden />
      <nav
        ref={navRef}
        className="md:hidden no-print fixed inset-x-0 bottom-0 z-40 flex items-stretch"
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
            {isDirector && (
              <Link
                href="/quan-tri"
                onClick={() => setShowMore(false)}
                className="ws-nav-link flex items-center gap-2.5 px-2 py-2.5 rounded-[8px] text-[14px] font-semibold"
              >
                <span aria-hidden>🛠</span> Quản trị nội dung
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
