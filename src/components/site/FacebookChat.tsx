// facebook.com/FuntiKidbooks — real numeric Page ID, taken straight from
// the Page's own Meta Business Suite inbox settings (Hộp thư > Cài đặt
// hộp thư > Nhắn tin > URL Messenger, m.me/<page_id>).
const FB_PAGE_ID = "249373520318216";
const MESSENGER_LINK = `https://m.me/${FB_PAGE_ID}`;

// Meta discontinued the embeddable Customer Chat Plugin (the
// xfbml.customerchat.js widget this used to render) in May 2024 — its SDK
// endpoint now returns a permanent 500 regardless of locale, confirmed live
// on this site in August 2026. A plain m.me link is Meta's own recommended
// replacement: it opens a real Messenger conversation with the Page,
// same destination as the old widget, no dead third-party script involved.
export function FacebookChat() {
  return (
    <a
      href={MESSENGER_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat qua Messenger"
      title="Chat qua Messenger"
      className="fixed z-50 flex items-center justify-center rounded-full"
      style={{ width: 56, height: 56, right: 20, bottom: 20, background: "#0084ff", boxShadow: "var(--shadow-lg)" }}
    >
      <span style={{ fontSize: 26 }} aria-hidden>
        💬
      </span>
    </a>
  );
}
