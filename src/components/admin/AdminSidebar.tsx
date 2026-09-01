"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { resetThemeOnSignOut } from "@/lib/useTheme";
import type { AccessRole } from "@/lib/types";

const NAV = [
  { href: "/quan-tri/du-an", label: "Dự án", icon: "📁" },
  { href: "/quan-tri/danh-gia", label: "Đánh giá khách hàng", icon: "⭐" },
  { href: "/quan-tri/tin-nhan", label: "Tin nhắn khách hàng", icon: "✉️" },
  { href: "/quan-tri/chat", label: "Chat khách vãng lai", icon: "💬" },
];

// Also open to staff whose chức danh is exactly "Project Manager" — see
// can_manage_hr() / requireDirectorOrPM() in supabase/schema.sql and
// lib/actions/admin.ts. Nhân sự is view-only for them (StaffRoles.tsx
// hides every edit control unless the viewer is actually the director).
const HR_NAV = [
  { href: "/quan-tri/nhan-su", label: "Nhân sự & phân quyền", icon: "🧑‍🤝‍🧑" },
  { href: "/quan-tri/cham-cong", label: "Chấm công", icon: "🕐" },
  { href: "/quan-tri/bang-luong", label: "Bảng lương", icon: "💰" },
  { href: "/quan-tri/hop-dong", label: "Hợp đồng", icon: "📄" },
  { href: "/quan-tri/hoa-don", label: "Tạo hoá đơn điện tử", icon: "🧾" },
];

// Whole-business P&L — more sensitive than payroll (that's one employee at
// a time), so unlike HR_NAV this is director-only, not shared with PM.
const DIRECTOR_ONLY_NAV = [{ href: "/quan-tri/tai-chinh", label: "Tài chính", icon: "📈" }];

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

  // Closing here (not via a pathname-watching effect) mirrors how
  // MobileNav's own "Thêm" sheet closes itself — every navigational
  // element in the drawer just closes it directly on click. A no-op on
  // the desktop <aside> instance since mobileOpen is already false there.
  function NavLink({ item, showDot }: { item: { href: string; label: string; icon: string }; showDot?: boolean }) {
    const active = pathname.startsWith(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold transition-colors"
        style={{
          background: active ? "var(--color-accent-100)" : "transparent",
          color: active ? "var(--color-accent-700)" : "var(--color-text)",
        }}
      >
        <span aria-hidden>{item.icon}</span>
        {item.label}
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
  const navSections = (
    <div className="flex flex-col gap-1">
      {(isDirector || user.accessRole === "admin") && (
        <>
          <div className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1" style={{ color: "var(--color-neutral-500)" }}>
            QUẢN TRỊ NỘI DUNG
          </div>
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          <Link
            href="/tin-tuc"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            <span aria-hidden>📰</span>
            Tin tức (đăng bài trực tiếp trên trang)
          </Link>
        </>
      )}

      {(isDirector || isProjectManager) && (
        <>
          <div className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1 mt-3" style={{ color: "var(--color-neutral-500)" }}>
            {isDirector ? "GIÁM ĐỐC" : "QUẢN LÝ"}
          </div>
          <Link
            href="/workspace"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            📊 Bảng công việc
          </Link>
          {HR_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              showDot={item.href === "/quan-tri/bang-luong" && hasPendingPayrollFeedback}
            />
          ))}
          {isDirector && DIRECTOR_ONLY_NAV.map((item) => <NavLink key={item.href} item={item} />)}
        </>
      )}
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
