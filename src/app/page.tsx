import DashboardView from "@/components/DashboardView";
import { loadDataBundle } from "@/lib/data-bundle";
import { loadMarketingData } from "@/lib/marketing-data";
import { getDashboardSummary, getMarketingSummary } from "@/lib/metrics";

// ライブデータ(Google Sheets / Slack / 集客・広告シート)を60秒おきに再取得して反映する。
// loadDataBundle() / loadMarketingData() 自体もモジュールメモリキャッシュを持つため、二重に整合する。
export const dynamic = "force-dynamic";

export default async function TodayDashboardPage() {
  const now = new Date();
  const [bundle, marketingResult] = await Promise.all([loadDataBundle(), loadMarketingData()]);
  const summary = getDashboardSummary(bundle, now);
  const marketingSummary = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    bundle.candidates,
    bundle.settings.referralRates,
    now,
  );
  // 先月分(主要指標・集客/広告の「先月」トグル用)。基準日は先月15日(月初・月末の日数差の影響を受けない)。
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const summaryLastMonth = getDashboardSummary(bundle, lastMonth);
  const marketingSummaryLastMonth = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    bundle.candidates,
    bundle.settings.referralRates,
    lastMonth,
  );

  return (
    <DashboardView
      summary={summary}
      summaryLastMonth={summaryLastMonth}
      candidates={bundle.candidates}
      sourceStatus={bundle.sourceStatus}
      sourceErrorMessage={bundle.sourceErrorMessage}
      slackStatus={bundle.slackStatus}
      slackErrorMessage={bundle.slackErrorMessage}
      marketingSummary={marketingSummary}
      marketingSummaryLastMonth={marketingSummaryLastMonth}
      marketingStatus={marketingResult.status}
      marketingErrorMessage={marketingResult.errorMessage}
    />
  );
}
