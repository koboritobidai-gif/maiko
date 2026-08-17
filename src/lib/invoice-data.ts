/**
 * Slack「#請求書」から読み取った送客パートナー請求書の唯一のデータ取得口。
 * marketing-data.ts / candidate-threads.ts とは独立したキャッシュを持つ。
 *
 * この機能は `SLACK_INVOICE_CHANNEL` が未設定の間は「機能OFF」として扱う。DATA_MODE=live でも
 * このチャンネルIDが無ければ(=まだこの機能を有効化していない)、live-error(接続エラー)ではなく
 * status: "demo" ・ 請求書0件を返す(画面側はこれを見てカード自体を非表示にする。他のSlack連携の
 * ような「設定漏れ」ではなく「未導入」の意味合いのため、デモデータで埋めずに空にする)。
 * これに対し、DATA_MODE が live ではない通常のデモモードでは、他の機能と同様デモ請求書4件を返す。
 * DATA_MODE=live かつ SLACK_INVOICE_CHANNEL 設定済みで取得に失敗した場合のみ、console.warn した上で
 * デモ請求書へフォールバックし、status に "live-error" を設定する(data-bundle.ts 等と同じパターン)。
 */
import type { ReferralInvoice, SourceStatus } from "./types";
import { DemoInvoiceSource, getInvoiceSource } from "./adapters/invoices";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";

// marketing-data.ts / candidate-threads.ts と同様、更新頻度が低いデータのため5分キャッシュとする。
const CACHE_MS = 5 * 60_000;

export interface InvoiceDataResult {
  invoices: ReferralInvoice[];
  /** 直近15件の上限を超えたため点検対象外にしたPDFの件数。 */
  skippedCount: number;
  status: SourceStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

let cache: { result: InvoiceDataResult; expiresAt: number } | null = null;

function isDataModeLive(): boolean {
  return process.env.DATA_MODE === "live";
}

/** ライブ取得に必要な条件が揃っているか(DATA_MODE=live かつ #請求書チャンネルID設定済み)。 */
function canLoadLive(): boolean {
  return isDataModeLive() && Boolean(process.env.SLACK_INVOICE_CHANNEL);
}

/** デモ請求書4件を返す(通常のデモモード、または live 取得失敗時のフォールバック用)。 */
async function loadDemoInvoices(status: SourceStatus): Promise<InvoiceDataResult> {
  const demo = new DemoInvoiceSource();
  const { invoices, skippedCount } = await demo.getReferralInvoices();
  return { invoices, skippedCount, status };
}

async function loadLive(): Promise<InvoiceDataResult> {
  try {
    const source = getInvoiceSource();
    const { invoices, skippedCount } = await source.getReferralInvoices();
    return { invoices, skippedCount, status: "live" };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn(
      "[invoice-data] Slack「#請求書」の取得に失敗したため、デモデータへフォールバックします:",
      error,
    );
    const part = await loadDemoInvoices("live-error");
    return { ...part, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

/** 送客パートナー請求書を取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadReferralInvoices(forceRefresh = false): Promise<InvoiceDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  let result: InvoiceDataResult;
  if (canLoadLive()) {
    result = await loadLive();
  } else if (isDataModeLive()) {
    // live運用中だがこの機能は未導入(SLACK_INVOICE_CHANNEL未設定) → デモデータで埋めず0件にし、
    // ダッシュボード側でカードごと非表示にできるようにする。
    result = { invoices: [], skippedCount: 0, status: "demo" };
  } else {
    result = await loadDemoInvoices("demo");
  }

  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}
