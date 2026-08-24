# Funti Kidbooks Studio — Website

Website chính thức của Funti Kidbooks Studio: trang marketing (giới thiệu, dịch vụ, quy trình,
dự án, tin tức, liên hệ) và không gian làm việc nội bộ dành cho nhân viên — đăng nhập nhiều tài
khoản, bảng công việc kiểu Trello (Kanban), kéo-thả thẻ công việc.

Xây dựng dựa trên bản thiết kế trong `design-reference/` (Claude Design), triển khai lại bằng
Next.js + Supabase theo đúng codebase thật (không dùng file `.dc.html` trong sản phẩm).

## Công nghệ

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind CSS v4)
- **Supabase**: xác thực (nhiều tài khoản), Postgres database, Row Level Security
- **dnd-kit**: kéo-thả thẻ công việc trên bảng Kanban

## Thiết lập lần đầu

### 1. Cài dependencies

```bash
npm install
```

### 2. Tạo dự án Supabase

Bạn cần tự tạo tài khoản/dự án tại [supabase.com](https://supabase.com) (miễn phí ở mức nhỏ) —
đây là bước cần làm thủ công vì lý do bảo mật tài khoản.

1. Tạo project mới trên Supabase.
2. Vào **SQL Editor** → **New query**, dán toàn bộ nội dung file [`supabase/schema.sql`](supabase/schema.sql)
   và chạy. File này tạo các bảng `profiles`, `boards`, `board_columns`, `tasks`,
   `contact_messages`, `task_checklist_items`, `task_comments`, `task_attachments`, bucket Storage
   `task-attachments` (ảnh đính kèm/bình luận), cùng Row Level Security và trigger tự tạo hồ sơ khi
   có người đăng ký. File này idempotent — nếu project Supabase đã tồn tại từ trước, chạy lại toàn
   bộ file để bổ sung các bảng/bucket mới mà không ảnh hưởng dữ liệu cũ.
3. Vào **Project Settings → API**, lấy `Project URL` và `anon public` key.
4. Copy `.env.local.example` thành `.env.local` và điền hai giá trị trên:

   ```bash
   cp .env.local.example .env.local
   ```

5. (Khuyến nghị) Trong **Authentication → Sign In / Providers**, nếu muốn thành viên đăng nhập
   được ngay mà không cần xác nhận email, tắt "Confirm email" — phù hợp với một công cụ nội bộ
   nhỏ. Nếu để bật, người dùng mới cần bấm link xác nhận trong email trước khi đăng nhập được.

### 3. Chạy dev server

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Cấu trúc dự án

```
src/app/(site)/        trang marketing công khai (Header/Footer chung)
src/app/dang-nhap/      trang đăng nhập / đăng ký (nhiều tài khoản qua Supabase Auth)
src/app/workspace/      không gian làm việc nội bộ — cần đăng nhập (proxy.ts chặn truy cập)
src/components/site/    Header, Footer, các khối marketing dùng lại
src/components/workspace/  Sidebar, Board (Kanban), Column, TaskCard, các modal, ChecklistSection,
                        TaskAttachments, TaskCommentChat (trò chuyện theo thẻ)
src/lib/supabase/       Supabase client (browser + server) và middleware refresh session
src/lib/actions/        Server Actions: auth, contact form, thao tác board/task, checklist/bình
                        luận/đính kèm (task-detail.ts)
src/lib/data/board.ts   truy vấn dữ liệu board phía server
supabase/schema.sql     toàn bộ schema + RLS cho Supabase
design-reference/       bản thiết kế gốc (Claude Design) — chỉ để tham khảo, không dùng trong build
```

## Trạng thái hiện tại (Giai đoạn 1)

- [x] Trang marketing: Trang chủ, Giới thiệu, Dịch vụ, Quy trình, Dự án, Tin tức, Liên hệ
- [x] Form liên hệ lưu vào Supabase (bảng `contact_messages`)
- [x] Đăng ký / đăng nhập nhiều tài khoản (Supabase Auth)
- [x] Bảng Kanban cơ bản: cột mặc định, thêm cột, thêm/sửa/xoá thẻ công việc, kéo-thả giữa các cột,
      gán người phụ trách, hạn chót, tiến độ

## Giai đoạn 2 — chi tiết thẻ công việc

- [x] Checklist (việc cần làm) trong mỗi thẻ, có thanh tiến độ riêng
- [x] Trò chuyện / bình luận theo thẻ (tự cập nhật mỗi 4 giây)
- [x] Đính kèm ảnh thật (trên thẻ và trong bình luận) — lưu ở Supabase Storage, bucket `task-attachments`
- [ ] Nhãn màu (labels) cho thẻ công việc
- [ ] Trò chuyện 1:1 giữa các thành viên
- [ ] Lịch nhóm (thêm ghi chú theo ngày)
- [ ] Trang "Thành viên" (danh bạ nhân viên) và trang "Dự án" (nhiều board)
- [ ] Chỉnh sửa hồ sơ cá nhân (ảnh đại diện, tên hiển thị)
- [ ] Chuyển đổi song ngữ Việt/Anh (toggle VI/EN)

## Ghi chú bảo mật

Đây là công cụ nội bộ cho một studio nhỏ: mọi tài khoản đã đăng nhập đều có quyền xem/sửa toàn bộ
bảng công việc (xem chính sách RLS trong `supabase/schema.sql`). Nếu sau này cần phân quyền theo
từng dự án/vai trò, cần thắt chặt lại các policy này.
