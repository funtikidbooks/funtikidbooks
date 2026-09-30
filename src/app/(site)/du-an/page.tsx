import type { Metadata } from "next";
import { getJsonSetting, getPublishedProjects } from "@/lib/data/site-content";
import { CARD_ART_KEY, FEATURED_KEY } from "@/lib/projectCards";
import { ProjectsPageContent } from "./ProjectsPageContent";

const PAGE_DESCRIPTION =
  "Portfolio các dự án minh hoạ sách thiếu nhi, thiết kế nhân vật và bìa sách mà Funti Kidbooks Studio đã thực hiện cùng tác giả, nhà xuất bản và thương hiệu trên khắp thế giới.";

export const metadata: Metadata = {
  title: "Dự án",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Dự án · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Dự án · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function ProjectsPage() {
  const [projects, featuredIds, cardArt] = await Promise.all([
    getPublishedProjects(),
    // null until an editor pins something — then their list, in their order.
    getJsonSetting<string[] | null>(FEATURED_KEY, null),
    getJsonSetting<Record<string, string>>(CARD_ART_KEY, {}),
  ]);
  return <ProjectsPageContent initialProjects={projects} featuredIds={featuredIds} cardArt={cardArt} />;
}
