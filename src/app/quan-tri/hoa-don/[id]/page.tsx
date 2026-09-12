import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getInvoice } from "@/lib/actions/invoices";
import { InvoicePrintView } from "@/components/admin/InvoicePrintView";

export const metadata: Metadata = { title: "Hoá đơn" };

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    redirect("/quan-tri");
  }

  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  return <InvoicePrintView invoice={invoice} />;
}
