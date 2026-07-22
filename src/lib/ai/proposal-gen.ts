/**
 * 提案書(AI推薦状ジェネレーター)- 生成ロジック
 * 設計書 4.5 対応。
 *
 * 手数料計算・希望条件表・担当CA連絡先など「数字が合っていなければならない」項目は
 * Claude の有無にかかわらず必ずこのファイル側で決定的に計算する(LLMには文章のみを生成させる)。
 * Claude API が使える場合はそちらで自然な日本語の推薦文を生成し、
 * 使えない・応答の形が不正な場合はテンプレートベース生成にフォールバックする。
 */
import { askClaude } from "./client";
import { candidates } from "@/lib/demo-data";
import { getBranchById, getMemberById } from "@/lib/metrics";
import { CA_MEMBER_ID } from "@/lib/demo-data";
import { FEE_RATE } from "@/lib/types";

export type AgeBand = "20代" | "30代" | "40代" | "50代以上";
export type ChangeReason =
  | "キャリアアップ"
  | "年収向上"
  | "ワークライフバランス"
  | "新分野挑戦";

export const AGE_BANDS: AgeBand[] = ["20代", "30代", "40代", "50代以上"];
export const CHANGE_REASONS: ChangeReason[] = [
  "キャリアアップ",
  "年収向上",
  "ワークライフバランス",
  "新分野挑戦",
];

export interface ProposalInput {
  /** 任意。デモ求職者から選んだ場合は氏名が入る。 */
  candidateName: string;
  ageBand: AgeBand;
  currentRole: string;
  desiredRole: string;
  /** 万円単位 */
  desiredIncomeMan: number;
  desiredLocation: string;
  reason: ChangeReason;
}

export interface ConditionRow {
  label: string;
  value: string;
}

export interface FeeCalc {
  incomeMan: number;
  feeRateLabel: string;
  feeMan: number;
}

export interface CaContact {
  name: string;
  roleLabel: string;
  email: string;
  phone: string;
}

export interface ProposalResult {
  headerDateLabel: string;
  candidateLabel: string;
  candidateSummary: string;
  reasons: string[];
  highlights: string[];
  conditionsTable: ConditionRow[];
  feeCalc: FeeCalc;
  caContact: CaContact;
  source: "claude" | "demo";
}

// ─────────────────────────────────────────────
// 決定的パート(常にこのファイルで計算する)
// ─────────────────────────────────────────────

function formatHeaderDate(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function buildConditionsTable(input: ProposalInput): ConditionRow[] {
  return [
    { label: "年齢層", value: input.ageBand },
    { label: "現職種", value: input.currentRole },
    { label: "希望職種", value: input.desiredRole },
    { label: "希望年収", value: `${input.desiredIncomeMan.toLocaleString("ja-JP")}万円` },
    { label: "希望勤務地", value: input.desiredLocation },
    { label: "転職目的", value: input.reason },
  ];
}

function buildFeeCalc(input: ProposalInput): FeeCalc {
  const feeMan = Math.round(input.desiredIncomeMan * FEE_RATE);
  return {
    incomeMan: input.desiredIncomeMan,
    feeRateLabel: `${Math.round(FEE_RATE * 100)}%`,
    feeMan,
  };
}

/** 氏名がデモ求職者と一致すれば、その担当CAを連絡先として使う。一致しなければ既定のCA(高梨CA)を使う。 */
function resolveCaContact(candidateName: string): CaContact {
  const matched = candidateName ? candidates.find((c) => c.name === candidateName) : undefined;
  const member = getMemberById(matched?.caId ?? CA_MEMBER_ID) ?? getMemberById(CA_MEMBER_ID);
  const branchName = member ? getBranchById(member.branchId)?.name : undefined;
  return {
    name: member?.name ?? "高梨 玲奈",
    roleLabel: member ? `${member.role} / ${branchName ?? ""}拠点` : "CA",
    // デモ環境のため実在しない連絡先(社内表記のダミー)
    email: "career-support@tobidai-cockpit.example",
    phone: "03-1234-5678(デモ表示)",
  };
}

// ─────────────────────────────────────────────
// テンプレートベース生成(デモレスポンダ)
// ─────────────────────────────────────────────

const REASON_SENTENCE: Record<ChangeReason, string> = {
  キャリアアップ:
    "更なるキャリアアップを志向しており、裁量のあるポジションで早期に成果を出す意欲を持っています。",
  年収向上:
    "市場価値に見合う処遇を求めており、成果が正当に評価される環境で高いパフォーマンスを発揮する見込みです。",
  ワークライフバランス:
    "働き方の柔軟性を重視しつつも業務へのコミットメントは高く、安定した貢献が期待できます。",
  新分野挑戦:
    "新しい分野への挑戦意欲が高く、キャッチアップの速さを活かして早期の戦力化が見込めます。",
};

const AGE_BAND_STRENGTH: Record<AgeBand, string> = {
  "20代": "吸収力と柔軟性の高さ",
  "30代": "実務経験と自走力を両立した対応力",
  "40代": "マネジメント経験や業界知見に基づく判断力",
  "50代以上": "豊富な経験に裏打ちされた安定した判断力と後進育成力",
};

function generateDemoNarrative(input: ProposalInput, candidateLabel: string) {
  const reasons = [
    `現職(${input.currentRole})で培った実務経験を活かし、${input.desiredRole}として即戦力の活躍が期待できます。`,
    REASON_SENTENCE[input.reason],
    `${input.ageBand}ならではの${AGE_BAND_STRENGTH[input.ageBand]}があり、チームへの早期適応が見込まれます。`,
  ];

  const highlights = [
    `${input.currentRole}分野における実務経験`,
    `${input.desiredRole}に直結するスキルセット・知見`,
    `転職目的「${input.reason}」に沿った明確なキャリアビジョン`,
    `${input.desiredLocation}での就業を前提とした、無理のない転職活動`,
  ];

  const candidateSummary = `${candidateLabel}は${input.ageBand}、現職${input.currentRole}のご経験をお持ちで、${input.desiredRole}としての転職を希望されています。転職目的は「${input.reason}」で、希望勤務地は${input.desiredLocation}、希望年収は${input.desiredIncomeMan.toLocaleString("ja-JP")}万円です。ご経験とご志向を踏まえ、貴社にご推薦いたします。`;

  return { candidateSummary, reasons, highlights };
}

// ─────────────────────────────────────────────
// Claude 連携パス(推薦文のみを生成させる)
// ─────────────────────────────────────────────

const PROPOSAL_SYSTEM_PROMPT = `あなたは人材紹介会社「株式会社翔び台」のキャリアアドバイザーです。
求職者の条件をもとに、企業向け推薦状の文章パートのみを、以下のJSON形式のみで出力してください。説明文やコードフェンスは付けず、JSONのみを返してください。数字の計算(手数料額など)は行わないでください。

{
  "candidateSummary": "候補者サマリを2〜3文で(ですます調)",
  "reasons": ["推薦理由をちょうど3件、それぞれ1文で"],
  "highlights": ["スキル・経験ハイライトを3〜4件、それぞれ短い句で"]
}`;

function buildProposalUserPrompt(input: ProposalInput, candidateLabel: string): string {
  return `候補者表記: ${candidateLabel}
年齢層: ${input.ageBand}
現職種: ${input.currentRole}
希望職種: ${input.desiredRole}
希望年収: ${input.desiredIncomeMan}万円
希望勤務地: ${input.desiredLocation}
転職目的: ${input.reason}`;
}

function parseClaudeJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fromClaudeJson(
  json: Record<string, unknown>,
): { candidateSummary: string; reasons: string[]; highlights: string[] } | null {
  const { candidateSummary, reasons, highlights } = json;
  if (
    typeof candidateSummary !== "string" ||
    !Array.isArray(reasons) ||
    !reasons.every((r) => typeof r === "string") ||
    reasons.length === 0 ||
    !Array.isArray(highlights) ||
    !highlights.every((h) => typeof h === "string") ||
    highlights.length === 0
  ) {
    return null;
  }
  return { candidateSummary, reasons, highlights };
}

/**
 * 提案書(推薦状)の結果を生成する。
 * 数値・表(希望条件表/手数料計算/CA連絡先)は常にこのファイルで決定的に計算し、
 * 推薦文(サマリ/推薦理由/ハイライト)のみ Claude → テンプレートの順で生成する。
 */
export async function generateProposalResult(input: ProposalInput): Promise<ProposalResult> {
  const candidateLabel = input.candidateName.trim() || "本求職者";

  const claudeText = await askClaude(
    PROPOSAL_SYSTEM_PROMPT,
    buildProposalUserPrompt(input, candidateLabel),
  );
  let narrative: { candidateSummary: string; reasons: string[]; highlights: string[] } | null = null;
  let source: "claude" | "demo" = "demo";
  if (claudeText) {
    const json = parseClaudeJson(claudeText);
    narrative = json ? fromClaudeJson(json) : null;
    if (narrative) source = "claude";
  }
  if (!narrative) {
    narrative = generateDemoNarrative(input, candidateLabel);
  }

  return {
    headerDateLabel: formatHeaderDate(),
    candidateLabel,
    candidateSummary: narrative.candidateSummary,
    reasons: narrative.reasons,
    highlights: narrative.highlights,
    conditionsTable: buildConditionsTable(input),
    feeCalc: buildFeeCalc(input),
    caContact: resolveCaContact(input.candidateName.trim()),
    source,
  };
}
