import type { Metadata } from "next";
import Image from "next/image";
import { getContentEditorRole, getProjects } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";
import { ProjectsGrid } from "./ProjectsGrid";

const PAGE_DESCRIPTION =
  "Portfolio các dự án minh hoạ sách thiếu nhi, thiết kế nhân vật và bìa sách mà Funti Kidbooks Studio đã thực hiện cùng tác giả, nhà xuất bản và thương hiệu trên khắp thế giới.";

export const metadata: Metadata = {
  title: "Dự án",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Dự án · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Dự án · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function ProjectsPage({ searchParams }: PageProps<"/du-an">) {
  const [editorRole, locale, params] = await Promise.all([getContentEditorRole(), getLocale(), searchParams]);
  const canEdit = editorRole !== null;
  const projects = await getProjects(canEdit);
  const t = dictionary[locale].projects;
  const pParam = params?.p;
  const initialOpenId = Array.isArray(pParam) ? pParam[0] : pParam;

  const TAGS = [
    { icon: "🎨", label: t.tagline1 },
    { icon: "🏢", label: t.tagline2 },
    { icon: "📍", label: t.tagline3 },
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

      <section className="site-container pb-16">
        <ProjectsGrid projects={projects} canEdit={canEdit} initialOpenId={initialOpenId} />
      </section>
    </>
  );
}
