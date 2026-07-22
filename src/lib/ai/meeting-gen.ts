/**
 * 面談AI(面談コパイロット)- 生成ロジック
 * 設計書 4.4 対応。
 *
 * `askClaude` が使える(ANTHROPIC_API_KEY 設定済み)場合は構造化プロンプトで一括生成し、
 * 使えない場合はここに実装したルールベース抽出(デモレスポンダ)で同じ形の結果を組み立てる。
 * どちらの経路でも呼び出し元(api/meeting/route.ts)からは `generateMeetingResult` を呼ぶだけでよい。
 */
import { askClaude } from "./client";
import { findMemberByName } from "@/lib/metrics";
import { PIPELINE_STAGES } from "@/lib/types";
import type { DataBundle } from "@/lib/types";
import type { MeetingKind } from "@/lib/demo-transcripts";

export interface MeetingActionItem {
  action: string;
  dueDate: string;
  owner: string;
}

export interface SheetUpdateRow {
  target: string;
  field: string;
  before: string;
  after: string;
}

export interface FollowUpEmail {
  subject: string;
  body: string;
}

export interface MeetingResult {
  kind: MeetingKind;
  /** 議事録(要点箇条書き) */
  minutes: string[];
  /** 求職者・顧客インサイト(本音・温度感) */
  insight: string;
  /** ネクストアクション(期限つき) */
  actions: MeetingActionItem[];
  /** スプレッドシート更新案(表形式) */
  sheetUpdates: SheetUpdateRow[];
  /** フォローメール文面 */
  followUpEmail: FollowUpEmail;
  /** どちらの経路で生成したか(UI表示用) */
  source: "claude" | "demo";
}

// ─────────────────────────────────────────────
// 共通ユーティリティ
// ─────────────────────────────────────────────

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

/** 今日から n 日後の表示ラベル(0 = 本日中)。 */
function dueInDays(n: number): string {
  if (n <= 0) return "本日中";
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${formatDateLabel(d)}まで`;
}

/** ヘッダー行(【面談メモ】...)から `ラベル: 値` 形式のフィールドを取り出す。 */
function extractHeaderField(transcript: string, label: string): string | null {
  const re = new RegExp(`${label}[:：]\\s*([^/\\n]+)`);
  const match = transcript.match(re);
  if (!match) return null;
  return match[1].replace(/様\s*$/, "").trim();
}

/** 文字起こし冒頭の発言者名(例: 「今井:」)から社内メンバーを推定する。 */
function extractSpeakerMember(transcript: string, bundle: DataBundle) {
  const attendee = extractHeaderField(transcript, "対応");
  const attendeeName = attendee?.split(/[(（]/)[0]?.trim();
  if (attendeeName) {
    const member = findMemberByName(bundle.members, attendeeName);
    if (member) return member;
  }
  const firstLine = transcript
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^[^\s:：]+[:：]/.test(l) && !l.startsWith("【"));
  const speaker = firstLine?.match(/^([^\s:：]+)[:：]/)?.[1];
  return speaker ? findMemberByName(bundle.members, speaker) : undefined;
}

/** 文字起こしを発言単位の文(「。」区切り)に分解する(話者ラベルは除去)。 */
function splitSentences(transcript: string): string[] {
  return transcript
    .split("\n")
    .map((line) => line.replace(/^【.*】.*$/, "").replace(/^[^\s:：]{1,6}[:：]\s*/, "").trim())
    .filter(Boolean)
    .flatMap((line) => line.split("。").map((s) => s.trim()))
    .filter((s) => s.length > 0);
}

function pickByKeywords(sentences: string[], keywords: string[], limit = 3): string[] {
  const hits = sentences.filter((s) => keywords.some((k) => s.includes(k)));
  return Array.from(new Set(hits)).slice(0, limit);
}

// ─────────────────────────────────────────────
// ルールベース抽出(デモレスポンダ)
// ─────────────────────────────────────────────

const CANDIDATE_KEYWORDS = {
  background: ["現在", "現職", "実務経験", "案件", "きっかけ", "不満"],
  conditions: ["希望", "年収", "リモート", "自社開発", "勤務地", "働き方"],
  concerns: ["不安", "懸念", "心配", "気になる", "気になり"],
};

const CORPORATE_KEYWORDS = {
  background: ["採用背景", "増員", "事業拡大", "欠員", "背景"],
  requirements: ["必須", "スキル", "経験", "年以上", "歓迎"],
  incomeRange: ["年収", "万円", "レンジ"],
  process: ["選考", "面接", "書類確認", "一次", "最終", "内定"],
  focus: ["重視", "懸念", "カルチャー", "協調性"],
};

function positiveTemperature(transcript: string): boolean {
  return ["急ぎ", "すぐにでも", "前向き", "早期", "最短"].some((k) => transcript.includes(k));
}

function generateCandidateDemo(transcript: string, bundle: DataBundle): MeetingResult {
  const sentences = splitSentences(transcript);
  const nameField = extractHeaderField(transcript, "求職者") ?? "対象求職者";
  const roleField = extractHeaderField(transcript, "希望職種");
  const speakerMember = extractSpeakerMember(transcript, bundle);
  const owner = speakerMember?.name ?? "担当CA";

  const background = pickByKeywords(sentences, CANDIDATE_KEYWORDS.background);
  const conditions = pickByKeywords(sentences, CANDIDATE_KEYWORDS.conditions);
  const concerns = pickByKeywords(sentences, CANDIDATE_KEYWORDS.concerns);

  const minutes = [
    ...background.map((s) => `【現状・転職理由】${s}`),
    ...conditions.map((s) => `【希望条件】${s}`),
    ...concerns.map((s) => `【懸念点】${s}`),
  ];
  if (minutes.length === 0) {
    minutes.push("会話内容からは要点キーワードを十分に抽出できませんでした。文字起こしをご確認ください。");
  }

  const temperature = positiveTemperature(transcript) ? "高め" : "中程度";
  const insight = [
    conditions[0] ? `${conditions[0]}という希望が語られており、` : "",
    concerns[0] ? `一方で${concerns[0]}という懸念も抱えている様子です。` : "懸念点は明確には語られていません。",
    `転職活動の温度感は${temperature}と見立てられます。`,
  ].join("");

  const matchedCandidate = bundle.candidates.find(
    (c) => c.name === nameField || c.name.includes(nameField) || nameField.includes(c.name),
  );

  const currentStageIndex = matchedCandidate
    ? PIPELINE_STAGES.indexOf(matchedCandidate.stage)
    : -1;
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < PIPELINE_STAGES.length - 1
      ? PIPELINE_STAGES[currentStageIndex + 1]
      : "面談";

  const newNote = [conditions[0], concerns[0]].filter(Boolean).join(" / ") || "初回面談を実施。";

  const sheetUpdates: SheetUpdateRow[] = matchedCandidate
    ? [
        {
          target: matchedCandidate.name,
          field: "選考ステージ",
          before: matchedCandidate.stage,
          after: nextStage,
        },
        {
          target: matchedCandidate.name,
          field: "最新メモ",
          before: matchedCandidate.latestNote,
          after: newNote,
        },
      ]
    : [
        {
          target: nameField,
          field: "選考ステージ",
          before: "(未登録)",
          after: "面談",
        },
        {
          target: nameField,
          field: "最新メモ",
          before: "(未登録)",
          after: newNote,
        },
      ];

  const actions: MeetingActionItem[] = [
    { action: "面談メモをスプレッドシートへ反映", dueDate: dueInDays(0), owner },
    { action: `提案企業リストの選定(${roleField ?? "希望職種"}軸)`, dueDate: dueInDays(2), owner },
    { action: "職務経歴書・ポートフォリオの受領確認", dueDate: dueInDays(3), owner },
    { action: "候補求人の提案・共有", dueDate: dueInDays(5), owner },
    { action: "フォローメール送信", dueDate: dueInDays(0), owner },
  ];

  const followUpEmail: FollowUpEmail = {
    subject: `【株式会社翔び台】本日はありがとうございました(${nameField}様)`,
    body: `${nameField}様

本日はお忙しい中、面談のお時間をいただきありがとうございました。
${conditions[0] ? `ご希望条件として伺いました「${conditions[0]}」を踏まえ、` : ""}条件に合う求人企業を選定し、改めてご連絡いたします。
${concerns[0] ? `「${concerns[0]}」というお気持ちについても、選考を進める中で丁寧にフォローさせていただきます。` : ""}

ご不明点等ございましたら、いつでもご連絡ください。
引き続きよろしくお願いいたします。

株式会社翔び台
${owner}`,
  };

  return { kind: "candidate", minutes, insight, actions, sheetUpdates, followUpEmail, source: "demo" };
}

function generateCorporateDemo(transcript: string, bundle: DataBundle): MeetingResult {
  const sentences = splitSentences(transcript);
  const companyField = extractHeaderField(transcript, "企業") ?? "対象企業";
  const speakerMember = extractSpeakerMember(transcript, bundle);
  const owner = speakerMember?.name ?? "担当RA";

  const background = pickByKeywords(sentences, CORPORATE_KEYWORDS.background);
  const requirements = pickByKeywords(sentences, CORPORATE_KEYWORDS.requirements);
  const incomeRange = pickByKeywords(sentences, CORPORATE_KEYWORDS.incomeRange, 2);
  const process = pickByKeywords(sentences, CORPORATE_KEYWORDS.process, 2);
  const focus = pickByKeywords(sentences, CORPORATE_KEYWORDS.focus);

  const minutes = [
    ...background.map((s) => `【採用背景】${s}`),
    ...requirements.map((s) => `【求人要件】${s}`),
    ...incomeRange.map((s) => `【年収レンジ】${s}`),
    ...process.map((s) => `【選考フロー】${s}`),
    ...focus.map((s) => `【重視ポイント】${s}`),
  ];
  if (minutes.length === 0) {
    minutes.push("会話内容からは要点キーワードを十分に抽出できませんでした。文字起こしをご確認ください。");
  }

  const temperature = positiveTemperature(transcript) ? "高く、スピード対応が求められる" : "通常ペース";
  const insight = [
    background[0] ? `${background[0]}という背景があり、` : "",
    focus[0] ? `「${focus[0]}」を選考上の重視ポイントとして語っており、` : "",
    `採用意欲は${temperature}案件と見立てられます。`,
  ].join("");

  const incomeText = incomeRange[0] ?? "(要確認)";

  const sheetUpdates: SheetUpdateRow[] = [
    {
      target: companyField,
      field: "求人ステータス",
      before: "ヒアリング前",
      after: "要件確定・候補者提案準備中",
    },
    {
      target: companyField,
      field: "年収レンジ",
      before: "未登録",
      after: incomeText,
    },
  ];

  const actions: MeetingActionItem[] = [
    { action: "商談メモをスプレッドシート(求人管理)へ反映", dueDate: dueInDays(0), owner },
    { action: "要件に合う候補者のスクリーニング", dueDate: dueInDays(3), owner },
    { action: "求人票(JD)のドラフト作成・社内共有", dueDate: dueInDays(2), owner },
    { action: "選考フロー・年収レンジの担当CA陣への共有", dueDate: dueInDays(0), owner },
    { action: "御礼メール送信", dueDate: dueInDays(0), owner },
  ];

  const followUpEmail: FollowUpEmail = {
    subject: `【株式会社翔び台】本日は貴重なお時間をいただきありがとうございました`,
    body: `${companyField} ご担当者様

本日は貴重なお時間をいただき、誠にありがとうございました。
${requirements[0] ? `ご共有いただいた要件「${requirements[0]}」` : "ご共有いただいた採用要件"}をもとに、候補者の選定を進めてまいります。
${process[0] ? `選考フローについても「${process[0]}」の内容で認識しております。` : ""}

要件に合う候補者が見つかり次第、改めてご提案させていただきます。
引き続きよろしくお願いいたします。

株式会社翔び台
${owner}`,
  };

  return { kind: "corporate", minutes, insight, actions, sheetUpdates, followUpEmail, source: "demo" };
}

function generateDemoMeetingResult(transcript: string, kind: MeetingKind, bundle: DataBundle): MeetingResult {
  return kind === "corporate"
    ? generateCorporateDemo(transcript, bundle)
    : generateCandidateDemo(transcript, bundle);
}

// ─────────────────────────────────────────────
// Claude 連携パス
// ─────────────────────────────────────────────

const MEETING_SYSTEM_PROMPT = `あなたは人材紹介会社「株式会社翔び台」のオペレーションアシスタントです。
面談・商談の文字起こしから、以下のJSON形式のみを出力してください。説明文やコードフェンスは付けず、JSONのみを返してください。

{
  "minutes": ["議事録の要点を箇条書きで3〜6件"],
  "insight": "求職者または企業側の本音・温度感を1〜2文で",
  "actions": [{"action": "やること", "dueDate": "期限(例: 7/24(金)まで、本日中 など)", "owner": "担当者名(文中の対応者名。不明なら「担当CA」または「担当RA」)"}],
  "sheetUpdates": [{"target": "対象(求職者名または企業名)", "field": "更新項目(例: 選考ステージ、最新メモ、年収レンジ など)", "before": "変更前の値(不明なら「(要確認)」)", "after": "変更後の値・追記内容"}],
  "followUpEmail": {"subject": "件名", "body": "本文(宛名〜署名まで含める)"}
}

actions は3〜5件、sheetUpdates は1〜3件としてください。すべて自然な日本語(ですます調)で、文字起こしの内容に基づいた具体的な記載にしてください。`;

function buildMeetingUserPrompt(transcript: string, kind: MeetingKind): string {
  const kindLabel = kind === "corporate" ? "企業側商談(採用ニーズヒアリング)" : "求職者面談";
  return `種別: ${kindLabel}
本日の日付: ${formatDateLabel(new Date())}

--- 文字起こし ---
${transcript}
--- ここまで ---`;
}

/** Claude の応答テキストから JSON 部分だけを取り出してパースする。 */
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

function isMeetingActionItem(v: unknown): v is MeetingActionItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.action === "string" && typeof o.dueDate === "string" && typeof o.owner === "string";
}

function isSheetUpdateRow(v: unknown): v is SheetUpdateRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.target === "string" &&
    typeof o.field === "string" &&
    typeof o.before === "string" &&
    typeof o.after === "string"
  );
}

function fromClaudeJson(json: Record<string, unknown>, kind: MeetingKind): MeetingResult | null {
  const minutes = json.minutes;
  const insight = json.insight;
  const actions = json.actions;
  const sheetUpdates = json.sheetUpdates;
  const followUpEmail = json.followUpEmail as Record<string, unknown> | undefined;

  if (
    !Array.isArray(minutes) ||
    !minutes.every((m) => typeof m === "string") ||
    typeof insight !== "string" ||
    !Array.isArray(actions) ||
    !actions.every(isMeetingActionItem) ||
    !Array.isArray(sheetUpdates) ||
    !sheetUpdates.every(isSheetUpdateRow) ||
    !followUpEmail ||
    typeof followUpEmail.subject !== "string" ||
    typeof followUpEmail.body !== "string"
  ) {
    return null;
  }

  return {
    kind,
    minutes,
    insight,
    actions,
    sheetUpdates,
    followUpEmail: { subject: followUpEmail.subject, body: followUpEmail.body },
    source: "claude",
  };
}

/**
 * 面談AIの結果を生成する。Claude API が使える場合はそちらを優先し、
 * 使えない・応答の形が不正な場合はルールベース抽出にフォールバックする。
 */
export async function generateMeetingResult(
  transcript: string,
  kind: MeetingKind,
  bundle: DataBundle,
): Promise<MeetingResult> {
  const claudeText = await askClaude(MEETING_SYSTEM_PROMPT, buildMeetingUserPrompt(transcript, kind));
  if (claudeText) {
    const json = parseClaudeJson(claudeText);
    const parsed = json ? fromClaudeJson(json, kind) : null;
    if (parsed) return parsed;
  }
  return generateDemoMeetingResult(transcript, kind, bundle);
}

