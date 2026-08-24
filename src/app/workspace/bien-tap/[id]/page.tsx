import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEditorProject } from "@/lib/data/editor";
import { getFonts } from "@/lib/data/fonts";
import { Editor } from "@/components/workspace/Editor";

export const metadata: Metadata = { title: "Biên tập" };

export default async function EditorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, fonts] = await Promise.all([getEditorProject(id), getFonts()]);
  if (!project) notFound();

  return <Editor project={project} fonts={fonts} />;
}
