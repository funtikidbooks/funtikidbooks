"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/workspace/ImageLightbox";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { FileAttachment } from "@/lib/types";

// Shared "images + files someone attached to a chat message" renderer —
// used by the guest chat widget (cong-viec/GuestChatPanel.tsx), the
// signed-in client's own thread (cong-viec/PortalContent.tsx) and staff's
// inbox (workspace/ClientProjectsInbox.tsx), so all three show attachments
// at the same size, laid out in a row, with the same click-to-zoom-in /
// click-again-to-zoom-out behaviour (sếp Phúc: "khổ cũng lớn như trong
// phòng họp với nhân viên vậy" — ImageLightbox already has that animation
// built in, see its own comments).
const THUMB_SIZE = 140;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentGallery({
  imageUrls,
  fileAttachments,
}: {
  imageUrls: string[];
  fileAttachments: FileAttachment[];
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  if (imageUrls.length === 0 && fileAttachments.length === 0) return null;

  return (
    <>
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {imageUrls.map((url) => (
            <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl(url, THUMB_SIZE * 2)}
                alt=""
                className="rounded-[10px] object-cover block"
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
              />
            </button>
          ))}
        </div>
      )}
      {fileAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fileAttachments.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--color-surface)", color: "var(--color-accent-700)" }}
            >
              📄 {f.name}
              <span style={{ color: "var(--color-neutral-500)", fontWeight: 500 }}>({formatFileSize(f.size)})</span>
            </a>
          ))}
        </div>
      )}
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}
