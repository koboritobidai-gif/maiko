/**
 * SalesSource アダプタ
 * 法人営業(清本・望月)の架電数・アポイント獲得・商談数・契約数を、社内Slackから自動集計するための
 * データ取得口。Slack API呼び出しは invoices.ts / messenger.ts と同じパターン(fetch + Bearer
 * SLACK_BOT_TOKEN、429時はSlackの Retry-After 秒待って1回だけ再試行)を踏襲する。
 *
 * 実物のチャンネル構造(経営者のスクショで判明、当初想定の「自由記述の日報」とは異なる):
 *
 * - **#21_ra(`SLACK_RA_CHANNEL`)**:
 *   - **架電数**: ワークフローbotが毎日12:00と15:00に親メッセージ「架電数報告(12時)」
 *     「架電数報告(15時)」(本文に「架電数、メール数の報告お願いします」を含む)を投稿し、
 *     メンバーがそのスレッド**返信**で報告する。12時分・15時分は1日の合計として扱ってよい運用のため、
 *     同一メンバー・同一日の返信は合算する(`calls` のみを持つレコードとして返す)。
 *   - **業務報告**: メンバーが親メッセージ「業務報告)8/17」(タイトルのみ、対象日付き)を投稿し、
 *     本文(商談数・契約数)は**返信**に書く。親の投稿者=担当、対象日=親タイトルの日付
 *     (無ければ投稿日)として、その担当者自身の返信から商談数・契約数を読み取る(`meetings`/
 *     `contracts` のみを持つレコードとして返す。架電数がここに書かれていても、架電数報告
 *     スレッドと二重計上しないよう使わない)。
 *   - **業務予定報告**: 親「業務予定報告)8/17」はその日の"予定"であり実績ではないため、完全に除外する。
 *   - 上記いずれにも該当しない親メッセージは、従来どおり親本文そのものから架電/商談/契約の
 *     数値抽出を試みるフォールバックとして扱う(実際の投稿書式は運用によって揺れる可能性があるため)。
 * - **#22_アポイント報告(`SLACK_APPOINTMENT_CHANNEL`)**: メンバーが親メッセージ
 *   「アポイント報告)…」を1件獲得するごとに1投稿する運用。**トップレベルの1投稿=アポ獲得1件**
 *   (スレッド返信は祝福コメント等の想定のため数えない)。投稿者=担当、対象日=投稿日。
 *   獲得経路は親本文に加え、そのスレッドの返信のうち**親と同じ投稿者のもの**も対象に、
 *   「経路:」「獲得経路:」行→括弧書き→どちらも無ければ「不明」の順で探す。
 *
 * デモ段階は DemoSalesSource が demo-data.ts のデモ日報・デモアポ報告を返す。
 * 実連携は SlackSalesSource が conversations.history / conversations.replies を直接 fetch で呼び出す。
 * 実際の投稿書式は未確認のため、読み取りは寛容にし、読めないメッセージ・返信は黙ってスキップする。
 */
import type { AppointmentReport, SalesDailyReport } from "../types";
import { appointmentReports as demoAppointmentReports, salesDailyReports as demoSalesDailyReports } from "../demo-data";

export interface SalesFetchResult {
  reports: SalesDailyReport[];
  appointments: AppointmentReport[];
}

/**
 * #21_ra(日報)・#22_アポイント報告をそれぞれ独立に取得する。呼び出し元(sales-data.ts)は
 * 2つのメソッドを個別に try するため、片方のチャンネル未設定・取得失敗がもう片方に影響しない。
 */
export interface SalesSource {
  getDailyReports(): Promise<SalesDailyReport[]>;
  getAppointmentReports(): Promise<AppointmentReport[]>;
}

/** デモ実装: demo-data.ts のデモ日報・デモアポ報告をそのまま返す。 */
export class DemoSalesSource implements SalesSource {
  async getDailyReports(): Promise<SalesDailyReport[]> {
    return [...demoSalesDailyReports];
  }

  async getAppointmentReports(): Promise<AppointmentReport[]> {
    return [...demoAppointmentReports];
  }
}

// ─────────────────────────────────────────────
// SlackSalesSource: 実連携
// ─────────────────────────────────────────────

const SLACK_API_BASE = "https://slack.com/api";

interface SlackApiResponseBase {
  ok: boolean;
  error?: string;
}

async function slackGet<T extends SlackApiResponseBase>(
  botToken: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const url = `${SLACK_API_BASE}/${method}?${new URLSearchParams(params).toString()}`;
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
    cache: "no-store",
  });
  // レート制限(429)のときは Retry-After 秒(最大10秒)待って1回だけやり直す(invoices.ts/
  // messenger.ts と同じパターン。スレッド返信を多数取得するため瞬間的に制限へ達することがある)。
  if (res.status === 429) {
    const retryAfter = Math.min(Number(res.headers.get("retry-after") ?? "1") || 1, 10);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${botToken}` },
      cache: "no-store",
    });
  }
  const json = (await res.json()) as T;
  if (!res.ok || !json.ok) {
    throw new Error(`Slack API ${method} 呼び出しに失敗しました: ${json.error ?? res.status}`);
  }
  return json;
}

interface SlackUserInfoResponse extends SlackApiResponseBase {
  user?: {
    name?: string;
    real_name?: string;
    profile?: { real_name?: string; display_name?: string };
  };
}

interface SlackSalesMessage {
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  /** 親メッセージのみに含まれる、スレッド内の返信数。 */
  reply_count?: number;
  /** 返信メッセージのみに含まれる、親メッセージの ts。 */
  thread_ts?: string;
}

interface SlackHistoryResponse extends SlackApiResponseBase {
  messages?: SlackSalesMessage[];
}

/** Slackの ts(unix秒.マイクロ秒)を Date に変換する。 */
function tsToDate(ts: string): Date {
  return new Date(Number(ts.split(".")[0]) * 1000);
}

// 投稿日が直近185日(約6ヶ月)以内のものだけを対象にする(ダッシュボードの月選択が直近6ヶ月のため)。
const RECENT_WINDOW_MS = 185 * 24 * 60 * 60 * 1000;
// #21_ra: 架電数報告・業務報告スレッドの返信取得の上限(API呼び出し数抑制のため、直近のものを優先)。
const MAX_RA_THREAD_FETCHES = 120;
// #22_アポイント報告: 獲得経路を読むためのスレッド返信取得の上限。
const MAX_APPOINTMENT_THREAD_FETCHES = 60;
const THREAD_FETCH_CONCURRENCY = 6;

// ─────────────────────────────────────────────
// 読み取りヒューリスティック
// ─────────────────────────────────────────────

const CALL_RE = /(?:架電|荷電)\s*(?:数)?\s*[::]?\s*(\d+)/;
const MAIL_RE = /(?:メール|mail)\s*(?:数)?\s*[::]?\s*(\d+)/i;
const LINE_RE = /(?:LINE|ライン)\s*(?:数)?\s*[::]?\s*(\d+)/i;
const CONNECT_RE = /本通\s*(?:数)?\s*[::]?\s*(\d+)/;
const RECEIVED_RE = /受電\s*(?:数)?\s*[::]?\s*(\d+)/;
const MEETING_RE = /商談\s*(?:数)?\s*[::]?\s*(\d+)/;
const CONTRACT_RE = /契約\s*(?:数)?\s*[::]?\s*(\d+)/;
const ANY_NUMBER_RE = /(\d+)/;
const ROUTE_LABEL_RE = /(?:獲得経路|経路)\s*[::]\s*(.+)/;
// 括弧書き(半角・全角どちらも)。括弧の中身が20文字を超える場合は経路名として扱わない。
const ROUTE_PAREN_RE = /[(（]([^()（）]{1,20})[)）]/;
const DATE_SLASH_RE = /(\d{1,2})\s*\/\s*(\d{1,2})/;
const DATE_KANJI_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

/** 全角数字を半角に変換する(全角のまま正規表現にかけると \d にマッチしないため)。 */
function toHalfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 行の配列を先頭から順に探索し、最初にマッチした行の数値を返す(全角数字は半角化してから判定)。 */
function extractFirstNumber(lines: string[], re: RegExp): number | undefined {
  for (const line of lines) {
    const m = re.exec(toHalfWidthDigits(line));
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * 架電数報告スレッドの1返信から架電数を読み取る。「架電数:30」等のキーワード付き表記を優先し、
 * 無ければ返信中最初の数値を架電数とみなす(「30件 メール10件」のような形式を想定し、
 * 2つ以上数値がある場合は最初の数値=架電、以降〈メール数等〉は無視する)。
 */
function extractCallsFromReply(text: string): number | undefined {
  const viaKeyword = extractFirstNumber(text.split("\n"), CALL_RE);
  if (viaKeyword !== undefined) return viaKeyword;
  const m = ANY_NUMBER_RE.exec(toHalfWidthDigits(text));
  return m ? Number(m[1]) : undefined;
}

/**
 * 本文先頭付近から対象日(「8/17」「8月17日」形式)を読み取る。年は投稿日から推測し、
 * 2日以上未来になる場合は前年と解釈する。見つからなければ投稿日をそのまま返す。
 */
function detectReportDate(text: string, postedAt: Date): Date {
  const head = toHalfWidthDigits(text.slice(0, 100));
  const candidates: { index: number; month: number; day: number }[] = [];
  const slash = DATE_SLASH_RE.exec(head);
  if (slash) candidates.push({ index: slash.index, month: Number(slash[1]), day: Number(slash[2]) });
  const kanji = DATE_KANJI_RE.exec(head);
  if (kanji) candidates.push({ index: kanji.index, month: Number(kanji[1]), day: Number(kanji[2]) });
  candidates.sort((a, b) => a.index - b.index);
  const found = candidates[0];
  if (!found || found.month < 1 || found.month > 12 || found.day < 1 || found.day > 31) return postedAt;

  let year = postedAt.getFullYear();
  let candidate = new Date(year, found.month - 1, found.day);
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() - postedAt.getTime() > twoDaysMs) {
    year -= 1;
    candidate = new Date(year, found.month - 1, found.day);
  }
  return candidate;
}

/** 獲得経路を、渡されたテキスト群(親本文→スレッド返信の順)から探す。 */
function detectRoute(texts: string[]): string {
  for (const text of texts) {
    for (const line of text.split("\n")) {
      const m = ROUTE_LABEL_RE.exec(line);
      const route = m?.[1]?.trim().slice(0, 20);
      if (route) return route;
    }
  }
  for (const text of texts) {
    const m = ROUTE_PAREN_RE.exec(text);
    const route = m?.[1]?.trim();
    if (route) return route;
  }
  return "不明";
}

/** 日付を「年-月-日」キーにする(同一メンバー・同一日の架電数返信を合算するため)。 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type RaParentKind = "call" | "biz" | "excluded" | "fallback";

/**
 * #21_ra の親メッセージ本文を分類する。
 * - 「架電数報告」または「架電数、メール数の報告」を含む → 架電数報告スレッド(bot投稿)
 * - 「予定」を含む → 業務予定報告等、実績ではないため除外
 * - 「業務報告」を含む → 業務報告スレッド(本文は返信側)
 * - どれにも該当しない → フォールバック(親本文自体から数値抽出を試みる)
 */
function classifyRaParentText(text: string): RaParentKind {
  if (text.includes("架電数報告") || text.includes("架電数、メール数の報告")) return "call";
  if (text.includes("予定")) return "excluded";
  if (text.includes("業務報告")) return "biz";
  return "fallback";
}

interface SlackSalesConfig {
  botToken?: string;
  /** #21_ra チャンネルのID */
  raChannel?: string;
  /** #22_アポイント報告 チャンネルのID */
  appointmentChannel?: string;
}

/**
 * 実連携: Slack「#21_ra」「#22_アポイント報告」の自動集計。
 * `SLACK_BOT_TOKEN`(既存のものを共用)・`SLACK_RA_CHANNEL`・`SLACK_APPOINTMENT_CHANNEL` を使用する。
 */
export class SlackSalesSource implements SalesSource {
  private readonly userNameCache = new Map<string, string>();

  constructor(private readonly config: SlackSalesConfig = {}) {}

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
      const res = await slackGet<SlackUserInfoResponse>(botToken, "users.info", { user: userId });
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
   * 複数スレッドの返信を、6件ずつに分けて並列取得する(429対策+実行時間抑制)。
   * 1スレッドの取得失敗はそのスレッドをスキップするのみで、全体は落とさない。
   */
  private async fetchRepliesForThreads(
    botToken: string,
    channelId: string,
    threadTsList: string[],
  ): Promise<Map<string, SlackSalesMessage[]>> {
    const result = new Map<string, SlackSalesMessage[]>();
    for (let i = 0; i < threadTsList.length; i += THREAD_FETCH_CONCURRENCY) {
      const chunk = threadTsList.slice(i, i + THREAD_FETCH_CONCURRENCY);
      await Promise.all(
        chunk.map(async (ts) => {
          try {
            const res = await slackGet<SlackHistoryResponse>(botToken, "conversations.replies", {
              channel: channelId,
              ts,
              limit: "100",
            });
            const replies = (res.messages ?? []).filter(
              (m) => m.ts !== ts && (!m.subtype || m.subtype === "thread_broadcast") && m.text,
            );
            result.set(ts, replies);
          } catch (error) {
            console.warn(`[sales-reports] スレッド返信の取得に失敗しました(スキップ・ts=${ts}):`, error);
          }
        }),
      );
    }
    return result;
  }

  /**
   * #21_ra から架電数(架電数報告スレッドの返信を日別合算)・商談数/契約数(業務報告スレッドの、
   * 親投稿者本人による返信)を読み取る。「業務予定報告」は除外する。
   */
  async getDailyReports(): Promise<SalesDailyReport[]> {
    const botToken = this.requireToken();
    const channelId = this.config.raChannel;
    if (!channelId) {
      throw new Error("環境変数 SLACK_RA_CHANNEL(#21_ra のチャンネルID)を設定してください。");
    }

    const history = await slackGet<SlackHistoryResponse>(botToken, "conversations.history", {
      channel: channelId,
      limit: "200",
    });

    const cutoff = Date.now() - RECENT_WINDOW_MS;
    // 架電数報告の親メッセージはワークフローbot投稿で、subtype が "bot_message" になる。
    // subtype を一律除外すると架電数報告スレッドごと消えてしまう(実際に架電数0の原因になった)ため、
    // bot_message は許可し、channel_join 等のシステムメッセージだけを除外する。
    const parents = (history.messages ?? []).filter(
      (m) =>
        (!m.subtype || m.subtype === "bot_message" || m.subtype === "thread_broadcast") &&
        m.text &&
        tsToDate(m.ts).getTime() >= cutoff,
    );

    const classified = parents
      .map((message) => ({ message, kind: classifyRaParentText(message.text ?? "") }))
      .filter((c) => c.kind !== "excluded");

    // 返信取得が必要なスレッド(架電数報告・業務報告)を、直近優先で MAX_RA_THREAD_FETCHES 件まで。
    const threadTargets = classified
      .filter((c) => (c.kind === "call" || c.kind === "biz") && (c.message.reply_count ?? 0) > 0)
      .slice(0, MAX_RA_THREAD_FETCHES)
      .map((c) => c.message.ts);
    const repliesByTs = await this.fetchRepliesForThreads(botToken, channelId, threadTargets);

    const reports: SalesDailyReport[] = [];
    // 同一メンバー・同一日の架電数返信(12時分+15時分)を合算するための集計マップ。
    const callAgg = new Map<
      string,
      { authorName: string; date: Date; calls: number; mails: number; lineCount: number; connects: number; received: number }
    >();

    for (const { message, kind } of classified) {
      if (kind === "call") {
        const replies = repliesByTs.get(message.ts) ?? [];
        for (const reply of replies) {
          if (reply.bot_id) continue; // 返信内のbot投稿は除外
          const calls = extractCallsFromReply(reply.text ?? "");
          const lines = (reply.text ?? "").split("\n");
          // 架電のほか、報告に書かれていればメール・LINE・本通・受電も読み取る(無ければ0扱い)。
          const mails = extractFirstNumber(lines, MAIL_RE);
          const lineCount = extractFirstNumber(lines, LINE_RE);
          const connects = extractFirstNumber(lines, CONNECT_RE);
          const received = extractFirstNumber(lines, RECEIVED_RE);
          if (
            calls === undefined &&
            mails === undefined &&
            lineCount === undefined &&
            connects === undefined &&
            received === undefined
          ) {
            continue;
          }
          const authorName = reply.user ? await this.resolveUserName(botToken, reply.user) : "Slack Bot";
          const postedAt = tsToDate(reply.ts);
          const key = `${authorName}|${dayKey(postedAt)}`;
          const existing = callAgg.get(key);
          if (existing) {
            existing.calls += calls ?? 0;
            existing.mails += mails ?? 0;
            existing.lineCount += lineCount ?? 0;
            existing.connects += connects ?? 0;
            existing.received += received ?? 0;
          } else {
            callAgg.set(key, {
              authorName,
              date: postedAt,
              calls: calls ?? 0,
              mails: mails ?? 0,
              lineCount: lineCount ?? 0,
              connects: connects ?? 0,
              received: received ?? 0,
            });
          }
        }
        continue;
      }

      if (kind === "biz") {
        const replies = repliesByTs.get(message.ts) ?? [];
        // 本文(商談数・契約数)は親投稿者自身の返信にある運用のため、それ以外の返信は見ない。
        const ownReplies = message.user ? replies.filter((r) => r.user === message.user) : [];
        if (ownReplies.length === 0) continue; // 返信が読めなければこの日は黙ってスキップ
        const lines = ownReplies.flatMap((r) => (r.text ?? "").split("\n"));
        const meetings = extractFirstNumber(lines, MEETING_RE);
        const contracts = extractFirstNumber(lines, CONTRACT_RE);
        if (meetings === undefined && contracts === undefined) continue;
        const authorName = message.user ? await this.resolveUserName(botToken, message.user) : "Slack Bot";
        const date = detectReportDate(message.text ?? "", tsToDate(message.ts));
        reports.push({ date, authorName, meetings, contracts });
        continue;
      }

      // フォールバック: 上記いずれにも該当しない親メッセージは、本文自体から数値抽出を試みる。
      const lines = (message.text ?? "").split("\n");
      const calls = extractFirstNumber(lines, CALL_RE);
      const meetings = extractFirstNumber(lines, MEETING_RE);
      const contracts = extractFirstNumber(lines, CONTRACT_RE);
      if (calls === undefined && meetings === undefined && contracts === undefined) continue;
      const authorName = message.user ? await this.resolveUserName(botToken, message.user) : "Slack Bot";
      const date = detectReportDate(message.text ?? "", tsToDate(message.ts));
      reports.push({ date, authorName, calls, meetings, contracts });
    }

    for (const agg of callAgg.values()) {
      reports.push({
        date: agg.date,
        authorName: agg.authorName,
        calls: agg.calls,
        mails: agg.mails,
        lineCount: agg.lineCount,
        connects: agg.connects,
        received: agg.received,
      });
    }

    return reports;
  }

  /**
   * #22_アポイント報告 から、トップレベルの1投稿=アポ獲得1件として取得する。獲得経路は
   * 親本文+親投稿者本人によるスレッド返信から探す。
   */
  async getAppointmentReports(): Promise<AppointmentReport[]> {
    const botToken = this.requireToken();
    const channelId = this.config.appointmentChannel;
    if (!channelId) {
      throw new Error("環境変数 SLACK_APPOINTMENT_CHANNEL(#22_アポイント報告のチャンネルID)を設定してください。");
    }

    const history = await slackGet<SlackHistoryResponse>(botToken, "conversations.history", {
      channel: channelId,
      limit: "200",
    });

    const cutoff = Date.now() - RECENT_WINDOW_MS;
    // トップレベル投稿のみ対象(スレッド返信そのものは祝福コメント等の想定のため数えない)。
    const parents = (history.messages ?? []).filter(
      (m) =>
        !m.subtype &&
        m.text &&
        tsToDate(m.ts).getTime() >= cutoff &&
        (!m.thread_ts || m.thread_ts === m.ts),
    );

    const threadTargets = parents
      .filter((m) => (m.reply_count ?? 0) > 0)
      .slice(0, MAX_APPOINTMENT_THREAD_FETCHES)
      .map((m) => m.ts);
    const repliesByTs = await this.fetchRepliesForThreads(botToken, channelId, threadTargets);

    const appointments: AppointmentReport[] = [];
    for (const m of parents) {
      const authorName = m.user ? await this.resolveUserName(botToken, m.user) : "Slack Bot";
      const ownReplies = m.user ? (repliesByTs.get(m.ts) ?? []).filter((r) => r.user === m.user) : [];
      const texts = [m.text ?? "", ...ownReplies.map((r) => r.text ?? "")];
      appointments.push({
        date: tsToDate(m.ts),
        authorName,
        route: detectRoute(texts),
      });
    }
    return appointments;
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getSalesSource(): SalesSource {
  if (process.env.DATA_MODE === "live") {
    return new SlackSalesSource({
      botToken: process.env.SLACK_BOT_TOKEN,
      raChannel: process.env.SLACK_RA_CHANNEL,
      appointmentChannel: process.env.SLACK_APPOINTMENT_CHANNEL,
    });
  }
  return new DemoSalesSource();
}
