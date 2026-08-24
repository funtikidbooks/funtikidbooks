export function SectionHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold tracking-[0.08em] flex-none" style={{ color: "var(--color-accent-600)" }}>
        {step} {title.toUpperCase()}
      </span>
      <span className="flex-1" style={{ height: 1, background: "var(--color-neutral-200)" }} />
    </div>
  );
}
