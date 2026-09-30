"use client";

import Link from "next/link";
import { PageHero } from "@/components/site/PageHero";
import { ContactForm } from "@/components/site/ContactForm";
import { ContactOfficePhoto } from "@/components/site/ContactOfficePhoto";
import { Reveal } from "@/components/site/Reveal";
import { DrawnIcon, type DrawnIconName } from "@/components/site/Doodles";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";

// Toà nhà M.O.R.E, 40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM —
// re-geocoded straight from that address string via Google Maps to confirm
// the pin, rather than trusting the old hardcoded value.
const OFFICE_LAT = 10.7974838;
const OFFICE_LNG = 106.6584287;

// One door per kind of visit: a book project goes to Work With Funti (the
// quote intake); anything else to the message form on this page.
export function ContactPageContent({ officeImage }: { officeImage: string | null }) {
  const { t } = useDict();
  const { canEdit } = useViewer();
  const c = t.contact;

  const INFO: { icon: DrawnIconName; label: string; value: string; href?: string }[] = [
    { icon: "mail", label: c.email, value: "funtikidbooks.studio@gmail.com", href: "mailto:funtikidbooks.studio@gmail.com" },
    { icon: "phone", label: c.phone, value: "0978 346 851", href: "tel:0978346851" },
    { icon: "pin", label: c.address, value: c.addressValue },
  ];

  return (
    <>
      <PageHero kicker={c.kicker} title={c.title} body={c.body} hideImage />

      <section className="site-container pb-12 grid grid-cols-1 md:grid-cols-2 gap-5">
        <Reveal>
          <div className="h-full flex flex-col gap-3 rounded-[20px] p-6 sm:p-8" style={{ background: "var(--color-accent-100)" }}>
            <span style={{ color: "var(--color-accent-700)" }}>
              <DrawnIcon name="book" size={36} />
            </span>
            <h2 className="text-[22px] sm:text-[24px]">{c.doorProjectTitle}</h2>
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
              {c.doorProjectBody}
            </p>
            <Link href="/cong-viec" className="btn btn-primary btn-lg w-full sm:w-fit mt-auto">
              {c.doorProjectCta}
            </Link>
          </div>
        </Reveal>
        <Reveal delay={90}>
          <div className="h-full flex flex-col gap-3 rounded-[20px] p-6 sm:p-8" style={{ background: "var(--color-accent-2-100)" }}>
            <span style={{ color: "var(--color-accent-2-700)" }}>
              <DrawnIcon name="chat" size={36} />
            </span>
            <h2 className="text-[22px] sm:text-[24px]">{c.doorOtherTitle}</h2>
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
              {c.doorOtherBody}
            </p>
            <a href="#loi-nhan" className="btn btn-secondary btn-lg w-full sm:w-fit mt-auto" style={{ background: "var(--color-panel)" }}>
              {c.doorOtherCta}
            </a>
          </div>
        </Reveal>
      </section>

      <section id="loi-nhan" className="site-container pb-16 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] scroll-mt-20">
        <Reveal>
          <ContactForm />
        </Reveal>
        <Reveal delay={130} className="card elev-sm p-7 flex flex-col gap-5 h-fit">
          <h3 className="text-lg">{c.infoTitle}</h3>
          {INFO.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <span
                className="flex items-center justify-center rounded-full flex-none"
                style={{ width: 40, height: 40, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-700)" }}
              >
                <DrawnIcon name={item.icon} size={22} />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                  {item.label}
                </span>
                {item.href ? (
                  <a href={item.href} className="text-sm font-semibold break-words hover:underline">
                    {item.value}
                  </a>
                ) : (
                  <span className="text-sm font-semibold">{item.value}</span>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3">
            <span
              className="flex items-center justify-center rounded-full flex-none"
              style={{ width: 40, height: 40, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-700)" }}
            >
              <DrawnIcon name="clock" size={22} />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                {c.hours}
              </span>
              <span className="text-sm font-semibold">{c.hoursWeekday}</span>
              <span className="text-sm font-semibold">{c.hoursSaturday}</span>
            </div>
          </div>

          <ContactOfficePhoto src={officeImage} canEdit={canEdit} />
        </Reveal>
      </section>

      <section className="site-container pb-16">
        <Reveal className="relative rounded-[var(--radius-lg)] overflow-hidden elev-sm" style={{ height: 360 }}>
          <iframe
            title="Bản đồ đường đến Funti Kidbooks Studio"
            src={`https://www.google.com/maps?q=${OFFICE_LAT},${OFFICE_LNG}&output=embed`}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {/* Google's keyless embed doesn't support a custom pin label, so we
              overlay our own tag above the marker (which sits at the map's
              centered query point). */}
          <span
            className="absolute left-1/2 pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ top: "50%", transform: "translate(-50%, -44px)", background: "var(--color-panel)", color: "var(--color-accent-700)", boxShadow: "var(--shadow-sm)" }}
          >
            📍 Funtikidbooks
          </span>
        </Reveal>
        <div className="flex justify-center mt-4">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${OFFICE_LAT},${OFFICE_LNG}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            {c.directions} →
          </a>
        </div>
      </section>
    </>
  );
}
