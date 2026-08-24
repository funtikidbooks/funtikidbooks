import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { ContactForm } from "@/components/site/ContactForm";
import { ContactOfficePhoto } from "@/components/site/ContactOfficePhoto";
import { getContentEditorRole, getSiteSettings } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";

export const metadata: Metadata = { title: "Liên hệ" };

const OFFICE_IMAGE_KEY = "lien-he-anh-van-phong";
// Toà nhà M.O.R.E, 40B Út Tịch, P.4, Tân Bình, TP.HCM.
const OFFICE_LAT = 10.797428028272735;
const OFFICE_LNG = 106.65835599417403;

export default async function ContactPage() {
  const [locale, editorRole, settings] = await Promise.all([
    getLocale(),
    getContentEditorRole(),
    getSiteSettings([OFFICE_IMAGE_KEY]),
  ]);
  const t = dictionary[locale];
  const canEdit = editorRole !== null;
  const officeImage = settings[OFFICE_IMAGE_KEY] ?? null;

  const INFO = [
    { icon: "✉️", label: t.contact.email, value: "hello@funtikidbooks.com" },
    { icon: "📞", label: t.contact.phone, value: "+84 (0) 123 456 789" },
    { icon: "📍", label: t.contact.address, value: t.contact.addressValue },
  ];

  return (
    <>
      <PageHero kicker={t.contact.kicker} title={t.contact.title} body={t.contact.body} emoji="✉️" hideImage />
      <section className="max-w-[1280px] mx-auto px-5 pb-16 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <ContactForm />
        <div className="card elev-sm p-7 flex flex-col gap-5 h-fit">
          <h3 className="text-lg">{t.contact.infoTitle}</h3>
          {INFO.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <span
                className="flex items-center justify-center rounded-full text-base flex-none"
                style={{ width: 36, height: 36, background: "var(--color-accent-2-100)" }}
                aria-hidden
              >
                {item.icon}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                  {item.label}
                </span>
                <span className="text-sm font-semibold">{item.value}</span>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3">
            <span
              className="flex items-center justify-center rounded-full text-base flex-none"
              style={{ width: 36, height: 36, background: "var(--color-accent-2-100)" }}
              aria-hidden
            >
              🕐
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                {t.contact.hours}
              </span>
              <span className="text-sm font-semibold">{t.contact.hoursWeekday}</span>
              <span className="text-sm font-semibold">{t.contact.hoursSaturday}</span>
            </div>
          </div>

          <ContactOfficePhoto src={officeImage} canEdit={canEdit} />
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-5 pb-16">
        <div className="relative rounded-[var(--radius-lg)] overflow-hidden elev-sm" style={{ height: 360 }}>
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
        </div>
      </section>
    </>
  );
}
