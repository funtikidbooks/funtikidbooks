// Chat text with any web address turned into a link that opens in a new
// tab — the studio's automatic message carries its Facebook and Instagram
// links (lib/customerWaiting.ts), and a customer often pastes a reference.
const URL_RE = /(https?:\/\/[^\s]+)/g;

export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        // a trailing full stop or bracket belongs to the sentence, not the link
        const m = /^(.*?)([.,!?)\]]*)$/.exec(part);
        const href = m ? m[1] : part;
        const tail = m ? m[2] : "";
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}>
              {href}
            </a>
            {tail}
          </span>
        );
      })}
    </>
  );
}
