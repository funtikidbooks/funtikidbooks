import type { Metadata } from "next";
import Image from "next/image";
import { getContentEditorRole, getProjects } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";
import { ProjectsGrid } from "./ProjectsGrid";

export const metadata: Metadata = { title: "Dự án" };

export default async function ProjectsPage() {
  const [editorRole, locale] = await Promise.all([getContentEditorRole(), getLocale()]);
  const canEdit = editorRole !== null;
  const projects = await getProjects(canEdit);
  const t = dictionary[locale].projects;

  const TAGS = [
    { icon: "🎨", label: t.tagline1 },
    { icon: "🏢", label: t.tagline2 },
    { icon: "📍", label: t.tagline3 },
  ];

  return (
    <>
      <section className="px-6 lg:px-10 pt-10 pb-8">
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
            {t.stats.map((s) => (
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

      <section className="px-6 lg:px-10 pb-16">
        <ProjectsGrid projects={projects} canEdit={canEdit} />
      </section>
    </>
  );
}
