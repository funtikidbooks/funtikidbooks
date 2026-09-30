"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDict } from "@/components/site/LocaleProvider";
import { ProjectLightbox } from "@/components/site/ProjectLightbox";
import { Reveal } from "@/components/site/Reveal";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { isSupabaseStorageUrl, resizedUrl } from "@/lib/imageTransform";
import { trackProjectView } from "@/lib/actions/projects";
import { saveJsonSetting } from "@/lib/actions/admin";
import { CARD_ART_KEY, DEFAULT_CARD_ART, DEFAULT_FEATURED, FEATURED_KEY, projectImages } from "@/lib/projectCards";
import type { Project } from "@/lib/types";

// Code-split: the rich-text editor (TipTap) it pulls in is heavy and only
// director/admin ever open this dialog — regular visitors shouldn't pay for
// it in their initial page load.
const ProjectEditDialog = dynamic(() => import("@/components/admin/ProjectEditDialog").then((m) => m.ProjectEditDialog), {
  ssr: false,
});

const ALL = "Tất cả dự án";
const CATEGORIES = [ALL, "Sách tranh", "Sách truyện", "Sách giáo dục", "Character Design", "Product & Merch", "Sự kiện & Lễ"];
// Events are news more than portfolio — last in "all projects".
const LAST = "Sự kiện & Lễ";

function img(src: string, width: number) {
  return isSupabaseStorageUrl(src) ? (resizedUrl(src, width) ?? src) : src;
}

export function ProjectsGrid({
  projects,
  canEdit = false,
  initialOpenId,
  initialCategory,
  featuredIds,
  cardArt,
}: {
  projects: Project[];
  canEdit?: boolean;
  initialOpenId?: string;
  initialCategory?: string;
  featuredIds: string[] | null;
  cardArt: Record<string, string>;
}) {
  const { locale, t } = useDict();
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState(projects);
  // The page fetches published-only projects to stay static; once a
  // director/admin is confirmed client-side, the parent re-fetches with
  // drafts included and passes a new `projects` array here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(projects);
  }, [projects]);

  const [active, setActive] = useState(initialCategory && CATEGORIES.includes(initialCategory) ? initialCategory : ALL);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [pinned, setPinned] = useState<string[]>(featuredIds ?? DEFAULT_FEATURED);
  const [art, setArt] = useState(cardArt);
  const [picking, setPicking] = useState<Project | null>(null);

  // Deep-linked from elsewhere (e.g. the home page) with ?p=<id> or ?c=<category>
  // — open straight to it, then drop the params so a refresh or the back
  // button doesn't keep reopening it.
  useEffect(() => {
    if (!initialOpenId && !initialCategory) return;
    if (initialOpenId) void trackProjectView(initialOpenId);
    router.replace(pathname, { scroll: false });
    // Only ever meant to fire once, for what the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardSrc = (p: Project) => art[p.id] ?? DEFAULT_CARD_ART[p.id] ?? p.cover_image_url;

  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const featured = useMemo(() => pinned.map((id) => byId.get(id)).filter((p): p is Project => !!p), [pinned, byId]);
  const showFeatured = active === ALL && featured.length > 0;

  const filtered = useMemo(() => {
    if (active !== ALL) return items.filter((p) => p.tag === active);
    const rest = items.filter((p) => !(showFeatured && pinned.includes(p.id)));
    return [...rest.filter((p) => p.tag !== LAST), ...rest.filter((p) => p.tag === LAST)];
  }, [active, items, pinned, showFeatured]);
  // The lightbox's previous/next walks the page in the order it's shown.
  const ordered = showFeatured ? [...featured, ...filtered] : filtered;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of items) m.set(p.tag, (m.get(p.tag) ?? 0) + 1);
    return m;
  }, [items]);

  function openProject(id: string) {
    setOpenId(id);
    void trackProjectView(id);
  }

  const openItem = items.find((p) => p.id === openId) ?? null;
  const openIndex = openItem ? ordered.findIndex((p) => p.id === openId) : -1;

  function go(delta: number) {
    if (openIndex === -1) return;
    const next = (openIndex + delta + ordered.length) % ordered.length;
    setOpenId(ordered[next].id);
  }

  function upsert(project: Project) {
    setItems((prev) => {
      const exists = prev.some((p) => p.id === project.id);
      return exists ? prev.map((p) => (p.id === project.id ? project : p)) : [...prev, project];
    });
  }

  function togglePin(id: string) {
    const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
    setPinned(next);
    saveJsonSetting(FEATURED_KEY, next, ["/du-an"]).catch(() => {});
  }

  function chooseArt(id: string, src: string | null) {
    const next = { ...art };
    if (src) next[id] = src;
    else delete next[id];
    setArt(next);
    setPicking(null);
    saveJsonSetting(CARD_ART_KEY, next, ["/du-an"]).catch(() => {});
  }

  const editorButtons = (p: Project) =>
    canEdit && (
      <div className="absolute top-2 right-2 flex flex-wrap justify-end items-center gap-1.5">
        <span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: "rgba(20,18,17,.75)", color: "#fff" }} title={t.projects.views}>
          👁 {p.view_count}
        </span>
        {[
          { label: pinned.includes(p.id) ? t.projects.unpin : t.projects.pin, on: () => togglePin(p.id) },
          { label: t.projects.cardArt, on: () => setPicking(p) },
          { label: t.projects.edit, on: () => setEditing(p) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.on}
            className="editable-image-btn px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
          >
            {b.label}
          </button>
        ))}
      </div>
    );

  const card = (p: Project, i: number, big = false) => {
    const src = cardSrc(p);
    return (
      <Reveal key={p.id} delay={(i % 4) * 60} y={14} className="relative group min-w-0">
        <button
          type="button"
          onClick={() => openProject(p.id)}
          className="block w-full text-left"
          style={{ opacity: !p.published ? 0.55 : 1 }}
        >
          <span
            className="relative block overflow-hidden rounded-[14px]"
            style={{ aspectRatio: big ? "16 / 10" : "4 / 3", background: "var(--color-surface)", boxShadow: "var(--shadow-sm)" }}
          >
            {src ? (
              <Image
                src={img(src, big ? 900 : 640)}
                alt={p.title}
                fill
                unoptimized={isSupabaseStorageUrl(src)}
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                sizes={big ? "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw" : "(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"}
              />
            ) : null}
          </span>
          <span className="flex flex-col gap-0.5 pt-2.5 px-0.5">
            <span className={`font-bold leading-snug line-clamp-2 ${big ? "text-[15.5px]" : "text-[13.5px] sm:text-[14.5px]"}`} style={{ color: "var(--color-text)" }}>
              {pickLocalized(locale, p.title, p.title_en)}
            </span>
            <span className="text-[12px] sm:text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
              {categoryLabel(locale, p.tag)}
            </span>
          </span>
        </button>
        {editorButtons(p)}
      </Reveal>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Categories: one row that scrolls sideways on a phone. */}
      <div className="-mx-5 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center gap-2 w-max">
          {CATEGORIES.map((c) => {
            const on = active === c;
            const n = c === ALL ? items.length : counts.get(c) ?? 0;
            if (c !== ALL && n === 0 && !canEdit) return null;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                aria-pressed={on}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold whitespace-nowrap transition-colors"
                style={{
                  background: on ? "var(--color-accent-2-700)" : "var(--color-panel)",
                  color: on ? "#fff" : "var(--color-neutral-700)",
                  boxShadow: on ? "none" : "inset 0 0 0 1px var(--color-neutral-200)",
                }}
              >
                {c === ALL ? t.projects.allCategory : categoryLabel(locale, c)}
                <span className="text-[11.5px] font-semibold" style={{ opacity: 0.7 }}>
                  {n}
                </span>
              </button>
            );
          })}
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm ml-2" onClick={() => setEditing("new")}>
              {t.projects.addProject}
            </button>
          )}
        </div>
      </div>

      {showFeatured && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] sm:text-[22px] flex items-center gap-2">
            <span style={{ color: "var(--color-accent-500)" }} aria-hidden>
              ★
            </span>
            {t.projects.featuredTitle}
          </h2>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-4 sm:gap-x-5 gap-y-7">{featured.map((p, i) => card(p, i, true))}</div>
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 sm:gap-x-5 gap-y-7">
        {filtered.map((p, i) => card(p, i))}

        {/* The way in, as the last tile of the wall. */}
        <div className="flex flex-col justify-center gap-2 rounded-[14px] p-5" style={{ background: "var(--color-accent-100)", minHeight: 160 }}>
          <span className="text-[15px] font-bold leading-snug" style={{ color: "var(--color-accent-800)" }}>
            {t.projects.promoTitle}
          </span>
          <p className="text-[13px]" style={{ color: "var(--color-accent-700)" }}>
            {t.projects.promoBody}
          </p>
          <Link href="/cong-viec" className="btn btn-primary btn-sm w-fit mt-1">
            {t.projects.promoCta}
          </Link>
        </div>
      </div>

      {openItem && (
        <ProjectLightbox
          project={openItem}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onEdit={() => setEditing(openItem)}
        />
      )}

      {picking && <CardArtPicker project={picking} current={cardSrc(picking)} onPick={(src) => chooseArt(picking.id, src)} onClose={() => setPicking(null)} />}

      {editing && (
        <ProjectEditDialog
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(p) => setItems((prev) => [...prev, p])}
          onUpdated={(_id, patch) => upsert(patch)}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((p) => p.id !== id));
            if (openId === id) setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

// Editors: pick which of the project's own pictures stands for it on the grid.
function CardArtPicker({
  project,
  current,
  onPick,
  onClose,
}: {
  project: Project;
  current: string | null;
  onPick: (src: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useDict();
  const pictures = projectImages(project);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(20,18,17,.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-[860px] max-h-[86vh] overflow-y-auto rounded-[18px] p-5 sm:p-6 flex flex-col gap-4"
        style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.projects.cardArtTitle}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg">
              {t.projects.cardArtTitle} · {project.title}
            </h3>
            <p className="text-[13px] mt-1" style={{ color: "var(--color-neutral-600)" }}>
              {t.projects.cardArtHint}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        {pictures.length <= 1 && (
          <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
            {t.projects.cardArtEmpty}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {pictures.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => onPick(src)}
              className="relative block overflow-hidden rounded-[10px]"
              style={{ aspectRatio: "4 / 3", boxShadow: src === current ? "0 0 0 3px var(--color-accent-500)" : "inset 0 0 0 1px var(--color-neutral-200)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(src, 360)} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
        {project.cover_image_url && (
          <button type="button" className="btn btn-secondary btn-sm w-fit" onClick={() => onPick(project.cover_image_url)}>
            {t.projects.cardArtReset}
          </button>
        )}
      </div>
    </div>
  );
}
