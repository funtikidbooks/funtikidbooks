"use client";

import { useEffect, useState } from "react";

// A list page renders its published-only server data immediately (that's
// what keeps it static — see lib/data/site-content.ts). Once ViewerProvider
// confirms the viewer is a director/admin, this fetches the same list again
// including drafts and swaps it in, so inline editing still sees everything
// without the initial render having to wait on an auth check.
export function useEditorSwap<T>(canEdit: boolean, fetcher: () => Promise<T | null>, initial: T): T {
  const [data, setData] = useState(initial);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    fetcher().then((full) => {
      if (!cancelled && full !== null) {
        setData(full);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  return data;
}
