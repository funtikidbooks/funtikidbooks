import type { Metadata } from "next";
import { listMyStaffDocuments } from "@/lib/actions/documents";
import { DocumentsPanel } from "@/components/workspace/DocumentsPanel";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function DocumentsPage() {
  const documents = await listMyStaffDocuments();
  return <DocumentsPanel documents={documents} />;
}
