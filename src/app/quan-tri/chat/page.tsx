import { redirect } from "next/navigation";

// Consolidated into the Khách hàng inbox (/workspace/khach-hang), which now
// shows both a client's Công việc project and an anonymous visitor's widget
// chat side by side — this route stays only so an old bookmark/link still
// lands somewhere useful.
export default function AdminChatPage() {
  redirect("/workspace/khach-hang");
}
