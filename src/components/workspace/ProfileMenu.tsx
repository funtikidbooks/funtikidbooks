"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { updateMyAvatar, updateMyEmail, updateMyProfile } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types";

export function ProfileMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ws-profile-btn flex items-center gap-2 rounded-full pl-1 pr-3 py-1 flex-none elev-sm"
        aria-label="Hồ sơ của tôi"
      >
        <span
          className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
          style={{ width: 28, height: 28, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            profile.display_name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="text-[13px] font-bold">Hồ sơ</span>
      </button>
      {open && <ProfileDialog profile={profile} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [email, setEmail] = useState(profile.email);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    const localUrl = URL.createObjectURL(file);
    setAvatarUrl(localUrl);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await updateMyAvatar(formData);
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải ảnh lên");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveInfo() {
    setSavingInfo(true);
    setError(null);
    try {
      await updateMyProfile({ displayName, phone, address });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu thông tin");
    } finally {
      setSavingInfo(false);
    }
  }

  async function saveEmail() {
    if (email.trim().toLowerCase() === profile.email.toLowerCase()) return;
    setSavingEmail(true);
    setError(null);
    setEmailNotice(null);
    try {
      await updateMyEmail(email);
      setEmailNotice(`Đã gửi email xác nhận tới ${email}. Bấm vào link trong email đó để hoàn tất đổi email.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đổi email");
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div className="flex flex-col p-6 gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Hồ sơ của tôi</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative flex items-center justify-center rounded-full font-bold overflow-hidden"
            style={{ width: 76, height: 76, fontSize: 24, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </button>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="text-xs font-bold"
            style={{ color: "var(--color-accent-700)" }}
          >
            {uploadingAvatar ? "Đang tải…" : "Đổi ảnh đại diện"}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleAvatarFile(e.target.files?.[0])}
          />
        </div>

        <div className="field">
          <label>Chức vụ</label>
          <input className="input" value={profile.role ?? "Chưa cập nhật"} disabled style={{ color: "var(--color-neutral-500)" }} />
          <p className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
            Chức vụ do Giám đốc gán, không tự chỉnh sửa được.
          </p>
        </div>

        <div className="field">
          <label htmlFor="pm-name">Tên hiển thị</label>
          <input id="pm-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="pm-phone">Số điện thoại</label>
          <input id="pm-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" />
        </div>

        <div className="field">
          <label htmlFor="pm-address">Địa chỉ nhà</label>
          <input id="pm-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <button type="button" onClick={saveInfo} className="btn btn-primary btn-sm w-fit" disabled={savingInfo || !displayName.trim()}>
          {savingInfo ? "Đang lưu…" : "Lưu thông tin"}
        </button>

        <div className="field" style={{ borderTop: "1px solid var(--color-neutral-200)", paddingTop: 14 }}>
          <label htmlFor="pm-email">Email đăng nhập</label>
          <input id="pm-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button
            type="button"
            onClick={saveEmail}
            className="btn btn-ghost btn-sm w-fit mt-1"
            disabled={savingEmail || email.trim().toLowerCase() === profile.email.toLowerCase()}
          >
            {savingEmail ? "Đang gửi…" : "Đổi email"}
          </button>
          {emailNotice && (
            <p className="text-[12px]" style={{ color: "var(--status-green)" }}>
              {emailNotice}
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
