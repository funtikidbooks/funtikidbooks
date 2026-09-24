import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMindmapProjectDetail } from "@/lib/actions/mindmap";
import { MindmapCanvas } from "@/components/workspace/MindmapCanvas";

export const metadata: Metadata = { title: "Dự án" };

export default async function MindmapProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMindmapProjectDetail(id);
  if (!detail) notFound();

  return <MindmapCanvas project={detail.project} initialNodes={detail.nodes} />;
}
