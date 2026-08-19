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
  fetchContractCompanies,
  fetchJobMatrixData,
  fetchReferralCompanyData,
  resolveSheetRoles,
} from "./adapters/company-directory";
import type { ContractCompany, JobMatrixEntry, ReferralCompanyGroup } from "./adapters/company-directory";
import { getAccessToken } from "./adapters/spreadsheet";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";

export type CompanyDataStatus = "live" | "live-error" | "unconfigured";

/**
 * 契約企業一覧(スプレッドシート「送客可能/契約後の進捗について」)の状態。
 * 送客可能企業リスト・求人マトリックスとは別の環境変数(CONTRACT_COMPANY_SHEET_ID)で管理され、
 * 未設定でも既存の企業・求人機能(送客可能企業リスト・求人マトリックス)は従来どおり動く
 * ("unconfigured" は契約企業セクションのみ非表示にする)。
 */
export type ContractDataStatus = "live" | "unconfigured" | "live-error";

export interface ContractDataResult {
  status: ContractDataStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ)。 */
  errorMessage?: string;
  tabName?: string;
  companies: ContractCompany[];
}

export interface CompanyDataResult {
  referralGroups: ReferralCompanyGroup[];
  jobMatrix: JobMatrixEntry[];
  status: CompanyDataStatus;
  /** 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  errorMessage?: string;
  contracts: ContractDataResult;
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

/** 契約企業シートのライブ取得を試みる条件が揃っているか(DATA_MODE=live かつ CONTRACT_COMPANY_SHEET_ID 設定済み)。 */
function canAttemptContractLive(): boolean {
  return isDataModeLive() && Boolean(process.env.CONTRACT_COMPANY_SHEET_ID);
}

/** 送客可能企業リスト・求人マトリックスを取得する(失敗しても契約企業一覧の取得には影響しない)。 */
async function loadReferralAndMatrix(): Promise<
  Pick<CompanyDataResult, "referralGroups" | "jobMatrix" | "status" | "errorMessage">
> {
  if (!canAttemptLive()) {
    return { referralGroups: [], jobMatrix: [], status: "unconfigured" };
  }
  try {
    const accessToken = await getAccessToken(undefined);
    const roles = await resolveSheetRoles(accessToken);
    const [referralData, jobMatrix] = await Promise.all([
      fetchReferralCompanyData(accessToken, roles.referralCompanySheetId),
      fetchJobMatrixData(accessToken, roles.jobMatrixSheetId),
    ]);
    return { referralGroups: referralData.groups, jobMatrix, status: "live" };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn("[company-data] 企業・求人データの取得に失敗しました:", error);
    return {
      referralGroups: [],
      jobMatrix: [],
      status: "live-error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 契約企業一覧(スプレッドシート「送客可能/契約後の進捗について」タブ「企業一覧」)を取得する。
 * 送客可能企業リスト・求人マトリックス(resolveSheetRoles による役割自動判別)とは別シート・
 * 別環境変数で管理されており、このシートは1枚で役割が明確なため判別処理は不要(独立して取得する)。
 */
async function loadContracts(): Promise<ContractDataResult> {
  if (!canAttemptContractLive()) {
    return { status: "unconfigured", companies: [] };
  }
  try {
    const accessToken = await getAccessToken(undefined);
    const sheetId = process.env.CONTRACT_COMPANY_SHEET_ID as string;
    const data = await fetchContractCompanies(accessToken, sheetId);
    return { status: "live", tabName: data.tabName, companies: data.companies };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn("[company-data] 契約企業データの取得に失敗しました:", error);
    return {
      status: "live-error",
      errorMessage: error instanceof Error ? error.message : String(error),
      companies: [],
    };
  }
}

/** 企業・求人データを取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadCompanyData(forceRefresh = false): Promise<CompanyDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  // 送客可能企業リスト・求人マトリックスと契約企業一覧は別シート・別環境変数のため、
  // 一方が未設定/失敗でも他方の表示に影響しないよう、それぞれ独立して並行取得する。
  const [directory, contracts] = await Promise.all([loadReferralAndMatrix(), loadContracts()]);

  const result: CompanyDataResult = { ...directory, contracts };
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
    contracts: { status: "live-error", errorMessage: TIMEOUT_FALLBACK_MESSAGE, companies: [] },
  };
}
