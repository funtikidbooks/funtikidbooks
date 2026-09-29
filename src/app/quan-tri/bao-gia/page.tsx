import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listQuotes } from "@/lib/actions/quotes";
import { QuoteList } from "@/components/admin/QuoteList";

export const metadata: Metadata = { title: "Quản trị — Báo giá" };

export default async function QuotesPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director") redirect("/quan-tri");

  const { quotes, ready } = await listQuotes();
  return <QuoteList initialQuotes={quotes} ready={ready} />;
}
