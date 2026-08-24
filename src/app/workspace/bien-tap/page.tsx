import type { Metadata } from "next";
import { getEditorProjects } from "@/lib/data/editor";
import { EditorProjectList } from "@/components/workspace/EditorProjectList";

export const metadata: Metadata = { title: "Biên tập" };

export default async function EditorListPage() {
  const projects = await getEditorProjects();
  return <EditorProjectList initialProjects={projects} />;
}
