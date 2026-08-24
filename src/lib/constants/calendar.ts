import type { EventCategory } from "@/lib/types";

export const EVENT_CATEGORIES: { id: EventCategory; label: string; color: string }[] = [
  { id: "meeting", label: "Họp", color: "#4F80D9" },
  { id: "review", label: "Review", color: "#3F9E52" },
  { id: "workshop", label: "Workshop / Training", color: "#D6A400" },
  { id: "deadline", label: "Deadline", color: "#C0524F" },
  { id: "client", label: "Khách hàng", color: "#8B5CF6" },
  { id: "other", label: "Khác", color: "#FF7A3D" },
];

export function categoryOf(id: EventCategory) {
  return EVENT_CATEGORIES.find((c) => c.id === id) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

// Vietnam's fixed-date public holidays — same day/month every year, so these
// can be marked automatically. Lunar-calendar holidays (Tết Nguyên Đán, Giỗ
// Tổ Hùng Vương, ...) move every year and aren't listed here — add those as
// regular events instead, since getting the date wrong on a shared work
// calendar is worse than not showing it at all.
export const PUBLIC_HOLIDAYS: { month: number; day: number; label: string }[] = [
  { month: 1, day: 1, label: "Tết Dương lịch" },
  { month: 4, day: 30, label: "Ngày Giải phóng miền Nam" },
  { month: 5, day: 1, label: "Quốc tế Lao động" },
  { month: 9, day: 2, label: "Quốc khánh" },
];

export function holidayOn(day: Date) {
  return PUBLIC_HOLIDAYS.find((h) => h.month === day.getMonth() + 1 && h.day === day.getDate());
}
