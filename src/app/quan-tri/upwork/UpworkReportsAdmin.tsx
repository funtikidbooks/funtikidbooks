"use client";

import { useEffect, useState, useTransition } from "react";
import { listUpworkBatches, listUpworkLeadsForBatches, updateUpworkLeadDraft, updateUpworkLeadStatus } from "@/lib/actions/upwork";
import { UPWORK_LIVE_CHANNEL, UPWORK_LIVE_EVENT } from "@/lib/upworkLive";
import type { UpworkBatch, UpworkLead, UpworkLeadStatus, UpworkProposalTemplate } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ProposalTemplates } from "./ProposalTemplates";
import { UpworkSopView } from "./UpworkSopView";
import { UpworkStats } from "./UpworkStats";
import type { UpworkSop } from "@/lib/upworkSop";
import type { UpworkFilters } from "@/lib/upworkFilters";

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

function LeadCard({ lead, foundAt, onChanged }: { lead: UpworkLead; foundAt?: string; onChanged: (next: UpworkLead) => void }) {
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
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // Clipboard blocked (older Safari, no HTTPS) — the textarea below still
      // lets sếp select-all and copy by hand.
    }
  }

  // Duyệt = approve, copy the proposal, and open the job on Upwork in the
  // same tap — the link itself opens it (in whatever browser or app sếp is
  // signed in to), the status saves alongside. An unsaved edit is saved too.
  function approveAndOpen() {
    void copyDraft();
    startTransition(async () => {
      if (draft !== lead.proposal_draft) await updateUpworkLeadDraft(lead.id, draft);
      await updateUpworkLeadStatus(lead.id, "approved");
      onChanged({ ...lead, proposal_draft: draft, status: "approved" });
      setEditing(false);
    });
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
            {foundAt && <span>🕑 Tìm lúc {foundAt}</span>}
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
        {lead.status !== "rejected" && lead.status !== "pending" && (
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
            <a
              href={lead.job_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (pending) {
                  e.preventDefault();
                  return;
                }
                approveAndOpen();
              }}
              className="btn btn-primary btn-sm"
              aria-disabled={pending}
            >
              Duyệt & mở job ↗
            </a>
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

// The hourly checks, a day at a time (Vietnam calendar day).
const VN_OFFSET_MS = 7 * 3600e3;
const vnDay = (iso: string) => new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const vnTime = (iso: string) => new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
function dayLabel(key: string, todayKey: string) {
  const d = new Date(`${key}T00:00:00Z`);
  const date = `${WEEKDAYS[d.getUTCDay()]}, ${key.slice(8, 10)}/${key.slice(5, 7)}`;
  const diff = Math.round((Date.parse(`${todayKey}T00:00:00Z`) - d.getTime()) / 86400e3);
  return diff === 0 ? `Hôm nay · ${date}` : diff === 1 ? `Hôm qua · ${date}` : date;
}

function DaySection({
  dayKey,
  todayKey,
  batches,
  live,
  startOpen,
  tick,
}: {
  dayKey: string;
  todayKey: string;
  batches: UpworkBatch[];
  live: UpworkLead[];
  startOpen: boolean;
  tick: number;
}) {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<UpworkLead[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [failed, setFailed] = useState(false);
  const ids = batches.map((x) => x.id);
  const timeOf = new Map(batches.map((x) => [x.id, vnTime(x.ran_at)]));

  async function load() {
    setLoading(true);
    try {
      const rows = await listUpworkLeadsForBatches(ids);
      setLeads((prev) => mergeLeads(rows, prev ?? []));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (leads === null) await load();
  }

  // The newest day with jobs opens by itself, including one whose first
  // job arrived while the page was open.
  useEffect(() => {
    if (!startOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the newest day once it has jobs
    setOpen(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen]);

  // A live ping for one of this day's checks: refetch if its leads are on
  // screen, so another device's Duyệt / edit shows up here.
  useEffect(() => {
    if (tick === 0 || (!open && leads === null)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch triggered by an external realtime ping
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Leads written or changed elsewhere (the hourly run adding them, the PM
  // pressing Duyệt on another device) show up here without a reload.
  useEffect(() => {
    if (live.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- merging a realtime push into local state
    setLeads((prev) => mergeLeads(prev ?? [], live));
  }, [live]);

  const jobsFound = batches.reduce((n, x) => n + (x.jobs_found ?? 0), 0);
  const drafted = Math.max(
    batches.reduce((n, x) => n + (x.leads_drafted ?? 0), 0),
    leads?.length ?? 0,
  );
  const pendingCount = leads?.filter((l) => l.status === "pending").length ?? null;
  const notes = batches.filter((x) => x.note?.trim());
  // Newest first inside the day.
  const shown = leads ? [...leads].reverse() : [];

  return (
    <div className="card elev-sm overflow-hidden" style={{ opacity: drafted === 0 ? 0.8 : 1 }}>
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="text-sm font-bold">{dayLabel(dayKey, todayKey)}</div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--color-neutral-500)" }}>
            <span>{batches.length} lượt kiểm tra</span>
            <span>· {jobsFound} job mới</span>
            <span style={{ color: drafted > 0 ? "var(--color-text)" : undefined, fontWeight: drafted > 0 ? 600 : undefined }}>
              · {drafted} proposal
            </span>
            {pendingCount !== null && pendingCount > 0 && (
              <span style={{ color: "var(--status-yellow)", fontWeight: 600 }}>· {pendingCount} chờ duyệt</span>
            )}
          </div>
        </div>
        <span aria-hidden style={{ color: "var(--color-neutral-400)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {loading && leads === null && (
            <p className="text-sm pt-3" style={{ color: "var(--color-neutral-500)" }}>
              Đang tải...
            </p>
          )}
          {failed && !loading && leads === null && (
            <p className="text-sm pt-3" style={{ color: "var(--status-red)" }}>
              Không tải được job của ngày này.{" "}
              <button type="button" className="underline font-semibold" onClick={() => void load()}>
                Thử lại
              </button>
            </p>
          )}
          {leads && leads.length === 0 && (
            <p className="text-sm pt-3" style={{ color: "var(--color-neutral-500)" }}>
              Hôm đó không có job nào khớp SOP.
            </p>
          )}
          {shown.length > 0 && (
            <div className="flex flex-col gap-3 pt-3">
              {shown.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  foundAt={timeOf.get(lead.batch_id)}
                  onChanged={(next) => setLeads((prev) => prev?.map((l) => (l.id === next.id ? next : l)) ?? prev)}
                />
              ))}
            </div>
          )}
          {notes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className="self-start text-xs font-semibold underline"
                style={{ color: "var(--color-accent-700)" }}
                onClick={() => setShowLog((v) => !v)}
              >
                {showLog ? "Ẩn" : "Xem"} ghi chú {notes.length} lượt kiểm tra
              </button>
              {showLog && (
                <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-neutral-600)" }}>
                  {[...notes].reverse().map((x) => (
                    <li key={x.id} className="flex gap-2">
                      <span className="tabular-nums flex-none font-semibold">{vnTime(x.ran_at)}</span>
                      <span className="min-w-0">{x.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "batches" | "stats" | "templates" | "sop";

export function UpworkReportsAdmin({
  initialBatches,
  initialTemplates,
  sop,
  filters,
  initialTab,
}: {
  initialBatches: UpworkBatch[];
  initialTemplates: UpworkProposalTemplate[];
  sop: { sop: UpworkSop; saved: boolean };
  filters: UpworkFilters;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [templates, setTemplates] = useState(initialTemplates);
  const [batches, setBatches] = useState(initialBatches);
  const [liveLeads, setLiveLeads] = useState<Map<string, UpworkLead[]>>(() => new Map());
  const [ticks, setTicks] = useState<Map<string, number>>(() => new Map());

  // Realtime: a new check from the hourly run, a lead it drafted, or a
  // status someone changed appears the moment it is saved.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(UPWORK_LIVE_CHANNEL)
      // Works with no database setup: a ping after every change elsewhere
      // (lib/upworkLive.ts) → refetch the batch list and that batch's leads.
      .on("broadcast", { event: UPWORK_LIVE_EVENT }, (msg) => {
        const batchId = (msg.payload as { batchId?: string } | undefined)?.batchId;
        void listUpworkBatches()
          .then((rows) => setBatches(rows))
          .catch(() => {});
        if (batchId) setTicks((prev) => new Map(prev).set(batchId, (prev.get(batchId) ?? 0) + 1));
      })
      // Also listens to table changes directly once upwork_realtime.sql has
      // been run — whichever arrives first wins, the merge is idempotent.
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

  // Newest day first; each day's hourly checks together.
  const todayKey = vnDay(new Date().toISOString());
  const days: { key: string; batches: UpworkBatch[] }[] = [];
  for (const batch of batches) {
    const key = vnDay(batch.ran_at);
    const last = days[days.length - 1];
    if (last?.key === key) last.batches.push(batch);
    else days.push({ key, batches: [batch] });
  }
  days.sort((x, y) => y.key.localeCompare(x.key));
  const hasJobs = (d: { batches: UpworkBatch[] }) => d.batches.some((x) => x.leads_drafted > 0 || (liveLeads.get(x.id)?.length ?? 0) > 0);
  const newestWithJobs = days.find(hasJobs)?.key ?? null;
  const totalDrafted = batches.reduce((n, x) => n + (x.leads_drafted ?? 0), 0);
  const lastCheck = batches[0]?.ran_at ?? null;

  function switchTab(next: Tab) {
    setTab(next);
    // Keeps the tab on reload / when the link is shared, without a navigation.
    const url = new URL(window.location.href);
    if (next === "templates") url.searchParams.set("tab", "mau");
    else if (next === "sop") url.searchParams.set("tab", "sop");
    else if (next === "stats") url.searchParams.set("tab", "hieu-qua");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "batches", label: "Job theo ngày", count: totalDrafted },
    { id: "stats", label: "📊 Hiệu quả" },
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
            gửi lên Upwork; bấm &quot;Duyệt &amp; mở job&quot; — proposal được chép sẵn, job mở trên Upwork, dán vào rồi tự tay gửi.
          </p>
        </div>
        <div role="tablist" className="flex gap-5 -mb-px overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t.id)}
                className="pb-2.5 text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap flex-none"
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
        ) : tab === "stats" ? (
          <UpworkStats batches={batches} initialFilters={filters} />
        ) : tab === "templates" ? (
          <ProposalTemplates templates={templates} onTemplatesChange={setTemplates} />
        ) : (
          <>
            {/* Every hourly check lands in its day; a day opens to that
                day's jobs, newest first. */}
            <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              {lastCheck ? <>Kiểm tra Gmail mỗi 15 phút (7h–24h) · lần gần nhất {fmtDateTime(lastCheck)}</> : "Chưa có lượt kiểm tra nào."}
            </p>
            {days.length > 0 && !newestWithJobs && (
              <p style={{ color: "var(--color-neutral-500)" }}>Chưa có job nào hợp SOP. Có job mới là hiện ở đây ngay.</p>
            )}
            {days.map((d) => (
              <DaySection
                key={d.key}
                dayKey={d.key}
                todayKey={todayKey}
                batches={d.batches}
                live={d.batches.flatMap((x) => liveLeads.get(x.id) ?? [])}
                startOpen={d.key === newestWithJobs}
                tick={d.batches.reduce((n, x) => n + (ticks.get(x.id) ?? 0), 0)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
