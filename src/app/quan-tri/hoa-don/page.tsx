import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listInvoices } from "@/lib/actions/invoices";
import { InvoiceManager } from "@/components/admin/InvoiceManager";

export const metadata: Metadata = { title: "Quản trị — Hoá đơn" };

export default async function AdminInvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role")
    .eq("id", user!.id)
    .maybeSingle();

  if (profile?.access_role !== "director") {
    redirect("/quan-tri");
  }

  const invoices = await listInvoices();
  return <InvoiceManager initialInvoices={invoices} />;
}
