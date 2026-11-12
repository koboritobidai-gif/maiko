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
import { referralInvoices as demoReferralInvoices } from "./demo-data";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";

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

/**
 * 恒久補正: 毎月¥16,500固定と経営者確認済みの2社(2026-11-12指示「この2社は16,500円で固定なので、
 * 毎回16,500円に2社ともして」)。この2社の請求書PDFはスキャン画像のため毎月金額を読み取れない。
 * - 株式会社SSマーケット(ファイル名は「御請求書.E26028180.PDF」「御請求書E26031979.PDF」等)
 * - 楽天モバイル株式会社の月額固定分(ファイル名は「株式会社飛び台様_T0000001069_R11001069_…pdf」等)
 * 注意: 楽天モバイルには別の携帯通信費の請求書(「楽天モバイル請求書_2026年N月利用分.pdf」、
 * 金額は自動で読める)も毎月あり、そちらは混同しないこと。この補正は**金額を読み取れなかった
 * PDFにしか適用されない**ため、金額が読めている通信費請求書には影響しない(経営者指示どおり)。
 */
const FIXED_UNREADABLE_VENDORS: { re: RegExp; amountYen: number; label: string }[] = [
  { re: /SS\s*マーケット|SSE?\d{8}/i, amountYen: 16_500, label: "株式会社SSマーケット" },
  { re: /楽天モバイル|T\d{10}_R\d{8}/, amountYen: 16_500, label: "楽天モバイル株式会社" },
];

/**
 * 月別の手動補正(過去月の経緯記録として残す): 2026年5月〜10月支払いの読取不可は
 * いずれも¥16,500(経営者確認 2026-09-24・2026-10-22)。
 * 2026年11月以降は上の FIXED_UNREADABLE_VENDORS(2社固定)で自動適用されるため、
 * この配列への月の追記は原則不要。2社以外の読取不可PDFが新たに出た場合のみ、
 * 経営者確認の金額をここに月単位で足すこと(その月の読取不可すべてに一律適用される点に注意)。
 */
const MANUAL_UNREADABLE_AMOUNTS: { month: string; amountYen: number }[] = [
  { month: "2026-05", amountYen: 16_500 },
  { month: "2026-06", amountYen: 16_500 },
  { month: "2026-07", amountYen: 16_500 },
  { month: "2026-08", amountYen: 16_500 },
  { month: "2026-09", amountYen: 16_500 },
  { month: "2026-10", amountYen: 16_500 },
];

function applyManualInvoiceFixes(invoices: ReferralInvoice[]): ReferralInvoice[] {
  return invoices.map((inv) => {
    if (inv.amountYen !== undefined) return inv;
    // 経営者確認済みの補正はSTORY(別事業)以外の読取不可PDFが対象のため、
    // excludedFromTotals(STORYスレッド由来)の請求書には適用しない。
    if (inv.excludedFromTotals) return inv;
    // 2社固定(SSマーケット・楽天モバイル)を最優先で適用(月を問わず毎回¥16,500)。
    const vendorFix = FIXED_UNREADABLE_VENDORS.find((f) =>
      f.re.test(`${inv.vendorName ?? ""} ${inv.fileName}`),
    );
    if (vendorFix) {
      return {
        ...inv,
        amountYen: vendorFix.amountYen,
        parseNote: `${vendorFix.label}は毎月¥${vendorFix.amountYen.toLocaleString("ja-JP")}固定(経営者確認)のため手動計上。`,
      };
    }
    const fix = MANUAL_UNREADABLE_AMOUNTS.find((f) => f.month === inv.targetMonth);
    if (!fix) return inv;
    return {
      ...inv,
      amountYen: fix.amountYen,
      parseNote: `金額を自動で読み取れないPDFのため、経営者確認の¥${fix.amountYen.toLocaleString("ja-JP")}を手動計上。`,
    };
  });
}

async function loadLive(): Promise<InvoiceDataResult> {
  try {
    const source = getInvoiceSource();
    const { invoices, skippedCount } = await source.getReferralInvoices();
    return { invoices: applyManualInvoiceFixes(invoices), skippedCount, status: "live" };
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

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。live取得失敗時のフォールバック
 * (デモ請求書4件+ステータス "live-error"。手動補正 applyManualInvoiceFixes は live成功時のみ
 * 適用するもののため、loadDemoInvoices 同様ここでも適用しない)と同じ構造。
 * 裏側では loadLive() が走り続けており、完了すればモジュールキャッシュに反映される。
 */
export function invoiceDataTimeoutFallback(): InvoiceDataResult {
  return {
    invoices: [...demoReferralInvoices].sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime()),
    skippedCount: 0,
    status: "live-error",
    errorMessage: TIMEOUT_FALLBACK_MESSAGE,
  };
}
