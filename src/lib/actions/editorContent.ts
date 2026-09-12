"use server";

import { getContentEditorRole, getJobPostings, getNewsPosts, getProjects, getReviews } from "@/lib/data/site-content";
import { getViewer } from "@/lib/supabase/server";
import type { AccessRole } from "@/lib/types";

// The marketing pages that list these are now statically served with only
// their published rows (see lib/data/site-content.ts) so an anonymous visit
// never touches a cookie. A signed-in director/admin still needs to see (and
// inline-edit) drafts on the same page, so the client calls one of these
// once it has mounted and confirmed it's talking to an editor — the initial
// render never blocks on it.
export async function fetchViewerInfo(): Promise<{
  isAuthenticated: boolean;
  memberHref: string;
  canEdit: boolean;
  accessRole: AccessRole | null;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { isAuthenticated: false, memberHref: "/dang-nhap", canEdit: false, accessRole: null };
  }
  try {
    const viewer = await getViewer();
    if (!viewer) return { isAuthenticated: false, memberHref: "/dang-nhap", canEdit: false, accessRole: null };
    const canEdit = viewer.accessRole === "director" || viewer.accessRole === "admin";
    return {
      isAuthenticated: true,
      memberHref: viewer.accessRole === "admin" ? "/quan-tri" : "/workspace",
      canEdit,
      accessRole: viewer.accessRole,
    };
  } catch {
    return { isAuthenticated: false, memberHref: "/dang-nhap", canEdit: false, accessRole: null };
  }
}

export async function fetchAllProjectsForEditor() {
  const role = await getContentEditorRole();
  return role ? getProjects(true) : null;
}

export async function fetchAllReviewsForEditor() {
  const role = await getContentEditorRole();
  return role ? getReviews(true) : null;
}

export async function fetchAllNewsForEditor() {
  const role = await getContentEditorRole();
  return role ? getNewsPosts(true) : null;
}

export async function fetchAllJobPostingsForEditor() {
  const role = await getContentEditorRole();
  return role ? getJobPostings(true) : null;
}
