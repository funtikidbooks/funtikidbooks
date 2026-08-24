import type { Metadata } from "next";
import { listProjects } from "@/lib/actions/admin";
import { ProjectsAdmin } from "./ProjectsAdmin";

export const metadata: Metadata = { title: "Quản trị — Dự án" };

export default async function AdminProjectsPage() {
  const projects = await listProjects();
  return <ProjectsAdmin initialProjects={projects} />;
}
