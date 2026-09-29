import type { Quote, QuoteDraft, QuoteItem } from "@/lib/quote";
import { LABELS, formatMoney, lineTotal, tierTotals, unitPrice } from "@/lib/quote";

// The quote as the client sees it — the editor's live preview, the public
// link (/bao-gia/<token>) and the printed PDF all render this. Always on
// white paper whatever the site theme, since it's a document.
const STUDIO = {
  name: "Funti Kidbooks Studio",
  legal: "Công ty TNHH Funti Kidbooks",
  address: "40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM",
  phone: "0978 346 851",
  email: "funtikidbooks.studio@gmail.com",
  web: "funtikidbooks.com",
};

const INK = "#1f1b18";
const MUTED = "#6b625b";
const LINE = "#ece6df";
const ACCENT = "#e8674a";
const WASH = "#fdf1ec";

function dateText(iso: string, lang: "vi" | "en", addDays = 0) {
  const d = new Date(new Date(iso).getTime() + addDays * 86400000);
  return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}

export function QuoteSheet({ quote }: { quote: QuoteDraft & Pick<Quote, "code" | "created_at"> }) {
  const L = LABELS[quote.language];
  const n = Math.max(1, quote.tier_names.length);
  const money = (v: number) => formatMoney(v, quote.currency);
  const totals = tierTotals(quote.items, n);
  const main = quote.items.filter((it) => !it.optional);
  const extras = quote.items.filter((it) => it.optional && it.kind === "item");
  const cols = { "--cols": `minmax(0,1.7fr) repeat(${n}, minmax(0,1fr))` } as React.CSSProperties;

  const priceCells = (it: QuoteItem) => {
    if (it.flat && n > 1) {
      const line = lineTotal(it, 0);
      const unit = unitPrice(it, 0);
      return (
        <div className="fk-q-prices" style={{ "--span": n } as React.CSSProperties}>
          <PriceCell line={line} unit={unit} it={it} money={money} centered />
        </div>
      );
    }
    return quote.tier_names.map((name, t) => (
      <div key={t} className="fk-q-price">
        <span className="fk-q-tiername">{name}</span>
        <PriceCell line={lineTotal(it, t)} unit={unitPrice(it, t)} it={it} money={money} />
      </div>
    ));
  };

  return (
    <article className="fk-quote-sheet" style={{ background: "#fff", color: INK }}>
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5" style={{ borderBottom: `2px solid ${ACCENT}` }}>
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/funti-logo.jpg" alt="" width={52} height={52} className="rounded-full flex-none" />
          <div className="min-w-0">
            <div className="font-heading text-[19px] font-bold leading-tight">{STUDIO.name}</div>
            <div className="text-[12px]" style={{ color: MUTED }}>
              {STUDIO.web} · {STUDIO.email} · {STUDIO.phone}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-[22px] font-bold tracking-[0.12em]" style={{ color: ACCENT }}>
            {L.doc}
          </div>
          <div className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>
            {quote.code}
          </div>
        </div>
      </header>

      <section className="grid gap-x-6 gap-y-1.5 py-4 text-[13.5px] sm:grid-cols-2">
        {quote.client_name && (
          <Meta label={L.to} value={quote.client_contact ? `${quote.client_name} · ${quote.client_contact}` : quote.client_name} />
        )}
        {quote.title && <Meta label={L.project} value={quote.title} />}
        <Meta label={L.date} value={dateText(quote.created_at, quote.language)} />
        <Meta label={L.validUntil} value={dateText(quote.created_at, quote.language, quote.valid_days)} />
      </section>

      {quote.intro.trim() && (
        <p className="text-[14px] leading-relaxed whitespace-pre-line pb-4" style={{ color: INK }}>
          {quote.intro}
        </p>
      )}

      {/* The tiers side by side — what each one means and what it costs. */}
      <section className={`grid gap-2.5 pb-5 ${n === 3 ? "grid-cols-1 sm:grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {quote.tier_names.map((name, t) => (
          <div key={t} className="rounded-[10px] px-3 py-3 flex flex-col gap-1" style={{ background: WASH, border: `1px solid ${LINE}` }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: ACCENT }}>
              {n > 1 ? `${L.choose} ${t + 1}` : L.total}
            </span>
            <span className="text-[15px] font-bold leading-snug">{name}</span>
            {quote.tier_notes[t]?.trim() && (
              <span className="text-[12px] leading-snug" style={{ color: MUTED }}>
                {quote.tier_notes[t]}
              </span>
            )}
            <span className="text-[18px] font-bold tabular-nums mt-auto pt-1">{money(totals[t]?.total ?? 0)}</span>
            {totals[t]?.missing && (
              <span className="text-[11px]" style={{ color: MUTED }}>
                ({L.missing})
              </span>
            )}
          </div>
        ))}
      </section>

      <section className="fk-q-table" style={{ borderTop: `1px solid ${LINE}` }}>
        <div className="fk-q-row fk-q-head" style={cols}>
          <span>{L.item}</span>
          {quote.tier_names.map((name, t) => (
            <span key={t} className="fk-q-headprice">
              {name}
            </span>
          ))}
        </div>
        {main.map((it) =>
          it.kind === "section" ? (
            <div key={it.id} className="fk-q-section" style={{ color: ACCENT }}>
              {it.name}
            </div>
          ) : (
            <div key={it.id} className="fk-q-row" style={cols}>
              <ItemName it={it} qtyLabel={L.qty} />
              {priceCells(it)}
            </div>
          ),
        )}
        <div className="fk-q-row fk-q-total" style={cols}>
          <span>{L.total}</span>
          {quote.tier_names.map((name, t) => (
            <span key={t} className="fk-q-price">
              <span className="fk-q-tiername">{name}</span>
              <b className="tabular-nums">{money(totals[t]?.total ?? 0)}</b>
            </span>
          ))}
        </div>
      </section>

      {extras.length > 0 && (
        <section className="fk-q-table pt-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap pb-1.5">
            <h3 className="text-[14px] font-bold">{L.options}</h3>
            <span className="text-[12px]" style={{ color: MUTED }}>
              {L.optionsNote}
            </span>
          </div>
          {extras.map((it) => (
            <div key={it.id} className="fk-q-row" style={cols}>
              <ItemName it={it} qtyLabel={L.qty} />
              {priceCells(it)}
            </div>
          ))}
        </section>
      )}

      {quote.terms.trim() && (
        <section className="pt-5 text-[13px]">
          <h3 className="text-[14px] font-bold pb-1.5">{L.terms}</h3>
          <ul className="flex flex-col gap-1 pl-4" style={{ listStyle: "disc", color: INK }}>
            {quote.terms
              .split("\n")
              .map((t) => t.replace(/^\s*[-•]\s*/, "").trim())
              .filter(Boolean)
              .map((t, i) => (
                <li key={i} className="leading-relaxed">
                  {t}
                </li>
              ))}
          </ul>
        </section>
      )}

      <footer className="pt-6 mt-6 flex flex-wrap items-end justify-between gap-3 text-[12px]" style={{ borderTop: `1px solid ${LINE}`, color: MUTED }}>
        <span>
          {STUDIO.legal} · {STUDIO.address}
        </span>
        {quote.prepared_by && (
          <span>
            {L.preparedBy}: <b style={{ color: INK }}>{quote.prepared_by}</b>
          </span>
        )}
      </footer>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="flex-none w-[92px]" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="font-semibold min-w-0 break-words">{value}</span>
    </div>
  );
}

function ItemName({ it, qtyLabel }: { it: QuoteItem; qtyLabel: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[14px] font-semibold leading-snug break-words">{it.name || "—"}</span>
      {it.description.trim() && (
        <span className="text-[12.5px] leading-snug whitespace-pre-line" style={{ color: MUTED }}>
          {it.description}
        </span>
      )}
      <span className="text-[12px] tabular-nums" style={{ color: MUTED }}>
        {qtyLabel}: {it.qty} {it.unit}
      </span>
    </div>
  );
}

function PriceCell({
  line,
  unit,
  it,
  money,
  centered,
}: {
  line: number | null;
  unit: number | null;
  it: QuoteItem;
  money: (n: number) => string;
  centered?: boolean;
}) {
  if (line === null) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span className={`flex flex-col ${centered ? "sm:items-center" : ""}`}>
      <b className="text-[14px] tabular-nums">{money(line)}</b>
      {it.qty !== 1 && unit !== null && (
        <span className="text-[11.5px] tabular-nums" style={{ color: MUTED }}>
          {money(unit)} / {it.unit || "1"}
        </span>
      )}
    </span>
  );
}
