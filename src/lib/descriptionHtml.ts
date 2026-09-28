// Card descriptions arrive two ways: HTML written in the web editor, and the
// Markdown text brought over from Trello (blank-line paragraphs, [text](url)
// links, **bold**, lists). Dropped into the page as HTML, Markdown collapses
// into one run-on block with raw brackets, so it's converted here — for
// display and as the starting content when someone edits it. Pure; tested in
// tests/calculations.test.mjs.

export function isHtmlDescription(s: string) {
  return /<\/(p|li|h[1-6]|div|blockquote|ul|ol)>|<br\s*\/?>|<img\b/i.test(s);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeUrl(url: string) {
  const u = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}

// A long bare link reads as noise — show host + the start of the path.
function linkLabel(text: string) {
  if (!/^https?:\/\//i.test(text) || text.length <= 60) return text;
  try {
    const u = new URL(text);
    const rest = `${u.pathname}${u.search}`;
    return `${u.host}${rest.length > 28 ? `${rest.slice(0, 28)}…` : rest}`;
  } catch {
    return `${text.slice(0, 57)}…`;
  }
}

const anchor = (url: string, text: string) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

function inline(src: string): string {
  const slots: string[] = [];
  const put = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = src;
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_, ch: string) => put(esc(ch)));
  s = s.replace(/`([^`]+)`/g, (_, code: string) => put(`<code>${esc(code)}</code>`));
  // Images on Trello need a Trello login to load — linked, not embedded.
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, alt: string, url: string) => {
    const u = safeUrl(url);
    return u ? put(anchor(u, `🖼 ${alt.trim() || "Ảnh"}`)) : m;
  });
  s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, text: string, url: string) => {
    const u = safeUrl(url);
    return u ? put(anchor(u, linkLabel(text.trim()))) : m;
  });
  s = s.replace(/https?:\/\/[^\s<>\u0000]*[^\s<>\u0000.,;:!?)\]'"]/g, (url) => put(anchor(url, linkLabel(url))));
  s = esc(s);
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>");
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)]);
}

export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; start: number; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const start = list.tag === "ol" && list.start !== 1 ? ` start="${list.start}"` : "";
      out.push(`<${list.tag}${start}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    }
    list = null;
  };
  const openList = (tag: "ul" | "ol", start: number) => {
    flushPara();
    if (list?.tag !== tag) {
      flushList();
      list = { tag, start, items: [] };
    }
    return list as { items: string[] };
  };

  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line))) {
      flushPara();
      flushList();
      const level = Math.min(m[1].length + 2, 6);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (/^\s{0,3}([-*_])(\s*\1){2,}$/.test(line)) {
      flushPara();
      flushList();
      out.push("<hr>");
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      openList("ul", 1).items.push(m[1]);
    } else if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
      openList("ol", Number(m[1])).items.push(m[2]);
    } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`);
    } else if (list && /^\s+/.test(raw)) {
      // An indented line under a list item continues that item.
      const items = (list as { items: string[] }).items;
      items[items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

export function descriptionToHtml(description: string | null | undefined): string {
  const d = description ?? "";
  if (!d.trim()) return "";
  return isHtmlDescription(d) ? d : markdownToHtml(d);
}
