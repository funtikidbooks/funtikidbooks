"use client";

import { useEffect, useState } from "react";
import { STALE_CHUNK_RE, tryAutoReload } from "@/lib/autoReload";

// Without this file, any uncaught error thrown while rendering anything
// under /workspace (a bad realtime payload, a stale chunk mid-render, any
// bug) unmounts the whole React tree and leaves a blank white page — which
// is exactly what staff have been reporting. This catches it, tries one
// silent reload (which also happens to pick up whatever deploy caused it),
// and only asks for a manual tap if that reload didn't help.
export default function WorkspaceError({ error }: { error: Error & { digest?: string } }) {
  const [reloaded, setReloaded] = useState(false);

  useEffect(() => {
    console.error(error);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReloaded(tryAutoReload());
  }, [error]);

  const isStaleChunk = STALE_CHUNK_RE.test(error.message || "");

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-bold">
        {reloaded ? "Đang tải lại…" : isStaleChunk ? "Có bản cập nhật mới" : "Đã có lỗi xảy ra"}
      </p>
      <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
        {reloaded ? "Chỉ mất một chút xíu thôi." : "Bấm nút bên dưới để tải lại trang."}
      </p>
      {!reloaded && (
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      )}
    </div>
  );
}
