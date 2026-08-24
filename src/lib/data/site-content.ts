import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AccessRole, NewsPost, Project, Review } from "@/lib/types";

export async function getProjects(includeUnpublished = false): Promise<Project[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    let query = supabase.from("projects").select("*").order("position", { ascending: true });
    if (!includeUnpublished) query = query.eq("published", true);
    const { data } = await query;
    return (data ?? []) as Project[];
  } catch {
    return [];
  }
}

export async function getPublishedProjects(): Promise<Project[]> {
  return getProjects(false);
}

// `includeUnpublished` should only be true for a signed-in director/admin —
// RLS still enforces this server-side, this just controls the query filter.
export async function getNewsPosts(includeUnpublished = false): Promise<NewsPost[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    let query = supabase.from("news_posts").select("*").order("created_at", { ascending: false });
    if (!includeUnpublished) query = query.eq("published", true);
    const { data } = await query;
    return (data ?? []) as NewsPost[];
  } catch {
    return [];
  }
}

export async function getPublishedNewsPosts(): Promise<NewsPost[]> {
  return getNewsPosts(false);
}

// RLS already restricts unpublished rows to director/admin sessions, so no
// extra filter is needed here — a non-editor gets null for a draft slug.
export async function getNewsPostBySlug(slug: string): Promise<NewsPost | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("news_posts").select("*").eq("slug", slug).maybeSingle();
    return (data as NewsPost) ?? null;
  } catch {
    return null;
  }
}

export async function getReviews(includeUnpublished = false): Promise<Review[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    let query = supabase.from("reviews").select("*").order("position", { ascending: true });
    if (!includeUnpublished) query = query.eq("published", true);
    const { data } = await query;
    return (data ?? []) as Review[];
  } catch {
    return [];
  }
}

export async function getSiteSettings(keys: string[]): Promise<Record<string, string>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("site_settings").select("key, value").in("key", keys);
    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    return map;
  } catch {
    return {};
  }
}

export async function getHeroSlides(key: string, fallback: string[]): Promise<string[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return fallback;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
    if (!data?.value) return fallback;
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// Generic structured content stored as JSON under one site_settings key —
// used for admin-editable lists (About page timeline, team roster) that
// don't warrant their own database table.
export async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return fallback;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
    if (!data?.value) return fallback;
    return JSON.parse(data.value) as T;
  } catch {
    return fallback;
  }
}

// Used by public marketing pages to decide whether to show inline
// "edit this page" affordances (add/replace content) for the current user.
export async function getContentEditorRole(): Promise<AccessRole | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("access_role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.access_role as AccessRole | undefined;
    return role === "director" || role === "admin" ? role : null;
  } catch {
    return null;
  }
}
