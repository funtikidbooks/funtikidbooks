"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addClockDevice,
  cancelClockCommand,
  getClockOverview,
  removeClockDevice,
  removeClockFinger,
  renameClockDevice,
  resetClockToken,
  setWebCheckIn,
  startEnroll,
  type ClockOverview,
} from "@/lib/actions/clock";
import type { ClockCommand, Profile } from "@/lib/types";

// Quản trị → Chấm công: the fingerprint machine at the office — is it on,
// who has a finger on it, enrol someone (the machine walks them through it
// while this shows each step), the last few scans, and whether opening the
// workspace still checks people in.

const ONLINE_MS = 45_000;

function ago(iso: string | null, now: number) {
  if (!iso) return "chưa kết nối lần nào";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} giây trước`;
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
  return `${Math.round(s / 86400)} ngày trước`;
}

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const ddmm = (iso: string) => {
  const [, m, d] = new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10).split("-");
  return `${d}/${m}`;
};
const SCAN_RESULT: Record<string, string> = { check_in: "vào", check_out: "về", repeat: "chạm lại" };

function stepText(c: ClockCommand, ownerOfSlot: (slot: number) => string | null) {
  if (c.status === "pending") return "Đang chờ máy nhận lệnh (tối đa ~10 giây)…";
  if (c.status === "cancelled") return "Đã huỷ";
  if (c.status === "done") return c.kind === "enroll" ? "✓ Đã lưu vân tay" : "✓ Đã xoá trên máy";
  if (c.status === "running") {
    return (
      {
        place1: "👆 Đặt ngón tay lên máy",
        lift: "✋ Nhấc tay ra",
        place2: "👆 Đặt lại đúng ngón đó",
        saving: "Đang lưu…",
      }[c.step] ?? "Máy đang làm…"
    );
  }
  if (c.step.startsWith("duplicate:")) {
    const owner = ownerOfSlot(Number(c.step.slice(10)));
    return `Vân tay này đã đăng ký${owner ? ` cho ${owner}` : " rồi"}`;
  }
  return (
    {
      timeout: "Hết giờ chờ đặt tay — bấm thử lại",
      mismatch: "Hai lần đặt không khớp — thử lại",
    }[c.step] ?? "Máy chưa đọc được vân tay — thử lại"
  );
}

export function ClockPanel({ staff }: { staff: Profile[] }) {
  const [data, setData] = useState<ClockOverview | null>(null);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getClockOverview();
      setData(d);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được máy chấm công.");
    }
  }, []);

  const active = (data?.commands ?? []).some((c) => c.status === "pending" || c.status === "running");
  // Every 2 s while the machine is enrolling someone (to show each step),
  // otherwise every 20 s (is it still on, new scans).
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), active ? 2000 : 20000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, active]);

  const devices = useMemo(() => data?.devices ?? [], [data]);
  const device = devices.find((d) => d.id === deviceId) ?? devices[0] ?? null;
  const names = useMemo(() => new Map(staff.map((p) => [p.id, p.display_name])), [staff]);
  const deviceName = useMemo(() => new Map(devices.map((d) => [d.id, d.name])), [devices]);
  const ownerOfSlot = (slot: number) => {
    const f = (data?.fingers ?? []).find((x) => x.slot === slot && (!device || x.device_id === device.id));
    return f ? (names.get(f.profile_id) ?? null) : null;
  };

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không làm được.");
    }
    await load();
  }

  const online = (iso: string | null) => !!iso && now - new Date(iso).getTime() < ONLINE_MS;
  const enrolled = new Set((data?.fingers ?? []).map((f) => f.profile_id));

  return (
    <section className="card elev-sm p-4 flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-bold">🖐 Máy chấm công vân tay</h2>
        {data?.ready &&
          devices.map((d) => (
            <span key={d.id} className="text-[12.5px] font-semibold" style={{ color: online(d.last_seen_at) ? "var(--status-green)" : "var(--color-neutral-500)" }}>
              {online(d.last_seen_at) ? "●" : "○"} {devices.length > 1 ? `${d.name}: ` : ""}
              {online(d.last_seen_at) ? "đang bật" : `mất kết nối · ${ago(d.last_seen_at, now)}`}
            </span>
          ))}
        {data?.ready && devices.length > 0 && (
          <span className="text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
            {staff.filter((p) => enrolled.has(p.id)).length}/{staff.length} người đã có vân tay
          </span>
        )}
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Thu gọn" : "Mở"}
        </button>
      </div>

      {error && (
        <p className="text-[13px] rounded-[10px] px-3 py-2" style={{ background: "var(--badge-red-bg)", color: "var(--badge-red-fg)" }}>
          {error}
        </p>
      )}

      {open && !data && <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>Đang tải…</p>}

      {open && data && !data.ready && (
        <p className="text-[13px]" style={{ color: "var(--color-neutral-600)" }}>
          Chưa cài đặt — cần chạy file SQL <code>fingerprint_clock.sql</code> trong Supabase trước.
        </p>
      )}

      {open && data?.ready && (
        <div className="flex flex-col gap-4">
          {/* Machines */}
          <div className="flex flex-col gap-2">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] px-3 py-2.5"
                style={{ border: "1px solid var(--color-neutral-200)" }}
              >
                <span className="font-semibold text-[14px]">{d.name}</span>
                <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                  {(data.fingers ?? []).filter((f) => f.device_id === d.id).length}/{d.capacity} vân tay
                  {d.firmware ? ` · bản ${d.firmware}` : ""} · liên lạc {ago(d.last_seen_at, now)}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const name = prompt("Tên máy:", d.name);
                    if (name !== null) void run(() => renameClockDevice(d.id, name));
                  }}
                >
                  Đổi tên
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!confirm(`Tạo mã kết nối mới cho “${d.name}”? Mã cũ ngừng hoạt động — phải nạp lại mã mới vào máy.`)) return;
                    void run(async () => setToken({ name: d.name, token: await resetClockToken(d.id) }));
                  }}
                >
                  Mã kết nối mới
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--status-red)" }}
                  onClick={() => {
                    if (!confirm(`Xoá “${d.name}” và toàn bộ vân tay đã gán cho máy này?`)) return;
                    void run(() => removeClockDevice(d.id));
                  }}
                >
                  Xoá
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm self-start"
              onClick={() => {
                const name = prompt("Tên máy (VD: Máy cửa chính):", devices.length ? `Máy ${devices.length + 1}` : "Máy chấm công");
                if (name === null) return;
                void run(async () => {
                  const r = await addClockDevice(name);
                  setToken({ name: name || "Máy chấm công", token: r.token });
                });
              }}
            >
              + Thêm máy
            </button>
          </div>

          {token && (
            <div className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3 text-[13px]" style={{ background: "var(--badge-orange-bg)", color: "var(--badge-orange-fg)" }}>
              <span>
                <b>Mã kết nối của “{token.name}”</b> — chỉ hiện một lần này. Dán vào dòng <code>DEVICE_TOKEN</code> trong chương trình của máy:
              </span>
              <code className="block rounded-[8px] px-2.5 py-2 text-[12px] break-all" style={{ background: "var(--color-panel)", color: "var(--color-text)" }}>
                const char* DEVICE_TOKEN = &quot;{token.token}&quot;;
              </code>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    const line = `const char* DEVICE_TOKEN = "${token.token}";`;
                    try {
                      await navigator.clipboard.writeText(line);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    } catch {
                      prompt("Chép dòng này:", line);
                    }
                  }}
                >
                  {copied ? "✓ Đã chép" : "📋 Chép"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setToken(null)}>
                  Đã dán xong, ẩn đi
                </button>
              </div>
            </div>
          )}

          {/* Web check-in on/off */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[13.5px] font-semibold">Tự chấm công khi mở web</span>
            {data.isDirector ? (
              <div className="inline-flex rounded-[10px] p-0.5" style={{ background: "var(--color-neutral-100)" }} role="radiogroup">
                {(
                  [
                    [true, "Bật"],
                    [false, "Tắt"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={data.webCheckIn === v}
                    onClick={() => void run(() => setWebCheckIn(v))}
                    className="rounded-[8px] px-3 py-1 text-[13px] font-semibold"
                    style={data.webCheckIn === v ? { background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" } : { color: "var(--color-neutral-600)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <b className="text-[13px]">{data.webCheckIn ? "Đang bật" : "Đang tắt"}</b>
            )}
            <span className="text-[12px] basis-full" style={{ color: "var(--color-neutral-500)" }}>
              {data.webCheckIn
                ? "Ai chưa chấm vân tay vẫn được tính giờ vào theo lần mở workspace đầu tiên; chấm vân tay buổi sáng sẽ thay giờ đó."
                : "Chỉ tính giờ vào khi chấm vân tay ở máy."}
            </span>
          </div>

          {/* People */}
          {devices.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">Vân tay nhân viên</span>
                {devices.length > 1 && (
                  <select
                    className="input"
                    style={{ width: "auto", padding: "5px 10px", fontSize: 13 }}
                    value={device?.id ?? ""}
                    onChange={(e) => setDeviceId(e.target.value)}
                    aria-label="Đăng ký trên máy"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        Đăng ký trên: {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                  Nên đăng ký 2 ngón cho mỗi người, lỡ một ngón bị đứt tay hay ướt.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                {staff.map((p) => {
                  const mine = data.fingers.filter((f) => f.profile_id === p.id);
                  const cmd = data.commands.find((c) => c.kind === "enroll" && c.profile_id === p.id);
                  const busy = !!cmd && (cmd.status === "pending" || cmd.status === "running");
                  const recent = !!cmd && !busy && now - new Date(cmd.updated_at).getTime() < 90_000;
                  return (
                    <div key={p.id} className="flex flex-col gap-1.5 rounded-[12px] px-3 py-2.5 min-w-0" style={{ border: "1px solid var(--color-neutral-200)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[13.5px] truncate flex-1 min-w-0">{p.display_name}</span>
                        {busy ? (
                          <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => void run(() => cancelClockCommand(cmd.id))}>
                            Huỷ
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm flex-none"
                            disabled={!device}
                            onClick={() => device && void run(() => startEnroll(device.id, p.id))}
                          >
                            + Vân tay
                          </button>
                        )}
                      </div>
                      {mine.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {mine.map((f, i) => (
                            <span
                              key={f.id}
                              className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11.5px] font-semibold"
                              style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}
                            >
                              Ngón {i + 1}
                              {devices.length > 1 ? ` · ${deviceName.get(f.device_id) ?? ""}` : ""} · #{f.slot}
                              <button
                                type="button"
                                aria-label={`Xoá vân tay ${i + 1} của ${p.display_name}`}
                                className="rounded-full px-1"
                                onClick={() => {
                                  if (confirm(`Xoá vân tay ngón ${i + 1} của ${p.display_name}?`)) void run(() => removeClockFinger(f.id));
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {(busy || recent) && cmd && (
                        <span
                          className="text-[12.5px] font-semibold"
                          style={{
                            color:
                              cmd.status === "done" ? "var(--status-green)" : cmd.status === "failed" ? "var(--status-red)" : "var(--color-accent-700)",
                          }}
                        >
                          {stepText(cmd, ownerOfSlot)}
                        </span>
                      )}
                      {!mine.length && !busy && !recent && (
                        <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                          Chưa có vân tay
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Last scans */}
          {data.scans.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13.5px] font-semibold">Lần chấm gần đây</span>
              <ul className="flex flex-col text-[13px]">
                {data.scans.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-2 py-1" style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
                    <span className="tabular-nums flex-none" style={{ color: "var(--color-neutral-500)" }}>
                      {ddmm(s.scanned_at)} {hhmm(s.scanned_at)}
                    </span>
                    <span className="min-w-0 truncate">
                      {s.profile_id ? (names.get(s.profile_id) ?? "—") : `Vân tay chưa đăng ký (#${s.slot ?? "?"})`}
                      {s.profile_id && (
                        <span style={{ color: "var(--color-neutral-500)" }}> · {SCAN_RESULT[s.result] ?? s.result}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
