// Live updates for Quản trị → Tìm khách (Upwork) that need no database
// setup: whoever changes something (the hourly check saving a batch, a
// director/PM pressing Duyệt or editing a draft) sends a tiny broadcast on
// this public channel, and every open Upwork page refetches through its
// normal, permission-checked server actions. The ping carries only the
// batch id — never job or client details — so a public channel is fine.
export const UPWORK_LIVE_CHANNEL = "upwork-live";
export const UPWORK_LIVE_EVENT = "changed";
