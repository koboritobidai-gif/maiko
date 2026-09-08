/**
 * Slack「#21_ra」の【営業日報】スレッドから読み取ったRA(リクルーティングアドバイザー)営業日報の
 * 唯一のデータ取得口。sales-data.ts(同じ #21_ra チャンネルの架電数報告・業務報告スレッド集計)とは
 * 独立したキャッシュを持つ(対象とする親メッセージの種類が異なるため、片方の障害がもう片方に影響しない)。
 *
 * この機能は `SLACK_RA_CHANNEL` が未設定の間は「機能OFF」として扱う。DATA_MODE=live でも
 * このチャンネルIDが無ければ(=まだ運用開始していない)、live-error(接続エラー)ではなく
 * status: "demo" ・日報0件を返す(画面側はこれを見てセクション自体を非表示にする。他のSlack連携の
 * ような「設定漏れ」ではなく「未導入」の意味合いのため、デモデータで埋めずに空にする)。
 * これに対し、DATA_MODE が live ではない通常のデモモードでは、他の機能と同様デモ日報を返す。
 * DATA_MODE=live かつ SLACK_RA_CHANNEL 設定済みで取得に失敗した場合のみ、console.warn した上で
 * デモ日報へフォールバックし、status に "live-error" を設定する(invoice-data.ts と同じパターン)。
 */
import type { RaDailyReport, SourceStatus } from "./types";
import { DemoRaReportSource, getRaReportSource } from "./adapters/ra-reports";
import { raDailyReports as demoRaDailyReports } from "./demo-data";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";

// invoice-data.ts / sales-data.ts と同様、更新頻度が低いデータのため5分キャッシュとする。
const CACHE_MS = 5 * 60_000;

export interface RaReportDataResult {
  reports: RaDailyReport[];
  /** 返信取得が時間予算超過等で不完全だった(親本文のみで組み立てた)日報の件数。 */
  skippedCount: number;
  status: SourceStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

export interface RaReportLoadOptions {
  /**
   * live経路(adapters/ra-reports.ts)のスレッド返信取得に使う時間予算(ms)。
   * 省略時はアダプタ側の既定値(DEFAULT_TIME_BUDGET_MS)を使う。
   * /api/warm のウォームアップ実行など、通常より長く時間をかけたい場合に指定する。
   */
  timeBudgetMs?: number;
}

let cache: { result: RaReportDataResult; expiresAt: number } | null = null;

function isDataModeLive(): boolean {
  return process.env.DATA_MODE === "live";
}

/** ライブ取得に必要な条件が揃っているか(DATA_MODE=live かつ #21_ra チャンネルID設定済み)。 */
function canLoadLive(): boolean {
  return isDataModeLive() && Boolean(process.env.SLACK_RA_CHANNEL);
}

/** デモ日報を返す(通常のデモモード、または live 取得失敗時のフォールバック用)。 */
async function loadDemoRaReports(status: SourceStatus): Promise<RaReportDataResult> {
  const demo = new DemoRaReportSource();
  const { reports, skippedCount } = await demo.getRaDailyReports();
  return { reports, skippedCount, status };
}

async function loadLive(opts?: RaReportLoadOptions): Promise<RaReportDataResult> {
  try {
    const source = getRaReportSource();
    const { reports, skippedCount } = await source.getRaDailyReports(
      opts?.timeBudgetMs !== undefined ? { timeBudgetMs: opts.timeBudgetMs } : undefined,
    );
    return { reports, skippedCount, status: "live" };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn(
      "[ra-report-data] Slack「#21_ra」の営業日報取得に失敗したため、デモデータへフォールバックします:",
      error,
    );
    const part = await loadDemoRaReports("live-error");
    return { ...part, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * RA営業日報(直近120日分)を取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。
 * `opts.timeBudgetMs` は live経路のときだけ使用する(デモ経路は無視)。
 */
export async function loadRaDailyReports(
  forceRefresh = false,
  opts?: RaReportLoadOptions,
): Promise<RaReportDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  let result: RaReportDataResult;
  if (canLoadLive()) {
    result = await loadLive(opts);
  } else if (isDataModeLive()) {
    // live運用中だがこの機能は未導入(SLACK_RA_CHANNEL未設定) → デモデータで埋めず0件にし、
    // ダッシュボード側でセクションごと非表示にできるようにする。
    result = { reports: [], skippedCount: 0, status: "demo" };
  } else {
    result = await loadDemoRaReports("demo");
  }

  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。live取得失敗時のフォールバック
 * (デモ日報+ステータス "live-error")と同じ構造。裏側では loadLive() が走り続けており、
 * 完了すればモジュールキャッシュに反映される。
 */
export function raReportDataTimeoutFallback(): RaReportDataResult {
  return {
    reports: [...demoRaDailyReports],
    skippedCount: 0,
    status: "live-error",
    errorMessage: TIMEOUT_FALLBACK_MESSAGE,
  };
}
