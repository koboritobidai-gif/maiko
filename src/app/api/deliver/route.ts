/**
 * POST /api/deliver — 「届ける」の宛先提案・送信エンドポイント。
 * action: "suggest"(既定) | "send"
 *  - suggest: askClaude が使えれば宛先提案(JSON)を生成、不可/失敗なら deliver-router.ts の
 *    ルールベースにフォールバックする。DataBundle(実データ/デモデータ)のメンバー・拠点マスタを使用する。
 *  - send: adapters/messenger.ts 経由で送信する(live: 実際にSlackへ投稿 / demo: デモ送信)。
 */
import { NextResponse } from "next/server";
import { askClaude } from "@/lib/ai/client";
import {
  DELIVER_CATEGORIES,
  ROLE_LABELS,
  buildDeliverSystemPrompt,
  routeDelivery,
} from "@/lib/ai/deliver-router";
import type { DeliverCategory, DeliverMemberSuggestion, DeliverSuggestion } from "@/lib/ai/deliver-router";
import { getMessengerSource } from "@/lib/adapters/messenger";
import { loadDataBundle } from "@/lib/data-bundle";
import type { DataBundle } from "@/lib/types";

interface SuggestRequestBody {
  action?: "suggest";
  text?: unknown;
  category?: unknown;
  role?: unknown;
}

interface SendRequestBody {
  action: "send";
  channel?: unknown;
  author?: unknown;
  body?: unknown;
}

function isDeliverCategory(value: unknown): value is DeliverCategory {
  return typeof value === "string" && (DELIVER_CATEGORIES as string[]).includes(value);
}

interface ClaudeDeliverResponse {
  members?: { id?: unknown; reason?: unknown }[];
  channels?: unknown[];
  headline?: unknown;
  mentions?: unknown[];
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function parseClaudeSuggestion(raw: string, bodyText: string, bundle: DataBundle): DeliverSuggestion | null {
  try {
    const parsed = JSON.parse(extractJson(raw)) as ClaudeDeliverResponse;
    if (!Array.isArray(parsed.members) || parsed.members.length === 0) return null;

    const memberSuggestions: DeliverMemberSuggestion[] = [];
    for (const entry of parsed.members) {
      if (typeof entry.id !== "string") continue;
      const member = bundle.members.find((m) => m.id === entry.id);
      if (!member) continue;
      memberSuggestions.push({
        id: member.id,
        name: member.name,
        role: member.role,
        roleLabel: ROLE_LABELS[member.role],
        branchName: bundle.branches.find((b) => b.id === member.branchId)?.name ?? member.branchId,
        reason: typeof entry.reason === "string" && entry.reason ? entry.reason : "AIが関連性が高いと判断",
      });
    }
    if (memberSuggestions.length === 0) return null;

    const channels =
      Array.isArray(parsed.channels) && parsed.channels.length > 0
        ? parsed.channels.filter((c): c is string => typeof c === "string")
        : ["#全社"];

    const headline = typeof parsed.headline === "string" && parsed.headline ? parsed.headline : "【共有】";
    const mentions =
      Array.isArray(parsed.mentions) && parsed.mentions.length > 0
        ? parsed.mentions.filter((m): m is string => typeof m === "string")
        : memberSuggestions.map((m) => `@${m.name}`);

    const formatted = [headline, `宛先: ${mentions.join(" ")}`, `配信先: ${channels.join(" / ")}`, "", bodyText].join(
      "\n",
    );

    return {
      members: memberSuggestions,
      channels,
      message: { headline, body: bodyText, mentions, formatted },
    };
  } catch {
    return null;
  }
}

async function handleSuggest(body: SuggestRequestBody) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const category = isDeliverCategory(body.category) ? body.category : "成果報告";

  if (!text) {
    return NextResponse.json({ error: "text は必須です。" }, { status: 400 });
  }

  const bundle = await loadDataBundle();
  const system = buildDeliverSystemPrompt(bundle);
  const user = `# カテゴリ\n${category}\n\n# 本文\n${text}`;

  const aiRaw = await askClaude(system, user);
  if (aiRaw) {
    const parsed = parseClaudeSuggestion(aiRaw, text, bundle);
    if (parsed) {
      return NextResponse.json({ suggestion: parsed, source: "claude" as const, sourceStatus: bundle.sourceStatus });
    }
  }

  const ruleSuggestion = routeDelivery(text, category, bundle);
  return NextResponse.json({
    suggestion: ruleSuggestion,
    source: "rule" as const,
    sourceStatus: bundle.sourceStatus,
  });
}

async function handleSend(body: SendRequestBody) {
  const channel = typeof body.channel === "string" ? body.channel.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!channel || !messageBody) {
    return NextResponse.json({ error: "channel と body は必須です。" }, { status: 400 });
  }

  const messenger = getMessengerSource();
  try {
    const result = await messenger.postMessage(channel, author || "Tobidai Cockpit", messageBody);
    return NextResponse.json({ ok: result.ok, post: result.post });
  } catch (error) {
    console.error("[api/deliver] Slack への送信に失敗しました:", error);
    return NextResponse.json(
      { error: "Slackへの送信に失敗しました。設定(SLACK_BOT_TOKEN 等)を確認してください。" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  let body: SuggestRequestBody | SendRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です。" }, { status: 400 });
  }

  if (body.action === "send") {
    return handleSend(body);
  }
  return handleSuggest(body);
}
