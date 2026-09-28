"use client";

import { useTheme } from "@/lib/useTheme";

export function SiteThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="btn-icon flex-none"
      aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      title={theme === "dark" ? "Chuyển ban ngày" : "Chuyển ban đêm"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
