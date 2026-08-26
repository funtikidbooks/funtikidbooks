"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { useChatManager } from "@/components/workspace/ChatManager";
import { thumbnailUrl } from "@/lib/imageTransform";
import { resetThemeOnSignOut } from "@/lib/useTheme";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/workspace", label: "Bảng công việc", icon: "📊", enabled: true },
  { href: "/workspace/hop", label: "Trò chuyện & họp", icon: "💬", enabled: true },
  { href: "/workspace/kho-font", label: "Kho font & brush", icon: "🔤", enabled: true },
  { href: "/workspace/tinh-kho-sach", label: "Tính khổ sách", icon: "📐", enabled: true },
  { href: "/workspace/bien-tap", label: "Biên tập", icon: "🖊️", enabled: true },
  { href: "/workspace/thanh-vien", label: "Thành viên", icon: "👥", enabled: true },
  { href: "/workspace/lich", label: "Lịch", icon: "📅", enabled: true },
  { href: "/workspace/cham-cong", label: "Chấm công", icon: "🕐", enabled: true },
  { href: "#", label: "Dự án", icon: "📁", enabled: false },
];

export function Sidebar({
  user,
  currentUserId,
  profiles,
}: {
  user: { displayName: string; email: string; accessRole: "director" | "admin" | "staff" };
  currentUserId: string;
  profiles: Profile[];
}) {
  const pathname = usePathname();
  const { totalUnreadCount } = useChatManager();
  const myAvatarUrl = profiles.find((p) => p.id === currentUserId)?.avatar_url ?? null;

  return (
    <aside
      className="w-[220px] flex-none hidden md:flex flex-col gap-6 px-3.5 py-5"
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
        <div
          className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1"
          style={{ color: "var(--color-neutral-500)" }}
        >
          KHÔNG GIAN LÀM VIỆC
        </div>
        {NAV.map((item) => {
          const active = item.enabled && pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-disabled={!item.enabled}
              title={item.enabled ? undefined : "Sắp ra mắt"}
              className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
              style={{
                background: active ? "var(--color-accent-100)" : undefined,
                color: active
                  ? "var(--color-accent-700)"
                  : item.enabled
                    ? "var(--color-text)"
                    : "var(--color-neutral-400)",
                pointerEvents: item.enabled ? "auto" : "none",
                fontWeight: active ? 700 : 600,
              }}
            >
              <span aria-hidden>{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.href === "/workspace/hop" && totalUnreadCount > 0 && (
                <span
                  className="flex items-center justify-center rounded-full font-bold flex-none"
                  style={{ minWidth: 17, height: 17, padding: "0 4px", fontSize: 10, background: "var(--status-red)", color: "#fff" }}
                >
                  {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
                </span>
              )}
              {!item.enabled && (
                <span className="ml-auto text-[9px] tag tag-neutral">SẮP RA MẮT</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center gap-2 px-2">
          <div
            className="flex items-center justify-center rounded-full text-xs font-bold flex-none overflow-hidden"
            style={{ width: 30, height: 30, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
          >
            {myAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl(myAvatarUrl, 64)} alt="" className="w-full h-full object-cover" />
            ) : (
              user.displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">{user.displayName}</span>
            <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
              {user.email}
            </span>
          </div>
        </div>
        <form action={signOut} onSubmit={resetThemeOnSignOut}>
          <button
            type="submit"
            className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold w-full text-left"
            style={{ color: "var(--color-neutral-600)" }}
          >
            <span aria-hidden>↩</span> Đăng xuất
          </button>
        </form>
      </div>
    </aside>
  );
}
