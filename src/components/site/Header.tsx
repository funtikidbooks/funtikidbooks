"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDict, useLocale } from "@/components/site/LocaleProvider";
import { SiteThemeToggle } from "@/components/site/SiteThemeToggle";

export function Header({
  isAuthenticated,
  memberHref = "/workspace",
}: {
  isAuthenticated: boolean;
  memberHref?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const openRef = useRef(open);
  const { t } = useDict();

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

  const NAV_ITEMS = [
    { href: "/", label: t.nav.home },
    { href: "/dich-vu", label: t.nav.services },
    { href: "/quy-trinh", label: t.nav.process },
    { href: "/du-an", label: t.nav.projects },
    { href: "/gioi-thieu", label: t.nav.about },
    { href: "/tin-tuc", label: t.nav.news },
    { href: "/lien-he", label: t.nav.contact },
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

        {/* >=1280px: full-size nav — this is the width it was actually
            designed to fit at (verified empirically; 1024-1200px overflows
            it with no wrap). */}
        <nav className="hidden xl:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
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

        <div className="hidden xl:flex items-center gap-3 flex-none">
          <SiteThemeToggle />
          <LanguageToggle />
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

        {/* 1024-1279px (iPad landscape and similar): the same horizontal
            layout, just trimmed to actually fit — smaller nav links, no
            forced button minWidth, and the separate "Liên hệ với chúng
            tôi" CTA dropped since the nav's own "Liên hệ" link already
            covers it (that pairing alone needed ~200px it doesn't have
            here). Below this it falls back to the ☰ dropdown instead —
            no amount of trimming fits 7 nav words + logo + toggles + an
            action link into a phone or portrait-tablet width. */}
        <nav className="hidden lg:flex xl:hidden items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
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

        <div className="hidden lg:flex xl:hidden items-center gap-2 flex-none">
          <SiteThemeToggle />
          <LanguageToggle />
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
            <Link href="/lien-he" className="btn btn-secondary btn-block">
              {t.nav.contactCta}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function LanguageToggle() {
  const { locale, setLocale, pending } = useLocale();

  return (
    <div
      className="lang-toggle flex items-center rounded-full text-xs font-bold flex-none"
      style={{ border: "1.5px solid var(--color-neutral-300)", opacity: pending ? 0.6 : 1 }}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("vi")}
        disabled={pending}
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
        disabled={pending}
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
