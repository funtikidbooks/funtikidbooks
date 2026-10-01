import { SSR_SNAPSHOT_ID, SSR_SNAPSHOT_SCRIPT } from "@/lib/hydrationProbe";

// Last child of a page whose hydration mismatches need pinning down — see
// lib/hydrationProbe.ts. Records the page's text as the server sent it.
export function HydrationProbe() {
  return <script id={SSR_SNAPSHOT_ID} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SSR_SNAPSHOT_SCRIPT }} />;
}
