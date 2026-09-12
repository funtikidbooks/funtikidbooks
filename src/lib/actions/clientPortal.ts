"use server";

import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { sendClientReplyEmail, sendNewClientMessageEmail } from "@/lib/mail";
import type { ClientMessage, ClientProfile, ClientProject, ClientType } from "@/lib/types";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Client side — anyone signed in via the magic-link email flow (see
// SupportChatWidget-style client component in cong-viec/PortalContent.tsx).
// No requireUser() here: an unauthenticated visit to /cong-viec is a normal,
// expected state (show the sign-in form), not an error to throw on.
// ---------------------------------------------------------------------------

export async function getPortalState(): Promise<{ loggedIn: boolean; profile: ClientProfile | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { loggedIn: false, profile: null };

  const { data } = await supabase.from("clients").select("*").eq("id", user.id).maybeSingle();
  return { loggedIn: true, profile: (data as ClientProfile) ?? null };
}

export async function registerClientProfile(input: {
  displayName: string;
  country: string;
  avatarUrl: string | null;
  clientType: ClientType;
}): Promise<ClientProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in first.");

  const { data, error } = await supabase
    .from("clients")
    .insert({
      id: user.id,
      email: user.email ?? "",
      display_name: input.displayName.trim() || null,
      country: input.country.trim() || null,
      avatar_url: input.avatarUrl,
      client_type: input.clientType,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Could not save your profile. Please try again.");
  return data as ClientProfile;
}

export async function uploadClientAvatar(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in first.");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Missing file.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Only PNG, JPG, GIF or WEBP images are supported.");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("Image is larger than 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `avatars/${user.id}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("client-uploads")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Could not upload the image.");

  const { data } = supabase.storage.from("client-uploads").getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadClientProjectImage(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in first.");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Missing file.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Only PNG, JPG, GIF or WEBP images are supported.");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("Image is larger than 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `projects/${user.id}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("client-uploads")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Could not upload the image.");

  const { data } = supabase.storage.from("client-uploads").getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function listMyProjects(): Promise<ClientProject[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_projects")
    .select("*")
    .order("last_message_at", { ascending: false });
  return (data ?? []) as ClientProject[];
}

export async function getProjectMessages(projectId: string): Promise<ClientMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ClientMessage[];
}

// Notifies every director/PM (push + fallback email) whenever a client
// submits a new brief or sends a follow-up — same reasoning as
// notifyStaffOfVisitorMessage in visitor-chat.ts, just for a signed-in
// client instead of the anonymous widget.
async function notifyStaffOfClientMessage(clientName: string | null, content: string) {
  const supabase = createAdminClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, email")
    .or("access_role.eq.director,access_role.eq.admin,role.eq.Project Manager");
  if (!staff || staff.length === 0) return;

  const who = clientName?.trim() || "Một khách hàng";
  const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;

  await Promise.all(
    staff.map((s) =>
      sendPushToUser(s.id, {
        title: "🔔 Khách hàng nhắn tin mới",
        body: `${who}: ${preview}`,
        senderId: "client-portal",
        url: "/workspace/khach-hang",
        tag: "funti-client-portal",
        requireInteraction: true,
      }).catch(() => {}),
    ),
  );

  await Promise.all(
    staff.map((s) =>
      s.email ? sendNewClientMessageEmail({ to: s.email, clientName, preview }).catch(() => {}) : Promise.resolve(),
    ),
  );
}

export async function createClientProject(description: string, imageUrls: string[]): Promise<ClientProject> {
  const trimmed = description.trim();
  if (!trimmed) throw new Error("Please describe your project.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in first.");

  const { data: client } = await supabase.from("clients").select("display_name").eq("id", user.id).maybeSingle();

  const { data, error } = await supabase
    .from("client_projects")
    .insert({ client_id: user.id, description: trimmed, image_urls: imageUrls })
    .select("*")
    .single();

  if (error || !data) throw new Error("Could not submit your project. Please try again.");

  after(() => notifyStaffOfClientMessage(client?.display_name ?? null, trimmed).catch(() => {}));

  return data as ClientProject;
}

export async function sendClientMessage(
  projectId: string,
  content: string,
  imageUrls: string[] = [],
): Promise<ClientMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Please enter a message.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in first.");

  const { data, error } = await supabase
    .from("client_messages")
    .insert({
      project_id: projectId,
      sender_type: "client",
      sender_id: user.id,
      content: trimmed,
      image_urls: imageUrls,
      read_by_client: true,
      read_by_staff: false,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Could not send your message. Please try again.");

  const { data: client } = await supabase.from("clients").select("display_name").eq("id", user.id).maybeSingle();

  await supabase
    .from("client_projects")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", projectId);

  after(() => notifyStaffOfClientMessage(client?.display_name ?? null, trimmed).catch(() => {}));

  return data as ClientMessage;
}

export async function markProjectReadByClient(projectId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("client_messages")
    .update({ read_by_client: true })
    .eq("project_id", projectId)
    .eq("sender_type", "staff")
    .eq("read_by_client", false);
}

// Total unread staff replies across every project this client owns — RLS
// already scopes client_messages to their own rows, so no explicit
// project_id filter is needed here.
export async function getMyUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("client_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_type", "staff")
    .eq("read_by_client", false);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Staff side — director or Project Manager only, from inside the workspace
// (src/app/workspace/khach-hang).
// ---------------------------------------------------------------------------

async function requireClientManager() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  const allowed = profile?.access_role === "director" || profile?.access_role === "admin" || profile?.role === "Project Manager";
  if (!allowed) throw new Error("Chỉ Giám đốc và Quản lý dự án mới xem được mục này.");
  return { supabase, user };
}

export async function listAllClientProjects(): Promise<(ClientProject & { client: ClientProfile | null })[]> {
  const { supabase } = await requireClientManager();
  const { data } = await supabase
    .from("client_projects")
    .select("*, client:clients(*)")
    .order("last_message_at", { ascending: false });
  return (data ?? []) as unknown as (ClientProject & { client: ClientProfile | null })[];
}

export async function getClientProjectMessagesForStaff(projectId: string): Promise<ClientMessage[]> {
  const { supabase } = await requireClientManager();
  const { data } = await supabase
    .from("client_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ClientMessage[];
}

export async function sendStaffReplyToClient(projectId: string, content: string): Promise<ClientMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Vui lòng nhập nội dung tin nhắn.");
  const { supabase, user } = await requireClientManager();

  const { data, error } = await supabase
    .from("client_messages")
    .insert({
      project_id: projectId,
      sender_type: "staff",
      sender_id: user.id,
      content: trimmed,
      read_by_staff: true,
      read_by_client: false,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể gửi tin nhắn. Vui lòng thử lại.");

  const { data: project } = await supabase
    .from("client_projects")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("*, client:clients(*)")
    .single();

  const client = (project as unknown as { client: ClientProfile | null } | null)?.client ?? null;
  if (client?.email) {
    const preview = trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
    after(() =>
      sendClientReplyEmail({ to: client.email, clientName: client.display_name, preview }).catch(() => {}),
    );
  }

  return data as ClientMessage;
}

export async function markProjectReadByStaff(projectId: string): Promise<void> {
  const { supabase } = await requireClientManager();
  await supabase
    .from("client_messages")
    .update({ read_by_staff: true })
    .eq("project_id", projectId)
    .eq("sender_type", "client")
    .eq("read_by_staff", false);
}

// Total unread client messages across every project — badges the
// workspace sidebar link the same way DM/document counts do.
export async function getUnreadClientMessageCount(): Promise<number> {
  const { supabase } = await requireClientManager();
  const { count } = await supabase
    .from("client_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_type", "client")
    .eq("read_by_staff", false);
  return count ?? 0;
}
