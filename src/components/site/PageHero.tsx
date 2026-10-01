"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { EditableImage, DEFAULT_IMAGE_TRANSFORM, type ImageTransform } from "./EditableImage";
import { saveJsonSetting, setSiteImage } from "@/lib/actions/admin";
import { isSupabaseStorageUrl, supabaseImageLoader } from "@/lib/imageTransform";

const PAGE_HERO_LOADER = supabaseImageLoader(1400);

// The top of an inner page: kicker, title, a line of text, the buttons, and
// on the right either real art (`art`), a photo, or — for pages without
// either — nothing at all, the text then centred. No emoji placeholder: an
// empty picture box reads as an unfinished site.
export function PageHero({
  kicker,
  title,
  body,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  emoji = "🎨",
  imageSrc,
  heroKey,
  canEditImage = false,
  revalidatePaths = [],
  hideImage = false,
  imageTransform,
  transformKey,
  art,
}: {
  kicker?: string;
  title: ReactNode;
  body: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  emoji?: string;
  imageSrc?: string;
  // When set, the hero image becomes replaceable in place for director/admin
  // — stored in site_settings under this key, overriding `imageSrc`.
  heroKey?: string;
  canEditImage?: boolean;
  revalidatePaths?: string[];
  // Some pages (e.g. Contact) read better as a single centered column.
  hideImage?: boolean;
  // Pass both, alongside heroKey, to let director/admin drag-to-reposition
  // and zoom the hero photo in place — stored in site_settings under
  // `transformKey`, mirroring how `heroKey` stores the image itself.
  imageTransform?: ImageTransform;
  transformKey?: string;
  // The page's own picture (a collage of real work) in place of a photo.
  art?: ReactNode;
}) {
  const hasPicture = !hideImage && (art || imageSrc || (heroKey && canEditImage));
  const centred = !hasPicture;

  return (
    <section className="fk-paper">
      <div
        className={
          centred
            ? "max-w-[820px] mx-auto flex flex-col gap-4 items-center text-center px-5 pt-12 pb-10 sm:pt-16"
            : "site-container grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center pt-10 pb-12 sm:pt-14 lg:pb-16"
        }
      >
        <div className={centred ? "flex flex-col gap-4 items-center" : "flex flex-col gap-4 min-w-0 items-center text-center lg:items-start lg:text-left"}>
          {kicker && (
            <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-2-700)" }}>
              {kicker}
            </div>
          )}
          <h1 className="text-[32px] leading-[1.15] sm:text-[40px] lg:text-[46px]" style={{ textWrap: "balance" }}>
            {title}
          </h1>
          <p className="text-[16px] sm:text-[17px] leading-relaxed max-w-[36em]" style={{ color: "var(--color-neutral-700)", textWrap: "pretty" }}>
            {body}
          </p>
          {(primaryLabel || secondaryLabel) && (
            <div className={`flex flex-col sm:flex-row gap-3 mt-3 w-full sm:w-auto ${centred ? "justify-center" : ""}`}>
              {primaryLabel && primaryHref && (
                <Link href={primaryHref} className="btn btn-primary btn-lg w-full sm:w-auto">
                  {primaryLabel}
                </Link>
              )}
              {secondaryLabel && secondaryHref && (
                <Link href={secondaryHref} className="btn btn-secondary btn-lg w-full sm:w-auto">
                  {secondaryLabel}
                </Link>
              )}
            </div>
          )}
        </div>
        {!hasPicture ? null : art ? (
          <div className="min-w-0 w-full">{art}</div>
        ) : heroKey ? (
          <EditableImage
            src={imageSrc ?? null}
            emoji={emoji}
            canEdit={canEditImage}
            onUpload={(file) => setSiteImage(heroKey, file, revalidatePaths)}
            className="w-full"
            style={{ minHeight: 300, aspectRatio: "4 / 3" }}
            resizeWidth={1400}
            transform={imageTransform ?? DEFAULT_IMAGE_TRANSFORM}
            onTransformChange={transformKey ? (t) => saveJsonSetting(transformKey, t, revalidatePaths) : undefined}
          />
        ) : imageSrc ? (
          <div className="w-full relative rounded-[var(--radius-lg)] overflow-hidden" style={{ minHeight: 300, aspectRatio: "4 / 3" }}>
            <Image
              src={imageSrc}
              loader={isSupabaseStorageUrl(imageSrc) ? PAGE_HERO_LOADER : undefined}
              sizes="(max-width: 767px) 100vw, 50vw"
              alt=""
              fill
              className="object-cover"
              priority
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
