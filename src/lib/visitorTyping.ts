// Shared by the guest chat widget (app/(site)/cong-viec/GuestChatPanel.tsx)
// and its staff-side view (components/workspace/ClientProjectsInbox.tsx) —
// both need the exact same Supabase Realtime broadcast channel name per
// conversation for the "typing…" indicator to reach the other side. Same
// pattern as the internal 1-1 chat's own typing broadcast
// (DirectConversation.tsx): ephemeral, never written to the database.
export function visitorTypingChannelName(conversationId: string) {
  return `visitor-typing-${conversationId}`;
}

export const TYPING_IDLE_MS = 3000;
export const TYPING_BROADCAST_THROTTLE_MS = 2000;
