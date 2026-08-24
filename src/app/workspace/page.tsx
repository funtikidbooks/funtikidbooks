import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateDefaultBoard, getBoardData } from "@/lib/data/board";
import { WorkspaceBoard } from "@/components/workspace/Board";

export const metadata: Metadata = { title: "Bảng công việc" };

export default async function WorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const board = await getOrCreateDefaultBoard(user!.id);
  const { columns, tasks, profiles } = await getBoardData(board.id);

  return (
    <WorkspaceBoard
      board={board}
      initialColumns={columns}
      initialTasks={tasks}
      profiles={profiles}
      currentUserId={user!.id}
    />
  );
}
