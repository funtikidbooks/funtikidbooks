"use client";

import { useRef, useState } from "react";
import { saveJsonSetting } from "@/lib/actions/admin";
import { uploadVideoDirect } from "@/lib/uploadVideo";

const VIDEO_KEY = "gioi-thieu-hero-video";

export function AboutHeroVideo({ src, canEdit }: { src: string | null; canEdit: boolean }) {
  const [videoSrc, setVideoSrc] = useState(src);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadVideoDirect(file);
      await saveJsonSetting(VIDEO_KEY, url, ["/gioi-thieu"]);
      setVideoSrc(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải video lên");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative w-full">
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: "4/3",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-panel)",
          border: "1px solid var(--color-neutral-200)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {videoSrc ? (
          <video src={videoSrc} controls className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: "var(--color-surface)" }}>
            <span className="text-3xl" aria-hidden>
              🎬
            </span>
            {canEdit ? (
              <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                Chưa có video — bấm nút bên dưới để tải lên
              </span>
            ) : (
              <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                Video giới thiệu sắp ra mắt
              </span>
            )}
          </div>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="editable-image-btn absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
          >
            {uploading ? "Đang tải…" : videoSrc ? "✏️ Đổi video" : "+ Thêm video"}
          </button>
        )}
      </div>

      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      )}

      {error && (
        <p className="mt-2 text-[11px] font-semibold px-2 py-1 rounded-[6px]" style={{ background: "var(--status-red)", color: "#fff" }}>
          {error}
        </p>
      )}
    </div>
  );
}
