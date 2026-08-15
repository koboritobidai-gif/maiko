/**
 * POST /api/ask — 「AIに聞く」の質問応答エンドポイント。
 * 1. loadDataBundle() で DataBundle(実データ/デモデータ)を取得
 * 2. metrics.ts の集計関数からデータスナップショットを構築
 * 3. askClaude が使えれば経営アシスタントのシステムプロンプト+スナップショットJSONで回答生成
 * 4. askClaude が null の場合は ask-responder.ts のルールベース応答にフォールバック
 */
import { NextResponse } from "next/server";
import { askClaude } from "@/lib/ai/client";
import { ASK_SYSTEM_PROMPT, answerWithRules, buildAskSnapshot } from "@/lib/ai/ask-responder";
import type { AskRole } from "@/lib/ai/ask-responder";
import { loadCandidateThreads } from "@/lib/candidate-threads";
import { loadDataBundle } from "@/lib/data-bundle";

interface AskRequestBody {
  question?: unknown;
  role?: unknown;
}

function parseRole(value: unknown): AskRole {
  return value === "exec" || value === "ca" ? value : undefined;
}

export async function POST(request: Request) {
  let body: AskRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です。" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const role = parseRole(body.role);

  if (!question) {
    return NextResponse.json({ error: "question は必須です。" }, { status: 400 });
  }

  const [bundle, threadsResult] = await Promise.all([loadDataBundle(), loadCandidateThreads()]);
  const snapshot = buildAskSnapshot(bundle, threadsResult.threads);

  const userPrompt = `# 現在のデータスナップショット(JSON)\n${JSON.stringify(snapshot)}\n\n# ログイン中のロール\n${role ?? "不明"}\n\n# ユーザーの質問\n${question}`;

  const aiAnswer = await askClaude(ASK_SYSTEM_PROMPT, userPrompt);
  if (aiAnswer) {
    return NextResponse.json({
      answer: aiAnswer.trim(),
      source: "claude" as const,
      sourceStatus: bundle.sourceStatus,
    });
  }

  const ruleAnswer = answerWithRules(question, role, bundle, threadsResult.threads);
  return NextResponse.json({
    answer: ruleAnswer,
    source: "rule" as const,
    sourceStatus: bundle.sourceStatus,
  });
}
