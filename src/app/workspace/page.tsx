import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { getOrCreateDefaultBoard, getBoardData } from "@/lib/data/board";
import { WorkspaceBoard } from "@/components/workspace/Board";

export const metadata: Metadata = { title: "Bảng công việc" };

export default async function WorkspacePage() {
  // requireUser() is cached per request — the layout above already paid
  // for this auth round trip, so this just reuses it instead of redoing it.
  const { user } = await requireUser();

  const board = await getOrCreateDefaultBoard(user.id);
  const { columns, tasks, profiles, boardLabels } = await getBoardData(board.id);

  return (
    <WorkspaceBoard
      board={board}
      initialColumns={columns}
      initialTasks={tasks}
      profiles={profiles}
      initialBoardLabels={boardLabels}
      currentUserId={user.id}
    />
  );
}
