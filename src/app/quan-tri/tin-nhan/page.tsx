import type { Metadata } from "next";
import { listContactMessages } from "@/lib/actions/admin";
import type { ContactMessage } from "@/lib/types";
import { waitingFor } from "@/lib/customerWaitingLabel";
import { ContactHandledButton } from "./ContactHandledButton";

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
  const all = (await listContactMessages()) as ContactMessage[];
  // Not answered yet first (oldest wait at the top), then everything else.
  // Before customer_waiting.sql runs there's no handled_at at all — then
  // nothing is marked and the list keeps its plain newest-first order.
  const tracked = all.some((m) => "handled_at" in m);
  const waiting = tracked ? all.filter((m) => !m.handled_at).sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];
  const messages = tracked ? [...waiting, ...all.filter((m) => m.handled_at)] : all;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Tin nhắn khách hàng</h1>
        <span className="flex items-center gap-2">
          {waiting.length > 0 && (
            <span className="tag" style={{ background: "#fff1e6", color: "#c2410c", border: "1px solid #fdba74" }}>
              ⏳ {waiting.length} chưa trả lời
            </span>
          )}
          <span className="tag tag-neutral">{messages.length} tin nhắn</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có ai gửi form Liên hệ.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3 items-start">
            {messages.map((m) => (
              <div
                key={m.id}
                className="card elev-sm p-4 flex flex-col gap-2"
                style={tracked && !m.handled_at ? { border: "2px solid #fb923c", background: "#fffaf5" } : { opacity: tracked ? 0.8 : 1 }}
              >
                {tracked && !m.handled_at && (
                  <span className="text-[12px] font-bold" style={{ color: "#c2410c" }}>
                    ⏳ Khách chờ {waitingFor(m.created_at)} — chưa trả lời
                  </span>
                )}
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
                  {tracked && (
                    <span className="ml-auto">
                      <ContactHandledButton id={m.id} handled={Boolean(m.handled_at)} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
