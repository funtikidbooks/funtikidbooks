import type { Metadata } from "next";
import { getPublishedProjects } from "@/lib/data/site-content";
import { PortalContent } from "./PortalContent";

export const metadata: Metadata = {
  title: "Work With Funti",
  description: "Sign in to submit a project brief to Funti Kidbooks Studio and follow up with our team.",
};

// Public/static-safe fetch (createPublicClient under the hood, same as the
// homepage's own project showcase) — a first-time visitor lands on a bare
// sign-up form with zero proof this studio can actually draw; a handful of
// real cover images right on this page fixes that without adding a network
// round trip the client would otherwise have to make itself.
export default async function ClientPortalPage() {
  const projects = await getPublishedProjects();
  const showcaseImages = projects
    .map((p) => p.cover_image_url)
    .filter((url): url is string => !!url)
    .slice(0, 6);
  return <PortalContent showcaseImages={showcaseImages} />;
}
