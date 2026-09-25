import type { Metadata } from "next";
import { listUpworkBatches } from "@/lib/actions/upwork";
import { UpworkReportsAdmin } from "./UpworkReportsAdmin";

export const metadata: Metadata = { title: "Quản trị — Tìm khách (Upwork)" };

export default async function UpworkReportsPage() {
  const batches = await listUpworkBatches();
  return <UpworkReportsAdmin initialBatches={batches} />;
}
