import type { Metadata } from "next";
import { listProposalTemplates, listUpworkBatches } from "@/lib/actions/upwork";
import { UpworkReportsAdmin } from "./UpworkReportsAdmin";

export const metadata: Metadata = { title: "Quản trị — Tìm khách (Upwork)" };

export default async function UpworkReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, batches, templates] = await Promise.all([searchParams, listUpworkBatches(), listProposalTemplates()]);
  return <UpworkReportsAdmin initialBatches={batches} initialTemplates={templates} initialTab={tab === "mau" ? "templates" : "batches"} />;
}
