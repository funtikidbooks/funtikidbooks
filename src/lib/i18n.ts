export type Locale = "vi" | "en";

export const LOCALE_COOKIE = "funti-locale";

export function pickLocalized<T extends string | null>(
  locale: Locale,
  vi: T,
  en: string | null | undefined,
): T {
  if (locale === "en" && en) return en as T;
  return vi;
}
