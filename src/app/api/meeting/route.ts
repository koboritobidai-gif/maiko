import { NextResponse } from "next/server";
import { generateMeetingResult } from "@/lib/ai/meeting-gen";
import type { MeetingKind } from "@/lib/demo-transcripts";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const { transcript, kind } = (body ?? {}) as { transcript?: unknown; kind?: unknown };

  if (typeof transcript !== "string" || transcript.trim().length < 10) {
    return NextResponse.json(
      { error: "文字起こしを10文字以上入力してください。" },
      { status: 400 },
    );
  }

  const safeKind: MeetingKind = kind === "corporate" ? "corporate" : "candidate";

  try {
    const result = await generateMeetingResult(transcript.trim(), safeKind);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/meeting] 生成に失敗しました:", error);
    return NextResponse.json(
      { error: "面談メモの生成に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 },
    );
  }
}
