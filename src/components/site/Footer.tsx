import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { dictionary } from "@/lib/dictionary";

export function Footer({ locale }: { locale: Locale }) {
  const t = dictionary[locale];

  const COLUMNS = [
    {
      title: t.footer.studioCol,
      links: [
        { href: "/", label: t.nav.home },
        { href: "/gioi-thieu", label: t.nav.about },
        { href: "/tin-tuc", label: t.nav.news },
      ],
    },
    {
      title: t.footer.servicesCol,
      links: [
        { href: "/dich-vu", label: t.footer.illustration },
        { href: "/dich-vu", label: t.footer.characterDesign },
        { href: "/dich-vu", label: t.footer.modeling3d },
      ],
    },
    {
      title: t.footer.supportCol,
      links: [
        { href: "/quy-trinh", label: t.nav.process },
        { href: "/du-an", label: t.nav.projects },
        { href: "/lien-he", label: t.nav.contact },
      ],
    },
  ];

  // This footer is a permanently dark band by design (like the project
  // lightbox) — it must look the same regardless of the site's light/dark
  // theme, so every color here is a fixed literal, never a var(--color-*)
  // token (those flip meaning between themes and would wash the text out).
  return (
    <footer style={{ background: "#201e1d", color: "#eeeeec" }}>
      <div className="max-w-[1280px] mx-auto px-5 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/brand/funti-logo.jpg"
              alt="Funti Kidbooks Studio"
              width={40}
              height={40}
              className="rounded-full object-cover flex-none"
            />
            <span className="font-heading font-bold text-lg" style={{ color: "#fff" }}>Funti Kidbooks Studio</span>
          </div>
          <p className="text-sm max-w-[320px]" style={{ color: "#c8c7c1" }}>
            {t.footer.tagline}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {[
              { label: "Facebook", icon: "f", href: "https://facebook.com/Funtikidbooks" },
              { label: "Instagram", icon: "◎", href: "https://instagram.com/funtikidbooks" },
              { label: "Upwork", icon: "Uw", href: "https://www.upwork.com/freelancers/yunachan" },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                className="flex items-center justify-center rounded-full font-bold"
                style={{ width: 30, height: 30, border: "1.5px solid #57564f", color: "#ff9f6e", fontSize: s.icon.length > 1 ? 11 : 14 }}
              >
                {s.icon}
              </a>
            ))}
            <a
              href="mailto:funtikidbooks.studio@gmail.com"
              aria-label="Email"
              className="flex items-center justify-center rounded-full text-sm font-bold"
              style={{ width: 30, height: 30, border: "1.5px solid #57564f", color: "#ff9f6e" }}
            >
              ✉
            </a>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold tracking-wide" style={{ color: "#fff" }}>{col.title}</h3>
            {col.links.map((link, i) => (
              <Link
                key={col.title + i}
                href={link.href}
                className="text-sm"
                style={{ color: "#c8c7c1" }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold tracking-wide" style={{ color: "#fff" }}>{t.footer.contactCol}</h3>
          <a
            href="mailto:funtikidbooks.studio@gmail.com"
            className="text-sm"
            style={{ color: "#c8c7c1" }}
          >
            funtikidbooks.studio@gmail.com
          </a>
          <Link href="/lien-he" className="btn btn-primary btn-sm w-fit mt-1">
            {t.footer.contactBtn}
          </Link>
        </div>
      </div>
      <div
        className="max-w-[1280px] mx-auto px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs border-t"
        style={{ borderColor: "#3a3934", color: "#a3a29a" }}
      >
        <span>
          © {new Date().getFullYear()} Funti Kidbooks Studio. {t.footer.copyright}
        </span>
        <span>{t.footer.businessInfo}</span>
      </div>
    </footer>
  );
}
