"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePresence } from "@/lib/usePresence";
import { DEPARTMENTS } from "@/lib/constants/staff";
import type { Profile } from "@/lib/types";

const CreateAccountDialog = dynamic(
  () => import("@/components/admin/CreateAccountDialog").then((m) => m.CreateAccountDialog),
  { ssr: false },
);

const ALL = "Tất cả";

function formatJoinDate(createdAt: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(createdAt));
}

function formatTenure(createdAt: string) {
  const start = new Date(createdAt);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 1) return "Mới tham gia";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} tháng`;
  if (remMonths === 0) return `${years} năm`;
  return `${years} năm ${remMonths} tháng`;
}

export function MembersDirectory({
  profiles,
  currentUserId,
  canManage,
}: {
  profiles: Profile[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState(profiles);
  const [active, setActive] = useState(ALL);
  const [showCreate, setShowCreate] = useState(false);
  const onlineIds = usePresence(currentUserId);

  const departmentOf = (p: Profile) => p.department ?? (p.access_role !== "staff" ? "Studio Admin" : null);

  const filtered = useMemo(
    () => (active === ALL ? items : items.filter((p) => departmentOf(p) === active)),
    [active, items],
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl">Thành viên</h1>
        {canManage && (
          <button type="button" className="btn btn-primary btn-sm flex-none" onClick={() => setShowCreate(true)}>
            + Thêm thành viên
          </button>
        )}
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--color-neutral-600)" }}>
        Cùng nhau tạo nên những sản phẩm tuyệt vời ✨
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {[ALL, ...DEPARTMENTS].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setActive(d)}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: active === d ? "var(--color-accent-500)" : "var(--color-surface)",
              color: active === d ? "#fff" : "var(--color-text)",
              border: active === d ? "none" : "1px solid var(--color-neutral-200)",
            }}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => {
          const online = onlineIds.has(p.id);
          return (
            <div key={p.id} className="card elev-sm p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className="relative flex-none">
                  <span
                    className="flex items-center justify-center rounded-full text-lg font-bold overflow-hidden"
                    style={{ width: 56, height: 56, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      p.display_name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      right: 0,
                      bottom: 0,
                      background: online ? "var(--status-green)" : "var(--color-neutral-400)",
                      border: "2px solid var(--color-panel)",
                    }}
                  />
                </span>
                <span className={`tag flex-none ${online ? "tag-accent" : "tag-neutral"}`}>
                  {online ? "Đang làm việc" : "Ngoại tuyến"}
                </span>
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold flex items-center gap-1 truncate">
                  {p.display_name}
                  {p.access_role === "director" && <span aria-label="Giám đốc">👑</span>}
                </span>
                <span className="text-xs truncate" style={{ color: "var(--color-neutral-500)" }}>
                  {departmentOf(p) ?? p.role ?? "Chưa phân loại"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`mailto:${p.email}`}
                  aria-label={`Email ${p.display_name}`}
                  title={p.email}
                  className="btn-icon"
                  style={{ width: 30, height: 30, padding: 0, fontSize: 13 }}
                >
                  ✉️
                </a>
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    aria-label={`Gọi ${p.display_name}`}
                    title={p.phone}
                    className="btn-icon"
                    style={{ width: 30, height: 30, padding: 0, fontSize: 13 }}
                  >
                    📞
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-neutral-600)" }}>
                <span>📅 Tham gia: {formatJoinDate(p.created_at)}</span>
                <span>⏱ Thời gian làm việc: {formatTenure(p.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateAccountDialog
          onClose={() => setShowCreate(false)}
          onCreated={(p) => setItems((prev) => [...prev, p].sort((a, b) => a.display_name.localeCompare(b.display_name)))}
        />
      )}
    </div>
  );
}
