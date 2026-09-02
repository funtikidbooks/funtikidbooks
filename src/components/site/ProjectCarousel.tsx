"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useDict } from "@/components/site/LocaleProvider";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { isSupabaseStorageUrl, resizedUrl } from "@/lib/imageTransform";
import type { Project } from "@/lib/types";

const ROTATE_MS = 5500;
const CARD_WIDTH = 265;
const CARD_HEIGHT = 206;

// Shown only until the studio has published real projects — cropped from
// the studio's own Claude Design mockup as an AI-generated placeholder.
const FALLBACK_PROJECTS = [
  { title: "Miền Dâu Dại", title_en: null, tag: "Sách tranh", cover_image_url: "/placeholders/projects/mien-dau-dai.jpg" },
  { title: "Drachen lieben Schokolade", title_en: null, tag: "Sách truyện", cover_image_url: "/placeholders/projects/drachen-schokolade.jpg" },
  { title: "Usborne First Experiences", title_en: null, tag: "Sách giáo dục", cover_image_url: "/placeholders/projects/usborne-first-experiences.jpg" },
  { title: "Ping the Panda", title_en: null, tag: "Sách tranh", cover_image_url: "/placeholders/projects/ping-the-panda.jpg" },
  { title: "The Mystical Amulet", title_en: null, tag: "Sách truyện", cover_image_url: "/placeholders/projects/mystical-amulet.jpg" },
];

export function ProjectCarousel({ projects }: { projects: Project[] }) {
  const { locale, t } = useDict();
  const isRealData = projects.length > 0;
  const source = isRealData ? projects.slice(0, 8) : FALLBACK_PROJECTS;
  const [active, setActive] = useState(0);
  const count = source.length;

  function go(delta: number) {
    setActive((i) => (i + delta + count) % count);
  }

  // Auto-advance every 5-6s.
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => setActive((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [count]);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-full flex items-center justify-center" style={{ height: 300 }}>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t.projects.prevProject}
          className="absolute left-2 sm:left-8 z-20 flex items-center justify-center rounded-full text-white"
          style={{ width: 40, height: 40, background: "rgba(20,18,17,.85)" }}
        >
          ‹
        </button>

        {source.map((p, i) => {
          let offset = i - active;
          if (offset > count / 2) offset -= count;
          if (offset < -count / 2) offset += count;
          const abs = Math.abs(offset);
          if (abs > 2) return null;
          const isActive = abs === 0;

          const translate = offset * 195;
          const scale = Math.max(0.72, 1 - abs * 0.16);
          const opacity = Math.max(0, 1 - abs * 0.45);
          const z = 10 - abs;

          const card = (
            <>
              {p.cover_image_url ? (
                <Image
                  src={isSupabaseStorageUrl(p.cover_image_url) ? (resizedUrl(p.cover_image_url, 400) ?? p.cover_image_url) : p.cover_image_url}
                  alt={p.title}
                  fill
                  unoptimized={isSupabaseStorageUrl(p.cover_image_url)}
                  className="object-cover"
                  sizes={`${CARD_WIDTH}px`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: "var(--color-surface)" }}>
                  🖼
                </div>
              )}
              {isActive && (
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3"
                  style={{ background: "linear-gradient(180deg, transparent 30%, rgba(20,18,17,.85) 100%)" }}
                >
                  <span className="tag tag-accent w-fit">{categoryLabel(locale, p.tag)}</span>
                  <span className="text-white text-sm font-bold">{pickLocalized(locale, p.title, p.title_en)}</span>
                </div>
              )}
            </>
          );

          const style: React.CSSProperties = {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            transform: `translateX(${translate}px) scale(${scale})`,
            opacity,
            zIndex: z,
            boxShadow: isActive ? "var(--shadow-lg)" : "var(--shadow-sm)",
            transition: "transform .45s cubic-bezier(.22,1,.36,1), opacity .35s ease",
          };

          // Real projects link straight to their case study on /du-an
          // (opened there, not in a small popup on the homepage); the
          // placeholder set (no content to show yet) just links to /du-an.
          const href = isRealData ? `/du-an?p=${(p as Project).id}` : "/du-an";
          return (
            <Link key={`${p.title}-${i}`} href={href} className="absolute card overflow-hidden" style={style}>
              {card}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t.projects.nextProject}
          className="absolute right-2 sm:right-8 z-20 flex items-center justify-center rounded-full text-white"
          style={{ width: 40, height: 40, background: "rgba(20,18,17,.85)" }}
        >
          ›
        </button>
      </div>

      <Link href="/du-an" className="fk-navlink text-sm font-bold">
        {t.home.seeAllProjects}
      </Link>
    </div>
  );
}
