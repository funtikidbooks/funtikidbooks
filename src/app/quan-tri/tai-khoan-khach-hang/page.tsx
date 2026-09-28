import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listClientAccounts } from "@/lib/actions/clientAccounts";
import { ClientAccounts } from "./ClientAccounts";

export const metadata: Metadata = { title: "Quản trị — Tài khoản khách hàng" };

export default async function ClientAccountsPage() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  const isDirector = me?.access_role === "director";
  if (!isDirector && me?.role !== "Project Manager") redirect("/quan-tri");

  const accounts = await listClientAccounts();
  return <ClientAccounts initialAccounts={accounts} isDirector={isDirector} />;
}
