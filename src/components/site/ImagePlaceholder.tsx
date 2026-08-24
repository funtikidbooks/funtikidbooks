export function ImagePlaceholder({
  emoji = "🎨",
  label,
  className = "",
  style,
}: {
  emoji?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 ${className}`}
      style={{
        background: "linear-gradient(135deg, var(--color-accent-100), var(--color-accent-2-100))",
        borderRadius: "var(--radius-lg)",
        minHeight: 160,
        ...style,
      }}
    >
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      {label && (
        <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-600)" }}>
          {label}
        </span>
      )}
    </div>
  );
}
