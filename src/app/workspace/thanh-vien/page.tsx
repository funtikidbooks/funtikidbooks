import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <MembersDirectory
      profiles={(profiles ?? []) as Profile[]}
      currentUserId={user?.id ?? ""}
      canManage={me?.access_role === "director"}
    />
  );
}
