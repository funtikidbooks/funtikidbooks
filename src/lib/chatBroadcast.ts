"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Fast path for chat delivery. Right after a message is saved, the sender's
// browser Broadcasts the saved row to everyone listening — ~0.06s, versus
// ~0.6s for Postgres's change feed (both measured from Vietnam against the
// Singapore project, 2026-09-25). The change feed stays subscribed as the
// backup; firstSighting() below keeps a message that arrives both ways from
// being counted, dinged or popped up twice.
//
// Topics (PRIVATE channels — who may listen/send is enforced by RLS on
// realtime.messages, see supabase/migrations/chat_private_broadcast.sql):
//   room:<meeting channel id>  event "message"  payload MeetingMessage
//   inbox:<recipient id>       event "dm"       payload DirectMessage
//
// Only already-saved rows are ever broadcast, so a receiver never shows a
// message that didn't actually make it into the database.

type Listener = (event: string, payload: unknown) => void;

type Topic = {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  joined: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

const topics = new Map<string, Topic>();

// A refused join isn't always permanent — an expired token (a phone tab
// waking from hours asleep) gets the exact same "Unauthorized" as a real
// RLS refusal. Try again after a while instead of giving up for the rest
// of the page's life.
const REFUSED_RETRY_MS = 30000;

function connect(topic: string, entry: Topic) {
  const supabase = createClient();
  const channel = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } });
  entry.channel = channel;
  entry.joined = false;
  channel
    .on("broadcast", { event: "*" }, (message) => {
      for (const l of entry.listeners) l(message.event, message.payload);
    })
    .subscribe((status, err) => {
      if (entry.channel !== channel) return;
      entry.joined = status === "SUBSCRIBED";
      // Stop the client's own every-few-seconds rejoin loop and retry on a
      // slow timer instead. The change feed still delivers everything in
      // the meantime, just slower.
      if (status === "CHANNEL_ERROR" && err && /unauthori|permission/i.test(err.message)) {
        supabase.removeChannel(channel);
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = null;
          if (topics.get(topic) === entry && entry.channel === channel) connect(topic, entry);
        }, REFUSED_RETRY_MS);
      }
    });
}

export function roomTopic(channelId: string) {
  return `room:${channelId}`;
}

export function inboxTopic(profileId: string) {
  return `inbox:${profileId}`;
}

// One channel per topic no matter how many components listen (supabase-js
// hands back the same channel object for a repeated topic anyway, and a
// second .subscribe() on it would throw) — listeners share it, and it's
// closed when the last one leaves.
export function listenChatTopic(topic: string, listener: Listener): () => void {
  let entry = topics.get(topic);
  if (!entry) {
    const created = { listeners: new Set(), joined: false, retryTimer: null } as unknown as Topic;
    topics.set(topic, created);
    connect(topic, created);
    entry = created;
  }
  entry.listeners.add(listener);
  const current = entry;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0 && topics.get(topic) === current) {
      topics.delete(topic);
      if (current.retryTimer) clearTimeout(current.retryTimer);
      createClient().removeChannel(current.channel);
    }
  };
}

// Fire-and-forget. Over the already-open websocket when this browser is
// listening on the topic (a room you have open), otherwise a single REST
// call — e.g. a DM to someone else's inbox, which you're not allowed to
// listen on.
export function sendChatBroadcast(topic: string, event: string, payload: Record<string, unknown>) {
  const entry = topics.get(topic);
  if (entry?.joined) {
    entry.channel.send({ type: "broadcast", event, payload }).catch(() => {});
    return;
  }
  if (entry) {
    entry.channel.httpSend(event, payload).catch(() => {});
    return;
  }
  const supabase = createClient();
  const channel = supabase.channel(topic, { config: { private: true } });
  channel
    .httpSend(event, payload)
    .catch(() => {})
    .finally(() => supabase.removeChannel(channel));
}

// Returns true the first time a given message id is seen under a given
// scope, false after — so the Broadcast copy and the change-feed copy of
// the same message only ding / bump an unread badge / pop up once.
// Separate scopes because different listeners each need their own first
// sighting (MeetingHub's in-room ding vs ChatManager's unread counter).
const seenByScope = new Map<string, Set<string>>();
const MAX_SEEN = 2000;

export function firstSighting(scope: string, messageId: string): boolean {
  let seen = seenByScope.get(scope);
  if (!seen) {
    seen = new Set();
    seenByScope.set(scope, seen);
  }
  if (seen.has(messageId)) return false;
  seen.add(messageId);
  if (seen.size > MAX_SEEN) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  return true;
}
