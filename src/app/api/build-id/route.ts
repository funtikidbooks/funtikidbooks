export const dynamic = "force-dynamic";

// Lets an already-open tab (see AutoReloadWatchdog) notice a newer deploy
// went live and reload, instead of running old JS against the new server.
export function GET() {
  return Response.json(
    { id: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
