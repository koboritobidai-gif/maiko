import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { today } from "@/lib/date";
import { extractTasks } from "@/lib/extract";
import { matchOwner } from "@/lib/importer";
import { listUsers } from "@/lib/tasks";

/** 貼り付けた議事録からタスク候補を抽出して返す（取り込み画面のプレビュー用）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { body, meetingDate } = (await request.json()) as {
    body?: string;
    meetingDate?: string;
  };
  const users = await listUsers();
  const extracted = extractTasks(body ?? "", { meetingDate: meetingDate || today() });

  return NextResponse.json({
    tasks: extracted.map((task) => {
      const owner = matchOwner(task.ownerHint, users);
      return {
        title: task.title,
        ownerId: owner?.id ?? "",
        ownerHint: task.ownerHint,
        dueDate: task.dueDate ?? "",
        dueHint: task.dueHint,
        confidence: task.confidence,
        raw: task.raw,
      };
    }),
  });
}
