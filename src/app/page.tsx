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
  const marketingSummary = getMarketingSummary(marketingResult.data, bundle.weeklyKpis, now);

  return (
    <DashboardView
      summary={summary}
      candidates={bundle.candidates}
      sourceStatus={bundle.sourceStatus}
      sourceErrorMessage={bundle.sourceErrorMessage}
      slackStatus={bundle.slackStatus}
      slackErrorMessage={bundle.slackErrorMessage}
      marketingSummary={marketingSummary}
      marketingStatus={marketingResult.status}
      marketingErrorMessage={marketingResult.errorMessage}
    />
  );
}
