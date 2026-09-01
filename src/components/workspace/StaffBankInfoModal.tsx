"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { uploadStaffBankQr, upsertStaffBankInfo } from "@/lib/actions/admin";
import type { Profile, StaffBankInfo } from "@/lib/types";

const BANK_SUGGESTIONS = [
  "Vietcombank",
  "Techcombank",
  "MB Bank",
  "ACB",
  "BIDV",
  "VietinBank",
  "VPBank",
  "TPBank",
  "Sacombank",
  "Agribank",
];

export function StaffBankInfoModal({
  profile,
  info,
  onClose,
  onSaved,
}: {
  profile: Profile;
  info: StaffBankInfo | undefined;
  onClose: () => void;
  onSaved: (info: StaffBankInfo) => void;
}) {
  const [bankName, setBankName] = useState(info?.bank_name ?? "");
  const [accountNumber, setAccountNumber] = useState(info?.account_number ?? "");
  const [accountHolder, setAccountHolder] = useState(info?.account_holder ?? "");
  const [qrImageUrl, setQrImageUrl] = useState(info?.qr_image_url ?? null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingQr(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const saved = await uploadStaffBankQr(profile.id, formData);
      setQrImageUrl(saved.qr_image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setUploadingQr(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertStaffBankInfo(profile.id, { bankName, accountNumber, accountHolder });
      onSaved({ ...saved, qr_image_url: qrImageUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div className="flex-1">
            <h2 className="text-lg">Thông tin ngân hàng</h2>
            <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              {profile.display_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          <div className="field">
            <label htmlFor="bank-name">Ngân hàng</label>
            <input
              id="bank-name"
              className="input"
              list="bank-name-suggestions"
              placeholder="VD: Vietcombank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              autoFocus
            />
            <datalist id="bank-name-suggestions">
              {BANK_SUGGESTIONS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="bank-account-number">Số tài khoản</label>
            <input
              id="bank-account-number"
              className="input"
              placeholder="VD: 1234567890"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="bank-account-holder">Chủ tài khoản</label>
            <input
              id="bank-account-holder"
              className="input"
              placeholder="VD: NGUYEN VAN A"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
            />
          </div>

          <div className="field">
            <label>Mã QR chuyển khoản</label>
            <div className="flex items-center gap-3 mt-1">
              {qrImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrImageUrl}
                  alt="Mã QR chuyển khoản"
                  className="rounded-[8px] object-cover flex-none"
                  style={{ width: 64, height: 64, border: "1px solid var(--color-neutral-200)" }}
                />
              )}
              <label className="btn btn-ghost btn-sm w-fit cursor-pointer">
                {uploadingQr ? "Đang tải…" : qrImageUrl ? "Đổi ảnh QR" : "Tải ảnh QR lên"}
                <input type="file" accept="image/*" className="hidden" onChange={handleQrFileChange} disabled={uploadingQr} />
              </label>
            </div>
          </div>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
