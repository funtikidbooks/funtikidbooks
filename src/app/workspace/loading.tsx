// Shown the instant a workspace link is clicked, while the next page's
// server data loads — the sidebar/top bar (layout) stay put, only the
// content area shows this placeholder, so navigation never looks frozen.
export default function WorkspaceLoading() {
  const bar = (w: string, h = 12) => (
    <div className="rounded-full motion-safe:animate-pulse" style={{ width: w, height: h, background: "var(--color-neutral-200)" }} />
  );
  return (
    <div className="flex-1 flex flex-col gap-6 p-4 sm:p-6" aria-busy="true" aria-label="Đang tải">
      <div className="flex flex-col gap-2">
        {bar("180px", 20)}
        {bar("280px")}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card p-4 flex flex-col gap-3">
            {bar("60%", 14)}
            {bar("90%")}
            {bar("75%")}
          </div>
        ))}
      </div>
    </div>
  );
}
