"use client";

import { useEffect, useState } from "react";
import { tryAutoReload } from "@/lib/autoReload";

// The last line of defense: catches an error thrown even by the root
// layout itself, which workspace/error.tsx can't reach. Next requires this
// file to render its own <html>/<body> since it replaces the entire root
// layout when it fires. Same one-shot auto-reload as workspace/error.tsx,
// so a crash anywhere on the site self-heals instead of going blank.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [reloaded, setReloaded] = useState(false);

  useEffect(() => {
    console.error(error);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReloaded(tryAutoReload());
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: 18, fontWeight: 700 }}>{reloaded ? "Đang tải lại…" : "Đã có lỗi xảy ra"}</p>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            {reloaded ? "Chỉ mất một chút xíu thôi." : "Bấm nút bên dưới để tải lại trang."}
          </p>
          {!reloaded && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#e8674a",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tải lại trang
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
