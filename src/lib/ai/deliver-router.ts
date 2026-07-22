/**
 * 「届ける」の宛先ルーティング(デモレスポンダ)。
 * 本文とカテゴリからキーワードを抽出し、DataBundle のメンバー・拠点マスタ(役割・拠点・得意領域)と
 * マッチングして宛先メンバー・配信先Slackチャンネル・整形メッセージ案を組み立てる。
 * Claude が使える場合は api/deliver/route.ts が Claude 応答を優先し、
 * 使えない/失敗した場合にこちらへフォールバックする。
 */
import type { Branch, DataBundle, Member, Role } from "@/lib/types";

export type DeliverCategory = "成果報告" | "ニュース" | "相談" | "所感";

export const DELIVER_CATEGORIES: DeliverCategory[] = ["成果報告", "ニュース", "相談", "所感"];

export interface DeliverMemberSuggestion {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  branchName: string;
  reason: string;
}

export interface DeliverSuggestion {
  members: DeliverMemberSuggestion[];
  channels: string[];
  message: {
    headline: string;
    body: string;
    mentions: string[];
    formatted: string;
  };
}

export const ROLE_LABELS: Record<Role, string> = {
  CA: "キャリアアドバイザー(CA)",
  RA: "法人営業(RA)",
  管理: "管理部門",
};

const CATEGORY_HEADLINE: Record<DeliverCategory, string> = {
  成果報告: "【成果報告】",
  ニュース: "【お知らせ】",
  相談: "【ご相談】",
  所感: "【所感】",
};

function branchLabel(branches: Branch[], branchId: string): string {
  const branch = branches.find((b) => b.id === branchId);
  // 「東京本社」→「東京」のように、チャンネル名としては短い呼称を使う
  return branch ? branch.name.replace("本社", "") : branchId;
}

function findMentionedBranchIds(text: string, branches: Branch[]): string[] {
  return branches
    .filter((b) => text.includes(branchLabel(branches, b.id)) || text.includes(b.name))
    .map((b) => b.id);
}

/** メンバーの得意領域文字列を「・」「/」区切りでトークン化する。 */
function specialtyTokens(specialty: string): string[] {
  return specialty.split(/[・/]/).filter((t) => t.length >= 2);
}

interface ScoredMember {
  member: Member;
  score: number;
  reasons: string[];
}

/** 経営層(役割=管理・東京本社所属)は常に一定スコアを持たせ、全社的な情報共有の受け皿にする。 */
function isTopManagement(member: Member): boolean {
  return member.role === "管理" && member.branchId === "tokyo";
}

/**
 * 本文・カテゴリから宛先メンバーをスコアリングして選ぶ。
 * ルール:
 *  - 本文中の拠点名に所属するメンバーを加点
 *  - 本文中の単語が得意領域(specialty)トークンと一致するメンバーを加点
 *  - カテゴリごとに役割の重み付け(成果報告→CA/RA、ニュース/所感→管理、相談→同職種)
 *  - 常に経営層(東京本社・管理部門)を候補に含め、全社共有の目が届くようにする
 */
function scoreMembers(
  text: string,
  category: DeliverCategory,
  members: Member[],
  branches: Branch[],
): ScoredMember[] {
  const mentionedBranchIds = findMentionedBranchIds(text, branches);

  return members.map((member) => {
    let score = 0;
    const reasons: string[] = [];

    if (mentionedBranchIds.includes(member.branchId)) {
      score += 4;
      reasons.push(`本文に登場する${branchLabel(branches, member.branchId)}拠点の担当者`);
    }

    const matchedTokens = specialtyTokens(member.specialty).filter((token) => text.includes(token));
    if (matchedTokens.length > 0) {
      score += 3 * matchedTokens.length;
      reasons.push(`得意領域(${member.specialty})が本文の内容と合致`);
    }

    switch (category) {
      case "成果報告":
        if (member.role === "RA" || member.role === "CA") {
          score += 2;
          reasons.push("成果報告の当事者側(CA/RA)として共有価値が高い");
        }
        if (member.role === "管理") {
          score += 1;
          reasons.push("経営・管理部門として成約実績を把握しておくべき立場");
        }
        break;
      case "ニュース":
        if (member.role === "管理") {
          score += 3;
          reasons.push("全社ニュースの発信・周知を担う管理部門");
        } else {
          score += 1;
        }
        break;
      case "相談":
        if (member.role === "CA" && (text.includes("求職者") || text.includes("面談") || text.includes("CA"))) {
          score += 2;
          reasons.push("求職者対応に関する相談として近い職種");
        }
        if (
          member.role === "RA" &&
          (text.includes("企業") || text.includes("商談") || text.includes("RA") || text.includes("法人"))
        ) {
          score += 2;
          reasons.push("法人営業に関する相談として近い職種");
        }
        if (member.role === "管理") {
          score += 1;
          reasons.push("相談ごとの窓口となりうる管理部門");
        }
        break;
      case "所感":
        if (member.role === "管理") {
          score += 2;
          reasons.push("チーム全体の所感を集約する管理部門");
        } else {
          score += 1;
        }
        break;
    }

    // 経営層は常に一定スコアを持たせ、全社的な情報共有の受け皿にする
    if (isTopManagement(member)) {
      score += 1.5;
      if (reasons.length === 0) reasons.push("経営として全社の動きを把握する立場");
    }

    return { member, score, reasons };
  });
}

/** カテゴリ・本文から配信先Slackチャンネルを決める。 */
function resolveChannels(text: string, category: DeliverCategory, branches: Branch[]): string[] {
  const channels = new Set<string>();

  if (category === "成果報告") channels.add("#成約報告");
  if (category === "ニュース") channels.add("#全社");
  if (category === "所感") channels.add("#お知らせ");
  if (category === "相談") channels.add("#お知らせ");

  const mentionedBranchIds = findMentionedBranchIds(text, branches);
  for (const branchId of mentionedBranchIds) {
    channels.add(`#営業-${branchLabel(branches, branchId)}`);
  }

  // 全社的な内容(達成率・全社という語)や、拠点言及が無い成果報告は #全社 にも共有する
  if (category === "成果報告" && (text.includes("全社") || mentionedBranchIds.length === 0)) {
    channels.add("#全社");
  }

  if (channels.size === 0) channels.add("#全社");
  return [...channels];
}

/** ルールベースで宛先メンバー・チャンネル・メッセージ案を組み立てる。 */
export function routeDelivery(text: string, category: DeliverCategory, bundle: DataBundle): DeliverSuggestion {
  const { members, branches } = bundle;
  const scored = scoreMembers(text, category, members, branches)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  let picked = scored.slice(0, 4);
  if (picked.length < 2) {
    // スコアが立たない場合のセーフティネット: 経営層 + 東京拠点のCA/RAを補充
    const fallbackIds = new Set(picked.map((p) => p.member.id));
    const fallbackCandidates = members.filter(
      (m) => !fallbackIds.has(m.id) && (isTopManagement(m) || m.branchId === "tokyo"),
    );
    for (const m of fallbackCandidates) {
      if (picked.length >= 2) break;
      picked.push({ member: m, score: 0, reasons: ["全社的な情報共有の観点から候補に追加"] });
    }
  }
  picked = picked.slice(0, 4);

  const memberSuggestions: DeliverMemberSuggestion[] = picked.map(({ member, reasons }) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    roleLabel: ROLE_LABELS[member.role],
    branchName: branches.find((b) => b.id === member.branchId)?.name ?? member.branchId,
    reason: reasons[0] ?? "関連するメンバーとして選定",
  }));

  const channels = resolveChannels(text, category, branches);
  const headline = CATEGORY_HEADLINE[category];
  const mentions = memberSuggestions.map((m) => `@${m.name}`);
  const formatted = [
    headline,
    `宛先: ${mentions.join(" ")}`,
    `配信先: ${channels.join(" / ")}`,
    "",
    text,
  ].join("\n");

  return {
    members: memberSuggestions,
    channels,
    message: { headline, body: text, mentions, formatted },
  };
}

/** Claude 用システムプロンプト。JSON のみを返させ、api/deliver/route.ts でパースする。 */
export function buildDeliverSystemPrompt(bundle: DataBundle): string {
  const { members, branches } = bundle;
  const memberList = members
    .map(
      (m) =>
        `- id:${m.id} 氏名:${m.name} 役割:${ROLE_LABELS[m.role]} 拠点:${
          branches.find((b) => b.id === m.branchId)?.name ?? m.branchId
        } 得意領域:${m.specialty}`,
    )
    .join("\n");

  return `あなたは株式会社翔び台(人材紹介会社)の社内情報配信アシスタントです。
ユーザーが入力した「配信したい情報」の本文とカテゴリから、最適な宛先メンバー(2〜4名、理由付き)と配信先Slackチャンネル、整形済みメッセージ案を提案してください。

# 社内メンバー一覧
${memberList}

# 出力形式
必ず以下のJSON形式のみを出力してください(前後に説明文やコードフェンスを付けないこと)。
{
  "members": [ { "id": "m2", "reason": "選定理由(日本語、1文)" } ],
  "channels": ["#成約報告", "#全社"],
  "headline": "【成果報告】のようなカテゴリ見出し",
  "mentions": ["@高梨 玲奈"]
}

ルール:
- members は上記メンバー一覧に実在する id のみを2〜4件、関連性の高い順に選ぶこと。
- channels は "#" から始まるチャンネル名を1〜3件。拠点に関する内容なら "#営業-{拠点名}" のようなチャンネルも検討する。
- mentions は選んだメンバーの氏名に "@" を付けたもの。`;
}
