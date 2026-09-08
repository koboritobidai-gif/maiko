/**
 * RaReportSource アダプタ
 * RA(リクルーティングアドバイザー)が毎日 Slack「#21_ra」チャンネルに投稿する営業日報
 * (親メッセージ=「【営業日報】9/8(火)」のようなタイトル、本文はそのスレッド返信〈投稿者本人の
 * 返信〉、または親メッセージに直書きされる形式)を自動集計するためのデータ取得口。
 * 運用前提: SLACK_RA_CHANNEL(#21_ra のチャンネルID)未設定の間は「機能OFF」(ra-report-data.ts側で
 * status: "demo" ・0件として扱う)。人数・氏名はハードコードせず、日報を投稿した人ごとに集計する。
 *
 * `sales-reports.ts` と同じ #21_ra チャンネルを見るが、対象とする親メッセージの種類が異なる
 * (架電数報告bot・業務報告スレッドではなく「【営業日報】」を含む親メッセージのみ)ため、
 * 完全に独立した集計として実装する(既存の sales-reports.ts のロジックには手を入れない)。
 *
 * Slack API呼び出しは adapters/messenger.ts の SlackSource と同じ取得パターン(fetch + Bearer
 * SLACK_BOT_TOKEN、429時はSlackの Retry-After 秒待って1回だけ再試行、conversations.replies は
 * 鮮度キー「返信数:最新返信ts」でNext.jsデータキャッシュに30日保存)を踏襲する。重複実装を避けるため、
 * messenger.ts が export している `slackGet` 等のヘルパー・型をそのまま再利用する。
 *
 * デモ段階は DemoRaReportSource が demo-data.ts のデモ日報(2名×数日分)を返す。
 */
import type { RaDailyReport } from "../types";
import { raDailyReports as demoRaDailyReports } from "../demo-data";
import {
  slackGet,
  type SlackHistoryResponse,
  type SlackMessage,
  type SlackRepliesResponse,
  type SlackUserInfoResponse,
} from "./messenger";

export interface GetRaDailyReportsOptions {
  /**
   * スレッド返信の新規取得に使ってよい時間の上限(ms)。省略時は DEFAULT_TIME_BUDGET_MS。
   * /api/warm のウォームアップ実行など、通常のページ表示より長く時間をかけたい場合に指定する。
   */
  timeBudgetMs?: number;
}

export interface RaReportFetchResult {
  reports: RaDailyReport[];
  /**
   * 返信を取得したかった(reply_count > 0 の)のに、時間予算超過等で取得できず親メッセージのみで
   * 組み立てた日報の件数(=内容が不完全な可能性がある件数)。デモ実装は常に0。
   */
  skippedCount: number;
}

export interface RaReportSource {
  getRaDailyReports(opts?: GetRaDailyReportsOptions): Promise<RaReportFetchResult>;
}

/** デモ実装: demo-data.ts のデモ日報をそのまま返す。 */
export class DemoRaReportSource implements RaReportSource {
  async getRaDailyReports(): Promise<RaReportFetchResult> {
    return { reports: [...demoRaDailyReports], skippedCount: 0 };
  }
}

// ─────────────────────────────────────────────
// 読み取りヒューリスティック(表記揺れに耐えるパーサー)
// ─────────────────────────────────────────────

/** 全角数字を半角に変換する(全角のまま正規表現にかけると \d にマッチしないため)。 */
function toHalfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 「記入なし」を表す表記(値0扱い)。ハイフン・ダッシュ類の表記揺れも吸収する。 */
const ZERO_TOKENS = new Set(["なし", "無し", "-", "−", "‐", "―", "ー"]);

/** 件数系の値を読み取る。カンマ・全角数字・「件」「本」表記に対応。空欄はundefined。 */
function parseCount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (ZERO_TOKENS.has(trimmed)) return 0;
  const cleaned = toHalfWidthDigits(trimmed).replace(/,/g, "").replace(/[件本]/g, "").trim();
  const m = /^(\d+)/.exec(cleaned);
  return m ? Number(m[1]) : undefined;
}

/** 金額(円)の値を読み取る。「¥」「円」「,」表記に対応。空欄はundefined。 */
function parseYen(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (ZERO_TOKENS.has(trimmed)) return 0;
  const cleaned = toHalfWidthDigits(trimmed).replace(/[¥￥,円\s]/g, "");
  const m = /^(\d+)/.exec(cleaned);
  return m ? Number(m[1]) : undefined;
}

/**
 * 「A／B」形式の2値を分割する(／・半角/・中黒のいずれの区切りにも対応)。
 * 区切りが無く1値しか書かれていない場合は前者のみとして扱う(spec通り)。
 */
function splitDualValue(raw: string): [string, string | undefined] {
  const parts = raw
    .split(/[／\/・]/)
    .map((p) => p.trim())
    .filter((p, i, arr) => !(p === "" && arr.length > 1));
  if (parts.length >= 2) return [parts[0], parts[1]];
  return [raw.trim(), undefined];
}

/** ラベル比較用に正規化する(全角/半角スラッシュを統一・空白除去)。 */
function normalizeLabel(s: string): string {
  return s.replace(/[／\/]/g, "/").replace(/\s+/g, "").trim();
}

/** 「ラベル:値」形式の行(半角/全角コロン両対応)。値が空なら次行を値候補にする際に使う。 */
const LABEL_LINE_RE = /^(.{1,40}?)[:：]\s*(.*)$/;

/** 行が「別のラベル行」かどうか(次行値の採用可否判定用)。■見出し・①②…の項目・任意のラベル行を対象。 */
function isLabelLine(line: string): boolean {
  if (line.startsWith("■")) return true;
  if (/^[①-⑳]/.test(line)) return true;
  return LABEL_LINE_RE.test(line);
}

type NumericField =
  | "callDials"
  | "callConnected"
  | "callAppointments"
  | "dmSent"
  | "dmReplies"
  | "dmAppointments"
  | "eventCount"
  | "eventCardTarget"
  | "eventCardsExchanged"
  | "eventDecisionMakerCards"
  | "eventAppointments"
  | "eventFeeYen"
  | "referralObtained"
  | "referralAppointments"
  | "resultAppointments"
  | "resultMeetings"
  | "resultContracts";

export type RaParsedFields = Partial<Record<NumericField, number>>;

/** 単一の値を持つラベル(ラベル文字列は表記そのまま。比較時は normalizeLabel で揺れを吸収する)。 */
const SINGLE_LABELS: { label: string; field: NumericField; kind: "count" | "yen" }[] = [
  { label: "架電アポ獲得", field: "callAppointments", kind: "count" },
  { label: "DM送信数", field: "dmSent", kind: "count" },
  { label: "DM返信数", field: "dmReplies", kind: "count" },
  { label: "DMアポ獲得", field: "dmAppointments", kind: "count" },
  { label: "交流会参加数", field: "eventCount", kind: "count" },
  { label: "意思決定者の名刺数", field: "eventDecisionMakerCards", kind: "count" },
  { label: "交流会アポ獲得", field: "eventAppointments", kind: "count" },
  { label: "交流会参加費", field: "eventFeeYen", kind: "yen" },
  { label: "紹介獲得数", field: "referralObtained", kind: "count" },
  { label: "紹介アポ獲得", field: "referralAppointments", kind: "count" },
  // 「アポイント数」「商談実施数」「契約数」は■本日の成果ブロックのみに登場する想定(①②…の
  // 自由記述ブロックにはこれらと同名の完全一致ラベルは出てこない)。
  { label: "アポイント数", field: "resultAppointments", kind: "count" },
  { label: "商談実施数", field: "resultMeetings", kind: "count" },
  { label: "契約数", field: "resultContracts", kind: "count" },
];

/** 「A／B」の2値を持つラベル。 */
const DUAL_LABELS: { label: string; fields: [NumericField, NumericField] }[] = [
  { label: "架電数／本通", fields: ["callDials", "callConnected"] },
  { label: "名刺交換目標／名刺交換数", fields: ["eventCardTarget", "eventCardsExchanged"] },
];

/** Slackのコードブロック```記号を除去する(囲みの有無どちらにも対応するため単純除去)。 */
function stripCodeFences(text: string): string {
  return text.replace(/```/g, "");
}

/**
 * 日報本文(親本文+投稿者本人の返信を連結したもの)を項目ごとの数値に分解する(純関数)。
 * 「■本日のアポ・商談」ブロック内の①②…は対象ラベルが無いため自然に読み飛ばされる。
 * 自由記述(所感・備考等)はそもそも対象フィールドが無いため読み取らない。
 */
export function parseRaReportText(rawText: string): RaParsedFields {
  const lines = stripCodeFences(rawText)
    .split("\n")
    .map((l) => l.trim());

  const valueByLabel = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = LABEL_LINE_RE.exec(line);
    if (!m) continue;
    const label = normalizeLabel(m[1]);
    let value = m[2].trim();
    if (value === "") {
      // ラベルと値が別行の場合(実例:「目的:」の次行に値)。次行が■見出しや別のラベル行でない
      // 場合のみ値とみなす(自由記述ブロックの説明文を誤って値として拾わないようにするため)。
      const next = lines[i + 1] ?? "";
      if (next !== "" && !isLabelLine(next)) {
        value = next;
      }
    }
    // 同じラベル文言が複数セクションに登場する場合(所感ラベル等)は最初の出現を優先する。
    if (!valueByLabel.has(label)) valueByLabel.set(label, value);
  }

  const result: RaParsedFields = {};
  for (const { label, field, kind } of SINGLE_LABELS) {
    const raw = valueByLabel.get(normalizeLabel(label));
    if (raw === undefined) continue;
    const parsed = kind === "yen" ? parseYen(raw) : parseCount(raw);
    if (parsed !== undefined) result[field] = parsed;
  }
  for (const { label, fields } of DUAL_LABELS) {
    const raw = valueByLabel.get(normalizeLabel(label));
    if (raw === undefined) continue;
    const [rawA, rawB] = splitDualValue(raw);
    const a = parseCount(rawA);
    const b = rawB !== undefined ? parseCount(rawB) : undefined;
    if (a !== undefined) result[fields[0]] = a;
    if (b !== undefined) result[fields[1]] = b;
  }
  return result;
}

// ─────────────────────────────────────────────
// 日付復元
// ─────────────────────────────────────────────

/** 日時をJST(UTC+9)の年月日に変換する(サーバーはUTCで動作するため)。 */
function toJst(d: Date): { y: number; m: number; d: number } {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return { y: jst.getUTCFullYear(), m: jst.getUTCMonth() + 1, d: jst.getUTCDate() };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const TITLE_DATE_RE = /【営業日報】\s*(\d{1,2})\s*\/\s*(\d{1,2})/;

/**
 * 親メッセージ本文の「【営業日報】M/D」から報告対象日(YYYY-MM-DD)を復元する。
 * 年は投稿日時(JST)の年を基本にし、報告月が投稿月より大きい場合(1月に12/31の日報など)は
 * 前年と解釈する。タイトルから読めなければ投稿日時(JST)の日付をそのまま使う。
 */
export function detectRaReportDate(parentText: string, postedAt: Date): string {
  const head = toHalfWidthDigits(parentText.slice(0, 60));
  const jstPosted = toJst(postedAt);
  const fallback = `${jstPosted.y}-${pad2(jstPosted.m)}-${pad2(jstPosted.d)}`;
  const m = TITLE_DATE_RE.exec(head);
  if (!m) return fallback;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return fallback;
  let year = jstPosted.y;
  if (month > jstPosted.m) year -= 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 表示名の括弧書き以降を落とす(「望月愛(Mochizuki Ai)」→「望月愛」)。 */
function shortenAuthorName(name: string): string {
  return name.split(/[(（]/)[0].trim() || name;
}

/** Slackの ts(unix秒.マイクロ秒)を Date に変換する。 */
function tsToDate(ts: string): Date {
  return new Date(Number(ts.split(".")[0]) * 1000);
}

// ─────────────────────────────────────────────
// SlackRaReportSource: 実連携
// ─────────────────────────────────────────────

/** スレッド返信の新規取得に使ってよい時間の既定の上限(ms)。 */
const DEFAULT_TIME_BUDGET_MS = 20_000;
// 過去120日分を対象(経営者要望の月次集計で数ヶ月分見られるように)。
const HISTORY_LOOKBACK_DAYS = 120;
const HISTORY_MAX_MESSAGES = 600;
const THREAD_CONCURRENCY = 10;

/**
 * スレッド返信のモジュールメモリキャッシュ。キーは親メッセージの ts、cacheKey は「返信数:最新返信ts」。
 * (messenger.ts の threadRepliesCache と同じ考え方。変化のないスレッドの再取得を省き、
 * Slack API のレート制限に達しにくくする。ファイルを跨いだ共有はしない=完全に独立したキャッシュ)
 */
const raReplyCache = new Map<string, { cacheKey: string; replies: SlackMessage[] }>();

interface SlackRaReportConfig {
  botToken?: string;
  /** #21_ra チャンネルのID */
  raChannel?: string;
}

/**
 * 実連携: Slack「#21_ra」の【営業日報】スレッドの自動集計。
 * `SLACK_BOT_TOKEN`(既存のものを共用)・`SLACK_RA_CHANNEL` を使用する。
 */
export class SlackRaReportSource implements RaReportSource {
  private readonly userNameCache = new Map<string, string>();

  constructor(private readonly config: SlackRaReportConfig = {}) {}

  private requireToken(): string {
    if (!this.config.botToken) {
      throw new Error("環境変数 SLACK_BOT_TOKEN が設定されていません。");
    }
    return this.config.botToken;
  }

  private async resolveUserName(botToken: string, userId: string): Promise<string> {
    const cached = this.userNameCache.get(userId);
    if (cached) return cached;
    try {
      // 表示名はほぼ変わらないため、データキャッシュにも1日保存する(コールドスタート時の呼び出し削減)。
      const res = await slackGet<SlackUserInfoResponse>(botToken, "users.info", { user: userId }, 24 * 60 * 60);
      const name =
        res.user?.profile?.real_name ||
        res.user?.profile?.display_name ||
        res.user?.real_name ||
        res.user?.name ||
        userId;
      this.userNameCache.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  }

  /**
   * 1件の【営業日報】親メッセージから RaDailyReport を組み立てる。
   * reply_count > 0 なら conversations.replies を取得し、投稿者本人の返信本文だけを親本文に連結する
   * (上司コメント等の他人の返信は混ぜない)。時間予算超過時は取得をスキップし、親本文のみで組み立てる
   * (skipped: true を返す)。
   */
  private async buildReport(
    botToken: string,
    channelId: string,
    message: SlackMessage,
    deadline: number,
  ): Promise<{ report: RaDailyReport; skipped: boolean }> {
    let combinedText = stripCodeFences(message.text ?? "");
    let skipped = false;
    const replyCount = message.reply_count ?? 0;

    if (replyCount > 0) {
      const cacheKey = `${replyCount}:${message.latest_reply ?? ""}`;
      const cached = raReplyCache.get(message.ts);
      let replyMessages: SlackMessage[] | undefined;
      if (cached && cached.cacheKey === cacheKey) {
        replyMessages = cached.replies;
      } else if (Date.now() < deadline) {
        try {
          const res = await slackGet<SlackRepliesResponse>(
            botToken,
            "conversations.replies",
            { channel: channelId, ts: message.ts, limit: "50", _v: cacheKey },
            30 * 24 * 60 * 60,
          );
          replyMessages = (res.messages ?? []).filter((r) => r.ts !== message.ts);
          raReplyCache.set(message.ts, { cacheKey, replies: replyMessages });
        } catch {
          // このスレッドだけ返信なし扱いで続行する(全体は落とさない)。
          skipped = true;
        }
      } else if (cached) {
        // 時間切れだが古いキャッシュはある: 返信なし扱いよりは前回読んだ内容の方が正確。
        replyMessages = cached.replies;
      } else {
        // 時間切れ、かつキャッシュも無い: 親本文のみで組み立てる。
        skipped = true;
      }

      if (replyMessages) {
        const ownReplies = replyMessages.filter(
          (r) => r.user === message.user && !r.subtype && !r.bot_id && r.text,
        );
        for (const r of ownReplies) {
          combinedText += `\n${stripCodeFences(r.text ?? "")}`;
        }
      }
    }

    const parsed = parseRaReportText(combinedText);
    const postedAt = tsToDate(message.ts);
    const authorName = shortenAuthorName(await this.resolveUserName(botToken, message.user!));

    const report: RaDailyReport = {
      date: detectRaReportDate(message.text ?? "", postedAt),
      authorId: message.user!,
      authorName,
      postedAt,
      ...parsed,
    };
    return { report, skipped };
  }

  /**
   * #21_ra から【営業日報】を含む親メッセージのみを対象に取得する。
   * 【本日の業務予定】・架電数報告bot・離席連絡など日報以外の投稿は対象外(タイトルに
   * 「【営業日報】」を含まないため自動的に除外される)。
   */
  async getRaDailyReports(opts?: GetRaDailyReportsOptions): Promise<RaReportFetchResult> {
    const botToken = this.requireToken();
    const channelId = this.config.raChannel;
    if (!channelId) {
      throw new Error("環境変数 SLACK_RA_CHANNEL(#21_ra のチャンネルID)を設定してください。");
    }

    const timeBudgetMs = opts?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
    const deadline = Date.now() + timeBudgetMs;

    const oldest = String(Math.floor(Date.now() / 1000) - HISTORY_LOOKBACK_DAYS * 86400);
    const historyMessages: SlackMessage[] = [];
    let cursor: string | undefined;
    do {
      const history = await slackGet<SlackHistoryResponse>(botToken, "conversations.history", {
        channel: channelId,
        limit: "200",
        oldest,
        ...(cursor ? { cursor } : {}),
      });
      historyMessages.push(...(history.messages ?? []));
      cursor = history.response_metadata?.next_cursor || undefined;
    } while (cursor && historyMessages.length < HISTORY_MAX_MESSAGES);

    // 「【営業日報】」を含む親メッセージのみを対象にする(投稿者不明のbot投稿等は除外)。
    const parents = historyMessages.filter(
      (m) =>
        (!m.subtype || m.subtype === "bot_message" || m.subtype === "thread_broadcast") &&
        m.text?.includes("【営業日報】") &&
        m.user,
    );

    // 10件ずつ順に処理する(多数スレッドの一斉並列でレート制限に当たるのを避ける。messenger.ts と同じ工夫)。
    const built: { report: RaDailyReport; skipped: boolean }[] = [];
    for (let i = 0; i < parents.length; i += THREAD_CONCURRENCY) {
      const chunk = parents.slice(i, i + THREAD_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((m) => this.buildReport(botToken, channelId, m, deadline)),
      );
      built.push(...chunkResults);
    }

    // 同一人物・同一日付の日報が複数(訂正再投稿)ある場合は投稿日時が最新のものを採用する。
    const latestByKey = new Map<string, RaDailyReport>();
    for (const { report } of built) {
      const key = `${report.authorId}|${report.date}`;
      const existing = latestByKey.get(key);
      if (!existing || report.postedAt.getTime() > existing.postedAt.getTime()) {
        latestByKey.set(key, report);
      }
    }

    return {
      reports: [...latestByKey.values()],
      skippedCount: built.filter((b) => b.skipped).length,
    };
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getRaReportSource(): RaReportSource {
  if (process.env.DATA_MODE === "live") {
    return new SlackRaReportSource({
      botToken: process.env.SLACK_BOT_TOKEN,
      raChannel: process.env.SLACK_RA_CHANNEL,
    });
  }
  return new DemoRaReportSource();
}
