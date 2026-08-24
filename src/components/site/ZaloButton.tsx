const ZALO_LINK = "https://zalo.me/84978346851";

// Floating Zalo button, stacked above the Facebook Messenger bubble so the
// two don't overlap.
export function ZaloButton() {
  return (
    <a
      href={ZALO_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat qua Zalo"
      title="Chat qua Zalo"
      className="fixed z-50 flex items-center justify-center rounded-full"
      style={{ width: 56, height: 56, right: 20, bottom: 96, background: "#0068ff", boxShadow: "var(--shadow-lg)" }}
    >
      <span style={{ color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: "-0.02em" }}>Zalo</span>
    </a>
  );
}
