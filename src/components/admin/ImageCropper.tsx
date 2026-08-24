"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Modal } from "@/components/ui/Modal";
import { getCroppedImageBlob } from "@/lib/cropImage";

export function ImageCropper({
  imageSrc,
  aspect,
  fileName,
  fileType,
  onDone,
  onCancel,
}: {
  imageSrc: string;
  aspect: number;
  fileName: string;
  fileType: string;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, fileType);
      onDone(new File([blob], fileName, { type: fileType }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onCancel} maxWidth={560}>
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-lg">Chỉnh tỉ lệ ảnh bìa</h2>
          <button type="button" onClick={onCancel} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="relative w-full rounded-[var(--radius-md)] overflow-hidden" style={{ height: 340, background: "#111" }}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold flex-none" style={{ color: "var(--color-neutral-600)" }}>
              Phóng to
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </div>
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            Kéo ảnh để chọn phần muốn hiển thị, dùng thanh trượt để phóng to/thu nhỏ. Khung chọn chính là phần sẽ hiện làm ảnh bìa.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          <button type="button" onClick={onCancel} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="button" onClick={handleConfirm} className="btn btn-primary" disabled={saving || !croppedAreaPixels}>
            {saving ? "Đang xử lý…" : "✂️ Cắt & Dùng ảnh này"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
