/**
 * POST /api/placement-fee — 「入社決定の入金予定(見込み)」の要確認行(条件付き契約)の確定内容を保存する。
 * body: { name, company, type: "rate" | "fixed", ratePercent?, feeYen?, label?, clear? }
 * - clear: true なら該当の決定を取り除く(=要確認に戻す)。
 * - rate は 1〜100 の数値、fixed は 1〜10,000,000 の整数円のみ受け付ける。
 * 保存先は連携シートの専用タブ「アプリ保存用_入社報酬」(src/lib/placement-decisions.ts)。
 * middleware のBasic認証配下(除外は api/warm のみ)。業務データは返さず { ok: true } のみ返す。
 */
import { NextResponse } from "next/server";
import { MAX_FEE_YEN } from "@/lib/placement-calc";
import {
  clearPlacementDecision,
  placementDecisionKey,
  savePlacementDecision,
  type PlacementFeeDecision,
} from "@/lib/placement-decisions";

interface PlacementFeeBody {
  name?: unknown;
  company?: unknown;
  type?: unknown;
  ratePercent?: unknown;
  feeYen?: unknown;
  label?: unknown;
  clear?: unknown;
}

const MAX_LABEL_LENGTH = 60;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: PlacementFeeBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("リクエストボディが不正です。");
  }
  if (!body || typeof body !== "object") return badRequest("リクエストボディが不正です。");

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!name) return badRequest("name は必須です。");
  if (!company) return badRequest("company は必須です。");
  const key = placementDecisionKey(name, company);

  if (body.clear === true) {
    try {
      await clearPlacementDecision(key);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[api/placement-fee] 選択の取り消しに失敗しました:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "選択の取り消しに失敗しました。" },
        { status: 502 },
      );
    }
  }

  if (body.type !== "rate" && body.type !== "fixed") {
    return badRequest("type は rate または fixed を指定してください。");
  }
  let label: string | undefined;
  if (body.label !== undefined && body.label !== null) {
    if (typeof body.label !== "string") return badRequest("label が不正です。");
    label = body.label.trim() || undefined;
    if (label && label.length > MAX_LABEL_LENGTH) return badRequest(`label は${MAX_LABEL_LENGTH}文字以内にしてください。`);
  }

  const decision: PlacementFeeDecision = {
    key,
    name,
    company,
    type: body.type,
    ...(label ? { label } : {}),
    decidedAt: new Date().toISOString(),
  };
  if (body.type === "rate") {
    const rate = body.ratePercent;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 1 || rate > 100) {
      return badRequest("ratePercent は 1〜100 の数値で指定してください。");
    }
    decision.ratePercent = rate;
  } else {
    const fee = body.feeYen;
    if (typeof fee !== "number" || !Number.isInteger(fee) || fee < 1 || fee > MAX_FEE_YEN) {
      return badRequest(`feeYen は 1〜${MAX_FEE_YEN.toLocaleString("en-US")} の整数(円)で指定してください。`);
    }
    decision.feeYen = fee;
  }

  try {
    await savePlacementDecision(decision);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/placement-fee] 確定内容の保存に失敗しました:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "確定内容の保存に失敗しました。" },
      { status: 502 },
    );
  }
}
