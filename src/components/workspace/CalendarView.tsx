"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "@/lib/actions/calendar";
import { EVENT_CATEGORIES, categoryOf, holidayOn } from "@/lib/constants/calendar";
import type { CalendarEvent, EventCategory } from "@/lib/types";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateInputValue(iso: string) {
  const d = new Date(iso);
  return dateKey(d);
}

function toTimeInputValue(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function monthGrid(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const MONTH_LABELS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

export function CalendarView({ currentUserId, isDirector, initialEvents }: {
  currentUserId: string;
  isDirector: boolean;
  initialEvents: CalendarEvent[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [enabledCategories, setEnabledCategories] = useState<Set<EventCategory>>(
    () => new Set(EVENT_CATEGORIES.map((c) => c.id)),
  );
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!enabledCategories.has(ev.category)) continue;
      // "Nghỉ" events don't get a pill in the list — they turn the whole
      // day cell red instead, same as the fixed public holidays.
      if (ev.category === "off") continue;
      const key = dateKey(new Date(ev.start_at));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return map;
  }, [events, enabledCategories]);

  // Any "Nghỉ" (day off) event marks its whole day the same way a fixed
  // public holiday does — keyed by day so a day with both just shows one.
  const offDayByKey = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    if (!enabledCategories.has("off")) return map;
    for (const ev of events) {
      if (ev.category !== "off") continue;
      map.set(dateKey(new Date(ev.start_at)), ev);
    }
    return map;
  }, [events, enabledCategories]);

  const grid = useMemo(() => monthGrid(viewDate), [viewDate]);
  const today = new Date();

  function changeMonth(delta: number) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  function toggleCategory(id: EventCategory) {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreated(ev: CalendarEvent) {
    setEvents((prev) => [...prev, ev]);
    setCreateDate(null);
  }

  function handleUpdated(ev: CalendarEvent) {
    setEvents((prev) => prev.map((x) => (x.id === ev.id ? ev : x)));
    setEditingEvent(null);
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((x) => x.id !== id));
    setEditingEvent(null);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-xl">Lịch</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-neutral-600)" }}>
            Theo dõi lịch trình và các hoạt động chung của công ty
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm flex-none" onClick={() => setCreateDate(new Date())}>
          + Tạo sự kiện
        </button>
      </div>

      <div className="grid gap-5 mt-5 lg:grid-cols-[1fr_260px]">
        <div className="card elev-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 p-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            <div className="flex items-center gap-1.5">
              <button type="button" className="btn-icon" style={{ width: 30, height: 30, padding: 0 }} onClick={() => changeMonth(-1)} aria-label="Tháng trước">
                ‹
              </button>
              <button type="button" className="btn-icon" style={{ width: 30, height: 30, padding: 0 }} onClick={() => changeMonth(1)} aria-label="Tháng sau">
                ›
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setViewDate(d);
                }}
              >
                Hôm nay
              </button>
            </div>
            <span className="text-base font-bold">
              {MONTH_LABELS[viewDate.getMonth()]}, {viewDate.getFullYear()}
            </span>
            <span style={{ width: 30 }} aria-hidden />
          </div>

          <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-xs font-bold py-2" style={{ color: "var(--color-neutral-500)" }}>
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((day) => {
              const inMonth = day.getMonth() === viewDate.getMonth();
              const isToday = dateKey(day) === dateKey(today);
              const dayEvents = eventsByDay.get(dateKey(day)) ?? [];
              const offEvent = offDayByKey.get(dateKey(day));
              const holiday = holidayOn(day) ?? (offEvent ? { label: offEvent.title } : undefined);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setCreateDate(day)}
                  className="flex flex-col items-start gap-1 p-1.5 text-left"
                  style={{
                    minHeight: 92,
                    borderRight: "1px solid var(--color-neutral-200)",
                    borderBottom: "1px solid var(--color-neutral-200)",
                    background: holiday ? "rgba(192, 82, 79, 0.07)" : inMonth ? "var(--color-panel)" : "var(--color-surface)",
                    opacity: inMonth ? 1 : 0.55,
                  }}
                >
                  <span
                    className="text-xs font-bold flex items-center justify-center flex-none"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: isToday ? "var(--color-accent-500)" : "transparent",
                      color: isToday ? "#fff" : holiday ? "var(--status-red)" : "var(--color-text)",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  {holiday && (
                    <span
                      role={offEvent ? "button" : undefined}
                      tabIndex={offEvent ? 0 : undefined}
                      onClick={
                        offEvent
                          ? (e) => {
                              e.stopPropagation();
                              setEditingEvent(offEvent);
                            }
                          : undefined
                      }
                      className="rounded-[4px] px-1 py-0.5 text-[10px] font-bold truncate w-full"
                      style={{ background: "rgba(192, 82, 79, 0.12)", color: "var(--status-red)" }}
                      title={holiday.label}
                    >
                      🎉 {holiday.label}
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5 w-full">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const cat = categoryOf(ev.category);
                      return (
                        <span
                          key={ev.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEvent(ev);
                          }}
                          className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-[10px] font-semibold truncate w-full"
                          style={{ background: "var(--color-surface)" }}
                        >
                          <span className="rounded-full flex-none" style={{ width: 6, height: 6, background: cat.color }} />
                          <span className="truncate">
                            {ev.all_day ? "Cả ngày" : formatTime(ev.start_at)} {ev.title}
                          </span>
                        </span>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                        +{dayEvents.length - 3} khác
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card elev-sm p-4">
            <h3 className="text-sm font-bold mb-3">Danh mục</h3>
            <div className="flex flex-col gap-2">
              {EVENT_CATEGORIES.map((cat) => (
                <label key={cat.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledCategories.has(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    style={{ accentColor: cat.color }}
                  />
                  <span className="rounded-full flex-none" style={{ width: 8, height: 8, background: cat.color }} />
                  {cat.label}
                </label>
              ))}
            </div>
          </div>

          <div className="card elev-sm p-4">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">🎉 Ngày nghỉ lễ</h3>
            <p className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
              4 ngày lễ dương lịch cố định (1/1, 30/4, 1/5, 2/9) được đánh dấu tự động. Tết Nguyên Đán và Giỗ Tổ Hùng
              Vương đổi ngày mỗi năm theo âm lịch nên chưa tự động được — bấm &quot;+ Tạo sự kiện&quot; để thêm khi có
              lịch nghỉ chính thức.
            </p>
          </div>
        </div>
      </div>

      {createDate && (
        <EventDialog
          date={createDate}
          onClose={() => setCreateDate(null)}
          onSaved={handleCreated}
        />
      )}

      {editingEvent && (
        <EventDialog
          event={editingEvent}
          date={new Date(editingEvent.start_at)}
          canEdit={isDirector || editingEvent.created_by === currentUserId}
          onClose={() => setEditingEvent(null)}
          onSaved={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function EventDialog({
  event,
  date,
  canEdit = true,
  onClose,
  onSaved,
  onDeleted,
}: {
  event?: CalendarEvent;
  date: Date;
  canEdit?: boolean;
  onClose: () => void;
  onSaved: (ev: CalendarEvent) => void;
  onDeleted?: (id: string) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState<EventCategory>(event?.category ?? "meeting");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [dateValue, setDateValue] = useState(event ? toDateInputValue(event.start_at) : dateKey(date));
  const [timeValue, setTimeValue] = useState(event ? toTimeInputValue(event.start_at) : "09:00");
  const [note, setNote] = useState(event?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const startAt = new Date(`${dateValue}T${allDay ? "00:00" : timeValue}:00`).toISOString();
    try {
      const saved = event
        ? await updateCalendarEvent(event.id, { title, note, category, startAt, allDay })
        : await createCalendarEvent({ title, note, category, startAt, allDay });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event || !onDeleted) return;
    if (!confirm(`Xoá sự kiện "${event.title}"? Không thể hoàn tác.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCalendarEvent(event.id);
      onDeleted(event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setDeleting(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{event ? (canEdit ? "Sửa sự kiện" : "Chi tiết sự kiện") : "Tạo sự kiện"}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="field">
          <label htmlFor="ev-title">Tên sự kiện</label>
          <input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} required />
        </div>

        <div className="field">
          <label htmlFor="ev-cat">Danh mục</label>
          <select
            id="ev-cat"
            className="input"
            value={category}
            onChange={(e) => {
              const next = e.target.value as EventCategory;
              setCategory(next);
              if (next === "off") setAllDay(true);
            }}
            disabled={!canEdit}
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="field flex-1">
            <label htmlFor="ev-date">Ngày</label>
            <input id="ev-date" type="date" className="input" value={dateValue} onChange={(e) => setDateValue(e.target.value)} disabled={!canEdit} required />
          </div>
          {!allDay && (
            <div className="field flex-1">
              <label htmlFor="ev-time">Giờ</label>
              <input id="ev-time" type="time" className="input" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} disabled={!canEdit} required />
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={!canEdit} />
          Sự kiện cả ngày
        </label>

        <div className="field">
          <label htmlFor="ev-note">Ghi chú</label>
          <textarea
            id="ev-note"
            className="input"
            rows={3}
            placeholder="Ghi chú thêm cho sự kiện này…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!canEdit}
          />
        </div>

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        {canEdit ? (
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary flex-1" disabled={saving || !title.trim()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            {event && onDeleted && (
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "…" : "🗑 Xoá"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            Chỉ người tạo hoặc giám đốc mới sửa/xoá được sự kiện này.
          </p>
        )}
      </form>
    </Modal>
  );
}
