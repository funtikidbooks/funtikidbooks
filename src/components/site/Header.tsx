"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDict, useLocale } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { SiteThemeToggle } from "@/components/site/SiteThemeToggle";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const openRef = useRef(open);
  const { t } = useDict();
  const { isAuthenticated, memberHref } = useViewer();

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Hide the header on scroll-down, bring it back on scroll-up — frees up
  // screen space while reading, but stays reachable the moment you scroll
  // back toward the top. Never hides while the mobile menu is open.
  useEffect(() => {
    lastScrollY.current = window.scrollY;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const diff = currentY - lastScrollY.current;
        if (openRef.current || currentY < 80) {
          setHidden(false);
        } else if (diff > 5) {
          setHidden(true);
        } else if (diff < -5) {
          setHidden(false);
        }
        lastScrollY.current = currentY;
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Full flat list — only the mobile drawer (plenty of vertical room, no
  // hover concept) still shows all 8 this way.
  const NAV_ITEMS = [
    { href: "/", label: t.nav.home },
    { href: "/dich-vu", label: t.nav.services },
    { href: "/quy-trinh", label: t.nav.process },
    { href: "/du-an", label: t.nav.projects },
    { href: "/gioi-thieu", label: t.nav.about },
    { href: "/tin-tuc", label: t.nav.news },
    { href: "/tuyen-dung", label: t.nav.careers },
    { href: "/lien-he", label: t.nav.contact },
  ];

  // The two horizontal-bar tiers (2xl and the 1024-1535px compact one)
  // fold Quy trình/Giới thiệu/Tin tức/Tuyển dụng into a "Dịch vụ" hover/
  // long-press flyout instead — per sếp Phúc, cuts the bar from 8 words
  // down to 4 so it stops fighting for width at every breakpoint.
  const PRIMARY_NAV_ITEMS = [
    { href: "/", label: t.nav.home },
    { href: "/dich-vu", label: t.nav.services },
    { href: "/du-an", label: t.nav.projects },
    { href: "/lien-he", label: t.nav.contact },
  ];
  const SERVICES_SUBMENU = [
    { href: "/quy-trinh", label: t.nav.process },
    { href: "/gioi-thieu", label: t.nav.about },
    { href: "/tin-tuc", label: t.nav.news },
    { href: "/tuyen-dung", label: t.nav.careers },
  ];

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "var(--color-header-bg)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--color-neutral-200)",
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.25s ease",
      }}
    >
      <div className="site-container flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2 flex-none">
          <Image
            src="/brand/funti-logo.jpg"
            alt="Funti Kidbooks Studio"
            width={40}
            height={40}
            className="rounded-full object-cover flex-none"
            priority
          />
          <span className="flex flex-col leading-tight">
            <span className="font-heading font-bold text-base">Funti Kidbooks</span>
            <span
              className="text-[10px] font-bold tracking-[0.1em]"
              style={{ color: "var(--color-accent-2-700)" }}
            >
              STUDIO
            </span>
          </span>
        </Link>

        {/* >=1536px: full-size nav. Adding the 8th item (Tuyển dụng) pushed
            this past what fit at 1280px (verified empirically — it now
            overflows to ~1457px there), so the full tier moved out to
            2xl and the compact tier below now covers the whole
            1024-1535px range instead of stopping at 1279px. */}
        <nav className="hidden 2xl:flex items-center gap-1">
          {PRIMARY_NAV_ITEMS.map((item) => {
            if (item.href === "/dich-vu") {
              return <ServicesNavDropdown key={item.href} compact={false} submenu={SERVICES_SUBMENU} />;
            }
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`fk-navlink${active ? " fk-navlink-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden 2xl:flex items-center gap-3 flex-none">
          <SiteThemeToggle />
          <LanguageToggle />
          <Link href="/cong-viec" className="fk-navlink text-center">
            {t.nav.clientPortal}
          </Link>
          {isAuthenticated ? (
            <Link href={memberHref} className="btn btn-primary btn-sm text-center" style={{ minWidth: 210 }}>
              {t.nav.workspace}
            </Link>
          ) : (
            <Link href="/dang-nhap" className="fk-navlink text-center" style={{ minWidth: 130 }}>
              {t.nav.member}
            </Link>
          )}
          <Link href="/lien-he" className="btn btn-secondary btn-sm" style={{ minWidth: 200 }}>
            {t.nav.contactCta}
          </Link>
        </div>

        {/* 1024-1535px (iPad landscape up through common 13"-14" laptop
            widths): the same horizontal layout, just trimmed to actually
            fit — smaller nav links, no forced button minWidth, and the
            separate "Liên hệ với chúng tôi" CTA dropped since the nav's
            own "Liên hệ" link already covers it (that pairing alone
            needed ~200px it doesn't have here). Below this it falls back
            to the ☰ dropdown instead — no amount of trimming fits 8 nav
            words + logo + toggles + an action link into a phone or
            portrait-tablet width. */}
        <nav className="hidden lg:flex 2xl:hidden items-center gap-0.5">
          {PRIMARY_NAV_ITEMS.map((item) => {
            if (item.href === "/dich-vu") {
              return <ServicesNavDropdown key={item.href} compact submenu={SERVICES_SUBMENU} />;
            }
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`fk-navlink fk-navlink-compact${active ? " fk-navlink-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:flex 2xl:hidden items-center gap-2 flex-none">
          <SiteThemeToggle />
          <LanguageToggle />
          <Link href="/cong-viec" className="fk-navlink fk-navlink-compact text-center" title={t.nav.clientPortal}>
            💼
          </Link>
          {isAuthenticated ? (
            <Link href={memberHref} className="btn btn-primary btn-sm text-center">
              {t.nav.workspace}
            </Link>
          ) : (
            <Link href="/dang-nhap" className="fk-navlink fk-navlink-compact text-center">
              {t.nav.member}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <SiteThemeToggle />
          <LanguageToggle />
          <button
            type="button"
            className="btn-icon"
            aria-label={t.nav.menuOpen}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden px-5 pb-4 flex flex-col gap-1 border-t" style={{ borderColor: "var(--color-neutral-200)" }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="fk-navlink"
              style={{ textAlign: "left" }}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="flex flex-col gap-2 mt-2">
            {isAuthenticated ? (
              <Link href={memberHref} className="btn btn-primary btn-block">
                {t.nav.workspace}
              </Link>
            ) : (
              <Link href="/dang-nhap" className="btn btn-ghost btn-block">
                {t.nav.member}
              </Link>
            )}
            <Link href="/cong-viec" className="btn btn-ghost btn-block" onClick={() => setOpen(false)}>
              {t.nav.clientPortal}
            </Link>
            <Link href="/lien-he" className="btn btn-secondary btn-block">
              {t.nav.contactCta}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// "Dịch vụ" doubles as a category trigger for Quy trình/Giới thiệu/Tin tức/
// Tuyển dụng — hover opens it on desktop, long-press on touch (same timing
// as the workspace's other hover/long-press peek popups: 300ms to show,
// 150ms close-grace so the cursor can cross into the panel, 450ms
// long-press with a 10px move-cancel and a suppressed synthetic click so a
// long-press doesn't also navigate). A quick tap/click still goes straight
// to /dich-vu.
function ServicesNavDropdown({ compact, submenu }: { compact: boolean; submenu: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const { t } = useDict();
  const [show, setShow] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function clearShowAndCloseTimers() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  function handleMouseEnter() {
    clearShowAndCloseTimers();
    showTimer.current = setTimeout(() => setShow(true), 300);
  }

  function handleMouseLeave() {
    clearShowAndCloseTimers();
    closeTimer.current = setTimeout(() => setShow(false), 150);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      setShow(true);
      suppressClickRef.current = true;
    }, 450);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (suppressClickRef.current) {
      e.preventDefault();
      suppressClickRef.current = false;
    }
  }

  useEffect(() => clearShowAndCloseTimers, []);

  const active = pathname.startsWith("/dich-vu") || submenu.some((item) => pathname.startsWith(item.href));

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Link
        href="/dich-vu"
        className={`fk-navlink${compact ? " fk-navlink-compact" : ""}${active ? " fk-navlink-active" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        {t.nav.services}
        <span
          aria-hidden
          style={{
            display: "inline-block",
            fontSize: 10,
            transition: "transform 0.2s ease",
            transform: show ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </Link>
      {show && (
        <div
          className="card elev-lg absolute flex flex-col gap-0.5"
          style={{ top: "100%", left: 0, marginTop: 6, minWidth: 170, padding: 6, zIndex: 50 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {submenu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="fk-navlink"
              style={{ justifyContent: "flex-start" }}
              onClick={() => setShow(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className="lang-toggle flex items-center rounded-full text-xs font-bold flex-none"
      style={{ border: "1.5px solid var(--color-neutral-300)" }}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("vi")}
        className="lang-toggle-btn"
        style={{
          background: locale === "vi" ? "var(--color-accent-500)" : "transparent",
          color: locale === "vi" ? "#fff" : "var(--color-text)",
        }}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className="lang-toggle-btn"
        style={{
          background: locale === "en" ? "var(--color-accent-500)" : "transparent",
          color: locale === "en" ? "#fff" : "var(--color-text)",
        }}
      >
        EN
      </button>
    </div>
  );
}
