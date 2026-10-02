"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { createClient, ensureBrowserSession } from "@/lib/supabase/client";
import { cancelMyLeave } from "@/lib/actions/leave";
import { fetchActiveLeave } from "@/lib/leaveActive";
import { LEAVE_STATUS, dayMonth, leaveOutcome, leaveRangeLabel } from "@/lib/leave";
import { vnToday } from "@/lib/constants/attendance";
import { LeaveList } from "@/components/workspace/LeaveRequests";
import { PendingLeave, profileLookup } from "@/components/admin/LeaveApprovals";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import type { LeaveRequest, Profile } from "@/lib/types";

// Đơn xin nghỉ on the workspace top bar, on every page:
// - Giám đốc / PM: a "Chờ duyệt" inbox (📥) — the count of requests waiting
//   on them, opening onto the requests with their Duyệt buttons and who's
//   off soon. A Giám đốc's count also takes in đề nghị ứng lương.
// - Whoever has a request in: a chip with where it stands (Chờ duyệt →
//   Đã duyệt / Không duyệt), flipping the moment it's decided; a fresh
//   decision stands out until they've opened it, approved leave stays on
//   as "Nghỉ 03/10" until it's over.
// A notification's link (?don-nghi=duyet / cua-toi, lib/actions/leave.ts)
// opens the matching panel from wherever they are.

const SEEN_KEY = "funti-leave-seen";
type Panel = "duyet" | "cua-toi";

export function LeaveTopBar({
  currentUserId,
  canManage,
  isDirector,
  profiles,
  initial,
  initialAdvanceCount,
}: {
  currentUserId: string;
  canManage: boolean;
  isDirector: boolean;
  profiles: Profile[];
  initial: LeaveRequest[];
  initialAdvanceCount: number;
}) {
  const [requests, setRequests] = useState(initial);
  const [advanceCount, setAdvanceCount] = useState(initialAdvanceCount);
  const [panel, setPanel] = useState<Panel | null>(null);
  // Decisions already opened on this device; null until read after hydration.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const today = vnToday();

  const reload = useCallback(async () => {
    try {
      // A woken iPhone tab can query with no session and get [] back — that
      // must not wipe a pending request off the bar.
      await ensureBrowserSession();
      const supabase = createClient();
      const [list, advances] = await Promise.all([
        fetchActiveLeave(supabase, vnToday()),
        isDirector ? supabase.from("salary_advances").select("id", { count: "exact", head: true }).eq("status", "pending") : null,
      ]);
      setRequests(list);
      if (advances && !advances.error) setAdvanceCount(advances.count ?? 0);
    } catch {
      // Keep what's on screen; the next change or return to the app retries.
    }
  }, [isDirector]);

  // Live: a new request, a withdrawal, a decision (by either manager).
  // Coming back to the app re-reads too, in case the socket slept.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 300);
    };
    const channel = supabase.channel(`leave-topbar-${currentUserId}`);
    if (canManage) channel.on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, soon);
    else channel.on("postgres_changes", { event: "*", schema: "public", table: "leave_requests", filter: `profile_id=eq.${currentUserId}` }, soon);
    if (isDirector) channel.on("postgres_changes", { event: "*", schema: "public", table: "salary_advances" }, soon);
    channel.subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", soon);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", soon);
      supabase.removeChannel(channel);
    };
  }, [currentUserId, canManage, isDirector, reload]);

  useEffect(() => {
    let ids: unknown = [];
    try {
      ids = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    } catch {
      // private mode — every decision counts as new on this visit
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-device list after hydration
    setSeen(new Set(Array.isArray(ids) ? (ids as string[]) : []));
  }, []);

  // A notification's link: on load (?don-nghi=…), or tapped while the
  // workspace is already open (sw.js posts it; NotificationClickRouter
  // leaves the page where it is).
  useEffect(() => {
    function openFrom(url: string) {
      const which = new URL(url, window.location.origin).searchParams.get("don-nghi");
      if (which !== "duyet" && which !== "cua-toi") return;
      setPanel(which === "duyet" && canManage ? "duyet" : "cua-toi");
      void reload();
    }
    const here = new URL(window.location.href);
    if (here.searchParams.has("don-nghi")) {
      openFrom(here.href);
      here.searchParams.delete("don-nghi");
      window.history.replaceState(window.history.state, "", `${here.pathname}${here.search}${here.hash}`);
    }
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "notification-click" && typeof event.data.url === "string") openFrom(event.data.url);
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [canManage, reload]);

  const profileOf = useMemo(() => profileLookup(profiles), [profiles]);
  const mine = requests.filter((r) => r.profile_id === currentUserId);
  const decided = (r: LeaveRequest) => r.status === "approved" || r.status === "rejected";
  const fresh = seen ? mine.filter((r) => decided(r) && !seen.has(r.id)) : [];
  const myPending = mine.filter((r) => r.status === "pending");
  const myUpcoming = mine.filter((r) => r.status === "approved" && r.end_date >= today);
  const othersPending = requests.filter((r) => r.status === "pending" && r.profile_id !== currentUserId).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const offSoon = requests.filter((r) => r.status === "approved" && r.end_date >= today);
  const waitingCount = othersPending.length + (isDirector ? advanceCount : 0);

  function markSeen() {
    const next = new Set(seen ?? []);
    for (const r of mine) if (decided(r)) next.add(r.id);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-100)));
    } catch {
      // not remembered — the chip just shows it again next visit
    }
  }

  function openMine() {
    markSeen();
    setPanel("cua-toi");
  }

  const close = useCallback(() => setPanel(null), []);
  function closeMine() {
    // A decision that landed while the panel was open counts as read too.
    markSeen();
    setPanel(null);
  }

  async function cancel(id: string) {
    if (!window.confirm("Huỷ đơn xin nghỉ này?")) return;
    try {
      const saved = await cancelMyLeave(id);
      setRequests((prev) => prev.map((r) => (r.id === id ? saved : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chưa huỷ được, thử lại nhé.");
    }
  }

  // What the chip says: news first, then what's waiting, then leave to come.
  const freshRejected = fresh.find((r) => r.status === "rejected");
  const freshApproved = fresh.find((r) => r.status === "approved");
  const chip = freshRejected
    ? { request: freshRejected, status: "rejected" as const, text: "Không duyệt", isNew: true }
    : freshApproved
      ? { request: freshApproved, status: "approved" as const, text: "Đã duyệt", isNew: true }
      : myPending.length > 0
        ? { request: myPending[0], status: "pending" as const, text: myPending.length > 1 ? `${myPending.length} đơn chờ duyệt` : "Chờ duyệt", isNew: false }
        : myUpcoming.length > 0
          ? { request: myUpcoming[0], status: null, text: `Nghỉ ${dayMonth(myUpcoming[0].start_date)}`, isNew: false }
          : null;
  const chipStyle = chip?.status ? LEAVE_STATUS[chip.status] : { bg: "var(--color-surface)", color: "var(--color-neutral-700)" };

  const myList = mine
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || a.start_date.localeCompare(b.start_date));

  return (
    <>
      {chip && (
        <button
          type="button"
          onClick={openMine}
          className="relative flex-none flex items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-bold whitespace-nowrap"
          style={{ height: 30, background: chipStyle.bg, color: chipStyle.color }}
          aria-label={`Đơn xin nghỉ ${leaveRangeLabel(chip.request)}: ${chip.text}`}
          title="Đơn xin nghỉ của bạn"
        >
          <span aria-hidden>🗓</span>
          {chip.status && <span className="hidden md:inline font-semibold">{leaveRangeLabel(chip.request)} ·</span>}
          <span>{chip.text}</span>
          {chip.isNew && <RedDot />}
        </button>
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => setPanel("duyet")}
          className={`relative flex-none flex items-center justify-center gap-1.5 ${waitingCount > 0 ? "rounded-full sm:pl-2.5 sm:pr-3" : "btn-icon"}`}
          style={
            waitingCount > 0
              ? { height: 30, minWidth: 30, background: "rgba(214,160,40,.16)", color: "var(--status-yellow)" }
              : { width: 30, height: 30, padding: 0 }
          }
          aria-label={waitingCount > 0 ? `${waitingCount} đơn chờ duyệt` : "Hòm thư duyệt — không có đơn nào chờ"}
          title="Chờ duyệt"
        >
          <span aria-hidden>📥</span>
          {waitingCount > 0 && (
            <>
              <span className="hidden sm:inline text-[12.5px] font-bold whitespace-nowrap">Chờ duyệt</span>
              <CountBadge n={waitingCount} />
            </>
          )}
        </button>
      )}

      {panel === "duyet" && (
        <Modal onClose={close} maxWidth={1040} sheetOnPhone>
          <div className="p-4 sm:p-5 flex flex-col gap-5">
            <PanelHeader title="📥 Chờ duyệt" note="Đơn xin nghỉ đang chờ Giám đốc hoặc PM duyệt." onClose={close} />

            {othersPending.length === 0 ? (
              <p className="text-[13.5px] rounded-[12px] px-4 py-5 text-center" style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}>
                Không có đơn xin nghỉ nào đang chờ duyệt.
              </p>
            ) : (
              <div className="grid gap-3 items-start" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
                {othersPending.map((r) => (
                  <PendingLeave
                    key={r.id}
                    request={r}
                    profile={profileOf(r.profile_id)}
                    onDecided={(saved) => setRequests((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))}
                  />
                ))}
              </div>
            )}

            {isDirector && advanceCount > 0 && (
              <Link
                href="/quan-tri/cham-cong"
                onClick={close}
                className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-[13.5px] font-semibold hover:brightness-95"
                style={{ background: "rgba(214,160,40,.12)", color: "var(--color-text)" }}
              >
                <span>💰 {advanceCount} đề nghị ứng lương đang chờ duyệt</span>
                <span className="whitespace-nowrap" style={{ color: "var(--color-accent-600)" }}>
                  Mở →
                </span>
              </Link>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold" style={{ color: "var(--color-neutral-600)" }}>
                Sắp nghỉ
              </h3>
              {offSoon.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có ai sắp nghỉ.
                </p>
              ) : (
                <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
                  {offSoon.map((r) => {
                    const p = profileOf(r.profile_id);
                    return (
                      <li key={r.id} className="flex items-center gap-2.5 rounded-[10px] px-3 py-2" style={{ background: "var(--color-surface)" }}>
                        <AttendanceAvatar profile={p} size={28} />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-[13px] font-semibold truncate">{p.display_name}</span>
                          <span className="text-[12px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                            {leaveRangeLabel(r)} · {leaveOutcome(r)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Link href="/quan-tri/cham-cong" onClick={close} className="text-[12.5px] font-semibold w-fit hover:underline" style={{ color: "var(--color-neutral-600)" }}>
              Các đơn đã xử lý: Quản trị › Chấm công →
            </Link>
          </div>
        </Modal>
      )}

      {panel === "cua-toi" && (
        <Modal onClose={closeMine} maxWidth={440}>
          <div className="p-5 flex flex-col gap-4">
            <PanelHeader title="🗓 Đơn xin nghỉ của bạn" note="Giám đốc hoặc PM duyệt xong là bạn nhận thông báo ngay." onClose={closeMine} />
            {myList.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
                Bạn không có đơn xin nghỉ nào gần đây.
              </p>
            ) : (
              <LeaveList requests={myList} onCancel={cancel} />
            )}
            <Link href="/workspace/cham-cong" onClick={closeMine} className="btn btn-secondary w-full">
              Xin nghỉ thêm — mở lịch Chấm công
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}

function PanelHeader({ title, note, onClose }: { title: string; note: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg">{title}</h2>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
          {note}
        </p>
      </div>
      <button type="button" onClick={onClose} className="btn-icon flex-none" style={{ width: 32, height: 32, padding: 0 }} aria-label="Đóng">
        ✕
      </button>
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="absolute sm:static flex items-center justify-center rounded-full font-bold"
      style={{ top: -2, right: -2, minWidth: 16, height: 16, padding: "0 4px", fontSize: 10, background: "var(--status-red)", color: "#fff", border: "1.5px solid var(--color-bg)" }}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

function RedDot() {
  return (
    <span
      className="absolute rounded-full"
      style={{ top: -1, right: -1, width: 10, height: 10, background: "var(--status-red)", border: "2px solid var(--color-bg)" }}
      aria-hidden
    />
  );
}
