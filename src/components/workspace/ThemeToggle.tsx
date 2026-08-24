"use client";

import { useTheme } from "@/lib/useTheme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Chế độ sáng" : "Chế độ tối";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="btn-icon flex-none"
        style={{ width: 30, height: 30, padding: 0 }}
        title={label}
        aria-label={label}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold w-full text-left"
      style={{ color: "var(--color-neutral-600)" }}
    >
      <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
      {label}
    </button>
  );
}
