"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { ClientType } from "@/lib/types";

// Quản trị → Tài khoản khách hàng: the Công việc portal's logins, kept apart
// from staff (profiles). See supabase/migrations/client_accounts_separate.sql.

export type ClientAccount = {
  id: string;
  email: string;
  displayName: string | null;
  country: string | null;
  clientType: ClientType | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  // Signed in but never finished the "your details" step on /cong-viec.
  registered: boolean;
  // Also has a staff profile (e.g. sếp testing the portal with his own
  // email) — managed from Nhân sự, never deleted from here.
  alsoStaff: boolean;
  projectCount: number;
  lastMessageAt: string | null;
};

async function viewerRole() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  return { user, isDirector: me?.access_role === "director", isPM: me?.role === "Project Manager" };
}

export async function listClientAccounts(): Promise<ClientAccount[]> {
  const { isDirector, isPM } = await viewerRole();
  if (!isDirector && !isPM) throw new Error("Bạn không có quyền xem trang này.");

  const admin = createAdminClient();
  const [users, { data: clients }, { data: profiles }, { data: projects }] = await Promise.all([
    (async () => {
      const all = [];
      for (let page = 1; page < 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error("Không tải được danh sách tài khoản.");
        all.push(...data.users);
        if (data.users.length < 1000) break;
      }
      return all;
    })(),
    admin.from("clients").select("*"),
    admin.from("profiles").select("id"),
    admin.from("client_projects").select("client_id, last_message_at"),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id as string, c]));
  const staffIds = new Set((profiles ?? []).map((p) => p.id as string));
  const projectStats = new Map<string, { count: number; last: string | null }>();
  for (const p of projects ?? []) {
    const s = projectStats.get(p.client_id) ?? { count: 0, last: null };
    s.count++;
    if (!s.last || p.last_message_at > s.last) s.last = p.last_message_at;
    projectStats.set(p.client_id, s);
  }

  return users
    .filter((u) => u.user_metadata?.signup_source === "client" || clientById.has(u.id))
    .map((u) => {
      const c = clientById.get(u.id);
      const s = projectStats.get(u.id);
      return {
        id: u.id,
        email: u.email ?? c?.email ?? "",
        displayName: c?.display_name ?? null,
        country: c?.country ?? null,
        clientType: (c?.client_type as ClientType | undefined) ?? null,
        avatarUrl: c?.avatar_url ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        registered: !!c,
        alsoStaff: staffIds.has(u.id),
        projectCount: s?.count ?? 0,
        lastMessageAt: s?.last ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Removes the client's login and, through the schema's cascades, their
// clients row, projects and messages. Uploaded images are cleared from
// Storage first since the cascade never reaches it.
export async function deleteClientAccount(id: string) {
  const { isDirector } = await viewerRole();
  if (!isDirector) throw new Error("Chỉ Giám đốc mới xoá được tài khoản khách hàng.");

  const admin = createAdminClient();
  const { data: staff } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
  if (staff) throw new Error("Tài khoản này cũng là nhân viên — quản lý ở trang Nhân sự & phân quyền.");

  const [{ data: client }, { data: projects }] = await Promise.all([
    admin.from("clients").select("avatar_url").eq("id", id).maybeSingle(),
    admin.from("client_projects").select("id, image_urls").eq("client_id", id),
  ]);
  const projectIds = (projects ?? []).map((p) => p.id as string);
  const { data: messages } = projectIds.length
    ? await admin.from("client_messages").select("image_urls").in("project_id", projectIds)
    : { data: [] as { image_urls: unknown }[] };

  const urls: string[] = [];
  if (client?.avatar_url) urls.push(client.avatar_url);
  for (const row of [...(projects ?? []), ...(messages ?? [])]) {
    if (Array.isArray(row.image_urls)) urls.push(...(row.image_urls as string[]));
  }
  const paths = urls.map((u) => storagePathFromPublicUrl(u, "client-uploads")).filter((p): p is string => !!p);
  if (paths.length > 0) await admin.storage.from("client-uploads").remove(paths).catch(() => {});

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error("Không thể xoá tài khoản. Vui lòng thử lại.");
  revalidatePath("/quan-tri/tai-khoan-khach-hang");
}
