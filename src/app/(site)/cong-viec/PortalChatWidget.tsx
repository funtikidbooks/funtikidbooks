"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type FaqEntry = { question: string; keywords: string[]; answer: string };

// Pre-written answers, sourced from the site's own dịch-vụ/gioi-thieu/
// quy-trinh/lien-he copy — no API calls, no per-message cost. Anything not
// covered here (or a genuinely custom question) routes the visitor to the
// sign-up form right next to this widget, which is where a real staff
// member picks up the conversation once they're signed in.
const FAQ: FaqEntry[] = [
  {
    question: "Studio làm những dịch vụ gì?",
    keywords: ["dich vu", "lam gi", "ve gi", "minh hoa", "thiet ke", "service"],
    answer:
      "Funti Kidbooks Studio nhận:\n• Minh hoạ sách thiếu nhi (truyện tranh, sách giáo dục, song ngữ)\n• Thiết kế nhân vật\n• Thiết kế layout / dàn trang\n• Thiết kế bìa sách\n• Sản phẩm đi kèm: flashcard, poster, sticker, đồ chơi, quà tặng\n• Mô hình hoá & in 3D\n• Hợp tác B2B với nhà xuất bản / tác giả mở rộng series sách",
  },
  {
    question: "Quy trình làm việc ra sao?",
    keywords: ["quy trinh", "cac buoc", "lam viec the nao", "workflow", "process"],
    answer:
      "Quy trình 6 bước của Funti:\n1. Tiếp nhận yêu cầu\n2. Nghiên cứu & ý tưởng\n3. Phác thảo (có phản hồi từ khách)\n4. Minh hoạ & thiết kế đầy đủ\n5. Hoàn thiện, chuẩn in ấn\n6. Bàn giao file + hỗ trợ in ấn/xuất bản",
  },
  {
    question: "Bảng giá và thời gian thế nào?",
    keywords: ["gia", "bao nhieu tien", "chi phi", "thoi gian", "bao lau", "price", "cost"],
    answer:
      "Funti không có bảng giá cố định — giá được báo riêng theo số trang, độ phức tạp và phạm vi dự án (đối tác lâu dài có ưu đãi tốt hơn). Một cuốn sách tranh 24-32 trang thường mất khoảng 4-8 tuần, với 2-3 vòng chỉnh sửa mỗi giai đoạn. Sếp điền mô tả dự án ở form bên cạnh để nhận báo giá cụ thể nhé!",
  },
  {
    question: "Liên hệ studio bằng cách nào?",
    keywords: ["lien he", "dia chi", "email", "so dien thoai", "gio lam viec", "contact"],
    answer:
      "📧 funtikidbooks.studio@gmail.com\n📞 0978 346 851\n📍 Toà nhà M.O.R.E, 40A-40B Út Tịch, P. Tân Sơn Nhất, Tân Bình, TP.HCM\n🕘 T2-T6: 9:00-18:30, T7: 9:00-12:00",
  },
];

const FALLBACK_ANSWER =
  "Câu này mình chưa có câu trả lời dựng sẵn — sếp điền mô tả dự án ở form bên cạnh giúp mình nhé, đội ngũ Funti sẽ phản hồi trực tiếp trong 1-2 ngày làm việc!";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function findAnswer(input: string): string {
  const norm = normalize(input);
  const hit = FAQ.find((entry) => entry.keywords.some((k) => norm.includes(k)));
  return hit?.answer ?? FALLBACK_ANSWER;
}

export function PortalChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || thinking) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setThinking(true);
    // Small deliberate pause so the reply doesn't feel like it's just
    // snapping a lookup table onto the screen — still instant, still free.
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: findAnswer(trimmed) }]);
      setThinking(false);
    }, 450);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  // Once every canned question has been asked, offer the full set again
  // instead of leaving the visitor with an empty menu.
  const askedQuestions = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const remainingSuggestions = FAQ.filter((entry) => !askedQuestions.has(entry.question));
  const suggestionChips = remainingSuggestions.length > 0 ? remainingSuggestions : FAQ;

  return (
    <div className="card elev-sm flex flex-col" style={{ height: 600 }}>
      <div className="flex-none flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <span aria-hidden>💬</span>
        <div className="flex flex-col">
          <span className="font-bold text-sm">Hỏi nhanh Funti</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
            Câu hỏi thường gặp — nhân viên sẽ phản hồi trực tiếp qua form
          </span>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
        {messages.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
            Chào sếp 👋 Bấm một câu bên dưới, hoặc gõ câu hỏi về dịch vụ, quy trình, giá của Funti nhé.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className="rounded-[12px] px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words"
              style={{
                background: m.role === "user" ? "var(--color-accent-500)" : "var(--color-surface)",
                color: m.role === "user" ? "#fff" : "var(--color-text)",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Suggestion chips stay available after every reply, not just on
            the empty state — a visitor should be able to keep picking
            instead of hitting a dead end once one question is answered. */}
        {!thinking && (
          <div className="flex flex-col gap-1.5 items-start">
            {suggestionChips.map((entry) => (
              <button
                key={entry.question}
                type="button"
                onClick={() => sendMessage(entry.question)}
                className="rounded-full px-3 py-1.5 text-xs text-left"
                style={{ border: "1px solid var(--color-neutral-300)", color: "var(--color-neutral-700)" }}
              >
                {entry.question}
              </button>
            ))}
          </div>
        )}

        {thinking && (
          <div className="flex items-start">
            <div className="rounded-[12px] px-3 py-2.5 flex items-center gap-1" style={{ background: "var(--color-surface)" }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="fk-typing-dot"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--color-neutral-500)",
                    display: "inline-block",
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-none p-3" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Đặt câu hỏi…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={300}
            disabled={thinking}
          />
          <button type="submit" disabled={thinking || !input.trim()} className="btn btn-primary btn-sm flex-none">
            Gửi
          </button>
        </form>
      </div>
    </div>
  );
}
