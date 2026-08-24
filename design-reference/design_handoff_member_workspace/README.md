# Handoff: Funti Kidbooks — Member Workspace (Kanban Task Board)

## Overview
A Trello-style task management workspace for Funti Kidbooks Studio staff: login, Kanban board with drag-and-drop tasks, task detail panel (labels, checklist, comments, image attachments), team directory with 1:1 chat, calendar, and a projects list. This sits behind login inside the marketing site "Funtikidbooks Website.dc.html", reached via the "Thành viên" (Members) link in the header.

## About the Design Files
The files in this bundle are **design references built in HTML** (Design Components using a proprietary internal templating syntax — `<sc-for>`, `<sc-if>`, `{{ }}` bindings, `<image-slot>` placeholders). They are prototypes showing intended look, layout, and interaction — **not production code to copy directly**. The task is to **recreate this design in the target codebase's real environment** (React, Vue, native, etc. — whichever the project already uses, or the best modern choice if none exists yet), using that codebase's own component/state patterns, real auth, and a real backend/database in place of the mocked in-memory state used here.

## Fidelity
**High-fidelity for layout, spacing, and visual style** (colors, type, card shapes, iconography all follow the bound "Organic" design system — see Design Tokens below). **Low/mock-fidelity for data and backend behavior** — all data (tasks, comments, members, calendar events) is hardcoded/in-memory in the prototype's JS state and resets on reload. Every piece of "backend" behavior (auth, persistence, real-time updates, notifications) needs real implementation.

## Screens / Views

### 1. Login / Signup modal
- Centered modal over a blurred dark backdrop (`rgba(20,18,17,.7)`, `backdrop-filter: blur(4px)`).
- Card: white/cream background, `border-radius: var(--radius-lg)`, `padding: 32px`, max-width ~380px.
- Fields: Email (type=email, placeholder `name@funtikidbooks.com`), Password (type=password, dots placeholder). Enter key or button submits.
- Primary button `Đăng nhập` (Login), full width, pill/rounded per design system.
- Secondary link to switch to Signup; Signup modal has the same shape plus a Display Name field.
- Close (✕) icon top-right, hover turns accent orange, click closes and returns to prior page.
- On submit: derives a display name from the email's local-part (before `@`), capitalizes each word, stores as the session user's name; falls back to a placeholder "Phúc Trần" if the field was left blank in the prototype. **Replace with real auth (email+password, magic link, or SSO) and pull the real display name from the account record.**

### 2. Workspace shell (after login)
Two-column layout: fixed-width left sidebar (~220px) + flexible main content.

**Sidebar** (background `var(--color-bg)`, right border `1px solid var(--color-neutral-200)`, padding `20px 14px`):
- Workspace label "KHÔNG GIAN LÀM VIỆC" (WORKSPACE)
- Nav items, each a row `display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;font:600 13px`: 📊 Overview (Tổng quan), 📁 Projects (Dự án), 👥 Members (Thành viên), 📅 Calendar (Lịch). Active item gets `background: var(--color-accent-100); color: var(--color-accent-700); font-weight:700`.
- "MY PROJECTS" section listing named projects with a colored dot (5 sample projects, each own accent color).
- Bottom: Logout row (↩ icon + label), pinned via `margin-top:auto`.

**Main content header bar** (own project header, shown only on the Kanban view): transparent background, dark text; shows current board's title (e.g. "Miền Dâu Dại – Book 01") + a dropdown chevron, and on the right: a row of overlapping circular member avatars (max 4 shown, then a "+N" chip), plus utility icons (⚡ ≡ ★ 👤 ⋯).

### 3. Kanban board (default view)
- Row of columns, horizontally scrollable, each column ~250px wide, `background: var(--color-bg)`, `border-radius: var(--radius-md)`, `padding: 12px`, `max-height: 640px`.
- Column header: editable title (contentEditable span, save on blur) + colored accent text (per-column color) + a task-count pill (`.tag.tag-neutral`).
- Default columns: Ý TƯỞNG/IDEA (neutral gray), TODO (sage), ĐANG LÀM/WORKING (yellow #D6A400), ĐÁNH GIÁ/REVIEW (orange accent), DONE (green #3F9E52).
- "+ Thêm cột" (add column) button at the end of the row, dashed border, fills in a new custom column.
- Task cards: `.card.elev-sm`, `border-radius: 8px`, padding 10px, vertical stack of: cover image (image-slot, 90px tall) with a full-card invisible drag handle overlay, task code (`#032` style, 11px gray), title (13px bold heading font), assignee + due date row (11px gray, icons 👤 and plain date text), and a thin progress bar (`height:4px`, filled proportionally in the column's accent color).
- Card interactions:
  - **Click** anywhere on the card body → opens the Task Detail panel (see below).
  - **Drag and drop**: native HTML5 drag (`draggable`, `onDragStart/onDragEnd` on the image/handle, `onDragOver/onDrop` on the column container) to move a card between columns. Dragging card is hidden in place (`display:none`) while a ghost image follows the cursor; dropping re-parents the task to the target column.
  - Hover: card lifts slightly (scale/shadow transition ~0.18s) — CSS `transition: transform, box-shadow, filter 0.18s ease`.
- "+ Thêm công việc" / hover-fade button at the bottom of a column's task list opens the **Add Task modal** for that column.
- Stat row above the board: ✅ doneCount/totalCount "hoàn thành" (complete) — computed live as the count of cards currently in the DONE column vs. total cards; 👥 members count; 🕐 last-updated text.

### 4. Add Task modal
- Full modal, ~95vw / max 1500px wide, 88vh tall, `border-radius: var(--radius-lg)`, backdrop blurred dark overlay.
- Top: 130px cover strip (image-slot) with a "column name" pill top-left and a ✕ close top-right.
- Two-pane body below the cover:
  - **Left (wider) pane**: borderless large title input; a row of quick-action pill buttons (🏷 Nhãn/Labels, 🕐 Ngày/Dates, ☑ Việc cần làm/Checklist, 👤 Thành viên/Members — the Members pill opens a popover member-picker with checkmarks for multi-select, and shows a stack of selected-member avatars to its right, max 5 then "+N" overflow with a click-to-expand "all members" popover); assignee text field; due-date field; description textarea; Save button; a red "🗑 Xoá thẻ công việc này" (Delete this card) text action.
  - **Right pane**: "💬 Nhận xét và hoạt động" (Comments & activity) — scrollable list of comment rows (avatar + name + text), a disabled input placeholder for now (wire to the same comment system as the task detail panel below).
- Save creates a new card in the target column using the entered fields; card gets a random `#0NN` code.

### 5. Task Detail panel (click an existing card)
- Slide-in panel from the right, ~95vw/max 1500px wide, 88vh tall (matches Add Task modal sizing), slide/opacity transition in (~0.3s cubic-bezier) and reverse-slide-out on close (~0.28s).
- Top cover section (130px): image-slot cover, hover reveals a "Xoá ảnh bìa" (Remove cover) pill bottom-right that hides the image; top-left a "Bản chính thức 2026 / Draft ⌵" pill that opens a **Move Card** popover (tabs "Hộp thư đến"/Inbox and "Bảng thông tin"/Board — active tab gets a rounded orange border; Board tab shows Board/List/Position fields (currently read-only stand-ins) and a "Di chuyển"/Move button); top-right a row of 3 circular icon buttons (🖼, ⋯, ✕ close).
- Body, two columns:
  - **Left**: task code, title (22px bold heading), row of colored label chips (each removable via ✕, colors: red #C0524F "Gấp/Urgent", orange accent "Ưu tiên/Priority", green #3F9E52 "Sẵn sàng/Ready", blue #4F80D9 "Đang duyệt/In review") plus a dashed "+" to open a label picker popover; assignee, due date, and a progress bar (5px, orange fill by %); a description block with the task's text and an attached illustration image; a **Checklist** block — title with live "done/total" fraction, a thin progress bar, list of checkbox items (checked items get strikethrough+gray), remove (✕) per item, and an add-new-item input + Add button (Enter key also submits).
  - **Right**: comments/activity feed — each comment shows a small circular avatar (real avatar image for the logged-in user, initials-in-a-circle for others), name, and either text or an attached image (image opens a full lightbox with click-to-zoom-at-point and drag-to-pan when zoomed); a comment composer at the bottom with a 📎 attach-image button, text input (Enter to send), and a send (➤) button.

### 6. Members / Team directory
- Grid or list of Funti staff: each row/card shows avatar, name, role. Online members (currently logged-in accounts) are visually brighter/sorted to the top; offline members are dimmed/grayed and sorted below.
- Hovering a member's phone/email icon reveals that value as a tooltip pulled from their profile (empty if not set).
- Clicking a member (other than yourself) opens a **1:1 chat popup** anchored bottom-right, Messenger-style: message list, "typing…" indicator with animated ellipsis, image attach + lightbox (same zoom/pan behavior as task comments), Enter-to-send.
- Clicking yourself opens the **Edit Profile** modal (see below) instead of a chat with yourself.
- "+ Thêm thành viên" (Add member) opens a form to add a new staff record, including a role `<select>`-style custom dropdown (2D Illustrator, Art Lead, Project Manager, Team Manager) styled to match the design system with a smooth open/close animation and hover highlight per option.

### 7. Edit Profile modal
- Small centered modal: avatar image-slot (upload to change), display-name text field, Save button (Enter key also submits). Saving updates the display name and avatar everywhere it's shown across the workspace (header, member list, comments, chat).

### 8. Calendar view
- Month grid (7-column week header + weeks grid), prev/next month navigation, current-day cell highlighted with an accent outline ring.
- Empty by default — cells are click-to-add: hovering an empty day reveals an inline "+" affordance; clicking opens a small "add note" popover/modal to type a short event label, which then renders as a colored pill inside that day cell (multiple notes per day stack and the day scrolls internally if it overflows).
- Clicking an existing note reopens it for editing, with a delete (–) affordance.
- Right rail: "Lịch hôm nay" (Today's schedule) card listing any notes on the current day.

### 9. Projects list (within the workspace, separate from the public site's "Dự án" page)
- Filter chips across the top: Tất cả dự án (All), Đang thực hiện (Active), Sắp bắt đầu (Not started), Tạm dừng (Paused), Hoàn thành (Done), Lưu trữ (Archived) — active filter pill filled accent color.
- Grid of project cards: colored status dot + title, subtitle, cover image with an optional status badge overlay (top-right), a progress bar, a stack of member avatars (+N overflow), and a footer row with task count and start/end date range.
- Search input + "+ Thêm dự án" (Add project) button top-right.

## Interactions & Behavior (cross-cutting)
- **Bilingual (VI/EN) toggle**: every string in the workspace has a Vietnamese and English variant driven by a single `lang` state flag; all copy above is written as "Vietnamese (English)" pairs — implement as a standard i18n table, not hardcoded strings.
- **Drag and drop** for Kanban cards uses native HTML5 DnD; recreate with your framework's DnD library of choice (`dnd-kit`, `react-beautiful-dnd`/`@hello-pangea/dnd`, etc.) for accessibility and touch support the native API lacks.
- **Popovers/menus** (member picker, label picker, move-card, emoji picker, dropdowns) all close on outside click and are positioned relative to their trigger — use a proper popover/portal primitive in the target stack rather than manual absolute positioning.
- **Image lightbox** (used for chat images, comment images, and calendar/asset previews): click to open full-screen-ish view, first click-point sets a zoom origin (`transform-origin`) and scales ~2.2x, subsequent drag pans the zoomed image by adjusting scroll offset; click again (without having dragged) toggles back to fit view; a small drag threshold (3px) distinguishes "click to toggle zoom" from "drag to pan."
- **Auto-save-ish behavior**: text fields (column names, checklist items, comments) commit on blur/Enter — no explicit save step for most inline edits.
- **Transitions**: panel/modal open uses slide-in + fade (~0.3s cubic-bezier(.22,.9,.35,1)), close uses a mirrored slide-out (~0.28s cubic-bezier(.55,0,.85,.35)) before unmounting — implement with your framework's transition/animation library, matching timing.

## State Management
Needed state (currently mocked as in-memory React-like component state in the prototype):
- `session.user` — id, display name, avatar URL, email, phone (editable via profile modal)
- `board.columns[]` — id, name (renameable), color, order
- `board.tasks[]` — id, columnId, title, code, assignees[], dueDate, progress%, description, coverImageUrl, labels[], checklist[] (each `{text, done}`), comments[] (each `{authorId, text?, imageUrl?, timestamp}`)
- `projects[]` — id, title, subtitle, status, progress%, coverImageUrl, memberIds[], taskCount, startDate, endDate
- `members[]` — id, name, role, avatarUrl, online status, phone, email
- `chats` — per member-pair message thread (text/image, timestamp, "typing" ephemeral state)
- `calendarEvents[]` — date, label, color, per-board or per-user scope
- `lang` — 'vi' | 'en' toggle, ideally persisted (localStorage or account preference)

Real implementation will need: authenticated sessions, a tasks/columns data model with ordering (e.g. fractional-index for drag reorder), realtime sync for the board/chat (websockets or polling), file upload + storage for cover images/attachments/avatars, and permissioning (who can edit which board).

## Design Tokens
Sourced from the bound "Organic" design system (`_ds/organic-*/styles.css`) — do not hardcode values, pull from that system's CSS variables in the target codebase's equivalent token layer:
- Colors: `--color-bg` (#f5ead8 cream), `--color-text` (#201e1d), `--color-accent` (#c67139 terracotta) with `--color-accent-100…900` ramp, `--color-accent-2` (#7a8a5e sage) with its own 100–900 ramp, `--color-neutral-100…900` grayscale ramp.
- Status/label colors used ad hoc in the board (not part of the base ramp, define as workspace-specific tokens): red `#C0524F`, yellow `#D6A400`, green `#3F9E52`, blue `#4F80D9`, purple `#9146A8`.
- Typography: `--font-heading` (Caprasimo, swapped to "Baloo 2" for the site's Vietnamese-diacritic-safe headings — Caprasimo does not render Vietnamese tone marks correctly, use Baloo 2 or another Vietnamese-supporting rounded display font for all heading text), `--font-body` (Figtree).
- Radius: `--radius-md`, `--radius-lg` (16px+), pill buttons at 999px.
- Shadows: `--shadow-sm/md/lg` (`.elev-sm/md/lg` utility classes).
- Buttons/tags/cards/forms: reuse `.btn .btn-primary/.btn-secondary/.btn-ghost/.btn-icon/.btn-block`, `.tag .tag-accent/.tag-accent-2/.tag-neutral/.tag-outline`, `.card .elev-sm/md/lg`, `.field/.input` per the Organic system's component classes — see `components/*.html` in the design system source for exact markup patterns.

## Assets
- `assets/funti-logo.jpg` — studio logo (circular avatar treatment).
- `assets/funti-team.jpg` — team photo used as a placeholder hero image.
- All other imagery is via `<image-slot>` placeholders (drag-and-drop upload targets in the prototype) — task covers, avatars, checklist attachments, calendar note images, project covers. In production these become real upload-backed image fields.

## Files
- `Funtikidbooks Website.dc.html` — the full site including the Member Workspace (Kanban board, task detail, calendar, members, profile, chat). Search for `isBoard`, `isKanban`, `isCalendarView`, `isMembersView`, `isProjectsListView`, `hasBoardTaskPanel`, `hasAddTask` state flags to locate each view's markup and logic.
- `PageHero.dc.html`, `CtaBanner.dc.html` — shared header/footer building blocks used by the public marketing pages (not part of the workspace itself, included for context/consistency).
- `image-slot.js` — the drag-and-drop image placeholder web component used throughout; the real app should replace this with a proper file-upload component wired to storage.
- `contact-map.html` — an embedded map (Leaflet/OpenStreetMap) used on the public Contact page, unrelated to the workspace but bundled for completeness.
