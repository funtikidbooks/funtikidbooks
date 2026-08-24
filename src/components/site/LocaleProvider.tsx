"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { dictionary } from "@/lib/dictionary";

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  pending: boolean;
} | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setLocale(next: Locale) {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000`;
    startTransition(() => router.refresh());
  }

  return <LocaleContext.Provider value={{ locale, setLocale, pending }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function useDict() {
  const { locale } = useLocale();
  return { locale, t: dictionary[locale] };
}
