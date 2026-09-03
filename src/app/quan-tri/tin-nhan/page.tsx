import type { Metadata } from "next";
import { listContactMessages } from "@/lib/actions/admin";
import type { ContactMessage } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Tin nhắn khách hàng" };

// Explicit timeZone — a server component, so this can't cause a hydration
// mismatch, but without it the displayed time is the server's own (UTC on
// Vercel) rather than Vietnam's, and — unlike a client component — nothing
// ever corrects it afterward.
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export default async function AdminMessagesPage() {
  const messages = (await listContactMessages()) as ContactMessage[];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Tin nhắn khách hàng</h1>
        <span className="tag tag-neutral">{messages.length} tin nhắn</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có ai gửi form Liên hệ.</p>
        ) : (
          <div className="flex flex-col gap-3 max-w-[720px]">
            {messages.map((m) => (
              <div key={m.id} className="card elev-sm p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-sm">{m.full_name}</span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    {formatDate(m.created_at)}
                  </span>
                </div>
                {m.project_type && <span className="tag tag-accent-2 w-fit">{m.project_type}</span>}
                <p className="text-sm" style={{ color: "var(--color-neutral-700)" }}>
                  {m.message}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs pt-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: Funti Kidbooks Studio")}`} className="btn btn-secondary btn-sm">
                    ✉ Trả lời {m.email}
                  </a>
                  {m.phone && <span style={{ color: "var(--color-neutral-500)" }}>📞 {m.phone}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
