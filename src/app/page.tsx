import DashboardView from "@/components/DashboardView";
import { loadCandidateThreads } from "@/lib/candidate-threads";
import { loadDataBundle } from "@/lib/data-bundle";
import { loadReferralInvoices } from "@/lib/invoice-data";
import { loadMarketingData } from "@/lib/marketing-data";
import {
  getDashboardSummary,
  getInvoiceChecks,
  getMarketingSummary,
  getPrimaryMonthSnapshots,
  getRevenueSummary,
} from "@/lib/metrics";
import { loadRevenueRecords } from "@/lib/revenue-data";
import { buildReferralCandidatesFromSlack, fillInterviewDatesFromSlack } from "@/lib/slack-interviews";

// ライブデータ(Google Sheets / Slack / 集客・広告シート)を60秒おきに再取得して反映する。
// loadDataBundle() / loadMarketingData() 自体もモジュールメモリキャッシュを持つため、二重に整合する。
export const dynamic = "force-dynamic";
// #請求書のPDFを最大50件ダウンロード・解析するため、初回読み込みが標準の実行時間上限(10秒)を
// 超えることがある。Vercelの関数実行時間上限を60秒へ引き上げる(2回目以降は5分キャッシュで高速)。
export const maxDuration = 60;

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
  // 画面表示用: Slack「#求職者」スレッドの「面談実施」報告から面談日を補完(シートO列の手入力があれば優先)。
  const candidates = fillInterviewDatesFromSlack(bundle.candidates, threadsResult.threads);
  // 費用集計用: 上記に加えて流入経路(「◯◯様流入」等)もSlackから検出し、シートに載っていない
  // スレッドだけの求職者(面談実施済みのもの)も課金対象として組み込む。
  const referralCandidates = buildReferralCandidatesFromSlack(
    bundle.candidates,
    threadsResult.threads,
    bundle.settings.referralRates,
  );
  const marketingSummary = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    referralCandidates,
    bundle.settings.referralRates,
    now,
  );
  // 先月分(主要指標・集客/広告の「先月」トグル用)。基準日は先月15日(月初・月末の日数差の影響を受けない)。
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const summaryLastMonth = getDashboardSummary(bundle, lastMonth);
  const marketingSummaryLastMonth = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    referralCandidates,
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
  // 主要指標セクションの月選択(直近6ヶ月)。各月のKPI+お金の出入りをまとめて渡す。
  const primaryMonths = getPrimaryMonthSnapshots(
    bundle.weeklyKpis,
    marketingResult.data,
    referralCandidates,
    bundle.settings.referralRates,
    revenueResult.records,
    invoicesResult.invoices,
    now,
  );
  // 集客・広告セクションの月選択(直近6ヶ月)。主要指標と同じ月の並び・ラベルを使う。
  const marketingMonths = primaryMonths.map((m, i) => ({
    monthKey: m.monthKey,
    label: m.label,
    summary:
      i === 0
        ? marketingSummary
        : i === 1
          ? marketingSummaryLastMonth
          : getMarketingSummary(
              marketingResult.data,
              bundle.weeklyKpis,
              referralCandidates,
              bundle.settings.referralRates,
              new Date(now.getFullYear(), now.getMonth() - i, 15),
            ),
  }));

  return (
    <DashboardView
      summary={summary}
      summaryLastMonth={summaryLastMonth}
      candidates={candidates}
      sourceStatus={bundle.sourceStatus}
      sourceErrorMessage={bundle.sourceErrorMessage}
      slackStatus={bundle.slackStatus}
      slackErrorMessage={bundle.slackErrorMessage}
      marketingMonths={marketingMonths}
      marketingStatus={marketingResult.status}
      marketingErrorMessage={marketingResult.errorMessage}
      invoiceChecks={invoiceChecks}
      invoiceSkippedCount={invoicesResult.skippedCount}
      invoiceStatus={invoicesResult.status}
      invoiceErrorMessage={invoicesResult.errorMessage}
      revenueSummary={revenueSummary}
      revenueStatus={revenueResult.status}
      revenueErrorMessage={revenueResult.errorMessage}
      primaryMonths={primaryMonths}
    />
  );
}
