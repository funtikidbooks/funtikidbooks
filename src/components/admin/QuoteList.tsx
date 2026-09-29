"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createQuote } from "@/lib/actions/quotes";
import { QUOTE_PRESETS, STATUS_LABELS, formatMoney, tierTotals, type Quote, type QuoteLang } from "@/lib/quote";

const STATUS_TONE: Record<Quote["status"], { bg: string; fg: string }> = {
  draft: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" },
  sent: { bg: "var(--badge-orange-bg)", fg: "var(--badge-orange-fg)" },
  accepted: { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  declined: { bg: "var(--badge-red-bg)", fg: "var(--badge-red-fg)" },
};

// Báo giá: start a quote from a ready-made layout (or blank), then the
// list of every quote so far — newest first, searchable by client/project.
export function QuoteList({ initialQuotes, ready }: { initialQuotes: Quote[]; ready: boolean }) {
  const router = useRouter();
  const [language, setLanguage] = useState<QuoteLang>("vi");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyPreset, setBusyPreset] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return initialQuotes;
    return initialQuotes.filter((x) => `${x.code} ${x.title} ${x.client_name}`.toLowerCase().includes(needle));
  }, [initialQuotes, q]);

  function start(presetId: string) {
    setError(null);
    setBusyPreset(presetId);
    startTransition(async () => {
      try {
        const id = await createQuote(presetId, language);
        router.push(`/quan-tri/bao-gia/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tạo được báo giá.");
        setBusyPreset(null);
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-5">
      <div>
        <h1 className="text-xl">Báo giá</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Soạn báo giá 1–3 mức giá cho khách, in ra PDF hoặc chép dạng tin nhắn gửi qua Zalo. Chỉ Giám đốc thấy trang này.
        </p>
      </div>

      {!ready && (
        <div className="rounded-[12px] px-4 py-3 text-sm" style={{ background: "var(--badge-orange-bg)", color: "var(--badge-orange-fg)" }}>
          Cần chạy file SQL <b>quotes.sql</b> trong Supabase một lần trước khi dùng Báo giá.
        </div>
      )}

      <section className="card elev-sm p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">+ Báo giá mới</h2>
          <div className="inline-flex rounded-full p-0.5" style={{ background: "var(--color-neutral-100)" }} role="radiogroup" aria-label="Ngôn ngữ báo giá">
            {(
              [
                ["vi", "🇻🇳 Tiếng Việt · VNĐ"],
                ["en", "🇬🇧 English · USD"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={language === id}
                onClick={() => setLanguage(id)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
                style={language === id ? { background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" } : { color: "var(--color-neutral-600)" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {QUOTE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={pending || !ready}
              onClick={() => start(p.id)}
              className="ws-nav-link rounded-[12px] px-3 py-3 text-left flex flex-col gap-1"
              style={{ border: "1px solid var(--color-neutral-200)", opacity: !ready ? 0.5 : 1 }}
            >
              <span className="text-[14px] font-bold">{busyPreset === p.id ? "Đang tạo…" : p.label}</span>
              <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                {p.tiers === 1 ? "1 mức giá" : `${p.tiers} mức giá`} · {p.items.length} hạng mục
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h2 className="text-base font-bold">Đã soạn · {initialQuotes.length}</h2>
          <input className="input" style={{ maxWidth: 280 }} placeholder="Tìm theo khách, dự án, mã…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {shown.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--color-neutral-500)" }}>
            {initialQuotes.length === 0 ? "Chưa có báo giá nào — chọn một mẫu ở trên để bắt đầu." : "Không có báo giá nào khớp."}
          </p>
        ) : (
          <div className="card elev-sm flex flex-col overflow-hidden">
            {shown.map((x, i) => {
              const totals = tierTotals(x.items, x.tier_names.length);
              const tone = STATUS_TONE[x.status];
              return (
                <Link
                  key={x.id}
                  href={`/quan-tri/bao-gia/${x.id}`}
                  className="ws-nav-link flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  style={{ borderTop: i ? "1px solid var(--color-neutral-200)" : undefined }}
                >
                  <span className="flex flex-col min-w-0 flex-1 basis-[220px]">
                    <span className="text-[14px] font-bold truncate">{x.client_name || "Chưa ghi khách"}</span>
                    <span className="text-[12.5px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                      {x.code} · {x.title || "Chưa có tên dự án"}
                    </span>
                  </span>
                  <span className="text-[13px] tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
                    {totals.map((t) => formatMoney(t.total, x.currency)).join(" / ")}
                  </span>
                  <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold flex-none" style={{ background: tone.bg, color: tone.fg }}>
                    {STATUS_LABELS[x.status]}
                  </span>
                  <span className="text-[12px] tabular-nums flex-none" style={{ color: "var(--color-neutral-500)" }}>
                    {new Date(x.created_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
