"use client";

import { useEffect, useState, useTransition } from "react";
import { updateUpworkLeadDraft, updateUpworkLeadStatus, listUpworkLeads } from "@/lib/actions/upwork";
import type { UpworkBatch, UpworkLead, UpworkLeadStatus, UpworkProposalTemplate } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ProposalTemplates } from "./ProposalTemplates";
import { UpworkSopView } from "./UpworkSopView";
import type { UpworkSop } from "@/lib/upworkSop";

const STATUS_LABEL: Record<UpworkLeadStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt — sẵn sàng gửi",
  rejected: "Đã bỏ qua",
  sent: "Đã gửi",
  replied: "Khách đã trả lời",
  hired: "Đã chốt 🎉",
};

const STATUS_COLOR: Record<UpworkLeadStatus, string> = {
  pending: "var(--status-yellow)",
  approved: "var(--status-green)",
  rejected: "var(--color-neutral-400)",
  sent: "var(--color-accent-700)",
  replied: "var(--color-accent-2-700)",
  hired: "var(--status-green)",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function LeadCard({ lead, onChanged }: { lead: UpworkLead; onChanged: (next: UpworkLead) => void }) {
  const [draft, setDraft] = useState(lead.proposal_draft);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function setStatus(status: UpworkLeadStatus) {
    startTransition(async () => {
      await updateUpworkLeadStatus(lead.id, status);
      onChanged({ ...lead, status });
    });
  }

  function saveDraft() {
    startTransition(async () => {
      await updateUpworkLeadDraft(lead.id, draft);
      onChanged({ ...lead, proposal_draft: draft });
      setEditing(false);
    });
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (older Safari, no HTTPS) — the textarea below still
      // lets sếp select-all and copy by hand.
    }
  }

  return (
    <div className="card elev-sm p-4 flex flex-col gap-3" style={{ opacity: lead.status === "rejected" ? 0.55 : 1 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={lead.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold hover:underline"
            style={{ color: "var(--color-text)" }}
          >
            {lead.job_title}
          </a>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-3" style={{ color: "var(--color-neutral-500)" }}>
            {lead.budget_text && <span>💰 {lead.budget_text}</span>}
            {lead.client_info && <span>{lead.client_info}</span>}
          </div>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full flex-none"
          style={{ background: "var(--color-neutral-100)", color: STATUS_COLOR[lead.status] }}
        >
          {STATUS_LABEL[lead.status]}
        </span>
      </div>

      {/* Night-shift report: how well it fits, what to do, when to send. */}
      {(lead.fit_score || lead.recommendation || lead.template_name || lead.send_window || lead.client_region) && (
        <div className="flex flex-wrap gap-1.5">
          {lead.recommendation && (
            <span
              className="text-[11px] font-bold px-2 py-1 rounded-full"
              style={{
                background:
                  lead.recommendation === "strong"
                    ? "color-mix(in srgb, var(--status-green) 16%, transparent)"
                    : "color-mix(in srgb, var(--status-yellow) 18%, transparent)",
                border: `1px solid ${lead.recommendation === "strong" ? "var(--status-green)" : "var(--status-yellow)"}`,
              }}
            >
              {lead.recommendation === "strong" ? "✅ Rất hợp — nên gửi" : "🤔 Có thể hợp — xem kỹ"}
            </span>
          )}
          {lead.fit_score && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "var(--color-neutral-100)" }}>
              Mức phù hợp {"★".repeat(lead.fit_score)}
              <span style={{ color: "var(--color-neutral-400)" }}>{"★".repeat(5 - lead.fit_score)}</span>
            </span>
          )}
          {lead.template_name && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "var(--color-neutral-100)" }}>
              📄 {lead.template_name}
            </span>
          )}
          {(lead.client_region || lead.send_window) && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "var(--color-neutral-100)" }}>
              🕘 {[lead.client_region, lead.send_window && `gửi ${lead.send_window}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      )}

      {lead.match_reason && (
        <p className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
          <span className="font-semibold">Vì sao hợp: </span>
          {lead.match_reason}
        </p>
      )}

      {/* The email a lead comes from has no client history — these four
          SOP checks are for whoever opens the job to send it. */}
      {lead.status !== "rejected" && lead.fit_score && (
        <div className="rounded-[8px] px-3 py-2 text-xs flex flex-col gap-1" style={{ background: "var(--color-neutral-100)" }}>
          <span className="font-semibold">Mở job, kiểm tra khách trước khi gửi:</span>
          <span>☐ Thanh toán đã xác minh · tổng tiền đã chi</span>
          <span>☐ Đánh giá từ freelancer khác (tìm tên thật của khách)</span>
          <span>☐ Tỉ lệ thuê (hire rate) · số Connects cần (trên 25 → Giám đốc duyệt)</span>
          <span style={{ color: "var(--color-neutral-500)" }}>Đạt từ 15/20 điểm SOP mới gửi.</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-500)" }}>
            Proposal nháp
          </span>
          {!editing && (
            <button type="button" className="text-xs font-semibold hover:underline" style={{ color: "var(--color-accent-700)" }} onClick={() => setEditing(true)}>
              Sửa
            </button>
          )}
        </div>
        {editing ? (
          <>
            <textarea
              className="input text-sm min-h-[140px] font-sans"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={saveDraft}>
                Lưu
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDraft(lead.proposal_draft);
                  setEditing(false);
                }}
              >
                Huỷ
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm whitespace-pre-wrap rounded-[8px] p-3" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>
            {draft}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {/* One tap on the phone: the draft goes to the clipboard and the job
            opens on Upwork, ready to paste. A real link (not window.open
            after an await) so iOS Safari never blocks it as a popup. */}
        {lead.status !== "rejected" && (
          <a
            href={lead.job_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void copyDraft()}
            className="btn btn-secondary btn-sm"
          >
            {copied ? "Đã chép ✓ — dán vào Upwork" : "Mở job & chép proposal"}
          </a>
        )}
        {/* A skipped lead has no "open job" button — keep a plain copy. */}
        {lead.status === "rejected" && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyDraft}>
            {copied ? "Đã chép ✓" : "Sao chép proposal"}
          </button>
        )}
        {lead.status === "pending" && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => setStatus("approved")}>
              Duyệt
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setStatus("rejected")}>
              Bỏ qua
            </button>
          </>
        )}
        {lead.status === "approved" && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setStatus("sent")}>
            Đánh dấu đã gửi trên Upwork
          </button>
        )}
        {/* Past "Đã gửi": mark how far it got, for the Tổng quan funnel. */}
        {lead.status === "sent" && (
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => setStatus("replied")}>
            Khách đã trả lời
          </button>
        )}
        {lead.status === "replied" && (
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => setStatus("hired")}>
            Đã chốt hợp đồng 🎉
          </button>
        )}
        {(lead.status === "replied" || lead.status === "hired") && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setStatus("sent")}>
            Quay lại &quot;Đã gửi&quot;
          </button>
        )}
        {(lead.status === "rejected" || lead.status === "sent") && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setStatus("pending")}>
            Đưa lại vào Chờ duyệt
          </button>
        )}
      </div>
    </div>
  );
}

// Oldest first; a lead the realtime feed just delivered replaces the
// fetched copy of the same id.
function mergeLeads(base: UpworkLead[], incoming: UpworkLead[]) {
  const byId = new Map(base.map((l) => [l.id, l]));
  for (const l of incoming) byId.set(l.id, { ...byId.get(l.id), ...l });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function BatchSection({ batch, live, startOpen }: { batch: UpworkBatch; live: UpworkLead[] | undefined; startOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<UpworkLead[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const rows = await listUpworkLeads(batch.id);
    setLeads((prev) => mergeLeads(rows, prev ?? []));
    setLoading(false);
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (leads === null) await load();
  }

  // The newest batch with jobs opens by itself, including one that just
  // arrived while the page was open.
  useEffect(() => {
    if (!startOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the newest batch once it appears
    setOpen(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen]);

  // Leads written or changed elsewhere (the hourly run adding them, the PM
  // pressing Duyệt on another device) show up here without a reload.
  useEffect(() => {
    if (!live || live.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- merging a realtime push into local state
    setLeads((prev) => mergeLeads(prev ?? [], live));
  }, [live]);

  const pendingCount = leads?.filter((l) => l.status === "pending").length ?? null;

  return (
    <div className="card elev-sm overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div>
          <div className="text-sm font-bold">Đợt tìm khách — {fmtDateTime(batch.ran_at)}</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
            {batch.jobs_found} job tìm được · {batch.leads_drafted} proposal đã soạn
            {pendingCount !== null && pendingCount > 0 && <> · {pendingCount} chờ duyệt</>}
          </div>
        </div>
        <span aria-hidden style={{ color: "var(--color-neutral-400)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {batch.note && (
            <p className="text-xs pt-3" style={{ color: "var(--color-neutral-500)" }}>
              {batch.note}
            </p>
          )}
          {loading && (
            <p className="text-sm pt-3" style={{ color: "var(--color-neutral-500)" }}>
              Đang tải...
            </p>
          )}
          {leads && leads.length === 0 && (
            <p className="text-sm pt-3" style={{ color: "var(--color-neutral-500)" }}>
              Đợt này không tìm được job nào khớp SOP.
            </p>
          )}
          {leads && leads.length > 0 && (
            <div className="flex flex-col gap-3 pt-3">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onChanged={(next) => setLeads((prev) => prev?.map((l) => (l.id === next.id ? next : l)) ?? prev)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "batches" | "templates" | "sop";

export function UpworkReportsAdmin({
  initialBatches,
  initialTemplates,
  sop,
  initialTab,
}: {
  initialBatches: UpworkBatch[];
  initialTemplates: UpworkProposalTemplate[];
  sop: { sop: UpworkSop; saved: boolean };
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [templates, setTemplates] = useState(initialTemplates);
  const [batches, setBatches] = useState(initialBatches);
  const [liveLeads, setLiveLeads] = useState<Map<string, UpworkLead[]>>(() => new Map());
  const [showEmpty, setShowEmpty] = useState(false);

  // Realtime: a new check from the hourly run, a lead it drafted, or a
  // status someone changed appears the moment it is saved.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("upwork-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "upwork_batches" }, (payload) => {
        const row = payload.new as UpworkBatch;
        setBatches((prev) => (prev.some((b) => b.id === row.id) ? prev : [row, ...prev]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "upwork_batches" }, (payload) => {
        const row = payload.new as UpworkBatch;
        setBatches((prev) => prev.map((b) => (b.id === row.id ? row : b)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "upwork_leads" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const row = payload.new as UpworkLead;
        setLiveLeads((prev) => new Map(prev).set(row.batch_id, [...(prev.get(row.batch_id) ?? []), row]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const withJobs = batches.filter((b) => b.leads_drafted > 0 || (liveLeads.get(b.id)?.length ?? 0) > 0);
  const emptyCount = batches.length - withJobs.length;
  const newestWithJobs = withJobs[0]?.id ?? null;
  const lastCheck = batches[0]?.ran_at ?? null;

  function switchTab(next: Tab) {
    setTab(next);
    // Keeps the tab on reload / when the link is shared, without a navigation.
    const url = new URL(window.location.href);
    if (next === "templates") url.searchParams.set("tab", "mau");
    else if (next === "sop") url.searchParams.set("tab", "sop");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "batches", label: "Đợt tìm khách", count: withJobs.length },
    { id: "templates", label: "Mẫu proposal", count: templates.length },
    { id: "sop", label: "SOP" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 sm:px-6 pt-4 flex flex-col gap-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div>
          <h1 className="text-xl">Tìm khách (Upwork)</h1>
          <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
            Báo cáo job tìm được và proposal nháp mỗi đêm — chỉ giám đốc và Project Manager thấy được. Không có gì ở đây tự
            gửi lên Upwork; bấm &quot;Duyệt&quot; rồi tự tay gửi.
          </p>
        </div>
        <div role="tablist" className="flex gap-5 -mb-px">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t.id)}
                className="pb-2.5 text-sm font-semibold flex items-center gap-1.5"
                style={{
                  color: active ? "var(--color-accent-700)" : "var(--color-neutral-500)",
                  borderBottom: `2px solid ${active ? "var(--color-accent-500)" : "transparent"}`,
                }}
              >
                {t.label}
                {t.count !== undefined && (
                  <span
                    className="text-[11px] tabular-nums rounded-full px-1.5"
                    style={{ background: active ? "var(--color-accent-100)" : "var(--color-neutral-100)" }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-3">
        {tab === "sop" ? (
          <UpworkSopView initialSop={sop.sop} saved={sop.saved} />
        ) : tab === "templates" ? (
          <ProposalTemplates templates={templates} onTemplatesChange={setTemplates} />
        ) : (
          <>
            {/* Every hourly check lands here; the ones with no new job fold
                into one line so the list only shows real work. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--color-neutral-500)" }}>
              <span>{lastCheck ? <>Kiểm tra Gmail mỗi giờ · lần gần nhất {fmtDateTime(lastCheck)}</> : "Chưa có lượt kiểm tra nào."}</span>
              {emptyCount > 0 && (
                <button
                  type="button"
                  className="underline font-semibold"
                  style={{ color: "var(--color-accent-700)" }}
                  onClick={() => setShowEmpty((v) => !v)}
                >
                  {showEmpty ? "Ẩn" : "Xem"} {emptyCount} lượt không có job mới
                </button>
              )}
            </div>
            {withJobs.length === 0 && !showEmpty && (
              <p style={{ color: "var(--color-neutral-500)" }}>Chưa có job nào hợp SOP. Có job mới là hiện ở đây ngay.</p>
            )}
            {(showEmpty ? batches : withJobs).map((batch) => (
              <BatchSection key={batch.id} batch={batch} live={liveLeads.get(batch.id)} startOpen={batch.id === newestWithJobs} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
