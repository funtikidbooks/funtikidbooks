"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { usePresence } from "@/lib/usePresence";
import { updateJoinedAt } from "@/lib/actions/admin";
import { thumbnailUrl } from "@/lib/imageTransform";
import { bankColor, formatAccountNumber } from "@/lib/bankDisplay";
import { StaffBankInfoModal } from "@/components/workspace/StaffBankInfoModal";
import type { Profile, StaffBankInfo } from "@/lib/types";

const CreateAccountDialog = dynamic(
  () => import("@/components/admin/CreateAccountDialog").then((m) => m.CreateAccountDialog),
  { ssr: false },
);

const ALL = "Tất cả";

// The join date directors care about (and can edit) — falls back to
// created_at (login account creation) when nobody's set it explicitly.
function joinDateOf(p: Profile) {
  return p.joined_at ?? p.created_at;
}

function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

function formatJoinDate(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

function formatTenure(iso: string) {
  const start = new Date(iso);
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
  initialBankInfo,
}: {
  profiles: Profile[];
  currentUserId: string;
  canManage: boolean;
  initialBankInfo: StaffBankInfo[];
}) {
  const [items, setItems] = useState(profiles);
  const [active, setActive] = useState(ALL);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const onlineIds = usePresence(currentUserId);
  const [bankInfo, setBankInfo] = useState<Map<string, StaffBankInfo>>(
    () => new Map(initialBankInfo.map((b) => [b.profile_id, b])),
  );
  const [editingBank, setEditingBank] = useState<Profile | null>(null);

  // A colleague's name/avatar/job-title edit, a brand-new staff account, or
  // a removed one now shows up here immediately — this is exactly the kind
  // of screen two directors/admins might have open at once.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("members-directory-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new as Profile;
        setItems((prev) =>
          prev.some((p) => p.id === row.id)
            ? prev
            : [...prev, row].sort((a, b) => a.display_name.localeCompare(b.display_name, "vi")),
        );
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new as Profile;
        setItems((prev) => prev.map((p) => (p.id === row.id ? row : p)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, (payload) => {
        const old = payload.old as { id: string };
        setItems((prev) => prev.filter((p) => p.id !== old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter tabs are generated straight from whatever chức danh (job title)
  // values are actually assigned to staff — no separate curated category.
  const roleTabs = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) {
      if (p.role?.trim()) set.add(p.role.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [items]);

  function changeJoinDate(id: string, dateValue: string) {
    const prev = items;
    setItems((list) => list.map((x) => (x.id === id ? { ...x, joined_at: dateValue || null } : x)));
    setError(null);
    startTransition(async () => {
      try {
        await updateJoinedAt(id, dateValue);
      } catch (err) {
        setItems(prev);
        setError(err instanceof Error ? err.message : "Không thể lưu ngày tham gia.");
      }
    });
  }

  const filtered = useMemo(
    () => (active === ALL ? items : items.filter((p) => p.role?.trim() === active)),
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

      {error && (
        <p className="text-sm font-semibold mb-3" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {[ALL, ...roleTabs].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: active === tab ? "var(--color-accent-500)" : "var(--color-surface)",
              color: active === tab ? "#fff" : "var(--color-text)",
              border: active === tab ? "none" : "1px solid var(--color-neutral-200)",
            }}
          >
            {tab}
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
                      <img src={thumbnailUrl(p.avatar_url, 112)} alt="" className="w-full h-full object-cover" />
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
                  {p.role ?? "Chưa có chức danh"}
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

              <div className="flex flex-col gap-1.5 text-xs" style={{ color: "var(--color-neutral-600)" }}>
                <span className="flex items-center gap-1.5">
                  📅 Tham gia:{" "}
                  {canManage ? (
                    <input
                      key={`join-${p.id}-${p.joined_at ?? ""}`}
                      type="date"
                      className="input"
                      style={{ padding: "2px 6px", fontSize: 11, height: 24 }}
                      defaultValue={toDateInputValue(joinDateOf(p))}
                      onChange={(e) => e.target.value && changeJoinDate(p.id, e.target.value)}
                    />
                  ) : (
                    formatJoinDate(joinDateOf(p))
                  )}
                </span>
                <span>⏱ Thời gian làm việc: {formatTenure(joinDateOf(p))}</span>
              </div>

              {canManage &&
                (() => {
                  const b = bankInfo.get(p.id);
                  return b && (b.bank_name || b.account_number) ? (
                    <button
                      type="button"
                      onClick={() => setEditingBank(p)}
                      className="rounded-[10px] p-3 flex flex-col gap-1 text-left"
                      style={{ background: bankColor(b.bank_name) }}
                    >
                      <span className="text-[11px] font-bold text-white/90">{b.bank_name || "Ngân hàng"}</span>
                      <span className="text-sm font-bold text-white font-mono tracking-wide">
                        {b.account_number ? formatAccountNumber(b.account_number) : "—"}
                      </span>
                      <span className="text-[11px] text-white/80 truncate">{b.account_holder}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingBank(p)}
                      className="btn btn-ghost btn-sm"
                      style={{ border: "1px dashed var(--color-neutral-300)" }}
                    >
                      + Thêm tài khoản ngân hàng
                    </button>
                  );
                })()}
            </div>
          );
        })}
      </div>

      {editingBank && (
        <StaffBankInfoModal
          profile={editingBank}
          info={bankInfo.get(editingBank.id)}
          onClose={() => setEditingBank(null)}
          onSaved={(info) => setBankInfo((prev) => new Map(prev).set(info.profile_id, info))}
        />
      )}

      {showCreate && (
        <CreateAccountDialog
          onClose={() => setShowCreate(false)}
          onCreated={(p) => setItems((prev) => [...prev, p].sort((a, b) => a.display_name.localeCompare(b.display_name)))}
        />
      )}
    </div>
  );
}
