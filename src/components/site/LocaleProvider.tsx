"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { dictionary } from "@/lib/dictionary";

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);

// Pages no longer read the locale cookie server-side (that's what keeps
// them static — see lib/getLocale.ts's callers), so every visit first
// renders "vi" and, if the visitor previously chose "en", swaps to it right
// after mount once this reads the cookie itself. That one swap is the
// trade-off for pages that otherwise reload instantly.
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("vi");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)funti-locale=([^;]*)/);
    if (match?.[1] === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState("en");
    }
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000`;
  }

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
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
