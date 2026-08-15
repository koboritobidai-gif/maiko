/**
 * 集客・広告データ(アイドマ=広告運用シート / リズリアライズ=SNS運用シート)の唯一のデータ取得口。
 * data-bundle.ts(Sheets/Slack)・candidate-threads.ts(求職者Slackスレッド)とは独立したキャッシュを持つ。
 *
 * DATA_MODE=live の場合、シートへの接続・パースに失敗すると console.warn した上でデモデータへ
 * フォールバックし、status に "live-error" を設定する(呼び出し元はこれを見てソースバッジ・
 * エラー表示を出し分ける。data-bundle.ts / candidate-threads.ts と同じパターン)。
 */
import type { MarketingData, SourceStatus } from "./types";
import { DemoMarketingSource, getMarketingSource } from "./adapters/marketing";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";

// 求職者Slackスレッドと同様、更新頻度が低いデータのため5分キャッシュとする。
const CACHE_MS = 5 * 60_000;

export interface MarketingDataResult {
  data: MarketingData;
  status: SourceStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

let cache: { result: MarketingDataResult; expiresAt: number } | null = null;

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

async function loadDemo(status: SourceStatus): Promise<MarketingDataResult> {
  const demo = new DemoMarketingSource();
  return { data: await demo.getMarketingData(), status };
}

async function loadLive(): Promise<MarketingDataResult> {
  try {
    const source = getMarketingSource();
    const data = await source.getMarketingData();
    return { data, status: "live" };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn(
      "[marketing-data] 集客・広告シートの取得に失敗したため、デモデータへフォールバックします:",
      error,
    );
    const part = await loadDemo("live-error");
    return { ...part, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

/** 集客・広告データを取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadMarketingData(forceRefresh = false): Promise<MarketingDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }
  const result = isLiveMode() ? await loadLive() : await loadDemo("demo");
  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}
