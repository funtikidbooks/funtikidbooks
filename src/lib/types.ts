export type AccessRole = "director" | "admin" | "staff";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string | null;
  phone: string | null;
  address: string | null;
  access_role: AccessRole;
  joined_at: string | null;
  theme: "light" | "dark" | null;
  created_at: string;
};

export type EventCategory = "meeting" | "review" | "workshop" | "deadline" | "client" | "off" | "other";

export type CalendarEvent = {
  id: string;
  title: string;
  note: string | null;
  category: EventCategory;
  start_at: string;
  all_day: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VisitorConversation = {
  id: string;
  visitor_name: string | null;
  status: "open" | "closed";
  unread: boolean;
  created_at: string;
  last_message_at: string;
};

export type VisitorMessage = {
  id: string;
  conversation_id: string;
  sender_type: "visitor" | "staff";
  sender_id: string | null;
  content: string;
  created_at: string;
};

export type FontAsset = {
  id: string;
  name: string;
  storage_path: string;
  file_url: string;
  file_ext: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type BrushCategory = "photoshop" | "procreate" | "clip_studio";

export type BrushAsset = {
  id: string;
  name: string;
  category: BrushCategory;
  storage_path: string;
  file_url: string;
  file_ext: string;
  size_bytes: number | null;
  // A manually-attached stroke-sample image — brush files (.abr/.brushset/
  // .sut) aren't renderable by a browser the way a font file is, so this is
  // the closest equivalent to the live font preview: optional, added after
  // upload via BrushLibrary's own "ảnh mẫu" control.
  preview_url: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachment_url: string | null;
  attachment_filename: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  created_at: string;
  read_at: string | null;
};

// A direct_messages row plus who the OTHER person in that conversation is —
// searchDirectMessages() spans every conversation the searcher has, and the
// searcher could be either sender_id or recipient_id on any given row, so
// results need this resolved rather than making the UI figure it out.
export type DirectMessageSearchResult = DirectMessage & {
  peer_id: string;
};

export type DmRead = {
  user_id: string;
  peer_id: string;
  last_read_at: string;
};

export type MeetingChannel = {
  id: string;
  name: string;
  icon: string;
  is_general: boolean;
  password_hash: string | null;
  created_by: string | null;
  created_at: string;
  parent_channel_id: string | null;
};

// What the client actually receives for a channel — password_hash is never
// sent to the browser, replaced with a plain has_password flag instead.
export type MeetingChannelPublic = Omit<MeetingChannel, "password_hash"> & {
  has_password: boolean;
  joined: boolean;
  // True until this member opens the room for the first time — see
  // meeting_channel_members.seen_at. Always false for "Chung", which every
  // staff member is implicitly in rather than explicitly invited to.
  is_new: boolean;
};

export type MeetingChannelMember = {
  channel_id: string;
  profile_id: string;
  joined_at: string;
  seen_at: string | null;
};

export type MeetingReaction = {
  message_id: string;
  profile_id: string;
  emoji: string;
  created_at: string;
};

export type DirectMessageReaction = {
  message_id: string;
  profile_id: string;
  emoji: string;
  created_at: string;
};

export type MeetingChannelRead = {
  channel_id: string;
  profile_id: string;
  last_read_message_id: string | null;
  updated_at: string;
};

export type WorkspaceRoomLabel = {
  key: string;
  label: string;
  updated_at: string;
};

export type MeetingMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  attachment_filename: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  reply_to_message_id: string | null;
  is_recalled: boolean;
  pinned_at: string | null;
  pinned_by: string | null;
  created_at: string;
};

// A meeting_messages row plus which room it came from — searchMeetingMessages()
// spans every room the searcher is in, so results need to say where each
// one is, since they don't all belong to whatever room is currently open.
export type MeetingSearchResult = MeetingMessage & {
  channel_name: string;
  channel_icon: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type Project = {
  id: string;
  title: string;
  title_en: string | null;
  tag: string;
  description: string | null;
  description_en: string | null;
  content: string | null;
  content_en: string | null;
  cover_image_url: string | null;
  gallery_images: string[];
  published: boolean;
  position: number;
  view_count: number;
  like_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsPost = {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  category: string;
  excerpt: string | null;
  excerpt_en: string | null;
  content: string | null;
  content_en: string | null;
  cover_image_url: string | null;
  gallery_images: string[];
  published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Review = {
  id: string;
  customer_name: string;
  avatar_url: string | null;
  rating: number;
  content: string;
  published: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceEntry = {
  id: string;
  profile_id: string;
  work_date: string;
  check_in_at: string | null;
  status: "present" | "absent" | "leave";
  note: string | null;
  created_at: string;
};

export type PayrollItem = {
  label: string;
  amount: number; // positive = allowance/bonus, negative = deduction
};

export type PayrollStatus = "draft" | "paid";

export type PayrollRecord = {
  id: string;
  profile_id: string;
  month: string; // always the 1st of the month, e.g. "2026-08-01"
  base_salary: number;
  items: PayrollItem[];
  note: string | null;
  status: PayrollStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffSalary = {
  profile_id: string;
  monthly_salary: number;
  standard_work_days: number;
  updated_at: string;
};

export type FinanceEntryType = "revenue" | "fixed_cost" | "variable_cost";

export type FinanceEntry = {
  id: string;
  entry_month: string; // always the 1st of the month, e.g. "2026-08-01"
  type: FinanceEntryType;
  category: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PageType = "single" | "double";

export type InvoiceItem = {
  description: string;
  quantity: number;
  // Optional so invoices created before this field existed still render —
  // treated as "single" wherever it's missing.
  page_type?: PageType;
  unit_price: number;
};

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export type Invoice = {
  id: string;
  invoice_number: string;
  client_name: string;
  client_address: string | null;
  client_tax_code: string | null;
  client_email: string | null;
  issue_date: string;
  due_date: string | null;
  items: InvoiceItem[];
  tax_rate: number;
  note: string | null;
  status: InvoiceStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Board = {
  id: string;
  title: string;
  color: string;
  created_by: string | null;
  created_at: string;
};

export type BoardColumn = {
  id: string;
  board_id: string;
  title: string;
  color: string;
  position: number;
  created_at: string;
};

export type BoardLabel = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
};

export type Task = {
  id: string;
  board_id: string;
  column_id: string;
  code: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  position: number;
  cover_image_url: string | null;
  labels: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskWithAssignee = Task & {
  assignee: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  assignees: Pick<Profile, "id" | "display_name" | "avatar_url">[];
  checklist_items?: Pick<ChecklistItem, "id" | "done">[];
  comment_count?: { count: number }[];
  attachment_count?: { count: number }[];
};

export type TaskAssigneeRow = {
  task_id: string;
  profile_id: string;
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  task_id: string;
  text: string;
  done: boolean;
  position: number;
  created_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  comment_id: string | null;
  uploaded_by: string;
  url: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  attachments: TaskAttachment[];
};

export type TaskLink = {
  id: string;
  task_id: string;
  label: string;
  url: string;
  created_by: string | null;
  created_at: string;
};

export type TaskActivityType = "created" | "moved" | "assigned" | "attached" | "link_added";

export type TaskActivity = {
  id: string;
  task_id: string;
  actor_id: string | null;
  type: TaskActivityType;
  metadata: Record<string, string>;
  created_at: string;
  actor: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
};

export type TaskDetail = TaskWithAssignee & {
  checklist_items: ChecklistItem[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  links: TaskLink[];
  activity: TaskActivity[];
};

export type EditorLayerBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorTextLayer = EditorLayerBase & {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
  // Tham chiếu tới FontAsset.id trong Kho font — null/không tìm thấy thì
  // dùng font mặc định của hệ thống.
  fontId: string | null;
};

export type EditorImageLayer = EditorLayerBase & {
  type: "image";
  src: string;
};

// Thứ tự phần tử trong mảng chính là thứ tự chồng lớp (phần tử cuối nằm trên
// cùng) — không cần trường zIndex riêng.
export type EditorLayer = EditorTextLayer | EditorImageLayer;

export type EditorProject = {
  id: string;
  name: string;
  background_url: string | null;
  background_width: number;
  background_height: number;
  layers: EditorLayer[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PricingTier = {
  id: string;
  name: string;
  nameEn?: string | null;
  priceVnd: number | null;
  priceUsd: number | null;
  delivery: string;
  deliveryEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  // Highlighted as the standout/VIP option — e.g. a B2B tier the director
  // wants to draw extra attention to.
  featured?: boolean;
};

export type PricingFeatureRow = {
  id: string;
  label: string;
  labelEn?: string | null;
  // One value per tier, in the same order as `tiers` — "-" for "not
  // included", "✓" for a plain checkmark, or free text (e.g. "2 lượt").
  values: string[];
};

export type PricingTable = {
  tiers: PricingTier[];
  rows: PricingFeatureRow[];
};

export type SiteSetting = {
  key: string;
  value: string;
  updated_at: string;
};

export type ContactMessage = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  project_type: string | null;
  message: string;
  created_at: string;
};

// Hand-authored table typing for @supabase/supabase-js — not generated via
// the Supabase CLI (no project access yet). Keep in sync with supabase/schema.sql.
// Each table needs Row/Insert/Update/Relationships to satisfy supabase-js's
// GenericTable constraint, and the schema needs Views/Functions even if empty.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string; display_name: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      boards: {
        Row: Board;
        Insert: Partial<Board> & { title: string };
        Update: Partial<Board>;
        Relationships: [];
      };
      board_columns: {
        Row: BoardColumn;
        Insert: Partial<BoardColumn> & { board_id: string; title: string };
        Update: Partial<BoardColumn>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & { board_id: string; column_id: string; title: string };
        Update: Partial<Task>;
        Relationships: [];
      };
      board_labels: {
        Row: BoardLabel;
        Insert: Partial<BoardLabel> & { board_id: string };
        Update: Partial<BoardLabel>;
        Relationships: [];
      };
      contact_messages: {
        Row: ContactMessage;
        Insert: Partial<ContactMessage> & { full_name: string; email: string; message: string };
        Update: Partial<ContactMessage>;
        Relationships: [];
      };
      direct_messages: {
        Row: DirectMessage;
        Insert: Partial<DirectMessage> & { sender_id: string; recipient_id: string };
        Update: Partial<DirectMessage>;
        Relationships: [];
      };
      direct_message_reactions: {
        Row: DirectMessageReaction;
        Insert: { message_id: string; profile_id: string; emoji: string };
        Update: Partial<DirectMessageReaction>;
        Relationships: [];
      };
      dm_reads: {
        Row: DmRead;
        Insert: Partial<DmRead> & { user_id: string; peer_id: string };
        Update: Partial<DmRead>;
        Relationships: [];
      };
      meeting_channels: {
        Row: MeetingChannel;
        Insert: Partial<MeetingChannel> & { name: string };
        Update: Partial<MeetingChannel>;
        Relationships: [];
      };
      meeting_channel_members: {
        Row: MeetingChannelMember;
        Insert: { channel_id: string; profile_id: string };
        Update: Partial<MeetingChannelMember>;
        Relationships: [];
      };
      meeting_messages: {
        Row: MeetingMessage;
        Insert: Partial<MeetingMessage> & { channel_id: string; sender_id: string };
        Update: Partial<MeetingMessage>;
        Relationships: [];
      };
      meeting_message_reactions: {
        Row: MeetingReaction;
        Insert: { message_id: string; profile_id: string; emoji: string };
        Update: Partial<MeetingReaction>;
        Relationships: [];
      };
      meeting_channel_reads: {
        Row: MeetingChannelRead;
        Insert: Partial<MeetingChannelRead> & { channel_id: string; profile_id: string };
        Update: Partial<MeetingChannelRead>;
        Relationships: [];
      };
      workspace_room_labels: {
        Row: WorkspaceRoomLabel;
        Insert: Partial<WorkspaceRoomLabel> & { key: string; label: string };
        Update: Partial<WorkspaceRoomLabel>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: Partial<Invoice> & { invoice_number: string; client_name: string };
        Update: Partial<Invoice>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Partial<PushSubscriptionRow> & { user_id: string; endpoint: string; p256dh: string; auth: string };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      task_assignees: {
        Row: TaskAssigneeRow;
        Insert: { task_id: string; profile_id: string };
        Update: Partial<TaskAssigneeRow>;
        Relationships: [];
      };
      task_checklist_items: {
        Row: ChecklistItem;
        Insert: Partial<ChecklistItem> & { task_id: string; text: string };
        Update: Partial<ChecklistItem>;
        Relationships: [];
      };
      task_comments: {
        Row: Omit<TaskComment, "author" | "attachments">;
        Insert: { task_id: string; user_id: string; content?: string };
        Update: Partial<Omit<TaskComment, "author" | "attachments">>;
        Relationships: [];
      };
      task_attachments: {
        Row: TaskAttachment;
        Insert: Partial<TaskAttachment> & {
          task_id: string;
          uploaded_by: string;
          url: string;
          storage_path: string;
          filename: string;
          mime_type: string;
          size: number;
        };
        Update: Partial<TaskAttachment>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Partial<Project> & { title: string; tag: string };
        Update: Partial<Project>;
        Relationships: [];
      };
      news_posts: {
        Row: NewsPost;
        Insert: Partial<NewsPost> & { title: string };
        Update: Partial<NewsPost>;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Partial<Review> & { customer_name: string; content: string };
        Update: Partial<Review>;
        Relationships: [];
      };
      attendance: {
        Row: AttendanceEntry;
        Insert: Partial<AttendanceEntry> & { profile_id: string; work_date: string };
        Update: Partial<AttendanceEntry>;
        Relationships: [];
      };
      payroll_records: {
        Row: PayrollRecord;
        Insert: Partial<PayrollRecord> & { profile_id: string; month: string };
        Update: Partial<PayrollRecord>;
        Relationships: [];
      };
      staff_salary: {
        Row: StaffSalary;
        Insert: Partial<StaffSalary> & { profile_id: string };
        Update: Partial<StaffSalary>;
        Relationships: [];
      };
      finance_entries: {
        Row: FinanceEntry;
        Insert: Partial<FinanceEntry> & { entry_month: string; type: FinanceEntryType; category: string };
        Update: Partial<FinanceEntry>;
        Relationships: [];
      };
      site_settings: {
        Row: SiteSetting;
        Insert: Partial<SiteSetting> & { key: string; value: string };
        Update: Partial<SiteSetting>;
        Relationships: [];
      };
      task_links: {
        Row: TaskLink;
        Insert: Partial<TaskLink> & { task_id: string; label: string; url: string };
        Update: Partial<TaskLink>;
        Relationships: [];
      };
      task_activity: {
        Row: Omit<TaskActivity, "actor">;
        Insert: { task_id: string; actor_id?: string | null; type: TaskActivityType; metadata?: Record<string, string> };
        Update: Partial<Omit<TaskActivity, "actor">>;
        Relationships: [];
      };
      fonts: {
        Row: FontAsset;
        Insert: Partial<FontAsset> & { name: string; storage_path: string; file_url: string; file_ext: string };
        Update: Partial<FontAsset>;
        Relationships: [];
      };
      brushes: {
        Row: BrushAsset;
        Insert: Partial<BrushAsset> & { name: string; storage_path: string; file_url: string; file_ext: string };
        Update: Partial<BrushAsset>;
        Relationships: [];
      };
      editor_projects: {
        Row: EditorProject;
        Insert: Partial<EditorProject> & { name: string };
        Update: Partial<EditorProject>;
        Relationships: [];
      };
      calendar_events: {
        Row: CalendarEvent;
        Insert: Partial<CalendarEvent> & { title: string; start_at: string };
        Update: Partial<CalendarEvent>;
        Relationships: [];
      };
      visitor_conversations: {
        Row: VisitorConversation & { visitor_token: string };
        Insert: Partial<VisitorConversation & { visitor_token: string }>;
        Update: Partial<VisitorConversation & { visitor_token: string }>;
        Relationships: [];
      };
      visitor_messages: {
        Row: VisitorMessage;
        Insert: Partial<VisitorMessage> & { conversation_id: string; sender_type: string; content: string };
        Update: Partial<VisitorMessage>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_project_view: {
        Args: { project_id: string };
        Returns: undefined;
      };
      set_project_like: {
        Args: { project_id: string; liked: boolean };
        Returns: number;
      };
    };
  };
};
