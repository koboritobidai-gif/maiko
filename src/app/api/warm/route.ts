/**
 * GET /api/warm — 認証なしのウォームアップAPI。
 * ダッシュボード「/」・企業ページ「/companies」を開く前に、コールドスタートで空になっている
 * モジュールキャッシュ・Next.jsデータキャッシュを先に温めておくためのエンドポイント
 * (Vercel Cron からの定期実行、または手動アクセスを想定。middleware.ts の matcher で
 * Basic認証の対象外にしている)。
 *
 * 主目的: #求職者Slackスレッドの返信取得(adapters/messenger.ts)は通常20秒の時間予算で打ち切るが、
 * ここでは45秒かけて未読分をより深く読み、返信キャッシュを厚く貯めておく。合わせて他の
 * ローダーも一通り呼び、それぞれのモジュールメモリ・データキャッシュを温める。
 *
 * 認証なしで公開されるエンドポイントのため、レスポンスには件数・ステータス文字列のみを含め、
 * 求職者名・金額・企業名などの業務データ本体は一切返さない。
 */
import { NextResponse } from "next/server";
import { loadCandidateThreads } from "@/lib/candidate-threads";
import { loadCompanyData } from "@/lib/company-data";
import { loadDataBundle } from "@/lib/data-bundle";
import { loadReferralInvoices } from "@/lib/invoice-data";
import { loadMarketingData } from "@/lib/marketing-data";
import { loadRevenueRecords } from "@/lib/revenue-data";
import { loadSalesReports } from "@/lib/sales-data";

export const revalidate = 0;
export const maxDuration = 60;

// 3分未満の連打・Cron設定ミス等での乱用に対する耐性(Slack/Google APIの呼び出し回数を抑える)。
// モジュール変数のため、Vercelの関数インスタンスが生きている間だけ有効(再起動すれば消えるが、
// 再起動直後はどのみちキャッシュも空でウォームアップ自体に意味があるため実害は無い)。
const THROTTLE_MS = 3 * 60_000;
let lastRunAt = 0;

/** Promise.allSettled の結果から状態文字列を取り出す(rejectしていたら "error" とする)。 */
function statusOf<T>(result: PromiseSettledResult<T>, pick: (value: T) => string): string {
  return result.status === "fulfilled" ? pick(result.value) : "error";
}

export async function GET() {
  const now = Date.now();
  const sinceLastRunMs = now - lastRunAt;
  if (lastRunAt > 0 && sinceLastRunMs < THROTTLE_MS) {
    return NextResponse.json({
      throttled: true,
      lastRunAgoSeconds: Math.floor(sinceLastRunMs / 1000),
    });
  }
  // 実行開始時点で更新する(実行中の重複呼び出しもスロットル対象にし、同時に複数の重い
  // Slack取得が走らないようにする)。
  lastRunAt = now;
  const start = Date.now();

  // 主目的: #求職者スレッドの未読分を通常(20秒)より長い45秒予算で読み込み、返信キャッシュを深く貯める。
  const threadsResult = await loadCandidateThreads(true, { replyTimeBudgetMs: 45_000 });

  // 他のローダーも合わせて温める。1つが失敗・時間切れでも他へ影響しないよう個別に実行する。
  const [bundleResult, marketingResult, invoiceResult, revenueResult, salesResult, companyResult] =
    await Promise.allSettled([
      loadDataBundle(true),
      loadMarketingData(true),
      loadReferralInvoices(true),
      loadRevenueRecords(true),
      loadSalesReports(true),
      loadCompanyData(true),
    ]);

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - start,
    candidateThreads: threadsResult.threads.length,
    candidateThreadsWithReplies: threadsResult.threads.filter((t) => t.replies.length > 0).length,
    dataBundleSourceStatus: statusOf(bundleResult, (v) => v.sourceStatus),
    dataBundleSlackStatus: statusOf(bundleResult, (v) => v.slackStatus),
    marketingStatus: statusOf(marketingResult, (v) => v.status),
    invoiceStatus: statusOf(invoiceResult, (v) => v.status),
    revenueStatus: statusOf(revenueResult, (v) => v.status),
    salesStatus: statusOf(salesResult, (v) => v.status),
    companyStatus: statusOf(companyResult, (v) => v.status),
    contractsStatus: statusOf(companyResult, (v) => v.contracts.status),
  });
}
