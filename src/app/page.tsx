import DashboardView from "@/components/DashboardView";
import { loadCandidateThreads } from "@/lib/candidate-threads";
import { loadDataBundle } from "@/lib/data-bundle";
import { loadReferralInvoices } from "@/lib/invoice-data";
import { loadMarketingData } from "@/lib/marketing-data";
import {
  getDashboardSummary,
  getInvoiceChecks,
  getMarketingSummary,
  getOtherInvoiceCosts,
  getRevenueSummary,
} from "@/lib/metrics";
import { loadRevenueRecords } from "@/lib/revenue-data";
import { fillInterviewDatesFromSlack } from "@/lib/slack-interviews";

// ライブデータ(Google Sheets / Slack / 集客・広告シート)を60秒おきに再取得して反映する。
// loadDataBundle() / loadMarketingData() 自体もモジュールメモリキャッシュを持つため、二重に整合する。
export const dynamic = "force-dynamic";

export default async function TodayDashboardPage() {
  const now = new Date();
  const [bundle, marketingResult, threadsResult, invoicesResult, revenueResult] = await Promise.all([
    loadDataBundle(),
    loadMarketingData(),
    loadCandidateThreads(),
    loadReferralInvoices(),
    loadRevenueRecords(),
  ]);
  const summary = getDashboardSummary(bundle, now);
  // Slack「#求職者」スレッドの「面談実施」報告から面談日を補完する(シートO列の手入力があれば優先)。
  // 送客パートナー費用の「面談実施で課金」集計を、Slackへの記載だけで回せるようにするため。
  const candidates = fillInterviewDatesFromSlack(bundle.candidates, threadsResult.threads);
  const marketingSummary = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    candidates,
    bundle.settings.referralRates,
    now,
  );
  // 先月分(主要指標・集客/広告の「先月」トグル用)。基準日は先月15日(月初・月末の日数差の影響を受けない)。
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const summaryLastMonth = getDashboardSummary(bundle, lastMonth);
  const marketingSummaryLastMonth = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    candidates,
    bundle.settings.referralRates,
    lastMonth,
  );
  // 送客パートナー請求書(Slack「#請求書」)の自動照合。
  const invoiceChecks = getInvoiceChecks(
    invoicesResult.invoices,
    marketingSummary.referralPartners,
    marketingSummaryLastMonth.referralPartners,
    now,
  );
  // 送客売上(翔び台が紹介先企業から貰う金額)の今月・先月まとめ。
  const revenueSummary = getRevenueSummary(revenueResult.records, now);
  // #請求書のうち送客パートナー以外の請求書(=広告費・送客費用に含まれないその他の支払い)。
  // 「出ていくお金」の全体額に合算する。
  const otherInvoiceCosts = getOtherInvoiceCosts(invoicesResult.invoices, now);

  return (
    <DashboardView
      summary={summary}
      summaryLastMonth={summaryLastMonth}
      candidates={candidates}
      sourceStatus={bundle.sourceStatus}
      sourceErrorMessage={bundle.sourceErrorMessage}
      slackStatus={bundle.slackStatus}
      slackErrorMessage={bundle.slackErrorMessage}
      marketingSummary={marketingSummary}
      marketingSummaryLastMonth={marketingSummaryLastMonth}
      marketingStatus={marketingResult.status}
      marketingErrorMessage={marketingResult.errorMessage}
      invoiceChecks={invoiceChecks}
      invoiceSkippedCount={invoicesResult.skippedCount}
      invoiceStatus={invoicesResult.status}
      invoiceErrorMessage={invoicesResult.errorMessage}
      revenueSummary={revenueSummary}
      revenueStatus={revenueResult.status}
      revenueErrorMessage={revenueResult.errorMessage}
      otherInvoiceCosts={otherInvoiceCosts}
    />
  );
}
