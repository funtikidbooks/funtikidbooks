import type { Metadata } from "next";
import { PortalContent } from "./PortalContent";

export const metadata: Metadata = {
  title: "My Projects",
  description: "Sign in to submit a project brief to Funti Kidbooks Studio and follow up with our team.",
};

export default function ClientPortalPage() {
  return <PortalContent />;
}
