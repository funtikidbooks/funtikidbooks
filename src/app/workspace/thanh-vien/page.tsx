import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listStaffBankInfo } from "@/lib/actions/admin";
import { MembersDirectory } from "@/components/workspace/MembersDirectory";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Thành viên" };

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profiles }, { data: me }] = await Promise.all([
    supabase.from("profiles").select("*").order("display_name", { ascending: true }),
    user
      ? supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const canManage = me?.access_role === "director";
  // Fetched only for the director — listStaffBankInfo() itself also
  // enforces this server-side (RLS + requireDirector()), this just avoids
  // the extra round-trip for every other viewer of this page.
  const bankInfo = canManage ? await listStaffBankInfo() : [];

  return (
    <MembersDirectory
      profiles={(profiles ?? []) as Profile[]}
      currentUserId={user?.id ?? ""}
      canManage={canManage}
      initialBankInfo={bankInfo}
    />
  );
}
