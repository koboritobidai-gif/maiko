import { NextResponse } from "next/server";
import { generateProposalResult } from "@/lib/ai/proposal-gen";
import {
  AGE_BANDS,
  CHANGE_REASONS,
  type AgeBand,
  type ChangeReason,
  type ProposalInput,
} from "@/lib/ai/proposal-gen";

function isAgeBand(v: unknown): v is AgeBand {
  return typeof v === "string" && (AGE_BANDS as string[]).includes(v);
}

function isChangeReason(v: unknown): v is ChangeReason {
  return typeof v === "string" && (CHANGE_REASONS as string[]).includes(v);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;

  const currentRole = typeof b.currentRole === "string" ? b.currentRole.trim() : "";
  const desiredRole = typeof b.desiredRole === "string" ? b.desiredRole.trim() : "";
  const desiredLocation = typeof b.desiredLocation === "string" ? b.desiredLocation.trim() : "";
  const desiredIncomeMan = Number(b.desiredIncomeMan);
  const candidateName = typeof b.candidateName === "string" ? b.candidateName.trim() : "";

  if (!isAgeBand(b.ageBand)) {
    return NextResponse.json({ error: "年齢層を選択してください。" }, { status: 400 });
  }
  if (!isChangeReason(b.reason)) {
    return NextResponse.json({ error: "転職目的を選択してください。" }, { status: 400 });
  }
  if (!currentRole) {
    return NextResponse.json({ error: "現職種を入力してください。" }, { status: 400 });
  }
  if (!desiredRole) {
    return NextResponse.json({ error: "希望職種を入力してください。" }, { status: 400 });
  }
  if (!desiredLocation) {
    return NextResponse.json({ error: "希望勤務地を入力してください。" }, { status: 400 });
  }
  if (!Number.isFinite(desiredIncomeMan) || desiredIncomeMan <= 0) {
    return NextResponse.json({ error: "希望年収(万円)を正しく入力してください。" }, { status: 400 });
  }

  const input: ProposalInput = {
    candidateName,
    ageBand: b.ageBand,
    currentRole,
    desiredRole,
    desiredIncomeMan,
    desiredLocation,
    reason: b.reason,
  };

  try {
    const result = await generateProposalResult(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/proposal] 生成に失敗しました:", error);
    return NextResponse.json(
      { error: "提案書の生成に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 },
    );
  }
}
