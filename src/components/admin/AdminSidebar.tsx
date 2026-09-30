"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { resetThemeOnSignOut } from "@/lib/useTheme";
import type { AccessRole } from "@/lib/types";

// Who sees an item:
//   director — sếp only (Tổng quan, the whole-business P&L)
//   content  — director + admin (site content)
//   hr       — director + chức danh "Project Manager" (see can_manage_hr()
//              in supabase/schema.sql; Nhân sự is view-only for a PM)
//   inbox    — anyone who answers customers: director, admin, PM
type Audience = "director" | "content" | "hr" | "inbox";
type NavItem = { href: string; label: string; icon: string; who: Audience };
type NavGroup = { id: string; label: string; icon: string; items: NavItem[] };

// Tổng quan sits on its own at the top; everything else is folded into a
// handful of groups so the menu stays short (sếp Phúc: "nhiều mục quá").
const OVERVIEW: NavItem = { href: "/quan-tri/tong-quan", label: "Tổng quan", icon: "📊", who: "director" };
// Right under Tổng quan: the PM's board of who is on which project.
const PROJECT_MANAGER: NavItem = { href: "/quan-tri/quan-ly-du-an", label: "Quản lý dự án", icon: "🗂️", who: "hr" };

const GROUPS: NavGroup[] = [
  {
    id: "nhan-su",
    label: "Nhân sự",
    icon: "🧑‍🤝‍🧑",
    items: [
      { href: "/quan-tri/nhan-su", label: "Nhân sự & phân quyền", icon: "🧑‍🤝‍🧑", who: "hr" },
      { href: "/quan-tri/cham-cong", label: "Chấm công", icon: "🕐", who: "hr" },
      { href: "/quan-tri/bang-luong", label: "Bảng lương", icon: "💰", who: "hr" },
      { href: "/quan-tri/hop-dong", label: "Hợp đồng", icon: "📄", who: "hr" },
      { href: "/quan-tri/tai-lieu", label: "Tài liệu", icon: "🗂️", who: "hr" },
      { href: "/quan-tri/thong-bao", label: "Thông báo trên máy", icon: "🔔", who: "hr" },
    ],
  },
  {
    id: "tai-chinh",
    label: "Tài chính",
    icon: "📈",
    items: [
      { href: "/quan-tri/tai-chinh", label: "Tài chính", icon: "📈", who: "director" },
      { href: "/quan-tri/bao-cao-tai-chinh", label: "Báo cáo tài chính", icon: "📊", who: "director" },
      { href: "/quan-tri/hoa-don", label: "Tạo hoá đơn điện tử", icon: "🧾", who: "hr" },
    ],
  },
  {
    id: "khach-hang",
    label: "Khách hàng",
    icon: "🤝",
    items: [
      // The workspace inbox — see src/app/quan-tri/chat/page.tsx for the
      // redirect covering old bookmarks to the previous location.
      { href: "/workspace/khach-hang", label: "Tin nhắn khách hàng", icon: "💬", who: "inbox" },
      { href: "/quan-tri/tin-nhan", label: "Form liên hệ", icon: "✉️", who: "content" },
      { href: "/quan-tri/bao-gia", label: "Báo giá", icon: "📝", who: "director" },
      { href: "/quan-tri/tai-khoan-khach-hang", label: "Tài khoản khách hàng", icon: "🤝", who: "hr" },
      { href: "/quan-tri/danh-gia", label: "Đánh giá khách hàng", icon: "⭐", who: "content" },
      { href: "/quan-tri/upwork", label: "Tìm khách (Upwork)", icon: "🎯", who: "hr" },
    ],
  },
  {
    id: "noi-dung",
    label: "Nội dung web",
    icon: "🌐",
    items: [
      { href: "/quan-tri/du-an", label: "Dự án", icon: "📁", who: "content" },
      { href: "/tin-tuc", label: "Tin tức (đăng trên trang)", icon: "📰", who: "content" },
      { href: "/tuyen-dung", label: "Tuyển dụng (đăng trên trang)", icon: "🌱", who: "content" },
    ],
  },
  {
    id: "khac",
    label: "Khác",
    icon: "🧰",
    items: [
      { href: "/quan-tri/do-toc-do", label: "Đo tốc độ chat", icon: "⚡", who: "hr" },
    ],
  },
];

const OPEN_GROUPS_KEY = "funti-admin-nav-open";

export function AdminSidebar({
  user,
  initialPendingPayrollFeedbackIds,
}: {
  user: { displayName: string; email: string; accessRole: AccessRole; jobTitle: string | null };
  initialPendingPayrollFeedbackIds: string[];
}) {
  const pathname = usePathname();
  const isDirector = user.accessRole === "director";
  const isProjectManager = user.jobTitle === "Project Manager";
  const [mobileOpen, setMobileOpen] = useState(false);

  const [pendingFeedbackIds, setPendingFeedbackIds] = useState<Set<string>>(
    () => new Set(initialPendingPayrollFeedbackIds),
  );

  // Same all-months realtime subscription as PayrollBoard's own copy of
  // this (they're separate components, so a separate Set + channel) — this
  // one only cares whether the set is non-empty, to light up the nav dot
  // even before the director opens the Bảng lương page itself.
  useEffect(() => {
    if (!isDirector && !isProjectManager) return;
    const supabase = createClient();
    const channel = supabase
      .channel("sidebar-payroll-feedback-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_feedback" }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as { id: string; status: string };
        setPendingFeedbackIds((prev) => {
          const next = new Set(prev);
          if (isDelete || row.status !== "pending") next.delete(row.id);
          else next.add(row.id);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isDirector, isProjectManager]);

  const hasPendingPayrollFeedback = pendingFeedbackIds.size > 0;

  const isAdmin = user.accessRole === "admin";
  function canSee(who: Audience) {
    if (who === "director") return isDirector;
    if (who === "content") return isDirector || isAdmin;
    if (who === "hr") return isDirector || isProjectManager;
    return isDirector || isAdmin || isProjectManager;
  }
  const isActive = (href: string) => pathname.startsWith(href);
  const visibleGroups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.who)) })).filter(
    (g) => g.items.length > 0,
  );

  // Groups start folded except the one holding the current page; whatever
  // sếp opens or closes is remembered on this device.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? "[]");
    } catch {
      saved = [];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-device preference after hydration
    setOpenGroups(new Set(saved));
  }, []);
  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        // private mode etc. — the menu still works, it just won't remember
      }
      return next;
    });
  }

  // Closing here (not via a pathname-watching effect) mirrors how
  // MobileNav's own "Thêm" sheet closes itself — every navigational
  // element in the drawer just closes it directly on click. A no-op on
  // the desktop <aside> instance since mobileOpen is already false there.
  // A plain render helper, not a component, so React never remounts links.
  function renderLink(item: NavItem, showDot = false, indent = false) {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-2 py-2 rounded-[8px] text-[13px] font-semibold transition-colors ${indent ? "pl-7 pr-2" : "px-2"}`}
        style={{
          background: active ? "var(--color-accent-100)" : "transparent",
          color: active ? "var(--color-accent-700)" : "var(--color-text)",
        }}
      >
        <span aria-hidden>{item.icon}</span>
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
        {showDot && (
          <span
            title="Có thắc mắc lương chưa xử lý"
            className="rounded-full flex-none"
            style={{ width: 8, height: 8, background: "var(--status-red)" }}
          />
        )}
      </Link>
    );
  }

  // Shared between the desktop <aside> and the mobile drawer, so the two
  // never drift apart — same role gating, same items, same order.
  // Back to the staff workspace — director and PM work in both; a content
  // admin has no workspace (its layout sends them straight back here).
  const canOpenWorkspace = isDirector || isProjectManager;
  const workspaceButton = canOpenWorkspace && (
    <Link
      href="/workspace"
      onClick={() => setMobileOpen(false)}
      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-[10px] text-[13px] font-bold mb-3"
      style={{ background: "var(--color-accent-500)", color: "#fff" }}
    >
      ← Về trang nhân viên
    </Link>
  );

  const navSections = (
    <div className="flex flex-col gap-0.5">
      {workspaceButton}
      {(canSee(OVERVIEW.who) || canSee(PROJECT_MANAGER.who)) && (
        <div className="mb-2 flex flex-col gap-0.5">
          {canSee(OVERVIEW.who) && renderLink(OVERVIEW)}
          {canSee(PROJECT_MANAGER.who) && renderLink(PROJECT_MANAGER)}
        </div>
      )}
      {visibleGroups.map((g) => {
        const holdsActive = g.items.some((i) => isActive(i.href));
        const open = holdsActive || openGroups.has(g.id);
        const dot = g.items.some((i) => i.href === "/quan-tri/bang-luong") && hasPendingPayrollFeedback;
        return (
          <div key={g.id} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => toggleGroup(g.id)}
              aria-expanded={open}
              className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-bold text-left"
              style={{ color: holdsActive ? "var(--color-accent-700)" : "var(--color-text)" }}
            >
              <span aria-hidden>{g.icon}</span>
              <span className="flex-1">{g.label}</span>
              {!open && dot && <span className="rounded-full flex-none" style={{ width: 8, height: 8, background: "var(--status-red)" }} />}
              <span
                aria-hidden
                className="text-[10px] transition-transform"
                style={{ color: "var(--color-neutral-500)", transform: open ? "rotate(90deg)" : "none" }}
              >
                ▶
              </span>
            </button>
            {open && g.items.map((item) => renderLink(item, item.href === "/quan-tri/bang-luong" && hasPendingPayrollFeedback, true))}
          </div>
        );
      })}
    </div>
  );

  const accountBlock = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-2">
        <div
          className="flex items-center justify-center rounded-full text-xs font-bold flex-none"
          style={{ width: 30, height: 30, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
        >
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold truncate">{user.displayName}</span>
          <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
            {isDirector ? "Giám đốc" : user.accessRole === "admin" ? "Admin" : user.jobTitle || "Nhân viên"}
          </span>
        </div>
      </div>
      <form action={signOut} onSubmit={resetThemeOnSignOut}>
        <button
          type="submit"
          className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold w-full text-left"
          style={{ color: "var(--color-neutral-600)" }}
        >
          <span aria-hidden>↩</span> Đăng xuất
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Phone/tablet: the desktop <aside> below is display:none here, so
          without this bar + drawer there was no way at all to reach any
          quan-tri section besides whatever page was linked to directly. */}
      <div
        className="no-print md:hidden flex-none flex items-center justify-between px-4 py-3"
        style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/funti-logo.jpg"
            alt="Funti Kidbooks Studio"
            width={28}
            height={28}
            className="rounded-full object-cover flex-none"
          />
          <span className="font-heading font-bold text-sm">Funti Kidbooks</span>
        </Link>
        <div className="flex items-center gap-2">
          {canOpenWorkspace && (
            <Link
              href="/workspace"
              className="flex items-center rounded-full px-3 text-[12px] font-bold"
              style={{ height: 34, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
            >
              ← Nhân viên
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="btn-icon"
            style={{ width: 34, height: 34 }}
            aria-label="Mở menu quản trị"
          >
            ☰
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="no-print md:hidden fixed inset-0 z-50 flex"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-[280px] max-w-[85vw] h-full flex flex-col gap-6 px-3.5 py-5 overflow-y-auto"
            style={{ background: "var(--color-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/brand/funti-logo.jpg"
                  alt="Funti Kidbooks Studio"
                  width={34}
                  height={34}
                  className="rounded-full object-cover flex-none"
                />
                <span className="font-heading font-bold text-sm">Funti Kidbooks</span>
              </Link>
              <button type="button" onClick={() => setMobileOpen(false)} className="btn-icon" aria-label="Đóng">
                ✕
              </button>
            </div>
            {navSections}
            <div className="mt-auto">{accountBlock}</div>
          </div>
        </div>
      )}

      <aside
        className="w-[240px] flex-none hidden md:flex flex-col gap-6 px-3.5 py-5"
        style={{ background: "var(--color-bg)", borderRight: "1px solid var(--color-neutral-200)" }}
      >
        <Link href="/" className="flex items-center gap-2 px-1">
          <Image
            src="/brand/funti-logo.jpg"
            alt="Funti Kidbooks Studio"
            width={34}
            height={34}
            className="rounded-full object-cover flex-none"
          />
          <span className="font-heading font-bold text-sm">Funti Kidbooks</span>
        </Link>

        {navSections}

        <div className="mt-auto">{accountBlock}</div>
      </aside>
    </>
  );
}
