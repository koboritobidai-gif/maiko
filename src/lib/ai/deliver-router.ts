/**
 * 「届ける」の宛先ルーティング(デモレスポンダ)。
 * 本文とカテゴリからキーワードを抽出し、DataBundle のメンバーマスタ(役割・得意領域)と
 * 担当領域マッチング(法人/契約→清本・江崎、面談・求職者→今井・佐藤・富田、
 * マーケ・PV・LINE→小堀、経営数字→小堀)で宛先メンバー・配信先Slackチャンネル・
 * 整形メッセージ案を組み立てる。
 * Claude が使える場合は api/deliver/route.ts が Claude 応答を優先し、
 * 使えない/失敗した場合にこちらへフォールバックする。
 */
import type { DataBundle, Member, Role } from "@/lib/types";

export type DeliverCategory = "成果報告" | "ニュース" | "相談" | "所感";

export const DELIVER_CATEGORIES: DeliverCategory[] = ["成果報告", "ニュース", "相談", "所感"];

export interface DeliverMemberSuggestion {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  specialty: string;
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
  代表: "代表",
  社長: "社長",
  CA: "キャリアアドバイザー(CA)",
  RA: "法人営業(RA)",
  法人営業: "法人営業",
  サポート: "サポート",
};

const CATEGORY_HEADLINE: Record<DeliverCategory, string> = {
  成果報告: "【成果報告】",
  ニュース: "【お知らせ】",
  相談: "【ご相談】",
  所感: "【所感】",
};

/** メンバーの得意領域文字列を「・」「/」区切りでトークン化する。 */
function specialtyTokens(specialty: string): string[] {
  return specialty.split(/[・/]/).filter((t) => t.length >= 2);
}

/** 担当領域ルール: 本文のキーワードから、関連度の高いメンバーIDへスコアを加点する。 */
interface AreaRule {
  keywords: string[];
  memberIds: string[];
  reason: string;
  channel: string;
}

const AREA_RULES: AreaRule[] = [
  {
    keywords: ["法人", "契約", "商談", "アポ", "名刺交換", "クライアント", "企業開拓", "新規開拓"],
    memberIds: ["m5", "m6"], // 清本・江崎
    reason: "法人営業(契約・商談)の担当領域に合致",
    channel: "#法人営業",
  },
  {
    keywords: ["面談", "求職者", "選考", "内定", "面接", "候補者", "承諾"],
    memberIds: ["m2", "m3", "m4"], // 今井・佐藤・富田
    reason: "求職者対応(面談・選考)の担当領域に合致",
    channel: "#CA",
  },
  {
    keywords: ["マーケ", "PV", "LINE", "集客", "広告", "LP", "導線", "登録率"],
    memberIds: ["m1"], // 小堀
    reason: "マーケティング・集客導線の担当領域に合致",
    channel: "#全社",
  },
  {
    keywords: ["経営", "売上", "KPI", "業績", "全社数字", "目標", "達成率"],
    memberIds: ["m1"], // 小堀
    reason: "経営数字を統括する立場として関連",
    channel: "#全社",
  },
];

interface ScoredMember {
  member: Member;
  score: number;
  reasons: string[];
}

/** 代表(小堀)は常に一定スコアを持たせ、全社的な情報共有の受け皿にする。 */
function isTopManagement(member: Member): boolean {
  return member.role === "代表";
}

/**
 * 本文・カテゴリから宛先メンバーをスコアリングして選ぶ。
 * ルール:
 *  - 本文のキーワードから担当領域(法人/求職者対応/マーケ/経営)に合致するメンバーを加点
 *  - 本文中の単語が得意領域(specialty)トークンと一致するメンバーを加点
 *  - カテゴリごとに役割の重み付け(成果報告→CA/RA、ニュース/所感→代表、相談→同職種)
 *  - 常に代表(小堀)を候補に含め、全社共有の目が届くようにする
 */
function scoreMembers(text: string, category: DeliverCategory, members: Member[]): ScoredMember[] {
  const matchedAreas = AREA_RULES.filter((rule) => rule.keywords.some((k) => text.includes(k)));

  return members.map((member) => {
    let score = 0;
    const reasons: string[] = [];

    for (const area of matchedAreas) {
      if (area.memberIds.includes(member.id)) {
        score += 4;
        reasons.push(area.reason);
      }
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
        if (member.role === "代表") {
          score += 1;
          reasons.push("経営として成約実績を把握しておくべき立場");
        }
        break;
      case "ニュース":
        if (member.role === "代表") {
          score += 3;
          reasons.push("全社ニュースの発信・周知を担う立場");
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
        if (member.role === "代表") {
          score += 1;
          reasons.push("相談ごとの窓口となりうる立場");
        }
        break;
      case "所感":
        if (member.role === "代表") {
          score += 2;
          reasons.push("チーム全体の所感を集約する立場");
        } else {
          score += 1;
        }
        break;
    }

    // 代表は常に一定スコアを持たせ、全社的な情報共有の受け皿にする
    if (isTopManagement(member)) {
      score += 1.5;
      if (reasons.length === 0) reasons.push("経営として全社の動きを把握する立場");
    }

    return { member, score, reasons };
  });
}

/** カテゴリ・本文から配信先Slackチャンネルを決める。 */
function resolveChannels(text: string, category: DeliverCategory): string[] {
  const channels = new Set<string>();

  if (category === "成果報告") channels.add("#成約報告");
  if (category === "ニュース") channels.add("#全社");
  if (category === "所感") channels.add("#お知らせ");
  if (category === "相談") channels.add("#お知らせ");

  const matchedAreas = AREA_RULES.filter((rule) => rule.keywords.some((k) => text.includes(k)));
  for (const area of matchedAreas) {
    channels.add(area.channel);
  }

  // 全社的な内容(達成率・全社という語)や、担当領域が特定できない成果報告は #全社 にも共有する
  if (category === "成果報告" && (text.includes("全社") || matchedAreas.length === 0)) {
    channels.add("#全社");
  }

  if (channels.size === 0) channels.add("#全社");
  return [...channels];
}

/** ルールベースで宛先メンバー・チャンネル・メッセージ案を組み立てる。 */
export function routeDelivery(text: string, category: DeliverCategory, bundle: DataBundle): DeliverSuggestion {
  const { members } = bundle;
  const scored = scoreMembers(text, category, members)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  let picked = scored.slice(0, 4);
  if (picked.length < 2) {
    // スコアが立たない場合のセーフティネット: 代表 + CA/RA陣を補充
    const fallbackIds = new Set(picked.map((p) => p.member.id));
    const fallbackCandidates = members.filter((m) => !fallbackIds.has(m.id));
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
    specialty: member.specialty,
    reason: reasons[0] ?? "関連するメンバーとして選定",
  }));

  const channels = resolveChannels(text, category);
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
  const { members } = bundle;
  const memberList = members
    .map((m) => `- id:${m.id} 氏名:${m.name} 役割:${ROLE_LABELS[m.role]} 得意領域:${m.specialty}`)
    .join("\n");

  return `あなたは株式会社翔び台(人材紹介会社)の社内情報配信アシスタントです。
ユーザーが入力した「配信したい情報」の本文とカテゴリから、最適な宛先メンバー(2〜4名、理由付き)と配信先Slackチャンネル、整形済みメッセージ案を提案してください。
担当領域の目安: 法人営業・契約・商談→清本・江崎、求職者対応(面談・選考・内定)→今井・佐藤・富田、マーケティング(PV・LINE集客)・経営数字→小堀。

# 社内メンバー一覧
${memberList}

# 出力形式
必ず以下のJSON形式のみを出力してください(前後に説明文やコードフェンスを付けないこと)。
{
  "members": [ { "id": "m2", "reason": "選定理由(日本語、1文)" } ],
  "channels": ["#成約報告", "#全社"],
  "headline": "【成果報告】のようなカテゴリ見出し",
  "mentions": ["@今井"]
}

ルール:
- members は上記メンバー一覧に実在する id のみを2〜4件、関連性の高い順に選ぶこと。
- channels は "#" から始まるチャンネル名を1〜3件("#成約報告" "#全社" "#お知らせ" "#法人営業" "#CA" など)。
- mentions は選んだメンバーの氏名に "@" を付けたもの。`;
}
