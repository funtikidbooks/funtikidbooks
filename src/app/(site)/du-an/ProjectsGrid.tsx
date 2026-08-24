"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useDict } from "@/components/site/LocaleProvider";
import { ProjectLightbox } from "@/components/site/ProjectLightbox";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { setProjectLike, trackProjectView } from "@/lib/actions/projects";
import type { Project } from "@/lib/types";

const LIKED_STORAGE_KEY = "funti-liked-projects";
const LIKED_EVENT = "funti-liked-projects-change";

// Same pattern as useTheme: read the raw string via useSyncExternalStore
// (stable across renders since strings compare by value) and parse it in
// the component, rather than setState-ing a Set from an effect.
function subscribeLikedProjects(callback: () => void) {
  window.addEventListener(LIKED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LIKED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getLikedProjectsSnapshot() {
  return localStorage.getItem(LIKED_STORAGE_KEY) ?? "[]";
}

function getLikedProjectsServerSnapshot() {
  return "[]";
}

function writeLikedProjects(ids: Set<string>) {
  localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(LIKED_EVENT));
}

// Code-split: the rich-text editor (TipTap) it pulls in is heavy and only
// director/admin ever open this dialog — regular visitors shouldn't pay for
// it in their initial page load.
const ProjectEditDialog = dynamic(() => import("@/components/admin/ProjectEditDialog").then((m) => m.ProjectEditDialog), {
  ssr: false,
});

const ALL = "Tất cả dự án";
const CATEGORIES = [ALL, "Sách tranh", "Sách truyện", "Sách giáo dục", "Character Design", "Product & Merch", "Sự kiện & Lễ"];

// Shown only until the studio has published real projects — cropped from
// the studio's own Claude Design mockup as an AI-generated placeholder.
const FALLBACK_PROJECTS: Pick<Project, "id" | "title" | "title_en" | "tag" | "cover_image_url">[] = [
  { id: "fallback-0", title: "Miền Dâu Dại", title_en: null, tag: "Sách tranh", cover_image_url: "/placeholders/projects/mien-dau-dai.jpg" },
  { id: "fallback-1", title: "Drachen lieben Schokolade", title_en: null, tag: "Sách truyện", cover_image_url: "/placeholders/projects/drachen-schokolade.jpg" },
  { id: "fallback-2", title: "Usborne First Experiences", title_en: null, tag: "Sách giáo dục", cover_image_url: "/placeholders/projects/usborne-first-experiences.jpg" },
  { id: "fallback-3", title: "Ping the Panda", title_en: null, tag: "Sách tranh", cover_image_url: "/placeholders/projects/ping-the-panda.jpg" },
  { id: "fallback-4", title: "The Mystical Amulet", title_en: null, tag: "Sách truyện", cover_image_url: "/placeholders/projects/mystical-amulet.jpg" },
  { id: "fallback-5", title: "Hành trình của Gấu Bông", title_en: null, tag: "Character Design", cover_image_url: "/placeholders/projects/hanh-trinh-gau-bong.jpg" },
  { id: "fallback-6", title: "Bộ sticker – Thế giới Funti", title_en: null, tag: "Product & Merch", cover_image_url: "/placeholders/projects/bo-sticker-funti.jpg" },
  { id: "fallback-8", title: "Sách toán vui mỗi ngày", title_en: null, tag: "Sách giáo dục", cover_image_url: "/placeholders/projects/sach-toan-vui.jpg" },
];

export function ProjectsGrid({ projects, canEdit = false }: { projects: Project[]; canEdit?: boolean }) {
  const { locale, t } = useDict();
  const [items, setItems] = useState(projects);
  const isRealData = items.length > 0;
  const source = isRealData ? items : FALLBACK_PROJECTS;

  const [active, setActive] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Project | "new" | null>(null);

  const likedRaw = useSyncExternalStore(subscribeLikedProjects, getLikedProjectsSnapshot, getLikedProjectsServerSnapshot);
  const likedIds = useMemo(() => {
    try {
      const parsed = JSON.parse(likedRaw);
      return new Set<string>(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set<string>();
    }
  }, [likedRaw]);

  function openProjectAndTrackView(id: string) {
    setOpenId(id);
    if (isRealData) void trackProjectView(id);
  }

  function toggleLike(p: Project) {
    const liked = !likedIds.has(p.id);
    const prevItems = items;

    const nextLikedIds = new Set(likedIds);
    if (liked) nextLikedIds.add(p.id);
    else nextLikedIds.delete(p.id);
    writeLikedProjects(nextLikedIds);

    setItems((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, like_count: Math.max(0, x.like_count + (liked ? 1 : -1)) } : x)),
    );

    setProjectLike(p.id, liked).then((newCount) => {
      if (newCount === null) {
        writeLikedProjects(likedIds);
        setItems(prevItems);
      }
    });
  }

  const filtered = useMemo(
    () => (active === ALL ? source : source.filter((p) => p.tag === active)),
    [active, source],
  );

  const openProject = isRealData ? items.find((p) => p.id === openId) ?? null : null;
  const openIndex = openProject ? filtered.findIndex((p) => p.id === openId) : -1;

  function go(delta: number) {
    if (openIndex === -1) return;
    const next = (openIndex + delta + filtered.length) % filtered.length;
    setOpenId(filtered[next].id);
  }

  function upsert(project: Project) {
    setItems((prev) => {
      const exists = prev.some((p) => p.id === project.id);
      return exists ? prev.map((p) => (p.id === project.id ? project : p)) : [...prev, project];
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-5 h-fit lg:sticky lg:top-24">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-bold tracking-[0.1em] mb-1" style={{ color: "var(--color-accent-700)" }}>
            {t.projects.sidebarKicker}
          </div>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              className="text-left text-sm font-semibold rounded-[var(--radius-md)] px-3 py-2 transition-colors"
              style={{
                background: active === c ? "var(--color-accent-2-100)" : "transparent",
                color: active === c ? "var(--color-accent-2-800)" : "var(--color-neutral-700)",
              }}
            >
              {c === ALL ? t.projects.allCategory : categoryLabel(locale, c)}
            </button>
          ))}
        </div>

        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm w-fit" onClick={() => setEditing("new")}>
            {t.projects.addProject}
          </button>
        )}

        <div className="card elev-sm p-5 flex flex-col gap-2" style={{ background: "var(--color-accent-100)", border: "none" }}>
          <span className="text-sm font-bold" style={{ color: "var(--color-accent-800)" }}>
            {t.projects.promoTitle}
          </span>
          <p className="text-xs" style={{ color: "var(--color-accent-700)" }}>
            {t.projects.promoBody}
          </p>
          <Link href="/lien-he" className="btn btn-primary btn-sm w-fit mt-1">
            {t.projects.promoCta}
          </Link>
        </div>
      </aside>

      <div>
        <p className="text-sm mb-4" style={{ color: "var(--color-neutral-600)" }}>
          {t.projects.showing(filtered.length, source.length)}
        </p>

        {/* Behance-style grid: uniform cards, gently landscape (not a hard
            square), caption reveals on hover. */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="relative group rounded-[var(--radius-md)] overflow-hidden card elev-sm"
              style={{ aspectRatio: "4 / 3" }}
            >
              <button
                type="button"
                onClick={() => openProjectAndTrackView(p.id)}
                className="absolute inset-0 w-full h-full text-left"
                style={{ opacity: isRealData && !(p as Project).published ? 0.55 : 1 }}
              >
                {p.cover_image_url ? (
                  <Image
                    src={p.cover_image_url}
                    alt={p.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: "var(--color-surface)" }}>
                    🖼
                  </div>
                )}
                <div
                  className="absolute inset-0 flex flex-col justify-end p-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(180deg, transparent 40%, rgba(20,18,17,.85) 100%)" }}
                >
                  <span className="tag tag-accent w-fit mb-1.5">{categoryLabel(locale, p.tag)}</span>
                  <h3 className="text-white text-sm font-bold">{pickLocalized(locale, p.title, p.title_en)}</h3>
                </div>
              </button>

              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                {isRealData && (
                  <>
                    <span
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
                      title={t.projects.views}
                    >
                      👁 {(p as Project).view_count}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleLike(p as Project)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
                      aria-label={likedIds.has(p.id) ? t.projects.unlikeAria : t.projects.likeAria}
                      aria-pressed={likedIds.has(p.id)}
                    >
                      {likedIds.has(p.id) ? "❤️" : "🤍"} {(p as Project).like_count}
                    </button>
                  </>
                )}
                {canEdit && isRealData && (
                  <button
                    type="button"
                    onClick={() => setEditing(p as Project)}
                    className="editable-image-btn flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold opacity-80 group-hover:opacity-100"
                    style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
                  >
                    {t.projects.edit}
                  </button>
                )}
              </div>
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="gallery-add-tile flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)]"
              style={{ aspectRatio: "4 / 3", border: "2px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
            >
              <span className="text-2xl leading-none" aria-hidden>
                +
              </span>
              <span className="text-xs font-bold">{t.projects.addNewTile}</span>
            </button>
          )}
        </div>
      </div>

      {openProject && (
        <ProjectLightbox
          project={openProject}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onEdit={() => setEditing(openProject)}
        />
      )}

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
