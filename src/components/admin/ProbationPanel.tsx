"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { vnToday } from "@/lib/constants/attendance";
import { confirmOfficialStaff, markOfficialEmailSent, revertOfficialStaff } from "@/lib/actions/probation";
import { formatVnDate, probationStatus, vnDateOf, DUE_WINDOW_DAYS } from "@/lib/probation";
import type { Profile, StaffProbation } from "@/lib/types";

// Quản trị → Nhân sự: who's on thử việc, whose 2 months are up, and the
// "Nhân viên chính thức" button that records it and emails the person.

const SUBJECT = "🎉 Chúc mừng bạn trở thành nhân viên chính thức — Funti Kidbooks Studio";

function defaultLetter(name: string, officialAt: string) {
  return `Chào ${name},

Chúc mừng bạn đã hoàn thành thời gian thử việc tại Funti Kidbooks Studio! Kể từ ngày ${formatVnDate(officialAt)}, bạn chính thức trở thành nhân viên chính thức của studio.

Cảm ơn bạn vì sự nỗ lực và những đóng góp trong thời gian qua. Chúc bạn tiếp tục gắn bó và cùng studio tạo nên thật nhiều cuốn sách đẹp.

Thân mến,
Funti Kidbooks Studio`;
}

function gmailComposeUrl(to: string, subject: string, body: string) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

function Pill({ tone, children }: { tone: "red" | "yellow" | "green"; children: React.ReactNode }) {
  const c = tone === "red" ? "var(--status-red)" : tone === "yellow" ? "var(--status-yellow)" : "var(--status-green)";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: "var(--color-text)", border: `1px solid ${c}` }}
    >
      {children}
    </span>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-sm font-bold flex-none"
      style={{ width: 36, height: 36, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ConfirmDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (row: StaffProbation) => void;
}) {
  const [officialAt, setOfficialAt] = useState(() => vnToday());
  const [subject, setSubject] = useState(SUBJECT);
  const [message, setMessage] = useState(() => defaultLetter(profile.display_name, vnToday()));
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saved, but the mail didn't go out on its own — offer Gmail instead.
  const [fallback, setFallback] = useState<{ reason: string } | null>(null);

  function changeDate(value: string) {
    setOfficialAt(value);
    if (!edited && value) setMessage(defaultLetter(profile.display_name, value));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await confirmOfficialStaff({ profileId: profile.id, officialAt, subject, message });
      onSaved(res.row);
      if (res.emailed) {
        onClose();
      } else {
        setFallback({
          reason: res.emailError ?? "Web chưa được kết nối Gmail để tự gửi.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  async function markSent() {
    const row = await markOfficialEmailSent(profile.id);
    if (row) onSaved(row);
    onClose();
  }

  return (
    <Modal onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-lg flex-1">✓ Nhân viên chính thức — {profile.display_name}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        {fallback ? (
          <div className="flex flex-col gap-4 px-6 py-6">
            <p className="text-sm">
              <b>{profile.display_name}</b> đã được ghi nhận là nhân viên chính thức từ ngày {formatVnDate(officialAt)}.
            </p>
            <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
              Mail chưa tự gửi được ({fallback.reason}). Bấm nút dưới để mở Gmail với thư đã soạn sẵn, rồi bấm Gửi trong Gmail.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <a
                className="btn btn-primary btn-sm"
                href={gmailComposeUrl(profile.email, subject, message)}
                target="_blank"
                rel="noopener noreferrer"
              >
                ✉️ Mở Gmail để gửi
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={markSent}>
                Đã gửi xong
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label>Gửi tới</label>
                <div className="input font-normal truncate" style={{ background: "var(--color-surface)" }} title={profile.email}>
                  {profile.email}
                </div>
              </div>
              <div className="field">
                <label htmlFor="official-at">Chính thức từ ngày</label>
                <input
                  id="official-at"
                  type="date"
                  className="input font-normal"
                  required
                  value={officialAt}
                  onChange={(e) => changeDate(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="official-subject">Tiêu đề</label>
              <input
                id="official-subject"
                className="input font-normal"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="official-message">Nội dung thư</label>
              <textarea
                id="official-message"
                className="input font-normal"
                rows={10}
                required
                value={message}
                onChange={(e) => {
                  setEdited(true);
                  setMessage(e.target.value);
                }}
              />
            </div>
            {error && (
              <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Huỷ
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? "Đang gửi…" : "✓ Xác nhận & gửi Gmail"}
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function ProbationPanel({
  profiles,
  initialRows,
}: {
  profiles: Profile[];
  initialRows: StaffProbation[];
}) {
  const [rows, setRows] = useState(() => new Map(initialRows.map((r) => [r.profile_id, r])));
  const [confirming, setConfirming] = useState<Profile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = vnToday();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("probation-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_probation" }, (payload) => {
        setRows((prev) => {
          const next = new Map(prev);
          if (payload.eventType === "DELETE") next.delete((payload.old as { profile_id: string }).profile_id);
          else next.set((payload.new as StaffProbation).profile_id, payload.new as StaffProbation);
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const { onProbation, recentlyOfficial } = useMemo(() => {
    const onProbation: { p: Profile; status: ReturnType<typeof probationStatus> }[] = [];
    const recentlyOfficial: { p: Profile; row: StaffProbation }[] = [];
    for (const p of profiles) {
      const row = rows.get(p.id);
      const status = probationStatus(p, row?.official_at, today);
      if (status.kind !== "official") onProbation.push({ p, status });
      else if (row) {
        const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.official_at}T00:00:00Z`)) / 86_400_000;
        if (age <= DUE_WINDOW_DAYS) recentlyOfficial.push({ p, row });
      }
    }
    // Overdue first (longest waiting on top), then whoever finishes soonest.
    const rank = (s: ReturnType<typeof probationStatus>) =>
      s.kind === "due" ? -1000 - s.daysOver : s.kind === "probation" ? s.daysLeft : 0;
    onProbation.sort((a, b) => rank(a.status) - rank(b.status));
    return { onProbation, recentlyOfficial };
  }, [profiles, rows, today]);

  const dueCount = onProbation.filter((x) => x.status.kind === "due").length;

  function revert(p: Profile) {
    if (!confirm(`Huỷ xác nhận chính thức của "${p.display_name}"? Họ sẽ quay lại trạng thái thử việc.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await revertOfficialStaff(p.id);
        setRows((prev) => {
          const next = new Map(prev);
          next.delete(p.id);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
    });
  }

  return (
    <section className="card elev-sm p-4 mb-6 max-w-[820px] flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base flex-1 min-w-[180px]">🌱 Thử việc</h2>
        {dueCount > 0 && <Pill tone="red">{dueCount} người hết hạn thử việc</Pill>}
      </div>
      <p className="text-xs -mt-1" style={{ color: "var(--color-neutral-600)" }}>
        Thử việc 2 tháng tính từ ngày tham gia (sửa ở trang Thành viên). Hết hạn thì bấm <b>Nhân viên chính thức</b> để xác
        nhận và gửi thư chúc mừng qua Gmail cho bạn đó.
      </p>

      {notice && (
        <p className="text-sm font-semibold" style={{ color: "var(--status-green)" }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      {onProbation.length === 0 ? (
        <p className="text-sm py-2" style={{ color: "var(--color-neutral-500)" }}>
          Hiện không có ai đang thử việc.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {onProbation.map(({ p, status }) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-[10px] p-3"
              style={{
                background: "var(--color-surface)",
                border: `1px solid ${status.kind === "due" ? "var(--status-red)" : "var(--color-neutral-200)"}`,
              }}
            >
              <Initial name={p.display_name} />
              <div className="flex flex-col min-w-0 flex-1 basis-[180px]">
                <span className="text-sm font-bold truncate">{p.display_name}</span>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  Vào làm {formatVnDate(vnDateOf(p.joined_at ?? p.created_at))} · Hết thử việc{" "}
                  {status.kind !== "official" && formatVnDate(status.endsOn)}
                </span>
              </div>
              {status.kind === "due" ? (
                <Pill tone="red">{status.daysOver === 0 ? "Hết hạn hôm nay" : `Hết hạn ${status.daysOver} ngày`}</Pill>
              ) : status.kind === "probation" ? (
                <Pill tone="yellow">Còn {status.daysLeft} ngày</Pill>
              ) : null}
              <button
                type="button"
                className={`btn btn-sm flex-none ${status.kind === "due" ? "btn-primary" : "btn-ghost"}`}
                style={status.kind === "due" ? undefined : { border: "1px solid var(--color-neutral-300)" }}
                onClick={() => {
                  setNotice(null);
                  setConfirming(p);
                }}
              >
                ✓ Nhân viên chính thức
              </button>
            </div>
          ))}
        </div>
      )}

      {recentlyOfficial.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            MỚI LÊN CHÍNH THỨC
          </span>
          {recentlyOfficial.map(({ p, row }) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{p.display_name}</span>
              <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                từ {formatVnDate(row.official_at)}
              </span>
              {row.emailed_at ? (
                <Pill tone="green">Đã gửi mail ✓</Pill>
              ) : (
                <a
                  className="text-xs font-semibold underline"
                  style={{ color: "var(--color-accent-700)" }}
                  href={gmailComposeUrl(p.email, SUBJECT, defaultLetter(p.display_name, row.official_at))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chưa gửi mail — mở Gmail
                </a>
              )}
              <button
                type="button"
                className="text-xs underline ml-auto"
                style={{ color: "var(--color-neutral-500)" }}
                disabled={pending}
                onClick={() => revert(p)}
              >
                Huỷ xác nhận
              </button>
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          profile={confirming}
          onClose={() => setConfirming(null)}
          onSaved={(row) => {
            setRows((prev) => new Map(prev).set(row.profile_id, row));
            if (row.emailed_at) setNotice(`Đã gửi thư chúc mừng tới ${confirming.email} ✓`);
          }}
        />
      )}
    </section>
  );
}
