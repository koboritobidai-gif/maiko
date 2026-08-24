import DashboardView from "@/components/DashboardView";
import { candidateThreadsTimeoutFallback, loadCandidateThreads } from "@/lib/candidate-threads";
import { dataBundleTimeoutFallback, loadDataBundle } from "@/lib/data-bundle";
import { invoiceDataTimeoutFallback, loadReferralInvoices } from "@/lib/invoice-data";
import { loadMarketingData, marketingDataTimeoutFallback } from "@/lib/marketing-data";
import {
  getDashboardSummary,
  getInvoiceChecks,
  getMarketingSummary,
  getPrimaryMonthSnapshots,
  getRevenueSummary,
} from "@/lib/metrics";
import { loadRevenueRecords, revenueDataTimeoutFallback } from "@/lib/revenue-data";
import { loadSalesReports, salesDataTimeoutFallback } from "@/lib/sales-data";
import { getSalesMonthlyStats } from "@/lib/sales-stats";
import { buildReferralCandidatesFromSlack, fillInterviewDatesFromSlack } from "@/lib/slack-interviews";
import { getThreadStatsWithFallback } from "@/lib/thread-stats";
import { withTimeout } from "@/lib/with-timeout";

// 毎リクエスト動的レンダリング(ライブデータ表示)。`force-dynamic` は使わないこと:
// Next.js 16 では force-dynamic が全 fetch を強制 no-store に上書きするため、messenger.ts が
// Slackスレッド返信を保存しているデータキャッシュ(next.revalidate 指定)まで無効化されてしまう。
// `revalidate = 0` なら動的レンダリングのまま、fetch 個別の revalidate 指定は尊重される。
export const revalidate = 0;
// #請求書のPDFを最大50件ダウンロード・解析するため、初回読み込みが標準の実行時間上限(10秒)を
// 超えることがある。Vercelの関数実行時間上限を60秒へ引き上げる(2回目以降は5分キャッシュで高速)。
export const maxDuration = 60;

// 各ローダーに与える時間上限。これを超えたら(ライブ失敗時と同じ形の)フォールバック値で
// 先にページを返す。元のローダーは裏で走り続け、キャッシュへ貯まった内容は次回アクセス以降に反映される
// (詳細は with-timeout.ts のコメント参照)。
const LOADER_TIMEOUT_MS = 25_000;

export default async function TodayDashboardPage() {
  const now = new Date();
  const [bundle, marketingResult, threadsResult, invoicesResult, revenueResult, salesResult] = await Promise.all([
    withTimeout(loadDataBundle(), LOADER_TIMEOUT_MS, dataBundleTimeoutFallback),
    withTimeout(loadMarketingData(), LOADER_TIMEOUT_MS, marketingDataTimeoutFallback),
    withTimeout(loadCandidateThreads(), LOADER_TIMEOUT_MS, candidateThreadsTimeoutFallback),
    withTimeout(loadReferralInvoices(), LOADER_TIMEOUT_MS, invoiceDataTimeoutFallback),
    withTimeout(loadRevenueRecords(), LOADER_TIMEOUT_MS, revenueDataTimeoutFallback),
    withTimeout(loadSalesReports(), LOADER_TIMEOUT_MS, salesDataTimeoutFallback),
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
  // 先々月分(ファネルを「先月」表示にしたときの前月比の比較対象)。
  const summaryTwoMonthsAgo = getDashboardSummary(bundle, new Date(now.getFullYear(), now.getMonth() - 2, 15));
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
  // 入金予定: 売上シートの「今月より先の入金月」の合計(入金月の昇順)。トップの主要指標に
  // これから入ってくるお金を表示したいという経営者の要望(9月末・10月末入金分など)。
  const nowMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const upcomingRevenue = [
    ...revenueResult.records
      .filter((r) => r.month > nowMonthKey)
      .reduce((m, r) => m.set(r.month, (m.get(r.month) ?? 0) + r.amountYen), new Map<string, number>()),
  ]
    .map(([monthKey, totalYen]) => ({ monthKey, totalYen }))
    .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1));
  // CA別の月次実績・面談数(#求職者スレッドから自動集計。直近6ヶ月・今月が先頭。対象CAは CA_NAMES
  // 固定リスト)。コールドスタート等でスレッド読み込みが不完全なとき(0件へ落ち込むのを防ぐため)は
  // 最後に完全読み込みできたときの最終確定値(thread-stats.ts)へフォールバックする。
  const { stats: threadStats } = await getThreadStatsWithFallback(threadsResult);
  const caStats = threadStats.caStats;
  const interviewCountsByMonth = new Map(Object.entries(threadStats.interviewCountsByMonth));
  // 月次推移の面談数も主要指標と同じ基準(週次KPIシートとSlack検出の大きい方)に揃える
  // (経営者の指摘: シート未入力の当月が月次推移だけ0件に見えるため)。
  const summaryForView = {
    ...summary,
    monthlyHistory: summary.monthlyHistory.map((p) => ({
      ...p,
      interviews: Math.max(p.interviews, interviewCountsByMonth.get(p.month) ?? 0),
    })),
  };
  // 営業実績(#21_ra・#22_アポイント報告から自動集計。直近6ヶ月・今月が先頭。対象は SALES_NAMES 固定リスト)。
  const salesStats = getSalesMonthlyStats(salesResult.reports, salesResult.appointments, now);
  // 主要指標セクションの月選択(直近6ヶ月)。各月のKPI+お金の出入りをまとめて渡す。
  // 面談数は週次KPIシートの手入力とSlack「#求職者」の面談メモ検出の多い方を表示する
  // (シート入力前の当月もCA別実績と同じSlack集計が即反映されるように)。
  const primaryMonths = getPrimaryMonthSnapshots(
    bundle.weeklyKpis,
    marketingResult.data,
    referralCandidates,
    bundle.settings.referralRates,
    revenueResult.records,
    invoicesResult.invoices,
    interviewCountsByMonth,
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
      summary={summaryForView}
      summaryLastMonth={summaryLastMonth}
      summaryTwoMonthsAgo={summaryTwoMonthsAgo}
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
      upcomingRevenue={upcomingRevenue}
      revenueStatus={revenueResult.status}
      revenueErrorMessage={revenueResult.errorMessage}
      primaryMonths={primaryMonths}
      caStats={caStats}
      salesStats={salesStats}
      salesStatus={salesResult.status}
      salesErrorMessage={salesResult.errorMessage}
    />
  );
}
