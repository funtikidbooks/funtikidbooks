// Lets an already-open tab (see AutoReloadWatchdog) notice a newer deploy
// went live and reload, instead of running old JS against the new server.
//
// Built once per deploy and served from Vercel's CDN (10/2026): it was a
// function call every time — over a thousand a day from open tabs, the
// third-biggest CPU user in Observability — for an answer that only changes
// when a new deploy goes out, which brings a new copy of this file with it.
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { id: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    // Browsers ask with cache: "no-store"; the CDN keeps it until the next deploy.
    { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } },
  );
}
