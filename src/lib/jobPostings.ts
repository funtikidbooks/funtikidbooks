import type { Locale } from "@/lib/i18n";
import type { EmploymentType } from "@/lib/types";

export const EMPLOYMENT_TYPES: { value: EmploymentType; icon: string; vi: string; en: string }[] = [
  { value: "full_time", icon: "💼", vi: "Toàn thời gian", en: "Full-time" },
  { value: "part_time", icon: "⏰", vi: "Bán thời gian", en: "Part-time" },
  { value: "internship", icon: "🎓", vi: "Thực tập", en: "Internship" },
  { value: "freelance", icon: "🧑‍💻", vi: "Freelance", en: "Freelance" },
];

export function employmentTypeLabel(locale: Locale, value: EmploymentType): string {
  const entry = EMPLOYMENT_TYPES.find((t) => t.value === value);
  if (!entry) return value;
  return locale === "en" ? entry.en : entry.vi;
}
