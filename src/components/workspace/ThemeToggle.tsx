"use client";

import { useTheme } from "@/lib/useTheme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold w-full text-left"
      style={{ color: "var(--color-neutral-600)" }}
    >
      <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
      {theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
    </button>
  );
}
