"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStaffWelcomeEmail } from "@/lib/mail";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { AccessRole, EmploymentType, JobPosting, NewsPost, Profile, Project, Review, StaffBankInfo } from "@/lib/types";

async function requireDirector() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director") {
    throw new Error("Chỉ Giám đốc mới có quyền này.");
  }

  return { supabase, user };
}

// Read-only visibility into the staff list for a "Project Manager" job
// title, alongside director — same population that already gets full
// access to chấm công/bảng lương/hoá đơn (can_manage_hr() in
// supabase/schema.sql). They can see roles/job titles but not change them:
// updateAccessRole/updateJobTitle/deleteStaffAccount/createStaffAccount
// below all still require requireDirector(), not this.
async function requireDirectorOrPM() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền xem trang này.");
  }

  return { supabase, user };
}

async function requireContentEditor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.access_role === "staff") {
    throw new Error("Bạn không có quyền thực hiện thao tác này.");
  }

  return { supabase, user };
}

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

async function uploadSiteImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  folder: string,
  file: File,
) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WEBP");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("Ảnh vượt quá 20MB");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `${folder}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("site-content")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải ảnh lên");

  const { data } = supabase.storage.from("site-content").getPublicUrl(storagePath);
  return data.publicUrl;
}

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "bai-viet";
}

async function uniqueNewsSlug(supabase: Awaited<ReturnType<typeof createClient>>, base: string) {
  let slug = base;
  let n = 2;
  for (;;) {
    const { data } = await supabase.from("news_posts").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n++}`;
  }
}

// ---------------------------------------------------------------------------
// Projects (Dự án)
// ---------------------------------------------------------------------------

export async function listProjects() {
  const { supabase } = await requireContentEditor();
  const { data } = await supabase.from("projects").select("*").order("position", { ascending: true });
  return (data ?? []) as Project[];
}

export async function createProject(input: {
  title: string;
  titleEn?: string;
  tag: string;
  description?: string;
  descriptionEn?: string;
  content?: string;
  contentEn?: string;
  cover?: File | null;
}) {
  const { supabase, user } = await requireContentEditor();
  const title = input.title.trim();
  if (!title) throw new Error("Thiếu tên dự án");

  let coverUrl: string | null = null;
  if (input.cover) coverUrl = await uploadSiteImage(supabase, "projects", input.cover);

  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title,
      title_en: input.titleEn?.trim() || null,
      tag: input.tag.trim() || "Khác",
      description: input.description?.trim() || null,
      description_en: input.descriptionEn?.trim() || null,
      content: input.content?.trim() || null,
      content_en: input.contentEn?.trim() || null,
      cover_image_url: coverUrl,
      position: count ?? 0,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo dự án");

  revalidatePath("/du-an");
  revalidatePath("/quan-tri/du-an");
  return data as Project;
}

export async function updateProject(
  id: string,
  input: {
    title?: string;
    titleEn?: string;
    tag?: string;
    description?: string;
    descriptionEn?: string;
    content?: string;
    contentEn?: string;
    published?: boolean;
    cover?: File | null;
  },
) {
  const { supabase } = await requireContentEditor();
  const patch: Partial<Project> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.titleEn !== undefined) patch.title_en = input.titleEn?.trim() || null;
  if (input.tag !== undefined) patch.tag = input.tag.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.descriptionEn !== undefined) patch.description_en = input.descriptionEn?.trim() || null;
  if (input.content !== undefined) patch.content = input.content?.trim() || null;
  if (input.contentEn !== undefined) patch.content_en = input.contentEn?.trim() || null;
  if (input.published !== undefined) patch.published = input.published;
  if (input.cover) patch.cover_image_url = await uploadSiteImage(supabase, "projects", input.cover);

  const { data, error } = await supabase.from("projects").update(patch).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể cập nhật dự án");

  revalidatePath("/du-an");
  revalidatePath("/quan-tri/du-an");
  return data as Project;
}

export async function deleteProject(id: string) {
  const { supabase } = await requireContentEditor();
  await supabase.from("projects").delete().eq("id", id);
  revalidatePath("/du-an");
  revalidatePath("/quan-tri/du-an");
}

// ---------------------------------------------------------------------------
// News posts (Tin tức)
// ---------------------------------------------------------------------------

export async function createNewsPost(input: {
  title: string;
  titleEn?: string;
  category: string;
  excerpt?: string;
  excerptEn?: string;
  content?: string;
  contentEn?: string;
  cover?: File | null;
}) {
  const { supabase, user } = await requireContentEditor();
  const title = input.title.trim();
  if (!title) throw new Error("Thiếu tiêu đề bài viết");

  let coverUrl: string | null = null;
  if (input.cover) coverUrl = await uploadSiteImage(supabase, "news", input.cover);

  const slug = await uniqueNewsSlug(supabase, slugify(title));

  const { data, error } = await supabase
    .from("news_posts")
    .insert({
      title,
      title_en: input.titleEn?.trim() || null,
      slug,
      category: input.category.trim() || "Studio",
      excerpt: input.excerpt?.trim() || null,
      excerpt_en: input.excerptEn?.trim() || null,
      content: input.content?.trim() || null,
      content_en: input.contentEn?.trim() || null,
      cover_image_url: coverUrl,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo bài viết");

  revalidatePath("/tin-tuc");
  return data as NewsPost;
}

export async function updateNewsPost(
  id: string,
  input: {
    title?: string;
    titleEn?: string;
    category?: string;
    excerpt?: string;
    excerptEn?: string;
    content?: string;
    contentEn?: string;
    published?: boolean;
    cover?: File | null;
  },
) {
  const { supabase } = await requireContentEditor();
  const patch: Partial<NewsPost> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.titleEn !== undefined) patch.title_en = input.titleEn?.trim() || null;
  if (input.category !== undefined) patch.category = input.category.trim();
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt?.trim() || null;
  if (input.excerptEn !== undefined) patch.excerpt_en = input.excerptEn?.trim() || null;
  if (input.content !== undefined) patch.content = input.content?.trim() || null;
  if (input.contentEn !== undefined) patch.content_en = input.contentEn?.trim() || null;
  if (input.published !== undefined) patch.published = input.published;
  if (input.cover) patch.cover_image_url = await uploadSiteImage(supabase, "news", input.cover);

  const { data, error } = await supabase.from("news_posts").update(patch).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể cập nhật bài viết");

  revalidatePath("/tin-tuc");
  return data as NewsPost;
}

export async function deleteNewsPost(id: string) {
  const { supabase } = await requireContentEditor();
  await supabase.from("news_posts").delete().eq("id", id);
  revalidatePath("/tin-tuc");
}

export async function uploadContentImage(file: File) {
  const { supabase } = await requireContentEditor();
  return uploadSiteImage(supabase, "news-content", file);
}

// ---------------------------------------------------------------------------
// Job postings (Tuyển dụng) — same shape and edit-in-place pattern as News.
// ---------------------------------------------------------------------------

async function uniqueJobPostingSlug(supabase: Awaited<ReturnType<typeof createClient>>, base: string) {
  let slug = base;
  let n = 2;
  for (;;) {
    const { data } = await supabase.from("job_postings").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n++}`;
  }
}

export async function createJobPosting(input: {
  title: string;
  titleEn?: string;
  employmentType: EmploymentType;
  location?: string;
  salaryRange?: string;
  deadline?: string;
  excerpt?: string;
  excerptEn?: string;
  content?: string;
  contentEn?: string;
  closed?: boolean;
  cover?: File | null;
}) {
  const { supabase, user } = await requireContentEditor();
  const title = input.title.trim();
  if (!title) throw new Error("Thiếu tiêu đề tin tuyển dụng");

  let coverUrl: string | null = null;
  if (input.cover) coverUrl = await uploadSiteImage(supabase, "tuyen-dung", input.cover);

  const slug = await uniqueJobPostingSlug(supabase, slugify(title));

  const { data, error } = await supabase
    .from("job_postings")
    .insert({
      title,
      title_en: input.titleEn?.trim() || null,
      slug,
      employment_type: input.employmentType,
      location: input.location?.trim() || null,
      salary_range: input.salaryRange?.trim() || null,
      deadline: input.deadline || null,
      excerpt: input.excerpt?.trim() || null,
      excerpt_en: input.excerptEn?.trim() || null,
      content: input.content?.trim() || null,
      content_en: input.contentEn?.trim() || null,
      closed: input.closed ?? false,
      cover_image_url: coverUrl,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo tin tuyển dụng");

  revalidatePath("/tuyen-dung");
  return data as JobPosting;
}

export async function updateJobPosting(
  id: string,
  input: {
    title?: string;
    titleEn?: string;
    employmentType?: EmploymentType;
    location?: string;
    salaryRange?: string;
    deadline?: string | null;
    excerpt?: string;
    excerptEn?: string;
    content?: string;
    contentEn?: string;
    published?: boolean;
    closed?: boolean;
    cover?: File | null;
  },
) {
  const { supabase } = await requireContentEditor();
  const patch: Partial<JobPosting> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.titleEn !== undefined) patch.title_en = input.titleEn?.trim() || null;
  if (input.employmentType !== undefined) patch.employment_type = input.employmentType;
  if (input.location !== undefined) patch.location = input.location?.trim() || null;
  if (input.salaryRange !== undefined) patch.salary_range = input.salaryRange?.trim() || null;
  if (input.deadline !== undefined) patch.deadline = input.deadline || null;
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt?.trim() || null;
  if (input.excerptEn !== undefined) patch.excerpt_en = input.excerptEn?.trim() || null;
  if (input.content !== undefined) patch.content = input.content?.trim() || null;
  if (input.contentEn !== undefined) patch.content_en = input.contentEn?.trim() || null;
  if (input.published !== undefined) patch.published = input.published;
  if (input.closed !== undefined) patch.closed = input.closed;
  if (input.cover) patch.cover_image_url = await uploadSiteImage(supabase, "tuyen-dung", input.cover);

  const { data, error } = await supabase.from("job_postings").update(patch).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể cập nhật tin tuyển dụng");

  revalidatePath("/tuyen-dung");
  return data as JobPosting;
}

export async function deleteJobPosting(id: string) {
  const { supabase } = await requireContentEditor();
  await supabase.from("job_postings").delete().eq("id", id);
  revalidatePath("/tuyen-dung");
}

export async function uploadJobPostingContentImage(file: File) {
  const { supabase } = await requireContentEditor();
  return uploadSiteImage(supabase, "tuyen-dung-content", file);
}

// ---------------------------------------------------------------------------
// Reviews (Đánh giá khách hàng)
// ---------------------------------------------------------------------------

export async function listReviews() {
  const { supabase } = await requireContentEditor();
  const { data } = await supabase.from("reviews").select("*").order("position", { ascending: true });
  return (data ?? []) as Review[];
}

export async function createReview(input: {
  customerName: string;
  rating: number;
  content: string;
  avatar?: File | null;
}) {
  const { supabase, user } = await requireContentEditor();
  const customerName = input.customerName.trim();
  const content = input.content.trim();
  if (!customerName) throw new Error("Thiếu tên khách hàng");
  if (!content) throw new Error("Thiếu nội dung đánh giá");
  const rating = Math.min(5, Math.max(1, Math.round(input.rating)));

  let avatarUrl: string | null = null;
  if (input.avatar) avatarUrl = await uploadSiteImage(supabase, "reviews", input.avatar);

  const { count } = await supabase.from("reviews").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      customer_name: customerName,
      avatar_url: avatarUrl,
      rating,
      content,
      position: count ?? 0,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo đánh giá");

  revalidatePath("/dich-vu");
  revalidatePath("/quan-tri/danh-gia");
  return data as Review;
}

export async function updateReview(
  id: string,
  input: {
    customerName?: string;
    rating?: number;
    content?: string;
    published?: boolean;
    avatar?: File | null;
  },
) {
  const { supabase } = await requireContentEditor();
  const patch: Partial<Review> = {};
  if (input.customerName !== undefined) patch.customer_name = input.customerName.trim();
  if (input.rating !== undefined) patch.rating = Math.min(5, Math.max(1, Math.round(input.rating)));
  if (input.content !== undefined) patch.content = input.content.trim();
  if (input.published !== undefined) patch.published = input.published;
  if (input.avatar !== undefined) {
    patch.avatar_url = input.avatar ? await uploadSiteImage(supabase, "reviews", input.avatar) : null;
  }

  const { data, error } = await supabase.from("reviews").update(patch).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể cập nhật đánh giá");

  revalidatePath("/dich-vu");
  revalidatePath("/quan-tri/danh-gia");
  return data as Review;
}

export async function deleteReview(id: string) {
  const { supabase } = await requireContentEditor();
  await supabase.from("reviews").delete().eq("id", id);
  revalidatePath("/dich-vu");
  revalidatePath("/quan-tri/danh-gia");
}

// ---------------------------------------------------------------------------
// Site settings (editable header/hero illustrations on public pages)
// ---------------------------------------------------------------------------

export async function setSiteImage(key: string, file: File, revalidate: string[] = []) {
  const { supabase } = await requireContentEditor();
  const url = await uploadSiteImage(supabase, "settings", file);

  const { error } = await supabase.from("site_settings").upsert({ key, value: url });
  if (error) throw new Error("Không thể lưu ảnh");

  for (const path of revalidate) revalidatePath(path);
  return url;
}

async function readSlideList(supabase: Awaited<ReturnType<typeof createClient>>, key: string): Promise<string[]> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// A rotating set of hero images (e.g. the homepage banner slideshow) — stored
// as a JSON array under one site_settings key.
export async function addHeroSlide(key: string, file: File, revalidate: string[] = []) {
  const { supabase } = await requireContentEditor();
  const url = await uploadSiteImage(supabase, "settings", file);
  const slides = [...(await readSlideList(supabase, key)), url];

  const { error } = await supabase.from("site_settings").upsert({ key, value: JSON.stringify(slides) });
  if (error) throw new Error("Không thể lưu ảnh");

  for (const path of revalidate) revalidatePath(path);
  return slides;
}

export async function removeHeroSlide(key: string, url: string, revalidate: string[] = []) {
  const { supabase } = await requireContentEditor();
  const slides = (await readSlideList(supabase, key)).filter((s) => s !== url);

  const { error } = await supabase.from("site_settings").upsert({ key, value: JSON.stringify(slides) });
  if (error) throw new Error("Không thể xoá ảnh");

  for (const path of revalidate) revalidatePath(path);
  return slides;
}

// Generic structured content stored as JSON under one site_settings key —
// used for admin-editable lists (About page timeline, team roster) that
// don't warrant their own database table.
export async function saveJsonSetting(key: string, value: unknown, revalidate: string[] = []) {
  const { supabase } = await requireContentEditor();
  const { error } = await supabase.from("site_settings").upsert({ key, value: JSON.stringify(value) });
  if (error) throw new Error("Không thể lưu");

  for (const path of revalidate) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Contact messages (Tin nhắn khách hàng) — read-only for admin/director
// ---------------------------------------------------------------------------

export async function listContactMessages() {
  const { supabase } = await requireContentEditor();
  const { data } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Staff role management (Nhân sự) — director-only
// ---------------------------------------------------------------------------

export async function listAllProfiles() {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name", { ascending: true });
  return (data ?? []) as Profile[];
}

export async function updateAccessRole(profileId: string, accessRole: AccessRole) {
  const { supabase, user } = await requireDirector();
  if (profileId === user.id && accessRole !== "director") {
    throw new Error("Bạn không thể tự hạ quyền của chính mình.");
  }
  await supabase.from("profiles").update({ access_role: accessRole }).eq("id", profileId);
  revalidatePath("/quan-tri/nhan-su");
}

// Job title (chức danh) is separate from access_role — it's just a label
// shown around the workspace, not a permission level.
export async function updateJobTitle(profileId: string, jobTitle: string) {
  const { supabase } = await requireDirector();
  await supabase
    .from("profiles")
    .update({ role: jobTitle.trim() || null })
    .eq("id", profileId);
  revalidatePath("/quan-tri/nhan-su");
}

// Actual employment start date (drives "Thời gian làm việc" on the Thành
// viên directory) — separate from created_at, which is just when the login
// account was made and can lag behind when someone really joined.
export async function updateJoinedAt(profileId: string, joinedAt: string) {
  const { supabase } = await requireDirector();
  const date = joinedAt.trim();
  if (date && Number.isNaN(Date.parse(date))) {
    throw new Error("Ngày không hợp lệ.");
  }
  await supabase
    .from("profiles")
    .update({ joined_at: date || null })
    .eq("id", profileId);
  revalidatePath("/workspace/thanh-vien");
}

// Bank details for actually paying salary — kept in its own table with its
// own director-only RLS (see staff_bank_info in supabase/schema.sql), never
// selected alongside the plain `profiles.*` fetch every staff member's
// browser gets on the Thành viên page.
export async function listStaffBankInfo(): Promise<StaffBankInfo[]> {
  const { supabase } = await requireDirector();
  const { data } = await supabase.from("staff_bank_info").select("*");
  return (data ?? []) as StaffBankInfo[];
}

// Single-profile lookup — backs the bank-card shown in PayrollEditModal so
// the director can see where to actually send the money right next to the
// amount, without fetching every staff member's bank info just to open one
// person's payslip.
export async function getStaffBankInfo(profileId: string): Promise<StaffBankInfo | null> {
  const { supabase } = await requireDirector();
  const { data } = await supabase.from("staff_bank_info").select("*").eq("profile_id", profileId).maybeSingle();
  return (data as StaffBankInfo) ?? null;
}

export async function upsertStaffBankInfo(
  profileId: string,
  input: { bankName: string; accountNumber: string; accountHolder: string },
): Promise<StaffBankInfo> {
  const { supabase } = await requireDirector();
  const { data, error } = await supabase
    .from("staff_bank_info")
    .upsert(
      {
        profile_id: profileId,
        bank_name: input.bankName.trim() || null,
        account_number: input.accountNumber.trim() || null,
        account_holder: input.accountHolder.trim() || null,
      },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể lưu thông tin ngân hàng.");
  revalidatePath("/workspace/thanh-vien");
  return data as StaffBankInfo;
}

const ALLOWED_QR_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_QR_SIZE = 20 * 1024 * 1024;

// A saved VietQR transfer-code screenshot — lets paying be a literal scan
// instead of retyping the account number. Same storage bucket/pattern as
// meeting message attachments and food shop menu photos.
export async function uploadStaffBankQr(profileId: string, formData: FormData): Promise<StaffBankInfo> {
  const { supabase } = await requireDirector();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu ảnh mã QR.");
  if (!ALLOWED_QR_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WEBP.");
  if (file.size > MAX_QR_SIZE) throw new Error("Ảnh vượt quá 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `bank-qr/${profileId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("task-attachments").upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải ảnh lên");

  const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("staff_bank_info")
    .upsert({ profile_id: profileId, qr_image_url: publicUrlData.publicUrl }, { onConflict: "profile_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu mã QR.");
  revalidatePath("/workspace/thanh-vien");
  return data as StaffBankInfo;
}

// Deletes the Supabase Auth user outright (not just the profile row) — the
// profiles table has `on delete cascade` from auth.users, so this removes
// their login and profile together. Everything they authored elsewhere
// (comments, DMs, task assignments...) is set up in the schema to either
// cascade away with them or fall back to a null "created_by", never block
// the delete.
export async function deleteStaffAccount(profileId: string) {
  const { user } = await requireDirector();
  if (profileId === user.id) {
    throw new Error("Bạn không thể tự xoá tài khoản của chính mình.");
  }

  const adminClient = createAdminClient();

  // auth.admin.deleteUser() cascades away this person's profile,
  // task_attachments, and every chat message they sent or received at the
  // DB level — but that cascade never touches Supabase Storage, so without
  // this pass every file they ever uploaded (avatar, task files, chat
  // attachments) would sit there orphaned forever.
  const [{ data: profile }, { data: attachments }, { data: sentMeeting }, { data: dms }] = await Promise.all([
    adminClient.from("profiles").select("avatar_url").eq("id", profileId).maybeSingle(),
    adminClient.from("task_attachments").select("storage_path").eq("uploaded_by", profileId),
    adminClient.from("meeting_messages").select("attachment_url").eq("sender_id", profileId).not("attachment_url", "is", null),
    adminClient
      .from("direct_messages")
      .select("attachment_url")
      .or(`sender_id.eq.${profileId},recipient_id.eq.${profileId}`)
      .not("attachment_url", "is", null),
  ]);

  const paths = [
    ...(attachments ?? []).map((a) => a.storage_path as string),
    ...(sentMeeting ?? []).map((m) => storagePathFromPublicUrl(m.attachment_url as string, "task-attachments")),
    ...(dms ?? []).map((m) => storagePathFromPublicUrl(m.attachment_url as string, "task-attachments")),
  ].filter((p): p is string => !!p);
  if (profile?.avatar_url) {
    const avatarPath = storagePathFromPublicUrl(profile.avatar_url, "task-attachments");
    if (avatarPath) paths.push(avatarPath);
  }
  if (paths.length > 0) await adminClient.storage.from("task-attachments").remove(paths).catch(() => {});

  const { error } = await adminClient.auth.admin.deleteUser(profileId);
  if (error) throw new Error("Không thể xoá tài khoản. Vui lòng thử lại.");

  revalidatePath("/quan-tri/nhan-su");
  revalidatePath("/workspace/thanh-vien");
}

export async function createStaffAccount(input: {
  displayName: string;
  email: string;
  password: string;
  accessRole: "admin" | "staff";
  jobTitle?: string;
}) {
  const { supabase } = await requireDirector();

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!displayName || !email) throw new Error("Vui lòng nhập đầy đủ tên và email.");
  if (password.length < 6) throw new Error("Mật khẩu cần ít nhất 6 ký tự.");
  if (input.accessRole !== "admin" && input.accessRole !== "staff") {
    throw new Error("Vai trò không hợp lệ.");
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (error || !data.user) {
    throw new Error(
      error?.message.toLowerCase().includes("already")
        ? "Email này đã có tài khoản rồi."
        : "Không thể tạo tài khoản. Vui lòng thử lại.",
    );
  }

  // handle_new_user trigger already inserted the profile row with default
  // access_role 'staff' — update it to the chosen role (and job title).
  const patch: Partial<Profile> = { access_role: input.accessRole };
  if (input.jobTitle?.trim()) patch.role = input.jobTitle.trim();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", data.user.id)
    .select("*")
    .single();

  if (profileError || !profile) throw new Error("Đã tạo tài khoản nhưng không thể gán vai trò, vào Nhân sự để chỉnh lại.");

  let emailSent = false;
  try {
    await sendStaffWelcomeEmail({ to: email, displayName, password });
    emailSent = true;
  } catch {
    // Account creation must succeed even if the welcome email fails to
    // send (e.g. Gmail credentials not configured yet) — the director
    // still sees the password on screen as a fallback.
  }

  revalidatePath("/quan-tri/nhan-su");
  revalidatePath("/workspace/thanh-vien");
  return { profile: profile as Profile, emailSent };
}
