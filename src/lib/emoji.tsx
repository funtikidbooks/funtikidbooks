// A small, fixed set of Twemoji SVGs (bundled under public/emoji/, not
// fetched from a CDN at runtime) standing in for the raw emoji characters
// used for reactions and the composer's emoji picker.
//
// Reasoning: a plain `{emoji}` character renders through whatever emoji
// font the visitor's OS happens to ship — Apple's on iPhone, Google's on
// Android, Microsoft's on Windows — so the exact same reaction looks like a
// different drawing depending on who's looking at it, and looks noticeably
// flatter/plainer than Zalo's own glossy, consistent reaction icons (what
// sếp Phúc was pointing at when he asked for this). Twemoji is what most
// apps reach for to get one single, consistent look everywhere instead —
// CC BY 4.0 (Twitter, Inc.), attribution required; noted here since there's
// no natural "credits" surface elsewhere in a work chat.
//
// Only the ~30 characters actually used in QUICK_REACTIONS/EMOJI_OPTIONS
// (MeetingHub.tsx, DirectConversation.tsx) are bundled — this is a lookup
// table for those specific characters, not a general emoji-to-Twemoji
// converter.
const EMOJI_TO_CODEPOINT: Record<string, string> = {
  "😀": "1f600",
  "😂": "1f602",
  "😅": "1f605",
  "😍": "1f60d",
  "😉": "1f609",
  "😎": "1f60e",
  "🤔": "1f914",
  "😢": "1f622",
  "😭": "1f62d",
  "😡": "1f621",
  "🥳": "1f973",
  "😴": "1f634",
  "😱": "1f631",
  "🙌": "1f64c",
  "👀": "1f440",
  "🤝": "1f91d",
  "👍": "1f44d",
  "👎": "1f44e",
  "👏": "1f44f",
  "🙏": "1f64f",
  "💪": "1f4aa",
  "🔥": "1f525",
  "✅": "2705",
  "❌": "274c",
  "🎉": "1f389",
  "❤️": "2764-fe0f",
  "💯": "1f4af",
  "😘": "1f618",
  "🐶": "1f436",
  "🐱": "1f431",
};

export function emojiIconSrc(emoji: string): string | null {
  const codepoint = EMOJI_TO_CODEPOINT[emoji];
  return codepoint ? `/emoji/${codepoint}.svg` : null;
}

// Drop-in for a bare `{emoji}` string — falls back to the raw character
// (never crashes) if it's ever handed something outside the bundled set.
export function Emoji({ emoji, size = 18 }: { emoji: string; size?: number }) {
  const src = emojiIconSrc(emoji);
  if (!src) return <>{emoji}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      style={{ display: "inline-block", verticalAlign: "-3px" }}
    />
  );
}
