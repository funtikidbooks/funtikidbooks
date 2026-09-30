import { permanentRedirect } from "next/navigation";

// The new home page was tried out here before it replaced "/"; the link
// still goes somewhere.
export default function HomePreviewPage() {
  permanentRedirect("/");
}
