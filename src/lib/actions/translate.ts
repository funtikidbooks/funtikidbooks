"use server";

// Vietnamese-only diacritics (beyond plain Latin) — good enough to guess
// which direction to translate without needing a separate detect call.
// Đ/đ is included since it never appears in English either.
const VIETNAMESE_CHARS =
  /[đĐàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/;

// The endpoint Chrome's own translate/dictionary extension calls internally
// — no API key, no billing, but undocumented by Google and not covered by
// any SLA. translate.googleapis.com's "single" endpoint (the other common
// free trick) is IP-blocked from a lot of cloud/datacenter ranges including
// this one; this one wasn't when tested. Good enough for the occasional
// English paste-in in an otherwise Vietnamese chat — if it ever breaks, the
// fix is the paid Cloud Translation API, not a code change to this shape.
export async function translateMessage(text: string): Promise<{ translated: string; targetLang: "vi" | "en" }> {
  const trimmed = text.trim();
  if (!trimmed) return { translated: "", targetLang: "vi" };

  const targetLang = VIETNAMESE_CHARS.test(trimmed) ? "en" : "vi";
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${targetLang}&q=${encodeURIComponent(trimmed)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" },
  });
  if (!res.ok) throw new Error("Không thể dịch lúc này.");

  // Response shape: [["translated text", "detected source lang"]]
  const data = (await res.json()) as unknown;
  const translated = Array.isArray(data) && Array.isArray(data[0]) ? data[0][0] : null;
  if (typeof translated !== "string") throw new Error("Không thể dịch lúc này.");

  return { translated, targetLang };
}
