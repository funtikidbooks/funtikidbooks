"use client";

import { useState } from "react";
import type { Profile, ProfileChange } from "@/lib/types";

// Director-only history under Nhân sự & phân quyền: every change to anyone's
// chức danh, quyền, ngày tham gia or email, as logged by the profiles
// trigger (supabase/migrations/profiles_self_update_guard.sql).

const FIELD_LABEL: Record<ProfileChange["field"], string> = {
  role: "chức danh",
  access_role: "quyền",
  joined_at: "ngày tham gia",
  email: "email",
};

const ACCESS_LABEL: Record<string, string> = { director: "Giám đốc", admin: "Admin", staff: "Hoạ sĩ / PM" };

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function formatValue(field: ProfileChange["field"], value: string | null) {
  if (value === null || value === "") return "trống";
  if (field === "access_role") return ACCESS_LABEL[value] ?? value;
  if (field === "joined_at") {
    const d = value.slice(0, 10).split("-");
    return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : value;
  }
  return value;
}

export function ProfileChangeLog({ changes, profiles }: { changes: ProfileChange[]; profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const nameOf = new Map(profiles.map((p) => [p.id, p.display_name]));
  const shown = open ? changes : changes.slice(0, 5);

  return (
    <section className="card elev-sm p-4 mt-6 xl:mt-0 flex flex-col gap-2">
      <h2 className="text-base">📜 Lịch sử đổi chức danh & quyền</h2>
      <p className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
        Chỉ Giám đốc đổi được chức danh, quyền, ngày tham gia và email. Mọi lần đổi đều được ghi lại ở đây.
      </p>
      {changes.length === 0 ? (
        <p className="text-sm py-1" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có thay đổi nào được ghi lại.
        </p>
      ) : (
        <div className="flex flex-col">
          {shown.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-[13px]"
              style={{ borderTop: "1px solid var(--color-neutral-200)" }}
            >
              <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--color-neutral-500)" }}>
                {formatWhen(c.changed_at)}
              </span>
              <span className="min-w-0">
                <b>{c.changed_by ? (nameOf.get(c.changed_by) ?? "Tài khoản đã xoá") : "Hệ thống"}</b> đổi {FIELD_LABEL[c.field]} của{" "}
                <b>{nameOf.get(c.profile_id) ?? "tài khoản đã xoá"}</b>: {formatValue(c.field, c.old_value)} →{" "}
                <b>{formatValue(c.field, c.new_value)}</b>
              </span>
            </div>
          ))}
          {changes.length > 5 && (
            <button
              type="button"
              className="text-xs font-semibold pt-2 self-start"
              style={{ color: "var(--color-accent-700)" }}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Thu gọn" : `Xem thêm ${changes.length - 5} lần đổi`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
