// Quản trị → Quản lý dự án: who is on which project, how far each project
// has got, who is free or about to be. A project is a meeting room (phòng
// họp dự án); being in the room means working on it. Its stage and due date
// come from the matching card on the Kanban board (room "Kelly Dorval- Nhân"
// ↔ card "Kelly Dorval- Canadian Backyard Adventure- Nhân"). Pure — shared by
// the server action and tests/calculations.test.mjs.

export type PmRoom = {
  id: string;
  name: string;
  icon: string;
  billing_type: string | null;
  weekly_hour_cap: number | null;
  last_message_at: string | null;
  created_at: string;
  memberIds: string[];
};
export type PmTask = {
  id: string;
  code: string;
  title: string;
  column_title: string;
  due_date: string | null;
  due_complete: boolean;
  created_at: string;
};
export type PmPerson = { id: string; display_name: string; role: string | null; avatar_url: string | null };
export type PmHour = { profile_id: string; project_channel_id: string | null; work_date: string; hours: number; minutes: number };

export type StageKey = "sample" | "sketch" | "hourly" | "color" | "final" | "unknown";
export const STAGES: { key: StageKey; label: string; progress: number | null }[] = [
  { key: "sample", label: "Mẫu / test", progress: 15 },
  { key: "sketch", label: "Phác thảo", progress: 40 },
  { key: "hourly", label: "Theo giờ", progress: null },
  { key: "color", label: "Lên màu", progress: 75 },
  { key: "final", label: "Hoàn thành", progress: 100 },
  { key: "unknown", label: "Chưa rõ", progress: null },
];
export const stageInfo = (key: StageKey) => STAGES.find((s) => s.key === key) ?? STAGES[STAGES.length - 1];

// The board's list names: Sample, Sketch Story Board, Theo Giờ, Color, Final 2026…
export function stageOf(columnTitle: string): StageKey {
  const t = fold(columnTitle);
  if (/final|hoan thanh|xong/.test(t)) return "final";
  if (/color|len mau/.test(t)) return "color";
  if (/theo gio|hourly/.test(t)) return "hourly";
  if (/sketch|phac|story/.test(t)) return "sketch";
  if (/sample|test|mau/.test(t)) return "sample";
  return "unknown";
}

export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// "Kelly Dorval- Nhân" → "kelly dorval"; "Dự án Martina" → "martina".
export function clientKey(roomName: string) {
  const head = roomName.split(/\s*-\s*/)[0] ?? roomName;
  return fold(head).replace(/^du an\s+/, "").trim();
}

// The part naming who draws it: "Brittany - Nhân, Thương" → "nhan thuong".
export function artistPart(roomName: string) {
  const parts = roomName.split(/\s*-\s*/);
  return parts.length > 1 ? fold(parts[parts.length - 1]) : "";
}

// The board card for a room: same client name (a typo or two allowed —
// "Carrie Liípon" vs "Carrie Lipson"). Prefers a card not yet in Final,
// then the newest.
export function matchTask(roomName: string, tasks: PmTask[]): PmTask | null {
  const key = clientKey(roomName);
  if (key.length < 3) return null;
  const keyWords = key.split(" ").slice(0, 2).join(" ");
  const hits = tasks.filter((t) => {
    const k = clientKey(t.title);
    if (!k) return false;
    if (k === key || k.startsWith(key) || key.startsWith(k)) return true;
    const tw = k.split(" ").slice(0, 2).join(" ");
    return keyWords.length >= 5 && editDistance(tw, keyWords) <= 2;
  });
  if (hits.length === 0) return null;
  return [...hits].sort((a, b) => {
    const af = stageOf(a.column_title) === "final" ? 1 : 0;
    const bf = stageOf(b.column_title) === "final" ? 1 : 0;
    return af - bf || b.created_at.localeCompare(a.created_at);
  })[0];
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export type PmProject = {
  id: string;
  name: string;
  icon: string;
  billing: "hourly" | "milestone";
  stage: StageKey;
  progress: number | null;
  task: { code: string; title: string } | null;
  dueDate: string | null;
  dueInDays: number | null;
  // In the board's Final list — the project is done.
  complete: boolean;
  // The card's due date ticked "hoàn thành" (a milestone met) — no longer
  // counts as due or overdue, but the project itself may still be running.
  dueDone: boolean;
  weekMinutes: number;
  capMinutes: number | null;
  quietDays: number | null;
  memberIds: string[];
  leadIds: string[];
  flags: { overdue: boolean; dueSoon: boolean; nearlyDone: boolean; quiet: boolean };
};

export type PmStaffStatus = "free" | "finishing" | "normal" | "busy";
export type PmStaffRow = {
  person: PmPerson;
  projectIds: string[];
  leadCount: number;
  weekMinutes: number;
  status: PmStaffStatus;
};

export const STATUS_LABELS: Record<PmStaffStatus, string> = {
  free: "Trống việc",
  finishing: "Sắp xong việc",
  normal: "Đang làm",
  busy: "Nhiều việc",
};

const QUIET_DAYS = 5;
const DUE_SOON_DAYS = 7;
const BUSY_AT = 4;

export function buildPm(input: {
  today: string;
  weekStart: string;
  rooms: PmRoom[];
  tasks: PmTask[];
  staff: PmPerson[];
  hours: PmHour[];
}) {
  const { today, weekStart, rooms, tasks, staff, hours } = input;
  const weekHours = hours.filter((h) => h.work_date >= weekStart && h.work_date <= today);
  const minutesOf = (h: PmHour) => (Number(h.hours) || 0) * 60 + (Number(h.minutes) || 0);
  const staffIds = new Set(staff.map((s) => s.id));

  const projects: PmProject[] = rooms.map((r) => {
    const task = matchTask(r.name, tasks);
    const stage: StageKey = task ? stageOf(task.column_title) : r.billing_type === "hourly" ? "hourly" : "unknown";
    const complete = stage === "final";
    const dueDone = !!task?.due_complete;
    const dueDate = task?.due_date ?? null;
    const dueInDays = dueDate ? daysBetween(today, dueDate) : null;
    const lastDay = r.last_message_at ? new Date(Date.parse(r.last_message_at) + 7 * 3600e3).toISOString().slice(0, 10) : null;
    const quietDays = lastDay ? daysBetween(lastDay, today) : null;
    // Who draws it: named after the last "-" of the room, or of its card.
    const artist = artistPart(r.name) || (task ? artistPart(task.title) : "");
    const leadIds = r.memberIds.filter((id) => {
      const p = staff.find((s) => s.id === id);
      if (!p || !artist) return false;
      return fold(p.display_name)
        .split(" ")
        .filter((w) => w.length >= 2)
        .some((w) => artist.split(" ").includes(w));
    });
    return {
      id: r.id,
      name: r.name,
      icon: r.icon,
      billing: r.billing_type === "hourly" ? "hourly" : "milestone",
      stage,
      progress: complete ? 100 : stageInfo(stage).progress,
      task: task ? { code: task.code, title: task.title } : null,
      dueDate,
      dueInDays,
      complete,
      dueDone,
      weekMinutes: weekHours.filter((h) => h.project_channel_id === r.id).reduce((s, h) => s + minutesOf(h), 0),
      capMinutes: r.weekly_hour_cap ? Math.round(Number(r.weekly_hour_cap) * 60) : null,
      quietDays,
      memberIds: r.memberIds.filter((id) => staffIds.has(id)),
      leadIds,
      flags: {
        overdue: !complete && !dueDone && dueInDays !== null && dueInDays < 0,
        dueSoon: !complete && !dueDone && dueInDays !== null && dueInDays >= 0 && dueInDays <= DUE_SOON_DAYS,
        nearlyDone: !complete && stage === "color",
        quiet: quietDays !== null && quietDays >= QUIET_DAYS,
      },
    };
  });

  const staffRows: PmStaffRow[] = staff.map((person) => {
    const mine = projects.filter((p) => p.memberIds.includes(person.id));
    const lead = mine.filter((p) => p.leadIds.includes(person.id));
    // "Sắp xong việc": everything they lead (or are in) is at colour stage or done.
    const judged = lead.length ? lead : mine;
    const status: PmStaffStatus =
      mine.length === 0
        ? "free"
        : judged.every((p) => p.complete || p.stage === "color" || p.stage === "final")
          ? "finishing"
          : mine.length >= BUSY_AT
            ? "busy"
            : "normal";
    return {
      person,
      projectIds: mine.map((p) => p.id),
      leadCount: lead.length,
      weekMinutes: weekHours.filter((h) => h.profile_id === person.id).reduce((s, h) => s + minutesOf(h), 0),
      status,
    };
  });
  const order: Record<PmStaffStatus, number> = { free: 0, finishing: 1, normal: 2, busy: 3 };
  staffRows.sort((a, b) => order[a.status] - order[b.status] || a.projectIds.length - b.projectIds.length || a.person.display_name.localeCompare(b.person.display_name, "vi"));

  // Most urgent first: overdue, due soonest, nearly done, then the rest by name.
  const urgency = (p: PmProject) => (p.flags.overdue ? 0 : p.flags.dueSoon ? 1 : p.flags.nearlyDone ? 2 : p.complete ? 4 : 3);
  projects.sort((a, b) => urgency(a) - urgency(b) || (a.dueInDays ?? 999) - (b.dueInDays ?? 999) || a.name.localeCompare(b.name, "vi"));

  const stageCounts = STAGES.map((s) => ({ key: s.key, label: s.label, value: projects.filter((p) => p.stage === s.key).length })).filter(
    (s) => s.value > 0,
  );

  return {
    projects,
    staff: staffRows,
    stageCounts,
    totals: {
      projects: projects.length,
      busyPeople: staffRows.filter((s) => s.projectIds.length > 0).length,
      people: staffRows.length,
      free: staffRows.filter((s) => s.status === "free").length,
      dueSoon: projects.filter((p) => p.flags.dueSoon || p.flags.overdue).length,
      weekMinutes: weekHours.filter((h) => staffIds.has(h.profile_id)).reduce((s, h) => s + minutesOf(h), 0),
    },
  };
}

export type PmData = ReturnType<typeof buildPm> & { today: string; weekStart: string };
