/**
 * 「入社決定の入金予定(見込み)」(トップ画面・全体タブ)の唯一のデータ取得口。
 * 他のローダー(invoice-data.ts / revenue-data.ts 等)とは独立した5分メモリキャッシュを持つ。
 *
 * データの流れ:
 * 1. KPI表.xlsx(Drive)の「（新）20244～」タブから、入社日が確定した人(氏名・企業名・入社日)
 * 2. 企業一覧シート(Googleスプレッドシート、タブ「企業一覧」)から、その企業の成功報酬条件(%or固定額)
 * 3. Slack「#求職者」の各求職者スレッドの労働条件通知書(PDF)から年収(固定報酬の企業は不要なので読まない)
 * 4. 報酬見込み = 年収×% または固定額。入金予定月 = 入社月の翌月
 *
 * DATA_MODE が live ではない通常のデモモードではデモ2件を返す。live運用中の失敗(KPI表未共有・
 * 接続エラー)は、業務金額をデモで埋めると誤認を招くため、デモへは逃がさず「空+status: live-error」
 * とし(console.warn はするがページは落とさない)、画面側が共有案内などを控えめに表示する。
 * 企業一覧シート・Slackだけが読めない場合は、読めた範囲(入社日確定者の一覧)を出しつつ警告を添える。
 */
import { fetchContractCompanies } from "./adapters/company-directory";
import type { ContractCompany } from "./adapters/company-directory";
import { fetchKpiPlacements, KpiXlsxNotSharedError } from "./adapters/kpi-xlsx";
import { lookupAnnualIncomeFromSlack } from "./adapters/placement-income";
import { getAccessToken } from "./adapters/spreadsheet";
import type { CandidateThreadsResult } from "./candidate-threads";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import {
  buildForecastRow,
  findCompanyMatch,
  normalizePersonName,
  shiftDateKey,
  parseFeeTerms,
  todayJstKey,
} from "./placement-calc";
import type { ExtractedIncome, KpiPlacement, PlacementForecastRow } from "./placement-calc";
import { PLACEMENT_FEE_OVERRIDES } from "./placement-fee-overrides";
import type { SourceStatus } from "./types";
import { TIMEOUT_FALLBACK_MESSAGE, withTimeout } from "./with-timeout";

// 他のローダー(invoice-data.ts 等)と同様、5分キャッシュ。失敗は共有作業の直後に再確認しやすいよう1分だけ。
const CACHE_MS = 5 * 60_000;
const ERROR_CACHE_MS = 60_000;
/** 求職者スレッド一覧の読み込みをこれ以上は待たない(待っても年収が取れないだけで、ページは出す)。 */
const THREADS_WAIT_MS = 20_000;

/** 企業一覧シート(契約企業一覧)のID。環境変数 FEE_SHEET_ID が優先。 */
const DEFAULT_FEE_SHEET_ID = "1sB33n8G_7ZL1geOjDMPScmOxQYFyGdU3P8EiSvWweQM";

export interface PlacementDataResult {
  /** 入社日確定者ごとの行(請求書手配済みの判定は画面側のページで売上シートと突き合わせて付ける)。 */
  rows: PlacementForecastRow[];
  status: SourceStatus;
  /** KPI表.xlsxがサービスアカウントに共有されていない(403/404)。画面は共有案内を表示する。 */
  shareNeeded: boolean;
  /** 一部だけ読めなかった項目の注意書き(企業一覧シート未共有・Slack未接続など)。 */
  warnings: string[];
  /** 接続失敗時のエラー内容(live-error のときのみ)。 */
  errorMessage?: string;
}

let cache: { result: PlacementDataResult; expiresAt: number } | null = null;

function isDataModeLive(): boolean {
  return process.env.DATA_MODE === "live";
}

function resolveFeeSheetId(): string {
  return process.env.FEE_SHEET_ID || DEFAULT_FEE_SHEET_ID;
}

/** デモ2件(通常のデモモード用)。日付は表示期間に入るよう実行日からの相対で作る。 */
function loadDemoPlacements(now: Date): PlacementDataResult {
  const today = todayJstKey(now);
  const demoPeople: { placement: KpiPlacement; terms: string; income?: ExtractedIncome }[] = [
    {
      placement: { name: "山田 太郎", company: "株式会社サンプル商事", hireDate: shiftDateKey(today, 12) },
      terms: "35％",
      income: { annualIncomeYen: 4_650_000, basis: "年収465万円(通知書記載)", estimated: false },
    },
    {
      placement: { name: "佐藤 花子", company: "デモ不動産", hireDate: shiftDateKey(today, 25) },
      terms: "一律50万",
    },
  ];
  const rows = demoPeople.map(({ placement, terms, income }) =>
    buildForecastRow({
      placement,
      company: { companyName: placement.company, isContracted: true, contractTerms: terms },
      income,
    }),
  );
  return { rows, status: "demo", shareNeeded: false, warnings: [] };
}

/** 企業一覧シートの契約企業を取得する。失敗しても入社日確定者の表示は続けるため、警告文字列を返す。 */
async function loadFeeCompanies(
  accessToken: string,
): Promise<{ companies: ContractCompany[]; warning?: string }> {
  try {
    const data = await fetchContractCompanies(accessToken, resolveFeeSheetId());
    return { companies: data.companies };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn("[placement-data] 企業一覧シートの取得に失敗しました:", error);
    return {
      companies: [],
      warning: `企業一覧シートを読み込めませんでした(契約条件が不明のため報酬は未確定です): ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function loadLive(
  getThreads: () => Promise<CandidateThreadsResult>,
  now: Date,
): Promise<PlacementDataResult> {
  try {
    const accessToken = await getAccessToken(undefined);
    const today = todayJstKey(now);
    const [placements, fee] = await Promise.all([
      fetchKpiPlacements(accessToken, today),
      loadFeeCompanies(accessToken),
    ]);
    const warnings: string[] = fee.warning ? [fee.warning] : [];

    // 各人の契約条件を引き、年収が必要な人(固定額でない・手動補正で報酬が確定していない人)だけSlackを読む。
    const prepared = placements.map((placement) => {
      const company = findCompanyMatch(placement.company, fee.companies);
      const override = PLACEMENT_FEE_OVERRIDES.find(
        (o) => normalizePersonName(o.name) === normalizePersonName(placement.name),
      );
      const kind = company ? parseFeeTerms(company.contractTerms).kind : undefined;
      // 固定報酬の企業は労働条件通知書を読まない(経営者指示)。契約条件を引けなかった/数字が読めない企業も
      // 年収があっても報酬を計算できないため読まない。
      const needsIncome =
        (kind === "rate" || kind === "conditional") &&
        override?.feeYen === undefined &&
        override?.annualIncomeYen === undefined;
      return { placement, company, override, needsIncome };
    });

    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CANDIDATE_CHANNEL;
    let threads: CandidateThreadsResult | undefined;
    if (prepared.some((p) => p.needsIncome)) {
      if (!botToken || !channelId) {
        warnings.push("Slack(SLACK_BOT_TOKEN / SLACK_CANDIDATE_CHANNEL)が未設定のため、年収を取得できません。");
      } else {
        threads = await withTimeout<CandidateThreadsResult | undefined>(
          getThreads(),
          THREADS_WAIT_MS,
          () => undefined,
        );
        if (!threads || threads.status !== "live") {
          warnings.push("Slack「#求職者」のスレッドを読み込めなかったため、年収を取得できていません。");
          threads = undefined;
        }
      }
    }

    const rows = await Promise.all(
      prepared.map(async ({ placement, company, override, needsIncome }) => {
        let income: ExtractedIncome | undefined;
        let incomeMissingReason: string | undefined;
        let threadUrl: string | undefined;
        if (needsIncome) {
          if (threads && botToken && channelId) {
            const found = await lookupAnnualIncomeFromSlack(botToken, channelId, threads.threads, placement.name);
            income = found.income;
            incomeMissingReason = found.missingReason;
            threadUrl = found.threadUrl;
          } else {
            incomeMissingReason = "Slack「#求職者」を読み込めていません";
          }
        }
        return buildForecastRow({
          placement,
          company,
          feeSheetUnavailable: Boolean(fee.warning),
          income,
          incomeMissingReason,
          override,
          threadUrl,
        });
      }),
    );

    return { rows, status: "live", shareNeeded: false, warnings };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn("[placement-data] 入社決定の入金予定の取得に失敗しました:", error);
    return {
      rows: [],
      status: "live-error",
      shareNeeded: error instanceof KpiXlsxNotSharedError,
      warnings: [],
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 入社決定の入金予定(見込み)を取得する(5分メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。
 * `getThreads` は求職者スレッド一覧の取得(ページ側が既に走らせているローダーの Promise を渡し、
 * 重いSlack読み込みを二重に走らせない)。年収を読む必要がある人がいるときだけ呼ぶ。
 */
export async function loadPlacementForecast(
  getThreads: () => Promise<CandidateThreadsResult>,
  forceRefresh = false,
): Promise<PlacementDataResult> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }
  const now = new Date();
  const result = isDataModeLive() ? await loadLive(getThreads, now) : loadDemoPlacements(now);
  cache = {
    result,
    expiresAt: Date.now() + (result.status === "live-error" || result.warnings.length > 0 ? ERROR_CACHE_MS : CACHE_MS),
  };
  return result;
}

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。live取得失敗時と同じ「空+live-error」。
 * 裏側では loadLive() が走り続けており、完了すればモジュールキャッシュに反映される。
 */
export function placementDataTimeoutFallback(): PlacementDataResult {
  return { rows: [], status: "live-error", shareNeeded: false, warnings: [], errorMessage: TIMEOUT_FALLBACK_MESSAGE };
}
