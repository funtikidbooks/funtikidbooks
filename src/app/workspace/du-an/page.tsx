import type { Metadata } from "next";
import { getMindmapProjects } from "@/lib/actions/mindmap";
import { MindmapProjectsList } from "@/components/workspace/MindmapProjectsList";

export const metadata: Metadata = { title: "Dự án" };

export default async function MindmapProjectsPage() {
  const projects = await getMindmapProjects();
  return <MindmapProjectsList initialProjects={projects} />;
}
