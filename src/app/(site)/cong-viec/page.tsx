import type { Metadata } from "next";
import { getPublishedProjects } from "@/lib/data/site-content";
import { PortalContent } from "./PortalContent";

export const metadata: Metadata = {
  title: "Work With Funti",
  description: "Sign in to submit a project brief to Funti Kidbooks Studio and follow up with our team.",
};

// Public/static-safe fetch (createPublicClient under the hood, same as the
// homepage's own project showcase) — a first-time visitor lands on a bare
// sign-up form with zero proof this studio can actually draw; real project
// art right on this page fixes that without adding a network round trip
// the client would otherwise have to make itself.
//
// Every cover AND gallery image across every published project, not just
// one cover each — sếp Phúc wants a slow-drifting marquee of these, and a
// handful of cover images loops back around far too quickly to feel like
// "browsing the studio's work". The shuffle happens client-side in
// PortalContent (see ShowcaseStrip) rather than here with Math.random() —
// this page is statically generated, so shuffling here would bake in ONE
// random order at build time for every visitor, not a fresh one per visit.
export default async function ClientPortalPage() {
  const projects = await getPublishedProjects();
  const showcaseImages = projects.flatMap((p) => [p.cover_image_url, ...p.gallery_images].filter((url): url is string => !!url));
  return <PortalContent showcaseImages={showcaseImages} />;
}
