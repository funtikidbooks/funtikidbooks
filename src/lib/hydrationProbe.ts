// Pinpoints a hydration mismatch (React error #418) on a staff device.
// Production React only says "the server rendered text didn't match" —
// not which text — and it only happens on certain iPhones/iPads, never on
// a dev machine. So the page's own text, exactly as the server sent it, is
// recorded by a tiny inline script while the HTML is still being parsed
// (before React hydrates); when #418 is reported, ClientErrorReporter
// compares that with what's on screen after React re-rendered and sends
// the first few lines that differ.

export const SSR_SNAPSHOT_ID = "fk-ssr-snapshot";

const SKIP = ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"];
const MAX_NODES = 5000;

// The visible text nodes under `root`, in document order.
export function collectTexts(root: Node): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && out.length < MAX_NODES) {
    const node = walker.currentNode;
    if (SKIP.includes(node.parentNode?.nodeName ?? "")) continue;
    const text = (node.nodeValue ?? "").trim();
    if (text) out.push(text.slice(0, 160));
  }
  return out;
}

// The same walk as collectTexts, as an inline script: it runs from the
// page's own <script>, so its parent is the page's content.
export const SSR_SNAPSHOT_SCRIPT = `(function(){try{var r=document.currentScript&&document.currentScript.parentNode;if(!r)return;var o=[],s=${JSON.stringify(SKIP)},w=document.createTreeWalker(r,4);while(w.nextNode()&&o.length<${MAX_NODES}){var n=w.currentNode,p=n.parentNode?n.parentNode.nodeName:"";if(s.indexOf(p)>-1)continue;var t=(n.nodeValue||"").trim();if(t)o.push(t.slice(0,160))}window.__fkSsrText=o}catch(e){}})()`;

// "where it differs: server «…» ≠ device «…»", or null if there's nothing to compare.
export function hydrationDiff(): string | null {
  const ssr = (window as Window & { __fkSsrText?: string[] }).__fkSsrText;
  const root = document.getElementById(SSR_SNAPSHOT_ID)?.parentNode;
  if (!ssr || !root) return null;
  const now = collectTexts(root);
  let i = 0;
  while (i < ssr.length && i < now.length && ssr[i] === now[i]) i++;
  if (i >= ssr.length && i >= now.length) return `giống hệt (${ssr.length} dòng)`;
  const around = (list: string[]) =>
    list
      .slice(Math.max(0, i - 2), i + 3)
      .map((t) => t.slice(0, 90))
      .join(" ▸ ");
  return `dòng ${i}/${ssr.length}: server «${around(ssr)}» ≠ máy «${around(now)}»`;
}
