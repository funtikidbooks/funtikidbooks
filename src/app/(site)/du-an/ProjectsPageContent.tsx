"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllProjectsForEditor } from "@/lib/actions/editorContent";
import type { Project } from "@/lib/types";
import { ProjectsGrid } from "./ProjectsGrid";

// The ?p=<id> deep link (e.g. from the homepage carousel) used to be read
// server-side via `searchParams`, but reading that on the server forces the
// whole page dynamic just like cookies() does — so it's read client-side
// here instead, behind the <Suspense> next/navigation's useSearchParams()
// requires.
function ProjectsGridWithDeepLink({ projects, canEdit }: { projects: Project[]; canEdit: boolean }) {
  const searchParams = useSearchParams();
  const initialOpenId = searchParams.get("p") ?? undefined;
  return <ProjectsGrid projects={projects} canEdit={canEdit} initialOpenId={initialOpenId} />;
}

export function ProjectsPageContent({ initialProjects }: { initialProjects: Project[] }) {
  const { t } = useDict();
  const { canEdit } = useViewer();
  const projects = useEditorSwap(canEdit, fetchAllProjectsForEditor, initialProjects);

  const TAGS = [
    { icon: "🎨", label: t.projects.tagline1 },
    { icon: "🏢", label: t.projects.tagline2 },
    { icon: "📍", label: t.projects.tagline3 },
  ];

  return (
    <>
      <section className="site-container pt-10 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Image
            src="/brand/funti-logo.jpg"
            alt="Funti Kidbooks Studio"
            width={72}
            height={72}
            className="rounded-full object-cover flex-none"
          />
          <div className="flex flex-col gap-2 flex-1">
            <h1 className="text-2xl">Funti Kidbooks Studio</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: "var(--color-neutral-600)" }}>
              {TAGS.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-8 flex-none">
            {t.projects.stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-xl font-heading font-bold" style={{ color: "var(--color-accent-700)" }}>
                  {s.value}
                </span>
                <span className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-container pb-16">
        <Suspense fallback={<ProjectsGrid projects={projects} canEdit={canEdit} />}>
          <ProjectsGridWithDeepLink projects={projects} canEdit={canEdit} />
        </Suspense>
      </section>
    </>
  );
}
