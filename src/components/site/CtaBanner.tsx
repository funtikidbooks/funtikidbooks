import Link from "next/link";

export function CtaBanner({
  title = "Bạn có dự án sách thiếu nhi hoặc ý tưởng sáng tạo?",
  body = "Hãy cùng Funti Kidbooks Studio biến ý tưởng của bạn thành những câu chuyện tuyệt vời!",
  ctaLabel = "Liên hệ ngay →",
  href = "/lien-he",
  secondaryLabel,
  secondaryHref,
}: {
  title?: string;
  body?: string;
  ctaLabel?: string;
  href?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="site-container my-10">
      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] px-8 py-10 flex flex-wrap items-center justify-center gap-6 text-center"
        style={{ background: "linear-gradient(135deg, var(--color-accent-100), var(--color-accent-2-100))" }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ top: -40, right: -30, width: 140, height: 140, background: "var(--color-accent-2-200)", opacity: 0.5 }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ bottom: -50, right: 120, width: 90, height: 90, background: "var(--color-accent-200)", opacity: 0.4 }}
        />
        <div
          className="relative flex items-center justify-center rounded-full text-2xl flex-none"
          style={{ width: 64, height: 64, background: "var(--color-bg)", boxShadow: "var(--shadow-md)" }}
          aria-hidden
        >
          📖
        </div>
        <div className="relative flex flex-col items-center gap-1.5 min-w-[220px] max-w-[420px]">
          <h2 className="text-xl">{title}</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-700)" }}>
            {body}
          </p>
        </div>
        <div className="relative flex flex-wrap justify-center gap-2 flex-none">
          <Link href={href} className="btn btn-primary">
            {ctaLabel}
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link href={secondaryHref} className="btn btn-ghost" style={{ background: "var(--color-panel)" }}>
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
