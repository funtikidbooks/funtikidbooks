import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { Sidebar } from "@/components/workspace/Sidebar";
import { ChatManagerProvider } from "@/components/workspace/ChatManager";
import { ChatDock } from "@/components/workspace/ChatDock";
import { ChatHeadBubbles } from "@/components/workspace/ChatHeadBubbles";
import { MessageToasts } from "@/components/workspace/MessageToasts";
import { ChatSyncBanner } from "@/components/workspace/ChatSyncBanner";
import { ClientErrorReporter } from "@/components/workspace/ClientErrorReporter";
import { PublicPageWarmer } from "@/components/workspace/PublicPageWarmer";
import { TabNotificationBadge } from "@/components/workspace/TabNotificationBadge";
import { ThemeSync } from "@/components/workspace/ThemeSync";
import { ProfileMenu } from "@/components/workspace/ProfileMenu";
import { MessengerButton } from "@/components/workspace/MessengerButton";
import { LeaveTopBar } from "@/components/workspace/LeaveTopBar";
import { MobileNav } from "@/components/workspace/MobileNav";
import { TeamOnlineBadge } from "@/components/workspace/TeamOnlineBadge";
import { IosInstallHint, PushPermissionBanner, PushSetup } from "@/components/workspace/PushSetup";
import { AutoReloadWatchdog } from "@/components/workspace/AutoReloadWatchdog";
import { getUnreadCounts } from "@/lib/actions/messages";
import { checkInIfNeeded } from "@/lib/actions/attendance";
import { countMyPendingDocuments } from "@/lib/actions/documents";
import { getUnreadClientMessageCount } from "@/lib/actions/clientPortal";
import { fetchActiveLeave } from "@/lib/leaveActive";
import { vnToday } from "@/lib/constants/attendance";
import type { Profile } from "@/lib/types";

// The workspace is an internal tool used mostly through the installed
// iPhone app — it should feel like one. viewportFit "cover" lets content
// draw under the notch/home-indicator area so env(safe-area-inset-*) has
// real values to report (MobileNav's home-indicator padding relies on this); disabling
// pinch-zoom stops accidental double-tap zoom, which no native app allows.
export const viewport: Viewport = {
  themeColor: "#e8674a",
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Goes through the shared, per-request-cached requireUser() (see its own
  // comment in lib/supabase/server.ts) instead of calling auth.getUser()
  // directly, so every other action below that also calls requireUser()
  // internally — getUnreadCounts, countMyPendingDocuments, checkInIfNeeded
  // — reuses this same auth check instead of each re-verifying the JWT
  // against Supabase's auth server on its own. That redundant chain of
  // auth round trips was a real, measurable slice of why a cold workspace
  // load felt slow.
  let supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  let user: Awaited<ReturnType<typeof requireUser>>["user"];
  try {
    ({ supabase, user } = await requireUser());
  } catch {
    redirect("/dang-nhap?next=/workspace");
  }

  // The unread client-message badge (director/PM only) starts with the rest
  // instead of after them: for anyone else it is refused and simply unused.
  const clientUnreadPromise = getUnreadClientMessageCount().catch(() => 0);
  const [{ data: profile }, { data: allProfiles }, unreadCounts, pendingDocumentCount, activeLeave] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, theme, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, theme, created_at")
      .order("display_name", { ascending: true }),
    getUnreadCounts().catch(() => ({})),
    countMyPendingDocuments().catch(() => 0),
    // The top bar's đơn xin nghỉ (LeaveTopBar): one's own, or everyone's for a Giám đốc / PM.
    fetchActiveLeave(supabase, vnToday()).catch(() => []),
  ]);

  // Auto-check-in bookkeeping has zero bearing on what this layout renders
  // — it used to sit here as a sequential `await` (its own auth check plus
  // 2-3 more DB calls) after the Promise.all above had already resolved,
  // purely blocking the response while the page waited on work nothing on
  // screen needed. after() runs it once the response is already on its way
  // to the browser instead.
  after(() => checkInIfNeeded().catch(() => {}));

  // Admin accounts handle site content, not the Kanban workspace — send
  // them to the panel that's actually theirs.
  if (profile?.access_role === "admin") {
    redirect("/quan-tri");
  }

  // No staff profile means a client signed in through Work With Funti
  // (handle_new_user() skips them) — the workspace is staff-only.
  if (!profile) redirect("/cong-viec");

  const myProfile: Profile = profile;

  // Same "director or exact chức danh 'Project Manager'" rule as
  // can_manage_hr() in schema.sql — a PM can already see the HR/finance
  // sections of /quan-tri once there, but had no link into it at all
  // (this icon and MobileNav's were both director-only), so they had no
  // way to discover the URL themselves.
  const canOpenAdmin = myProfile.access_role === "director" || myProfile.role === "Project Manager";
  const isDirector = myProfile.access_role === "director";
  // Đề nghị ứng lương waiting count joins a Giám đốc's "Chờ duyệt" inbox.
  const [initialClientUnreadCount, pendingAdvanceCount] = await Promise.all([
    canOpenAdmin ? clientUnreadPromise : 0,
    isDirector
      ? supabase
          .from("salary_advances")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .then(({ count }) => count ?? 0)
      : 0,
  ]);

  return (
    <ChatManagerProvider currentUserId={user.id} initialUnreadCounts={unreadCounts}>
      <AutoReloadWatchdog />
      <TabNotificationBadge />
      <ThemeSync serverTheme={myProfile.theme} />
      <PushSetup />
      {/* Locked to exactly 100dvh (not min-h) with overflow hidden so this
          shell can never grow taller than the visible viewport and hand
          scrolling off to the page/body. If it did, the whole shell —
          bottom nav included, since it's just the last flex item here —
          would drift up and down as the body scrolled (the iOS rubber-band
          bounce made this easy to trigger by dragging near the bottom).
          Every page under /workspace already scrolls its own content via
          an inner `flex-1 min-h-0` + `overflow-y-auto` region, so nothing
          needs body-level scroll — the bottom nav now truly can't move. */}
      <div className="flex flex-col h-[100dvh] overflow-hidden" style={{ background: "var(--color-bg)" }}>
        <IosInstallHint />
        <PushPermissionBanner />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            user={{
              displayName: myProfile.display_name,
              email: myProfile.email,
              accessRole: myProfile.access_role,
              jobTitle: myProfile.role,
            }}
            currentUserId={user.id}
            profiles={(allProfiles ?? []) as Profile[]}
            pendingDocumentCount={pendingDocumentCount}
            initialClientUnreadCount={initialClientUnreadCount}
          />
          <div className="flex-1 flex flex-col min-w-0">
            <div className="no-print flex-none flex items-center justify-between gap-2 px-3 py-1 sm:px-4 sm:py-2" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <TeamOnlineBadge
                currentUserId={user.id}
                totalMembers={(allProfiles ?? []).length}
                profiles={(allProfiles ?? []) as Profile[]}
              />
              {/* Never shrinks: when the bar is crowded, TeamOnlineBadge gives way. */}
              <div className="flex-none flex items-center gap-2">
                <LeaveTopBar
                  currentUserId={user.id}
                  canManage={canOpenAdmin}
                  isDirector={isDirector}
                  profiles={(allProfiles ?? []) as Profile[]}
                  initial={activeLeave}
                  initialAdvanceCount={pendingAdvanceCount}
                />
                <MessengerButton currentUserId={user.id} profiles={(allProfiles ?? []) as Profile[]} />
                <ProfileMenu profile={myProfile} />
              </div>
            </div>
            <ChatSyncBanner />
            <div className="flex-1 flex flex-col min-h-0">{children}</div>
          </div>
        </div>
        <MobileNav canOpenAdmin={canOpenAdmin} />
      </div>
      <ChatDock currentUser={{ id: myProfile.id, display_name: myProfile.display_name }} />
      <ChatHeadBubbles profiles={(allProfiles ?? []) as Profile[]} />
      <MessageToasts profiles={(allProfiles ?? []) as Profile[]} />
      <ClientErrorReporter />
      <PublicPageWarmer />
    </ChatManagerProvider>
  );
}
