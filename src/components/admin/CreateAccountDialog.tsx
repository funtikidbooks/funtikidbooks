"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { createStaffAccount } from "@/lib/actions/admin";
import { JOB_TITLE_SUGGESTIONS } from "@/lib/constants/staff";
import type { Profile } from "@/lib/types";

function randomPassword() {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5);
}

export function CreateAccountDialog({
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
      <datalist id="job-title-suggestions">
        {JOB_TITLE_SUGGESTIONS.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>
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
          <label htmlFor="s-title">Chức danh (tuỳ chọn, ví dụ: Art Director, Team Leader, Project Manager)</label>
          <input
            id="s-title"
            className="input"
            list="job-title-suggestions"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
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
