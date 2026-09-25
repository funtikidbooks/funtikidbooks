import type { Metadata } from "next";
import { getUpworkSop, listProposalTemplates, listUpworkBatches } from "@/lib/actions/upwork";
import { UpworkReportsAdmin } from "./UpworkReportsAdmin";

export const metadata: Metadata = { title: "Quản trị — Tìm khách (Upwork)" };

export default async function UpworkReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, batches, templates, sop] = await Promise.all([searchParams, listUpworkBatches(), listProposalTemplates(), getUpworkSop()]);
  return (
    <UpworkReportsAdmin
      initialBatches={batches}
      initialTemplates={templates}
      sop={sop}
      initialTab={tab === "mau" ? "templates" : tab === "sop" ? "sop" : "batches"}
    />
  );
}
