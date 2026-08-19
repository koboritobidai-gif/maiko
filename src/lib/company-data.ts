/**
 * 企業・求人ページ(送客可能企業リスト・求人マトリックス)の唯一のデータ取得口。
 * 他のローダー(revenue-data.ts 等)と同じ「3分岐+モジュール5分メモリキャッシュ」の構成だが、
 * この機能にはデモデータが存在しない(社内運用シート専用のため、デモで埋めても意味が無い)。
 * そのため SourceStatus(live/demo/live-error)は使わず、下記 CompanyDataStatus の3状態で扱う:
 * - "live": DATA_MODE=live かつ環境変数が揃っており、取得に成功した
 * - "live-error": DATA_MODE=live かつ環境変数のどちらかは設定されているが、取得に失敗した
 *   (環境変数が片方しか無い場合もここに含まれる。resolveSheetRoles が両方必須のエラーを投げるため)
 * - "unconfigured": DATA_MODE が live ではない、または環境変数が両方とも未設定
 *   (画面側はこれを見て、設定手順(env・サービスアカウント共有)を表示する)
 */
import {
  fetchJobMatrixData,
  fetchReferralCompanyData,
  resolveSheetRoles,
} from "./adapters/company-directory";
import type { JobMatrixEntry, ReferralCompanyGroup } from "./adapters/company-directory";
import { getAccessToken } from "./adapters/spreadsheet";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";

export type CompanyDataStatus = "live" | "live-error" | "unconfigured";

export interface CompanyDataResult {
  referralGroups: ReferralCompanyGroup[];
  jobMatrix: JobMatrixEntry[];
  status: CompanyDataStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
}

// 他の外部シート連携(revenue-data.ts 等)と同様、更新頻度が低いデータのため5分キャッシュとする。
const CACHE_MS = 5 * 60_000;
let cache: { result: CompanyDataResult; expiresAt: number } | null = null;

function isDataModeLive(): boolean {
  return process.env.DATA_MODE === "live";
}

/** ライブ取得を試みる条件が揃っているか(DATA_MODE=live かつ、2つの環境変数のどちらかは設定済み)。 */
function canAttemptLive(): boolean {
  return isDataModeLive() && Boolean(process.env.JOB_MATRIX_SHEET_ID || process.env.REFERRAL_COMPANY_SHEET_ID);
}

async function loadLive(): Promise<CompanyDataResult> {
  const accessToken = await getAccessToken(undefined);
  const roles = await resolveSheetRoles(accessToken);
  const [referralData, jobMatrix] = await Promise.all([
    fetchReferralCompanyData(accessToken, roles.referralCompanySheetId),
    fetchJobMatrixData(accessToken, roles.jobMatrixSheetId),
  ]);
  return { referralGroups: referralData.groups, jobMatrix, status: "live" };
}

/** 企業・求人データを取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadCompanyData(forceRefresh = false): Promise<CompanyDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  let result: CompanyDataResult;
  if (canAttemptLive()) {
    try {
      result = await loadLive();
    } catch (error) {
      if (isNextDynamicUsageError(error)) throw error;
      console.warn("[company-data] 企業・求人データの取得に失敗しました:", error);
      result = {
        referralGroups: [],
        jobMatrix: [],
        status: "live-error",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    result = { referralGroups: [], jobMatrix: [], status: "unconfigured" };
  }

  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}

/** 状態更新・企業追加の書き込み成功後に呼び、キャッシュを無効化する(次回 loadCompanyData で再取得させる)。 */
export function clearCompanyDataCache(): void {
  cache = null;
}

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。この機能にはデモデータが存在しないため、
 * live取得失敗時と同じ status: "live-error"(空データ)を返す。
 * 裏側では loadLive() が走り続けており、完了すればモジュールキャッシュに反映される。
 */
export function companyDataTimeoutFallback(): CompanyDataResult {
  return {
    referralGroups: [],
    jobMatrix: [],
    status: "live-error",
    errorMessage: TIMEOUT_FALLBACK_MESSAGE,
  };
}
