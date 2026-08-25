"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import type { AccessRole } from "@/lib/types";

const NAV = [
  { href: "/quan-tri/du-an", label: "Dự án", icon: "📁" },
  { href: "/quan-tri/danh-gia", label: "Đánh giá khách hàng", icon: "⭐" },
  { href: "/quan-tri/tin-nhan", label: "Tin nhắn khách hàng", icon: "✉️" },
  { href: "/quan-tri/chat", label: "Chat khách vãng lai", icon: "💬" },
];

const DIRECTOR_NAV = [
  { href: "/quan-tri/nhan-su", label: "Nhân sự & phân quyền", icon: "🧑‍🤝‍🧑", enabled: true },
  { href: "/quan-tri/cham-cong", label: "Chấm công", icon: "🕐", enabled: true },
  { href: "/quan-tri/bang-luong", label: "Bảng lương", icon: "💰", enabled: true },
  { href: "/quan-tri/hoa-don", label: "Tạo hoá đơn điện tử", icon: "🧾", enabled: true },
];

export function AdminSidebar({
  user,
}: {
  user: { displayName: string; email: string; accessRole: AccessRole };
}) {
  const pathname = usePathname();

  return (
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

      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1" style={{ color: "var(--color-neutral-500)" }}>
          QUẢN TRỊ NỘI DUNG
        </div>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold transition-colors"
              style={{
                background: active ? "var(--color-accent-100)" : "transparent",
                color: active ? "var(--color-accent-700)" : "var(--color-text)",
              }}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/tin-tuc"
          className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          <span aria-hidden>📰</span>
          Tin tức (đăng bài trực tiếp trên trang)
        </Link>

        {user.accessRole === "director" && (
          <>
            <div className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1 mt-3" style={{ color: "var(--color-neutral-500)" }}>
              GIÁM ĐỐC
            </div>
            <Link
              href="/workspace"
              className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              📊 Bảng công việc
            </Link>
            {DIRECTOR_NAV.map((item) =>
              item.enabled ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
                  style={{
                    background: pathname.startsWith(item.href) ? "var(--color-accent-100)" : "transparent",
                    color: pathname.startsWith(item.href) ? "var(--color-accent-700)" : "var(--color-text)",
                  }}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.href}
                  title="Sắp ra mắt"
                  className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
                  style={{ color: "var(--color-neutral-400)" }}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                  <span className="ml-auto text-[9px] tag tag-neutral">SẮP RA MẮT</span>
                </span>
              ),
            )}
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3">
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
              {user.accessRole === "director" ? "Giám đốc" : "Admin"}
            </span>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold w-full text-left"
            style={{ color: "var(--color-neutral-600)" }}
          >
            <span aria-hidden>↩</span> Đăng xuất
          </button>
        </form>
      </div>
    </aside>
  );
}
