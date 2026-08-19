/**
 * Slack「#21_ra」「#22_アポイント報告」から読み取った営業実績の唯一のデータ取得口。
 * invoice-data.ts / revenue-data.ts とは独立したキャッシュを持つ。
 *
 * この機能は `SLACK_RA_CHANNEL` / `SLACK_APPOINTMENT_CHANNEL` がどちらも未設定の間は「機能OFF」
 * として扱う。DATA_MODE=live でもどちらのチャンネルIDも無ければ(=まだこの機能を有効化していない)、
 * live-error(接続エラー)ではなく status: "demo" ・ 日報/アポとも0件を返す(画面側はこれを見て
 * セクション自体を非表示にする)。これに対し、DATA_MODE が live ではない通常のデモモードでは、
 * 他の機能と同様デモデータを返す。
 *
 * 2つのチャンネルは独立に設定・取得できる(片方だけ設定してももう片方は動作しない)ため、
 * 取得は互いに独立して try する。片方だけ取得に失敗した場合はその片方だけ空にして続行し
 * (console.warn + errorMessageに内容を残す)、設定されていた側がすべて失敗した場合のみ
 * console.warn の上でデモデータへ全面フォールバックし、status に "live-error" を設定する
 * (invoice-data.ts 等と同じ「自己診断」パターン)。
 */
import type { AppointmentReport, SalesDailyReport, SourceStatus } from "./types";
import { DemoSalesSource, getSalesSource } from "./adapters/sales-reports";
import { appointmentReports as demoAppointmentReports, salesDailyReports as demoSalesDailyReports } from "./demo-data";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";

// invoice-data.ts / revenue-data.ts と同様、更新頻度が低いデータのため5分キャッシュとする。
const CACHE_MS = 5 * 60_000;

export interface SalesDataResult {
  reports: SalesDailyReport[];
  appointments: AppointmentReport[];
  status: SourceStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

let cache: { result: SalesDataResult; expiresAt: number } | null = null;

function isDataModeLive(): boolean {
  return process.env.DATA_MODE === "live";
}

/** ライブ取得に必要な条件が揃っているか(DATA_MODE=live かつ、#21_ra・#22_アポイント報告の
 *  いずれか一方でもチャンネルID設定済み)。 */
function canLoadLive(): boolean {
  return (
    isDataModeLive() &&
    Boolean(process.env.SLACK_RA_CHANNEL || process.env.SLACK_APPOINTMENT_CHANNEL)
  );
}

/** デモ日報・デモアポ報告を返す(通常のデモモード、または live 取得失敗時のフォールバック用)。 */
async function loadDemoSales(status: SourceStatus): Promise<SalesDataResult> {
  const demo = new DemoSalesSource();
  const [reports, appointments] = await Promise.all([
    demo.getDailyReports(),
    demo.getAppointmentReports(),
  ]);
  return { reports, appointments, status };
}

async function loadLive(): Promise<SalesDataResult> {
  const source = getSalesSource();
  const errors: string[] = [];
  let reports: SalesDailyReport[] = [];
  let appointments: AppointmentReport[] = [];
  let reportsOk = false;
  let appointmentsOk = false;

  if (process.env.SLACK_RA_CHANNEL) {
    try {
      reports = await source.getDailyReports();
      reportsOk = true;
    } catch (error) {
      if (isNextDynamicUsageError(error)) throw error;
      console.warn(
        "[sales-data] Slack「#21_ra」の取得に失敗したため、この項目のみ空にします:",
        error,
      );
      errors.push(`#21_ra: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (process.env.SLACK_APPOINTMENT_CHANNEL) {
    try {
      appointments = await source.getAppointmentReports();
      appointmentsOk = true;
    } catch (error) {
      if (isNextDynamicUsageError(error)) throw error;
      console.warn(
        "[sales-data] Slack「#22_アポイント報告」の取得に失敗したため、この項目のみ空にします:",
        error,
      );
      errors.push(`#22_アポイント報告: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 設定されていたチャンネルのうち、1件も取得に成功しなかった場合はデモデータへ全面フォールバックする。
  if (!reportsOk && !appointmentsOk && errors.length > 0) {
    const demo = await loadDemoSales("live-error");
    return { ...demo, errorMessage: errors.join(" / ") };
  }

  return {
    reports,
    appointments,
    status: errors.length > 0 ? "live-error" : "live",
    errorMessage: errors.length > 0 ? errors.join(" / ") : undefined,
  };
}

/** 営業実績(#21_ra・#22_アポイント報告)を取得する(5分メモリキャッシュ)。
 *  `forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadSalesReports(forceRefresh = false): Promise<SalesDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  let result: SalesDataResult;
  if (canLoadLive()) {
    result = await loadLive();
  } else if (isDataModeLive()) {
    // live運用中だがこの機能は未導入(SLACK_RA_CHANNEL・SLACK_APPOINTMENT_CHANNEL いずれも未設定)
    // → デモデータで埋めず0件にし、ダッシュボード側でセクションごと非表示にできるようにする。
    result = { reports: [], appointments: [], status: "demo" };
  } else {
    result = await loadDemoSales("demo");
  }

  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。live取得が1件も成功しなかった場合の
 * フォールバック(デモ日報・デモアポ報告+ステータス "live-error")と同じ構造。
 * 裏側では loadLive() が走り続けており、完了すればモジュールキャッシュに反映される。
 */
export function salesDataTimeoutFallback(): SalesDataResult {
  return {
    reports: [...demoSalesDailyReports],
    appointments: [...demoAppointmentReports],
    status: "live-error",
    errorMessage: TIMEOUT_FALLBACK_MESSAGE,
  };
}
