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
import { loadReferralInvoices } from "@/lib/invoice-data";
import { loadMarketingData } from "@/lib/marketing-data";
import { getInvoiceChecks, getMarketingSummary, getReferralProfit, getRevenueSummary } from "@/lib/metrics";
import { loadRevenueRecords } from "@/lib/revenue-data";
import { fillInterviewDatesFromSlack } from "@/lib/slack-interviews";

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

  const [bundle, threadsResult, marketingResult, invoicesResult, revenueResult] = await Promise.all([
    loadDataBundle(),
    loadCandidateThreads(),
    loadMarketingData(),
    loadReferralInvoices(),
    loadRevenueRecords(),
  ]);

  // 請求書チェック(送客パートナー請求書の自動照合)には今月・先月双方の送客パートナーサマリが
  // 必要なため、ここで個別に算出する(buildAskSnapshot 内部で計算する今月分とは別に、先月分を用意する)。
  const now = new Date();
  const candidatesWithInterviews = fillInterviewDatesFromSlack(bundle.candidates, threadsResult.threads);
  const marketingSummaryThisMonth = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    candidatesWithInterviews,
    bundle.settings.referralRates,
    now,
  );
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const marketingSummaryLastMonth = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    candidatesWithInterviews,
    bundle.settings.referralRates,
    lastMonthRef,
  );
  const invoiceChecks = getInvoiceChecks(
    invoicesResult.invoices,
    marketingSummaryThisMonth.referralPartners,
    marketingSummaryLastMonth.referralPartners,
    now,
  );
  // 送客売上(翔び台が貰う金額)の今月・先月まとめ + 送客パートナー経由の利益(#請求書=払う金額とは逆方向)。
  const revenueSummary = getRevenueSummary(revenueResult.records, now);
  const revenueContext = {
    thisMonth: revenueSummary.thisMonth,
    lastMonth: revenueSummary.lastMonth,
    profitThisMonth: getReferralProfit(revenueSummary.thisMonth, marketingSummaryThisMonth.referralPartners),
    profitLastMonth: getReferralProfit(revenueSummary.lastMonth, marketingSummaryLastMonth.referralPartners),
  };

  const snapshot = buildAskSnapshot(
    bundle,
    threadsResult.threads,
    marketingResult.data,
    invoiceChecks,
    revenueContext,
  );

  const userPrompt = `# 現在のデータスナップショット(JSON)\n${JSON.stringify(snapshot)}\n\n# ログイン中のロール\n${role ?? "不明"}\n\n# ユーザーの質問\n${question}`;

  const aiAnswer = await askClaude(ASK_SYSTEM_PROMPT, userPrompt);
  if (aiAnswer) {
    return NextResponse.json({
      answer: aiAnswer.trim(),
      source: "claude" as const,
      sourceStatus: bundle.sourceStatus,
    });
  }

  const ruleAnswer = answerWithRules(
    question,
    role,
    bundle,
    threadsResult.threads,
    marketingResult.data,
    invoiceChecks,
    revenueContext,
  );
  return NextResponse.json({
    answer: ruleAnswer,
    source: "rule" as const,
    sourceStatus: bundle.sourceStatus,
  });
}
