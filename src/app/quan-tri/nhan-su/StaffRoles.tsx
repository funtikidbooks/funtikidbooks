"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { createStaffAccount, deleteStaffAccount, updateAccessRole } from "@/lib/actions/admin";
import type { AccessRole, Profile } from "@/lib/types";

const ROLE_LABELS: Record<AccessRole, string> = {
  director: "Giám đốc",
  admin: "Admin",
  staff: "Hoạ sĩ / PM",
};

function randomPassword() {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5);
}

export function StaffRoles({ initialProfiles, currentUserId }: { initialProfiles: Profile[]; currentUserId: string }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function changeRole(id: string, role: AccessRole) {
    const prev = profiles;
    setProfiles((p) => p.map((x) => (x.id === id ? { ...x, access_role: role } : x)));
    setError(null);
    startTransition(async () => {
      try {
        await updateAccessRole(id, role);
      } catch (err) {
        setProfiles(prev);
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
    });
  }

  function removeStaff(p: Profile) {
    if (!confirm(`Xoá tài khoản của "${p.display_name}"? Họ sẽ không đăng nhập được nữa. Không thể hoàn tác.`)) return;
    const prev = profiles;
    setDeletingId(p.id);
    setProfiles((list) => list.filter((x) => x.id !== p.id));
    setError(null);
    startTransition(async () => {
      try {
        await deleteStaffAccount(p.id);
      } catch (err) {
        setProfiles(prev);
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Nhân sự & phân quyền</h1>
        <div className="flex items-center gap-3">
          <span className="tag tag-neutral">{profiles.length} tài khoản</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + Thêm tài khoản
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm mb-4" style={{ color: "var(--color-neutral-600)" }}>
          Đổi vai trò để quyết định trang nào mỗi người vào được: <b>Giám đốc</b> vào được tất cả,{" "}
          <b>Admin</b> chỉ quản trị nội dung (không vào bảng công việc), <b>Hoạ sĩ / PM</b> chỉ vào bảng công việc.
        </p>
        {error && (
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 max-w-[640px]">
          {profiles.map((p) => (
            <div key={p.id} className="card elev-sm p-3 flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-full text-sm font-bold flex-none"
                style={{ width: 36, height: 36, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
              >
                {p.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold truncate">{p.display_name}</span>
                <span className="text-xs truncate" style={{ color: "var(--color-neutral-500)" }}>
                  {p.email}
                </span>
              </div>
              <select
                className="input"
                style={{ width: 150 }}
                value={p.access_role}
                disabled={pending}
                onChange={(e) => changeRole(p.id, e.target.value as AccessRole)}
              >
                {(Object.keys(ROLE_LABELS) as AccessRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {p.id !== currentUserId && (
                <button
                  type="button"
                  className="btn-icon flex-none"
                  disabled={pending}
                  onClick={() => removeStaff(p)}
                  aria-label={`Xoá tài khoản ${p.display_name}`}
                  title="Xoá tài khoản"
                  style={{ color: "var(--status-red)" }}
                >
                  {deletingId === p.id ? "…" : "🗑"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateAccountDialog
          onClose={() => setShowCreate(false)}
          onCreated={(p) => setProfiles((prev) => [...prev, p].sort((a, b) => a.display_name.localeCompare(b.display_name)))}
        />
      )}
    </div>
  );
}

function CreateAccountDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Profile) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [jobTitle, setJobTitle] = useState("");
  const [accessRole, setAccessRole] = useState<"admin" | "staff">("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string; emailSent: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !email.trim() || password.length < 6) return;
    setSaving(true);
    setError(null);
    try {
      const { profile, emailSent } = await createStaffAccount({ displayName, email, password, accessRole, jobTitle });
      onCreated(profile);
      setCreated({ email, password, emailSent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <Modal onClose={onClose} maxWidth={440}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Đã tạo tài khoản 🎉</h2>
            <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
              ✕
            </button>
          </div>
          <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
            {created.emailSent
              ? "Đã tự động gửi email chứa mật khẩu cho nhân viên. Bạn cũng có thể gửi thêm 2 thông tin này qua Zalo/tin nhắn:"
              : "Không gửi được email tự động (chưa cấu hình hoặc lỗi kết nối) — hãy gửi 2 thông tin này cho nhân viên qua Zalo/tin nhắn:"}
          </p>
          <div className="card elev-sm p-3 flex flex-col gap-1 text-sm font-mono" style={{ background: "var(--color-surface)" }}>
            <span>Email: {created.email}</span>
            <span>Mật khẩu: {created.password}</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Xong
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth={480}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Thêm tài khoản nhân viên</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="field">
          <label htmlFor="s-name">Tên hiển thị</label>
          <input id="s-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="s-email">Email</label>
          <input
            id="s-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="s-title">Chức danh (tuỳ chọn, ví dụ: 2D Illustrator)</label>
          <input id="s-title" className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="s-role">Vai trò</label>
          <select id="s-role" className="input" value={accessRole} onChange={(e) => setAccessRole(e.target.value as "admin" | "staff")}>
            <option value="staff">Hoạ sĩ / PM — chỉ vào bảng công việc</option>
            <option value="admin">Admin — chỉ quản trị nội dung</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="s-pass">Mật khẩu tạm</label>
          <div className="flex gap-2">
            <input
              id="s-pass"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPassword(randomPassword())}>
              Tạo mới
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
            Ít nhất 6 ký tự. Bạn sẽ gửi mật khẩu này cho nhân viên sau khi tạo xong.
          </p>
        </div>

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving || !displayName.trim() || !email.trim()}>
          {saving ? "Đang tạo…" : "Tạo tài khoản"}
        </button>
      </form>
    </Modal>
  );
}
