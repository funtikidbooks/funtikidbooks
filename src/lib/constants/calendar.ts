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
