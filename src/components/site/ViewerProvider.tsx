"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchViewerInfo } from "@/lib/actions/editorContent";
import type { AccessRole } from "@/lib/types";

type ViewerState = {
  isAuthenticated: boolean;
  memberHref: string;
  canEdit: boolean;
  accessRole: AccessRole | null;
};

const DEFAULT_STATE: ViewerState = {
  isAuthenticated: false,
  memberHref: "/dang-nhap",
  canEdit: false,
  accessRole: null,
};

const ViewerContext = createContext<ViewerState>(DEFAULT_STATE);

// The marketing site's pages are static now (no cookies() in their render
// path — see lib/data/site-content.ts), so who's viewing is resolved here,
// after mount, instead of blocking the page on a per-request auth check.
// Every visitor briefly sees the logged-out state; a signed-in director/
// admin sees edit affordances appear a beat later once this resolves.
export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewerState>(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;
    fetchViewerInfo().then((info) => {
      if (!cancelled) setState(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ViewerContext.Provider value={state}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  return useContext(ViewerContext);
}
