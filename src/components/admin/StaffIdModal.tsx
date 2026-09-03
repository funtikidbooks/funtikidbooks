"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { getStaffIdImageUrl, upsertStaffIdDocument } from "@/lib/actions/staffId";
import type { Profile, StaffIdDocument } from "@/lib/types";

function ImageSlot({
  label,
  path,
  file,
  onPick,
}: {
  label: string;
  path: string | null | undefined;
  file: File | null;
  onPick: (file: File | null) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const pickedPreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (pickedPreviewUrl) URL.revokeObjectURL(pickedPreviewUrl);
    };
  }, [pickedPreviewUrl]);

  useEffect(() => {
    if (!path || file) return;
    let cancelled = false;
    getStaffIdImageUrl(path).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path, file]);

  const previewUrl = pickedPreviewUrl ?? signedUrl;

  return (
    <div className="field">
      <label>{label}</label>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={label}
            className="rounded-[8px] object-cover flex-none"
            style={{ width: 90, height: 60, border: "1px solid var(--color-neutral-200)" }}
          />
        ) : (
          <div
            className="rounded-[8px] flex-none flex items-center justify-center text-[11px]"
            style={{ width: 90, height: 60, background: "var(--color-surface)", color: "var(--color-neutral-400)" }}
          >
            Chưa có ảnh
          </div>
        )}
        <label className="btn btn-ghost btn-sm">
          {previewUrl ? "Đổi ảnh" : "Tải ảnh lên"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </div>
  );
}

export function StaffIdModal({
  profile,
  existing,
  onClose,
  onSaved,
}: {
  profile: Profile;
  existing: StaffIdDocument | null;
  onClose: () => void;
  onSaved: (doc: StaffIdDocument) => void;
}) {
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [idNumber, setIdNumber] = useState(existing?.id_number ?? "");
  const [dob, setDob] = useState(existing?.dob ?? "");
  const [sex, setSex] = useState(existing?.sex ?? "");
  const [permanentAddress, setPermanentAddress] = useState(existing?.permanent_address ?? "");
  const [temporaryAddress, setTemporaryAddress] = useState(existing?.temporary_address ?? "");
  const [issuedDate, setIssuedDate] = useState(existing?.issued_date ?? "");
  const [issuedPlace, setIssuedPlace] = useState(existing?.issued_place ?? "");
  const [expiryDate, setExpiryDate] = useState(existing?.expiry_date ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let formData: FormData | undefined;
      if (frontFile || backFile) {
        formData = new FormData();
        if (frontFile) formData.append("front", frontFile);
        if (backFile) formData.append("back", backFile);
      }
      const saved = await upsertStaffIdDocument(
        profile.id,
        { fullName, idNumber, dob, sex, permanentAddress, temporaryAddress, issuedDate, issuedPlace, expiryDate, note },
        formData,
      );
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-lg flex-1">🪪 CCCD — {profile.display_name}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div className="field">
              <label htmlFor="id-full-name">Họ và tên đầy đủ</label>
              <input id="id-full-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="id-sex">Giới tính</label>
              <input id="id-sex" className="input" placeholder="Nam / Nữ" value={sex} onChange={(e) => setSex(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field">
              <label htmlFor="id-number">Số CCCD</label>
              <input id="id-number" className="input" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="id-dob">Ngày sinh</label>
              <input id="id-dob" type="date" className="input" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="id-permanent">Nơi thường trú</label>
            <textarea
              id="id-permanent"
              className="input"
              rows={2}
              value={permanentAddress}
              onChange={(e) => setPermanentAddress(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="id-temporary">Nơi tạm trú</label>
            <textarea
              id="id-temporary"
              className="input"
              rows={2}
              value={temporaryAddress}
              onChange={(e) => setTemporaryAddress(e.target.value)}
            />
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div className="field">
              <label htmlFor="id-issued-date">Ngày cấp</label>
              <input id="id-issued-date" type="date" className="input" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="id-issued-place">Nơi cấp</label>
              <input id="id-issued-place" className="input" value={issuedPlace} onChange={(e) => setIssuedPlace(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="id-expiry">Có giá trị đến</label>
              <input id="id-expiry" type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <ImageSlot label="Ảnh mặt trước" path={existing?.front_image_path} file={frontFile} onPick={setFrontFile} />
            <ImageSlot label="Ảnh mặt sau" path={existing?.back_image_path} file={backFile} onPick={setBackFile} />
          </div>

          <div className="field">
            <label htmlFor="id-note">Ghi chú</label>
            <textarea id="id-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
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
