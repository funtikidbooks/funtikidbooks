"use client";

import { useTheme } from "@/lib/useTheme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const switchLabel = isDark ? "Chế độ tối, bấm để chuyển sang sáng" : "Chế độ sáng, bấm để chuyển sang tối";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="btn-icon flex-none"
        style={{ width: 30, height: 30, padding: 0 }}
        title="Chế độ"
        aria-label={switchLabel}
      >
        {isDark ? "☀️" : "🌙"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-2 text-[13px] font-semibold" style={{ color: "var(--color-neutral-600)" }}>
      <span aria-hidden>{isDark ? "☀️" : "🌙"}</span>
      <span className="flex-1">Chế độ</span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={switchLabel}
        onClick={toggleTheme}
        className="relative flex-none"
        style={{
          width: 40,
          height: 22,
          padding: 0,
          borderRadius: 999,
          background: isDark ? "var(--color-accent-500)" : "var(--color-neutral-300)",
          transition: "background 0.15s ease",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 2,
            left: isDark ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,.25)",
            transition: "left 0.15s ease",
          }}
        />
      </button>
    </div>
  );
}
