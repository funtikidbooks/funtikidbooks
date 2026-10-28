"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { playCustomerChime } from "@/lib/chatSound";
import { waitingFor } from "@/lib/customerWaitingLabel";

// Khách chờ trả lời (28/10/2026). Sếp Phúc kept missing customers because
// their pings looked like coworker chat. For the director, admin and PM:
//  - an orange "khách chờ trả lời" button that never goes away while anyone
//    is still waiting for a person to answer (not just "unread" — opening a
//    chat doesn't clear it, only replying or "Không cần trả lời" does);
//  - when a customer writes while the app is open: a big orange banner that
//    stays until dismissed, its own chime, and the tab title flashing.
// Reads Supabase straight from the browser with the user's own session —
// no Vercel cost. Waiting state comes from customer_waiting.sql; before
// that runs the queries fail and this shows nothing.

type WaitingItem = { key: string; who: string; since: string; channel: "client" | "visitor" | "form"; href: string };
type Alert = { who: string; preview: string; channel: "client" | "visitor" | "form"; href: string; count: number };

const ORANGE = "#ea580c";
const ORANGE_DARK = "#c2410c";
const FLASH = "🟠 KHÁCH HÀNG NHẮN! ";

export function CustomerWaitingBar({ floating = false }: { floating?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  // Already in the Khách hàng inbox, looking at it: the conversation itself
  // shows the message — no banner or chime on top of a live chat.
  const inInboxRef = useRef(false);
  useEffect(() => {
    inInboxRef.current = pathname.startsWith("/workspace/khach-hang");
  }, [pathname]);
  const [items, setItems] = useState<WaitingItem[] | null>(null);
  const [open, setOpen] = useState(false);
  // Where the list starts on a phone, where it's pinned to the screen
  // rather than hung off the bell (see .fk-customer-waiting-dropdown).
  const [dropTop, setDropTop] = useState(56);
  const [alert, setAlert] = useState<Alert | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const [p, v, f] = await Promise.all([
      sb.from("client_projects").select("id, client_id, awaiting_reply_since").not("awaiting_reply_since", "is", null),
      sb
        .from("visitor_conversations")
        .select("id, visitor_name, awaiting_reply_since")
        .not("awaiting_reply_since", "is", null)
        .eq("status", "open")
        .is("claimed_by_client_id", null),
      sb.from("contact_messages").select("id, full_name, created_at").is("handled_at", null),
    ]);
    if (p.error || v.error || f.error) {
      setItems(null);
      return;
    }
    const clientIds = [...new Set((p.data ?? []).map((x) => x.client_id as string))];
    const { data: clients } = clientIds.length
      ? await sb.from("clients").select("id, display_name, email").in("id", clientIds)
      : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
    const next: WaitingItem[] = [
      ...(p.data ?? []).map((x) => {
        const c = (clients ?? []).find((k) => k.id === x.client_id);
        return {
          key: `c-${x.id}`,
          who: c?.display_name?.trim() || c?.email || "Khách hàng",
          since: x.awaiting_reply_since as string,
          channel: "client" as const,
          href: "/workspace/khach-hang",
        };
      }),
      ...(v.data ?? []).map((x) => ({
        key: `v-${x.id}`,
        who: (x.visitor_name as string | null)?.trim() || "Khách vãng lai",
        since: x.awaiting_reply_since as string,
        channel: "visitor" as const,
        href: "/workspace/khach-hang",
      })),
      ...(f.data ?? []).map((x) => ({
        key: `f-${x.id}`,
        who: (x.full_name as string) || "Khách",
        since: x.created_at as string,
        channel: "form" as const,
        href: "/quan-tri/tin-nhan",
      })),
    ].sort((a, b) => a.since.localeCompare(b.since));
    setItems(next);
  }, []);

  // First load, every minute while on screen, on coming back, and right
  // after a reply / "Không cần trả lời" here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => {});
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load().catch(() => {});
    };
    const onChanged = () => load().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("funti-customer-waiting-changed", onChanged);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("funti-customer-waiting-changed", onChanged);
    };
  }, [load]);

  // A customer writes: banner + chime + flashing tab title, then refresh
  // the list once the database has marked them waiting.
  useEffect(() => {
    const sb = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => load().catch(() => {}), 1500);
    };
    const raise = (a: Omit<Alert, "count">) => {
      refreshSoon();
      if (a.channel !== "form" && inInboxRef.current && document.visibilityState === "visible") return;
      setAlert((prev) => ({ ...a, count: (prev?.count ?? 0) + 1 }));
      playCustomerChime();
    };
    const channel = sb
      .channel("customer-waiting-bar")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_messages" }, async (payload) => {
        const row = payload.new as { project_id: string; sender_type: string; is_auto?: boolean; content: string };
        if (row.sender_type !== "client" || row.is_auto) return refreshSoon();
        const { data: proj } = await sb.from("client_projects").select("client_id").eq("id", row.project_id).maybeSingle();
        const { data: c } = proj
          ? await sb.from("clients").select("display_name, email").eq("id", proj.client_id).maybeSingle()
          : { data: null };
        raise({
          who: c?.display_name?.trim() || c?.email || "Khách hàng",
          preview: row.content || "📷 Gửi ảnh/tệp",
          channel: "client",
          href: "/workspace/khach-hang",
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_messages" }, async (payload) => {
        const row = payload.new as { conversation_id: string; sender_type: string; is_auto?: boolean; content: string };
        if (row.sender_type !== "visitor" || row.is_auto) return refreshSoon();
        const { data: conv } = await sb.from("visitor_conversations").select("visitor_name").eq("id", row.conversation_id).maybeSingle();
        raise({
          who: (conv?.visitor_name as string | null)?.trim() || "Khách vãng lai",
          preview: row.content || "📷 Gửi ảnh/tệp",
          channel: "visitor",
          href: "/workspace/khach-hang",
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contact_messages" }, (payload) => {
        const row = payload.new as { full_name: string; message: string };
        raise({ who: row.full_name || "Khách", preview: row.message || "", channel: "form", href: "/quan-tri/tin-nhan" });
      })
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      sb.removeChannel(channel);
    };
  }, [load]);

  // The tab title flashes while a banner is up and the tab isn't in view.
  useEffect(() => {
    const strip = () => {
      if (document.title.includes(FLASH)) document.title = document.title.replace(FLASH, "");
    };
    if (!alert) {
      strip();
      return;
    }
    let on = false;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        strip();
        return;
      }
      on = !on;
      if (on) {
        if (!document.title.includes(FLASH)) document.title = FLASH + document.title;
      } else {
        strip();
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      strip();
    };
  }, [alert]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const count = items?.length ?? 0;
  const oldest = items && items.length > 0 ? items[0].since : null;

  return (
    <>
      {items && count > 0 && (
        <div
          ref={boxRef}
          className={floating ? "no-print fixed z-[60]" : "relative flex-none"}
          style={floating ? { right: 16, bottom: 16 } : undefined}
        >
          <button
            type="button"
            onClick={() => {
              const r = boxRef.current?.getBoundingClientRect();
              if (r) setDropTop(Math.round(r.bottom + 8));
              setOpen((v) => !v);
            }}
            className="fk-customer-pulse flex items-center gap-1.5 rounded-full font-bold text-white whitespace-nowrap"
            style={{ background: `linear-gradient(135deg, #f97316, ${ORANGE_DARK})`, padding: "5px 11px", fontSize: 13, boxShadow: "0 2px 8px rgba(234,88,12,.45)" }}
            title={`${count} khách đang chờ trả lời${oldest ? ` — lâu nhất ${waitingFor(oldest)}` : ""}`}
            aria-expanded={open}
          >
            <span aria-hidden>🔔</span>
            <span>{count}</span>
            <span className="hidden sm:inline">khách chờ trả lời</span>
            {oldest && <span className="hidden xl:inline font-semibold opacity-90">· lâu nhất {waitingFor(oldest)}</span>}
          </button>
          {open && (
            <div
              className={`card elev-lg absolute z-[70] flex flex-col overflow-hidden${floating ? "" : " fk-customer-waiting-dropdown"}`}
              style={{
                width: "min(92vw, 340px)",
                right: 0,
                ...(floating ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
                maxHeight: "min(70vh, 460px)",
                ["--fk-drop-top" as string]: `${dropTop}px`,
              }}
            >
              <div className="px-3 py-2 text-[13px] font-bold text-white" style={{ background: ORANGE }}>
                🔔 {count} khách đang chờ — chưa ai trả lời
              </div>
              <div className="overflow-y-auto flex flex-col">
                {items.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(it.href);
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 text-left"
                    style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
                  >
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-bold truncate">{it.who}</span>
                      <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                        {it.channel === "form" ? "Form liên hệ" : it.channel === "visitor" ? "Chat trên web" : "Khách hàng · Công việc"}
                      </span>
                    </span>
                    <span className="text-[11px] font-bold flex-none" style={{ color: ORANGE_DARK }}>
                      ⏳ {waitingFor(it.since)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {alert && (
        <div
          role="alert"
          className="no-print fixed z-[250] left-1/2 -translate-x-1/2 flex flex-col gap-2 rounded-[14px] text-white"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            width: "min(94vw, 440px)",
            padding: "12px 14px",
            background: `linear-gradient(135deg, #f97316, ${ORANGE_DARK})`,
            boxShadow: "0 10px 30px rgba(194,65,12,.45)",
            border: "2px solid #fff",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[22px] leading-none" aria-hidden>
              🔔
            </span>
            <span className="flex-1 text-[15px] font-extrabold tracking-wide">
              {alert.channel === "form" ? "KHÁCH ĐIỀN FORM LIÊN HỆ" : "KHÁCH HÀNG MỚI NHẮN"}
              {alert.count > 1 ? ` (${alert.count})` : ""}
            </span>
          </div>
          <div className="text-[14px] leading-snug">
            <b>{alert.who}:</b> {alert.preview.length > 160 ? `${alert.preview.slice(0, 160)}…` : alert.preview}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-[13px] font-semibold"
              style={{ background: "rgba(255,255,255,.18)" }}
              onClick={() => setAlert(null)}
            >
              Để sau
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-1.5 text-[13px] font-extrabold"
              style={{ background: "#fff", color: ORANGE_DARK }}
              onClick={() => {
                const href = alert.href;
                setAlert(null);
                router.push(href);
              }}
            >
              Trả lời ngay →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
