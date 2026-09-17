"use client";

import { useEffect, useRef, useState } from "react";
import { useDict } from "@/components/site/LocaleProvider";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Keeps the same order as dictionary.ts's portal.chat.faq array — index i's
// keywords match FAQ entry i regardless of which locale's question/answer
// text is showing. Merged VI+EN terms so typing in either language still
// matches, since a visitor's locale toggle doesn't always match what
// language they actually type in.
const FAQ_KEYWORDS: string[][] = [
  ["dich vu", "lam gi", "ve gi", "minh hoa", "thiet ke", "service", "offer", "illustration"],
  ["quy trinh", "cac buoc", "lam viec the nao", "workflow", "process", "step"],
  ["gia", "bao nhieu tien", "chi phi", "thoi gian", "bao lau", "price", "cost", "pricing", "timeline", "how long"],
  ["lien he", "dia chi", "email", "so dien thoai", "gio lam viec", "contact", "address", "phone"],
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

// Pre-written answers, sourced from the site's own dịch-vụ/gioi-thieu/
// quy-trinh/lien-he copy — no API calls, no per-message cost. Anything not
// covered here (or a genuinely custom question) routes the visitor to the
// sign-up form right next to this widget, which is where a real staff
// member picks up the conversation once they're signed in.
export function PortalChatWidget() {
  const { t } = useDict();
  const faq = t.portal.chat.faq;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function findAnswer(text: string): string {
    const norm = normalize(text);
    const i = FAQ_KEYWORDS.findIndex((keywords) => keywords.some((k) => norm.includes(k)));
    return i >= 0 && faq[i] ? faq[i].answer : t.portal.chat.fallback;
  }

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
  const remainingSuggestions = faq.filter((entry) => !askedQuestions.has(entry.question));
  const suggestionChips = remainingSuggestions.length > 0 ? remainingSuggestions : faq;

  return (
    <div className="card elev-sm flex flex-col" style={{ height: 420 }}>
      <div className="flex-none flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <span aria-hidden>💬</span>
        <div className="flex flex-col">
          <span className="font-bold text-sm">{t.portal.chat.title}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
            {t.portal.chat.subtitle}
          </span>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
        {messages.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
            {t.portal.chat.greeting}
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
            placeholder={t.portal.chat.inputPlaceholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={300}
            disabled={thinking}
          />
          <button type="submit" disabled={thinking || !input.trim()} className="btn btn-primary btn-sm flex-none">
            {t.portal.chat.sendButton}
          </button>
        </form>
      </div>
    </div>
  );
}
