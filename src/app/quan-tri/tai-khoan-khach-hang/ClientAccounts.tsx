"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteClientAccount, type ClientAccount } from "@/lib/actions/clientAccounts";
import { thumbnailUrl } from "@/lib/imageTransform";

// Công việc portal logins, kept apart from staff — see
// lib/actions/clientAccounts.ts.

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(iso),
  );
}

function Tag({ tone, children }: { tone: "yellow" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-[10px] font-bold whitespace-nowrap"
      style={
        tone === "yellow"
          ? { background: "color-mix(in srgb, var(--status-yellow) 18%, transparent)", border: "1px solid var(--status-yellow)" }
          : { background: "var(--color-surface)", border: "1px solid var(--color-neutral-300)" }
      }
    >
      {children}
    </span>
  );
}

export function ClientAccounts({ initialAccounts, isDirector }: { initialAccounts: ClientAccount[]; isDirector: boolean }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(a: ClientAccount) {
    const label = a.displayName || a.email;
    const extra = a.projectCount > 0 ? ` Toàn bộ ${a.projectCount} dự án và tin nhắn của khách này cũng bị xoá.` : "";
    if (!confirm(`Xoá tài khoản khách hàng "${label}"? Khách sẽ không đăng nhập được nữa.${extra} Không thể hoàn tác.`)) return;
    const prev = accounts;
    setDeletingId(a.id);
    setAccounts((list) => list.filter((x) => x.id !== a.id));
    setError(null);
    startTransition(async () => {
      try {
        await deleteClientAccount(a.id);
      } catch (err) {
        setAccounts(prev);
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <h1 className="text-xl">Tài khoản khách hàng</h1>
        <span className="tag tag-neutral">{accounts.length} tài khoản</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <p className="text-sm mb-4 max-w-[820px]" style={{ color: "var(--color-neutral-600)" }}>
          Khách đăng nhập ở trang <b>Công việc</b> (funtikidbooks.com/cong-viec) bằng link gửi qua email. Tài khoản khách tách
          riêng khỏi nhân viên: không có trong Nhân sự, Thành viên, Chấm công và không vào được workspace. Tin nhắn với khách
          xem ở{" "}
          <Link href="/workspace/khach-hang" className="underline font-semibold" style={{ color: "var(--color-accent-700)" }}>
            Khách hàng
          </Link>
          .
        </p>
        {error && (
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        {accounts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có khách hàng nào đăng nhập.
          </p>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">
            {accounts.map((a) => (
              <div key={a.id} className="card elev-sm p-3 flex flex-wrap items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-full text-sm font-bold flex-none overflow-hidden"
                  style={{ width: 40, height: 40, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                >
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailUrl(a.avatarUrl, 80)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (a.displayName || a.email).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1 basis-[200px] gap-0.5">
                  <span className="text-sm font-bold flex flex-wrap items-center gap-1.5">
                    <span className="truncate">{a.displayName || "Chưa đặt tên"}</span>
                    {!a.registered && <Tag tone="yellow">Chưa hoàn tất đăng ký</Tag>}
                    {a.alsoStaff && <Tag tone="neutral">Cũng là nhân viên</Tag>}
                  </span>
                  <span className="text-xs truncate" style={{ color: "var(--color-neutral-500)" }}>
                    {a.email}
                    {a.country ? ` · ${a.country}` : ""}
                    {a.clientType ? ` · ${a.clientType === "business" ? "Doanh nghiệp" : "Cá nhân"}` : ""}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    Tạo {formatDate(a.createdAt)}
                    {a.lastSignInAt ? ` · Đăng nhập gần nhất ${formatDate(a.lastSignInAt)}` : ""}
                  </span>
                </div>
                <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--color-neutral-600)" }}>
                  {a.projectCount > 0 ? `${a.projectCount} dự án` : "Chưa có dự án"}
                </span>
                {isDirector && !a.alsoStaff && (
                  <button
                    type="button"
                    className="btn-icon flex-none"
                    disabled={pending}
                    onClick={() => remove(a)}
                    aria-label={`Xoá tài khoản khách ${a.displayName || a.email}`}
                    title="Xoá tài khoản khách hàng"
                    style={{ color: "var(--status-red)" }}
                  >
                    {deletingId === a.id ? "…" : "🗑"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
