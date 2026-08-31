"use client";

import Image from "next/image";
import Link from "next/link";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { EditableImage, DEFAULT_IMAGE_TRANSFORM, type ImageTransform } from "./EditableImage";
import { saveJsonSetting, setSiteImage } from "@/lib/actions/admin";

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
}: {
  kicker?: string;
  title: string;
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
  // Some pages (e.g. Contact) read better as a single centered column with
  // no illustration slot at all, rather than the usual two-up hero.
  hideImage?: boolean;
  // Pass both, alongside heroKey, to let director/admin drag-to-reposition
  // and zoom the hero photo in place — stored in site_settings under
  // `transformKey`, mirroring how `heroKey` stores the image itself.
  imageTransform?: ImageTransform;
  transformKey?: string;
}) {
  return (
    <section
      className={
        hideImage
          ? "max-w-[760px] mx-auto flex flex-col gap-4 items-center text-center px-5 pt-12 pb-8"
          : "site-container flex flex-col lg:flex-row gap-11 items-center pt-12 pb-8"
      }
    >
      <div className={hideImage ? "flex flex-col gap-4 items-center" : "flex-1 flex flex-col gap-4 max-w-[560px]"}>
        {kicker && (
          <div
            className="text-xs font-bold tracking-[0.1em]"
            style={{ color: "var(--color-accent-2-700)" }}
          >
            {kicker}
          </div>
        )}
        <h1 className="text-[34px] leading-[1.2] lg:text-[42px]">{title}</h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
          {body}
        </p>
        {(primaryLabel || secondaryLabel) && (
          <div className={`flex flex-wrap gap-3 mt-2 ${hideImage ? "justify-center" : ""}`}>
            {primaryLabel && primaryHref && (
              <Link href={primaryHref} className="btn btn-primary">
                {primaryLabel}
              </Link>
            )}
            {secondaryLabel && secondaryHref && (
              <Link href={secondaryHref} className="btn btn-ghost">
                {secondaryLabel}
              </Link>
            )}
          </div>
        )}
      </div>
      {hideImage ? null : heroKey ? (
        <EditableImage
          src={imageSrc ?? null}
          emoji={emoji}
          canEdit={canEditImage}
          onUpload={(file) => setSiteImage(heroKey, file, revalidatePaths)}
          className="flex-1 w-full"
          style={{ minHeight: 280 }}
          transform={imageTransform ?? DEFAULT_IMAGE_TRANSFORM}
          onTransformChange={transformKey ? (t) => saveJsonSetting(transformKey, t, revalidatePaths) : undefined}
        />
      ) : imageSrc ? (
        <div className="flex-1 w-full relative rounded-[var(--radius-lg)] overflow-hidden" style={{ minHeight: 280 }}>
          <Image src={imageSrc} alt="" fill className="object-cover" priority />
        </div>
      ) : (
        <ImagePlaceholder emoji={emoji} className="flex-1 w-full" style={{ minHeight: 280 }} />
      )}
    </section>
  );
}
