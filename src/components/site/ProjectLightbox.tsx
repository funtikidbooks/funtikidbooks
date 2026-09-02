"use client";

import Image from "next/image";
import Link from "next/link";
import { useDict } from "@/components/site/LocaleProvider";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { isSupabaseStorageUrl } from "@/lib/imageTransform";
import type { Project } from "@/lib/types";

export function ProjectLightbox({
  project,
  canEdit,
  onClose,
  onPrev,
  onNext,
  onEdit,
}: {
  project: Project;
  canEdit: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEdit: () => void;
}) {
  const { locale, t } = useDict();
  const title = pickLocalized(locale, project.title, project.title_en);
  const description = pickLocalized(locale, project.description, project.description_en);
  const content = pickLocalized(locale, project.content, project.content_en);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0908" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 flex-none" style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Image
            src="/brand/funti-logo.jpg"
            alt=""
            width={36}
            height={36}
            className="rounded-full object-cover flex-none"
          />
          <div className="flex flex-col min-w-0">
            <h2 className="text-white text-sm font-bold truncate">{title}</h2>
            <span className="text-xs truncate" style={{ color: "rgba(255,255,255,.6)" }}>
              Funti Kidbooks Studio · {categoryLabel(locale, project.tag)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-none">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="icon-btn-dark flex items-center gap-1.5 rounded-full text-white text-xs font-bold px-3 py-2"
              style={{ background: "rgba(255,255,255,.1)" }}
            >
              {t.projects.editProject}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.projects.close}
            className="icon-btn-dark flex items-center justify-center rounded-full text-white flex-none"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,.1)" }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable case study — cover + rich content (text interspersed with images) */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-3 px-4 sm:px-10 py-8">
          {project.cover_image_url && (
            <div className="relative w-full rounded-[var(--radius-md)] overflow-hidden">
              <Image
                src={project.cover_image_url}
                alt={title}
                width={1400}
                height={974}
                unoptimized={isSupabaseStorageUrl(project.cover_image_url)}
                className="w-full h-auto"
              />
            </div>
          )}

          {description && (
            <p className="text-base font-semibold" style={{ color: "rgba(255,255,255,.85)" }}>
              {description}
            </p>
          )}

          {content ? (
            <div
              className="rich-content"
              style={{ color: "rgba(255,255,255,.85)" }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            !project.cover_image_url && (
              <p className="text-sm text-center py-16" style={{ color: "rgba(255,255,255,.5)" }}>
                {t.projects.noContent}
              </p>
            )
          )}
        </div>
      </div>

      {/* Right-side action rail, Behance-style */}
      <div
        className="hidden sm:flex flex-col items-center gap-5 fixed"
        style={{ right: 24, top: "50%", transform: "translateY(-50%)" }}
      >
        {[
          { icon: "🔗", label: t.projects.share, href: "#" },
          { icon: "💬", label: t.projects.contact, href: "/lien-he" },
          { icon: "❤", label: t.projects.like, href: "#" },
        ].map((a) => (
          <Link key={a.label} href={a.href} className="flex flex-col items-center gap-1 text-white">
            <span
              className="icon-btn-dark flex items-center justify-center rounded-full"
              style={{ width: 44, height: 44, background: "rgba(255,255,255,.1)" }}
              aria-hidden
            >
              {a.icon}
            </span>
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,.7)" }}>
              {a.label}
            </span>
          </Link>
        ))}
      </div>

      {/* Prev / next project */}
      <button
        type="button"
        onClick={onPrev}
        aria-label={t.projects.prevProject}
        className="icon-btn-dark hidden sm:flex items-center justify-center rounded-full text-white fixed"
        style={{ left: 24, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, background: "rgba(255,255,255,.1)" }}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label={t.projects.nextProject}
        className="icon-btn-dark hidden sm:flex items-center gap-1.5 rounded-full text-white fixed px-4 py-2.5"
        style={{ right: 24, bottom: 24, background: "rgba(255,255,255,.1)" }}
      >
        {t.projects.nextProjectLabel}
      </button>

      {/* Bottom-left contact promo, Behance "available for hire" style */}
      <div
        className="hidden md:flex items-center gap-3 fixed rounded-full px-3 py-2"
        style={{ left: 24, bottom: 24, background: "rgba(255,255,255,.95)" }}
      >
        <Image src="/brand/funti-logo.jpg" alt="" width={32} height={32} className="rounded-full object-cover" />
        <span className="text-sm font-semibold">{t.projects.hirePromo}</span>
        <Link href="/lien-he" className="btn btn-primary btn-sm">
          {t.projects.hireCta}
        </Link>
      </div>
    </div>
  );
}
