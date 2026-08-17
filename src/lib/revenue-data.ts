/**
 * 送客売上(翔び台が紹介先企業から「貰う」金額)の唯一のデータ取得口。
 * invoice-data.ts / marketing-data.ts とは独立したキャッシュを持つ。
 *
 * この機能は `REVENUE_SHEET_ID` が未設定の間は「機能OFF」として扱う。DATA_MODE=live でも
 * このシートIDが無ければ(=まだこの機能を有効化していない)、live-error(接続エラー)ではなく
 * status: "demo" ・ 売上0件を返す(画面側はこれを見てセクション自体を非表示にする。invoice-data.ts の
 * SLACK_INVOICE_CHANNEL 未設定時と同じ「未導入」の意味合いのため、デモデータで埋めずに空にする)。
 * これに対し、DATA_MODE が live ではない通常のデモモードでは、他の機能と同様デモ売上(2ヶ月分)を返す。
 * DATA_MODE=live かつ REVENUE_SHEET_ID 設定済みで取得に失敗した場合のみ、console.warn した上で
 * デモ売上へフォールバックし、status に "live-error" を設定する(data-bundle.ts 等と同じパターン)。
 */
import type { RevenueRecord, SourceStatus } from "./types";
import { DemoRevenueSource, getRevenueSource } from "./adapters/revenue";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";

// invoice-data.ts / marketing-data.ts と同様、更新頻度が低いデータのため5分キャッシュとする。
const CACHE_MS = 5 * 60_000;

export interface RevenueDataResult {
  records: RevenueRecord[];
  status: SourceStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

/**
 * 手動計上分: 売上シート(翔び台請求書関係)の運用開始(タブ「2026年6月」=7月末入金分)より前の
 * 入金を補完する。2026年6月末入金分は経営者申告の¥1,320,000を固定で計上する
 * (金額を変えたい場合はここを修正する。以後の月はシートの月別タブから自動取得)。
 */
const MANUAL_REVENUE_RECORDS: RevenueRecord[] = [
  {
    month: "2026-06",
    inflowChannel: "その他(手動計上)",
    company: "6月末入金分まとめ(シート運用開始前)",
    amountYen: 1_320_000,
  },
];

let cache: { result: RevenueDataResult; expiresAt: number } | null = null;

function isDataModeLive(): boolean {
  return process.env.DATA_MODE === "live";
}

/** ライブ取得に必要な条件が揃っているか(DATA_MODE=live かつ売上シートID設定済み)。 */
function canLoadLive(): boolean {
  return isDataModeLive() && Boolean(process.env.REVENUE_SHEET_ID);
}

/** デモ売上(2ヶ月分)を返す(通常のデモモード、または live 取得失敗時のフォールバック用)。 */
async function loadDemoRevenue(status: SourceStatus): Promise<RevenueDataResult> {
  const demo = new DemoRevenueSource();
  const records = await demo.getRevenueRecords();
  return { records, status };
}

async function loadLive(): Promise<RevenueDataResult> {
  try {
    const source = getRevenueSource();
    const records = await source.getRevenueRecords();
    // シート運用開始前の手動計上分を追加する(実データ取得が成功したときのみ。
    // デモ・フォールバック時に混ぜるとデモ数字が崩れるため)。
    return { records: [...records, ...MANUAL_REVENUE_RECORDS], status: "live" };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn(
      "[revenue-data] 送客売上シートの取得に失敗したため、デモデータへフォールバックします:",
      error,
    );
    const part = await loadDemoRevenue("live-error");
    return { ...part, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

/** 送客売上を取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadRevenueRecords(forceRefresh = false): Promise<RevenueDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  let result: RevenueDataResult;
  if (canLoadLive()) {
    result = await loadLive();
  } else if (isDataModeLive()) {
    // live運用中だがこの機能は未導入(REVENUE_SHEET_ID未設定) → デモデータで埋めず0件にし、
    // ダッシュボード側でセクションごと非表示にできるようにする。
    result = { records: [], status: "demo" };
  } else {
    result = await loadDemoRevenue("demo");
  }

  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}
