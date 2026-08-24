import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { WorkspaceBoard } from "@/components/workspace/Board";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import type { Board, BoardColumn, Profile, TaskWithAssignee } from "@/lib/types";

export const metadata: Metadata = { title: "Xem thử — Bảng công việc" };

const now = new Date().toISOString();

const PROFILES: Profile[] = [
  { id: "demo-linh", email: "linh@funtikidbooks.com", display_name: "Linh", avatar_url: null, role: "2D Illustrator", phone: null, address: null, access_role: "staff", created_at: now },
  { id: "demo-an", email: "an@funtikidbooks.com", display_name: "An", avatar_url: null, role: "Art Lead", phone: null, address: null, access_role: "staff", created_at: now },
  { id: "demo-nam", email: "nam@funtikidbooks.com", display_name: "Nam", avatar_url: null, role: "2D Illustrator", phone: null, address: null, access_role: "staff", created_at: now },
  { id: "demo-minh", email: "minh@funtikidbooks.com", display_name: "Minh", avatar_url: null, role: "Project Manager", phone: null, address: null, access_role: "staff", created_at: now },
  { id: "demo-ha", email: "ha@funtikidbooks.com", display_name: "Hà", avatar_url: null, role: "3D Artist", phone: null, address: null, access_role: "staff", created_at: now },
];

const BOARD: Board = {
  id: "demo-board",
  title: "Miền Dâu Dại – Book 01",
  color: "#FF7A3D",
  created_by: null,
  created_at: now,
};

const COLUMNS: BoardColumn[] = [
  { id: "demo-col-idea", board_id: BOARD.id, title: "Ý tưởng", color: "#78776F", position: 0, created_at: now },
  { id: "demo-col-todo", board_id: BOARD.id, title: "Cần làm", color: "#4F80D9", position: 1, created_at: now },
  { id: "demo-col-doing", board_id: BOARD.id, title: "Đang làm", color: "#D6A400", position: 2, created_at: now },
  { id: "demo-col-review", board_id: BOARD.id, title: "Đánh giá", color: "#FF7A3D", position: 3, created_at: now },
  { id: "demo-col-done", board_id: BOARD.id, title: "Hoàn thành", color: "#3F9E52", position: 4, created_at: now },
];

function task(
  id: string,
  column_id: string,
  code: string,
  title: string,
  assignee: Profile | null,
  start_date: string,
  due_date: string,
  progress: number,
  position: number,
  cover_image_url: string | null = null,
  labels: string[] = [],
): TaskWithAssignee {
  return {
    id,
    board_id: BOARD.id,
    column_id,
    code,
    title,
    description: null,
    assignee_id: assignee?.id ?? null,
    assignee,
    assignees: assignee ? [assignee] : [],
    start_date,
    due_date,
    progress,
    position,
    cover_image_url,
    labels,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
}

const [linh, an, nam, minh] = PROFILES;

const TASKS: TaskWithAssignee[] = [
  task("t1", "demo-col-idea", "#032", "Concept nhân vật Chú gấu nhỏ", linh, "2026-08-20", "2026-08-28", 20, 0),
  task("t2", "demo-col-idea", "#033", "Bối cảnh rừng phác thảo", nam, "2026-08-21", "2026-08-30", 10, 1),
  task("t3", "demo-col-todo", "#034", "Layout trang 01", an, "2026-08-19", "2026-08-24", 0, 0),
  task("t4", "demo-col-todo", "#035", "Thumbnail chapter 1", linh, "2026-08-18", "2026-08-26", 0, 1),
  task("t5", "demo-col-doing", "#036", "Minh hoạ trang 05 (Chú gấu nhỏ)", an, "2026-08-18", "2026-08-23", 55, 0),
  task("t6", "demo-col-doing", "#037", "Minh hoạ trang 06 (Khu rừng mùa hè)", linh, "2026-08-15", "2026-08-31", 40, 1),
  task("t7", "demo-col-review", "#038", "Cover bản nháp 02", nam, "2026-08-14", "2026-08-22", 80, 0, "/brand/funti-team.jpg"),
  task("t8", "demo-col-done", "#030", "Cover bản nháp 01", minh, "2026-08-05", "2026-08-12", 100, 0, "/brand/funti-logo.jpg"),
];

export default function WorkspaceDemoPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--color-bg)" }}>
      <div
        className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold"
        style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}
      >
        <span>👀 Đây là bản xem thử với dữ liệu mẫu — mọi thay đổi chỉ hiện tạm trên trình duyệt, sẽ không được lưu.</span>
        <Link href="/dang-nhap" className="underline font-bold">
          Tạo tài khoản thật để lưu dữ liệu →
        </Link>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside
          className="w-[220px] flex-none hidden md:flex flex-col gap-6 px-3.5 py-5"
          style={{ background: "var(--color-bg)", borderRight: "1px solid var(--color-neutral-200)" }}
        >
          <Link href="/" className="flex items-center gap-2 px-1">
            <Image
              src="/brand/funti-logo.jpg"
              alt="Funti Kidbooks Studio"
              width={34}
              height={34}
              className="rounded-full object-cover flex-none"
            />
            <span className="font-heading font-bold text-sm">Funti Kidbooks</span>
          </Link>

          <div className="flex flex-col gap-1">
            <div
              className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1"
              style={{ color: "var(--color-neutral-500)" }}
            >
              KHÔNG GIAN LÀM VIỆC
            </div>
            <div
              className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-bold"
              style={{ background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
            >
              📊 Bảng công việc
            </div>
            {[
              { icon: "📁", label: "Dự án" },
              { icon: "👥", label: "Thành viên" },
              { icon: "📅", label: "Lịch" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
                style={{ color: "var(--color-neutral-400)" }}
              >
                {item.icon} {item.label}
                <span className="ml-auto text-[9px] tag tag-neutral">SẮP RA MẮT</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1 mt-2">
            <div
              className="text-[11px] font-bold tracking-[0.08em] px-2 mb-1"
              style={{ color: "var(--color-neutral-500)" }}
            >
              THÀNH VIÊN FUNTI
            </div>
            {PROFILES.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px] font-semibold">
                <span
                  className="flex items-center justify-center rounded-full text-[10px] font-bold flex-none"
                  style={{ width: 22, height: 22, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                >
                  {p.display_name.charAt(0)}
                </span>
                {p.display_name}
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-1">
            <ThemeToggle />
            <Link
              href="/"
              className="flex items-center gap-2 px-2 py-2 rounded-[8px] text-[13px] font-semibold"
              style={{ color: "var(--color-neutral-600)" }}
            >
              ↩ Thoát bản xem thử
            </Link>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <WorkspaceBoard
            board={BOARD}
            initialColumns={COLUMNS}
            initialTasks={TASKS}
            profiles={PROFILES}
            currentUserId={PROFILES[0].id}
          />
        </div>
      </div>
    </div>
  );
}
