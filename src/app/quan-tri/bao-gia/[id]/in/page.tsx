import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getQuote } from "@/lib/actions/quotes";
import { QuotePrintView } from "@/components/admin/QuotePrintView";

export const metadata: Metadata = { title: "Báo giá" };

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director") redirect("/quan-tri");

  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();
  return <QuotePrintView quote={quote} />;
}
