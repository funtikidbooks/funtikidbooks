"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImageCropper } from "@/components/admin/ImageCropper";

export function CoverDropzone({
  preview,
  onPick,
  onRemove,
  label = "Click hoặc kéo-thả ảnh bìa vào đây",
  aspect = 3 / 2,
}: {
  preview: string | null;
  onPick: (file: File) => void;
  onRemove?: () => void;
  label?: string;
  aspect?: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<{ url: string; name: string; type: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startCrop(file: File) {
    setPending({ url: URL.createObjectURL(file), name: file.name, type: file.type || "image/jpeg" });
  }

  // Re-open the same crop/zoom tool on the cover that's already set, instead
  // of forcing a brand-new upload just to nudge the framing.
  function startCropFromExisting() {
    if (!preview) return;
    setPending({ url: preview, name: "anh-bia.jpg", type: "image/jpeg" });
  }

  function closeCrop() {
    if (pending?.url.startsWith("blob:")) URL.revokeObjectURL(pending.url);
    setPending(null);
  }

  return (
    <>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) startCrop(file);
        }}
        className="cover-dropzone relative flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] cursor-pointer overflow-hidden"
        style={{
          minHeight: 160,
          border: `2px dashed ${dragOver ? "var(--color-accent-500)" : "var(--color-neutral-300)"}`,
          background: dragOver ? "var(--color-accent-100)" : "var(--color-surface)",
        }}
      >
        {preview ? (
          <>
            <Image src={preview} alt="" fill className="object-cover" sizes="640px" />
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity text-white text-sm font-bold"
              style={{ background: "rgba(20,18,17,.55)" }}
            >
              <span>Đổi ảnh bìa</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startCropFromExisting();
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: "var(--color-panel)", color: "var(--color-text)" }}
                >
                  ✂️ Chỉnh tỉ lệ ảnh này
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: "var(--status-red)", color: "#fff" }}
                  >
                    🗑 Xoá ảnh
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="text-2xl" aria-hidden>
              🖼️
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--color-neutral-600)" }}>
              {label}
            </span>
            <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              JPG/PNG · tối đa 20MB
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) startCrop(file);
            e.target.value = "";
          }}
        />
      </div>

      {pending && (
        <ImageCropper
          imageSrc={pending.url}
          aspect={aspect}
          fileName={pending.name}
          fileType={pending.type}
          onCancel={closeCrop}
          onDone={(file) => {
            onPick(file);
            closeCrop();
          }}
        />
      )}
    </>
  );
}
