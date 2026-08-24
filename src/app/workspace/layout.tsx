import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/workspace/Sidebar";
import { ChatManagerProvider } from "@/components/workspace/ChatManager";
import { ChatDock } from "@/components/workspace/ChatDock";
import { ProfileMenu } from "@/components/workspace/ProfileMenu";
import { getUnreadCounts } from "@/lib/actions/messages";
import type { Profile } from "@/lib/types";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dang-nhap?next=/workspace");
  }

  const [{ data: profile }, { data: allProfiles }, unreadCounts] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, created_at")
      .order("display_name", { ascending: true }),
    getUnreadCounts().catch(() => ({})),
  ]);

  // Admin accounts handle site content, not the Kanban workspace — send
  // them to the panel that's actually theirs.
  if (profile?.access_role === "admin") {
    redirect("/quan-tri");
  }

  const myProfile: Profile = profile ?? {
    id: user.id,
    email: user.email ?? "",
    display_name: user.email ?? "Thành viên",
    avatar_url: null,
    role: null,
    phone: null,
    address: null,
    access_role: "staff",
    created_at: new Date().toISOString(),
  };

  return (
    <ChatManagerProvider currentUserId={user.id} profiles={(allProfiles ?? []) as Profile[]} initialUnreadCounts={unreadCounts}>
      <div className="flex min-h-screen" style={{ background: "var(--color-bg)" }}>
        <Sidebar
          user={{
            displayName: myProfile.display_name,
            email: myProfile.email,
            accessRole: myProfile.access_role,
          }}
          currentUserId={user.id}
          profiles={(allProfiles ?? []) as Profile[]}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-none flex items-center justify-end px-4 py-2" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            <ProfileMenu profile={myProfile} />
          </div>
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
        </div>
      </div>
      <ChatDock currentUser={{ id: myProfile.id, display_name: myProfile.display_name }} />
    </ChatManagerProvider>
  );
}
