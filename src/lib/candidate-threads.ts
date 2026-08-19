/**
 * 求職者Slackスレッド(社内Slack「#求職者」チャンネル、1人1スレッド運用の進捗データベース)の
 * 唯一のデータ取得口。data-bundle.ts(Sheets/Slackハイライト用)とは独立したキャッシュを持つ。
 *
 * DATA_MODE=live の場合、Slack への接続・取得に失敗すると console.warn した上でデモスレッドへ
 * フォールバックし、status に "live-error" を設定する(呼び出し元はこれを見てソースバッジ・
 * エラー表示を出し分ける。data-bundle.ts と同じパターン)。
 */
import type { CandidateThread, SourceStatus } from "./types";
import { DemoSlackSource, getMessengerSource } from "./adapters/messenger";
import { candidateThreads as demoCandidateThreads } from "./demo-data";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";

// スレッド一覧・返信本文はKPI等に比べて更新頻度が低いため、data-bundle.ts の60秒キャッシュより
// 長めの5分キャッシュとする(Slack API 呼び出し回数の抑制)。
const CACHE_MS = 5 * 60_000;

export interface CandidateThreadsResult {
  threads: CandidateThread[];
  status: SourceStatus;
  /**
   * 読み込みが「途中まで」で信頼できない集計になり得るかどうか。
   * - status "live" のとき: messenger.ts が返信取得を予算切れ・時間切れでスキップしたスレッドが
   *   1件以上あれば true(SlackSource.getCandidateThreads の skippedReplyFetchCount > 0)。
   * - status "live-error"(live失敗時のデモフォールバック・withTimeoutのタイムアウトフォールバック
   *   いずれも含む)のときは常に true(デモ数値をそのまま業務集計に使うと実態とズレるため)。
   * - status "demo"(DATA_MODE≠live の通常デモモード)のときは常に false
   *   (これはフォールバックではなく、そもそもデモ数値を見せる画面のため)。
   * thread-stats.ts はこのフラグを見て、CA別実績・面談数の最終確定値キャッシュを更新するかどうか、
   * 不完全なときにその最終確定値へフォールバックするかどうかを判断する。
   */
  incomplete: boolean;
  /**
   * 返信を取りたかったのに取れなかったスレッド数(messenger.ts の skippedReplyFetchCount)。
   * incomplete の元になった生の件数で、/api/warm の診断表示にのみ使う(live以外は常に0)。
   */
  skippedReplyFetchCount: number;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

export interface CandidateThreadsLoadOptions {
  /**
   * live経路(adapters/messenger.ts の SlackSource)の返信取得に使う時間予算(ms)。
   * 省略時は messenger.ts 側の既定値(REPLY_TIME_BUDGET_MS)を使う。
   * /api/warm のウォームアップ実行など、通常より長く時間をかけて深く読み込ませたい場合に指定する。
   * デモ経路(DemoSlackSource)では無視される。
   */
  replyTimeBudgetMs?: number;
}

let cache: { result: CandidateThreadsResult; expiresAt: number } | null = null;

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

async function loadDemo(status: SourceStatus): Promise<CandidateThreadsResult> {
  const demo = new DemoSlackSource();
  const { threads } = await demo.getCandidateThreads();
  // status "demo"(通常のデモモード)はそのままデモ数値を見せる画面なので incomplete: false。
  // status "live-error"(live失敗時のフォールバック)は信頼できない集計として incomplete: true。
  return { threads, status, incomplete: status !== "demo", skippedReplyFetchCount: 0 };
}

async function loadLive(opts?: CandidateThreadsLoadOptions): Promise<CandidateThreadsResult> {
  try {
    const source = getMessengerSource();
    const { threads, skippedReplyFetchCount } = await source.getCandidateThreads(
      opts?.replyTimeBudgetMs !== undefined ? { replyTimeBudgetMs: opts.replyTimeBudgetMs } : undefined,
    );
    return { threads, status: "live", incomplete: skippedReplyFetchCount > 0, skippedReplyFetchCount };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn(
      "[candidate-threads] Slack の求職者スレッド取得に失敗したため、デモスレッドへフォールバックします:",
      error,
    );
    const part = await loadDemo("live-error");
    return { ...part, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 求職者Slackスレッド一覧を取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。
 * `opts.replyTimeBudgetMs` は live経路のときだけ使用する(デモ経路は無視)。
 */
export async function loadCandidateThreads(
  forceRefresh = false,
  opts?: CandidateThreadsLoadOptions,
): Promise<CandidateThreadsResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }
  const result = isLiveMode() ? await loadLive(opts) : await loadDemo("demo");
  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。live取得失敗時のフォールバック
 * (デモデータ+ステータス "live-error")と同じ構造。裏側では loadLive() が走り続けており、
 * 完了すればモジュールキャッシュに反映される。
 */
export function candidateThreadsTimeoutFallback(): CandidateThreadsResult {
  return {
    threads: [...demoCandidateThreads].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    status: "live-error",
    incomplete: true,
    skippedReplyFetchCount: 0,
    errorMessage: TIMEOUT_FALLBACK_MESSAGE,
  };
}
