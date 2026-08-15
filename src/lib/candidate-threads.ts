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
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";

// スレッド一覧・返信本文はKPI等に比べて更新頻度が低いため、data-bundle.ts の60秒キャッシュより
// 長めの5分キャッシュとする(Slack API 呼び出し回数の抑制)。
const CACHE_MS = 5 * 60_000;

export interface CandidateThreadsResult {
  threads: CandidateThread[];
  status: SourceStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

let cache: { result: CandidateThreadsResult; expiresAt: number } | null = null;

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

async function loadDemo(status: SourceStatus): Promise<CandidateThreadsResult> {
  const demo = new DemoSlackSource();
  return { threads: await demo.getCandidateThreads(), status };
}

async function loadLive(): Promise<CandidateThreadsResult> {
  try {
    const source = getMessengerSource();
    const threads = await source.getCandidateThreads();
    return { threads, status: "live" };
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

/** 求職者Slackスレッド一覧を取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadCandidateThreads(forceRefresh = false): Promise<CandidateThreadsResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }
  const result = isLiveMode() ? await loadLive() : await loadDemo("demo");
  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}
