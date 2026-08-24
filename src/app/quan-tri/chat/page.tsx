import type { Metadata } from "next";
import { ChatInbox } from "@/components/admin/ChatInbox";
import { listVisitorConversations } from "@/lib/actions/support-chat";

export const metadata: Metadata = { title: "Quản trị — Chat khách vãng lai" };

export default async function AdminChatPage() {
  const conversations = await listVisitorConversations();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Chat khách vãng lai</h1>
        <span className="tag tag-neutral">{conversations.length} cuộc trò chuyện</span>
      </div>
      <ChatInbox initialConversations={conversations} />
    </div>
  );
}
