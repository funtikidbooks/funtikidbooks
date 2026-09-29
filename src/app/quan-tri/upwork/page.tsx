import type { Metadata } from "next";
import { getUpworkFilters, getUpworkSop, listProposalTemplates, listUpworkBatches } from "@/lib/actions/upwork";
import { UpworkReportsAdmin } from "./UpworkReportsAdmin";

export const metadata: Metadata = { title: "Quản trị — Tìm khách (Upwork)" };

export default async function UpworkReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, batches, templates, sop, filters] = await Promise.all([
    searchParams,
    listUpworkBatches(),
    listProposalTemplates(),
    getUpworkSop(),
    getUpworkFilters(),
  ]);
  return (
    <UpworkReportsAdmin
      initialBatches={batches}
      initialTemplates={templates}
      sop={sop}
      filters={filters}
      initialTab={tab === "mau" ? "templates" : tab === "sop" ? "sop" : tab === "hieu-qua" ? "stats" : "batches"}
    />
  );
}
