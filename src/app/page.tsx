import DashboardView from "@/components/DashboardView";
import { loadDataBundle } from "@/lib/data-bundle";
import { getDashboardSummary } from "@/lib/metrics";

// ライブデータ(Google Sheets / Slack)を60秒おきに再取得して反映する。
// loadDataBundle() 自体もモジュールメモリに60秒キャッシュを持つため、二重に整合する。
export const revalidate = 60;

export default async function TodayDashboardPage() {
  const bundle = await loadDataBundle();
  const summary = getDashboardSummary(bundle);

  return (
    <DashboardView
      summary={summary}
      candidates={bundle.candidates}
      sourceStatus={bundle.sourceStatus}
      sourceErrorMessage={bundle.sourceErrorMessage}
      slackStatus={bundle.slackStatus}
      slackErrorMessage={bundle.slackErrorMessage}
    />
  );
}
