"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllProjectsForEditor } from "@/lib/actions/editorContent";
import type { Project } from "@/lib/types";
import { ProjectsGrid } from "./ProjectsGrid";

type GridProps = { projects: Project[]; canEdit: boolean; featuredIds: string[] | null; cardArt: Record<string, string> };

// ?p=<id> (open a project) and ?c=<category> (start on a category) are read
// client-side — reading searchParams on the server would make the whole page
// dynamic — behind the <Suspense> useSearchParams() requires.
function ProjectsGridWithDeepLink(props: GridProps) {
  const searchParams = useSearchParams();
  return <ProjectsGrid {...props} initialOpenId={searchParams.get("p") ?? undefined} initialCategory={searchParams.get("c") ?? undefined} />;
}

export function ProjectsPageContent({
  initialProjects,
  featuredIds,
  cardArt,
}: {
  initialProjects: Project[];
  featuredIds: string[] | null;
  cardArt: Record<string, string>;
}) {
  const { t } = useDict();
  const { canEdit } = useViewer();
  const projects = useEditorSwap(canEdit, fetchAllProjectsForEditor, initialProjects);
  const grid: GridProps = { projects, canEdit, featuredIds, cardArt };

  return (
    <>
      <section className="fk-paper">
        <div className="site-container pt-10 pb-6 sm:pt-14 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="flex flex-col gap-3 max-w-[640px]">
            <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-2-700)" }}>
              {t.projects.kicker}
            </div>
            <h1 className="text-[32px] leading-[1.15] sm:text-[42px]" style={{ textWrap: "balance" }}>
              {t.projects.title}
            </h1>
            <p className="text-[16px] sm:text-[17px] leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
              {t.projects.body}
            </p>
          </div>
          <dl className="flex gap-6 sm:gap-10">
            {t.projects.stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse gap-1">
                <dt className="text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
                  {s.label}
                </dt>
                <dd className="font-heading font-bold text-[26px] leading-none" style={{ color: "var(--color-accent-600)" }}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="site-container pt-4 pb-16">
        <Suspense fallback={<ProjectsGrid {...grid} />}>
          <ProjectsGridWithDeepLink {...grid} />
        </Suspense>
      </section>
    </>
  );
}
