// Realtime topic names for chat — kept free of imports so tests can load it
// directly. Who may listen/send on each is decided by the RLS rules in
// supabase/migrations/chat_private_broadcast.sql and performance_night.sql.

export function roomTopic(channelId: string) {
  return `room:${channelId}`;
}

export function inboxTopic(profileId: string) {
  return `inbox:${profileId}`;
}

// One private channel per pair of people (lower id first, plain code-unit
// order — the same order the database trigger uses with COLLATE "C") —
// both sides of an open conversation listen on it, so a DM goes out over
// the already-open socket instead of a REST call into the other person's
// inbox. Until the dm: rules in performance_night.sql are in, joining is
// refused and the inbox path carries everything as before.
export function dmTopic(a: string, b: string) {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}
