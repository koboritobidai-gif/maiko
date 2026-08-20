import MarketingReportView from "@/components/MarketingReportView";
import { candidateThreadsTimeoutFallback, loadCandidateThreads } from "@/lib/candidate-threads";
import { dataBundleTimeoutFallback, loadDataBundle } from "@/lib/data-bundle";
import { loadMarketingData, marketingDataTimeoutFallback } from "@/lib/marketing-data";
import { getMarketingSummary } from "@/lib/metrics";
import { buildReferralCandidatesFromSlack } from "@/lib/slack-interviews";
import { withTimeout } from "@/lib/with-timeout";

// app/page.tsx と同じ理由(コメントもそちらを参照)で `force-dynamic` は使わない: Next.js 16 では
// force-dynamic が全 fetch を強制 no-store に上書きするため、messenger.ts のデータキャッシュ
// (next.revalidate 指定)まで無効化されてしまう。`revalidate = 0` なら動的レンダリングのまま、
// fetch 個別の revalidate 指定は尊重される。
export const revalidate = 0;

// 各ローダーに与える時間上限(app/page.tsx と同じ値)。超えたらフォールバック値で先にページを返す。
const LOADER_TIMEOUT_MS = 25_000;

/** `month`(YYYY-MM)クエリパラメータを、対象月15日を基準日とする Date に変換する。
 *  省略・不正な形式のときは今月を返す(月初・月末の日数差の影響を受けないよう15日基準にするのは
 *  getDashboardSummary 等の既存パターンと同じ)。 */
function parseMonthParam(month: string | undefined): Date {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      return new Date(y, m - 1, 15);
    }
  }
  return new Date();
}

/** Date を YYYY-MM の月キーに変換する。 */
function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default async function MarketingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const targetMonth = parseMonthParam(month);
  const lastMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 15);

  const [bundle, marketingResult, threadsResult] = await Promise.all([
    withTimeout(loadDataBundle(), LOADER_TIMEOUT_MS, dataBundleTimeoutFallback),
    withTimeout(loadMarketingData(), LOADER_TIMEOUT_MS, marketingDataTimeoutFallback),
    withTimeout(loadCandidateThreads(), LOADER_TIMEOUT_MS, candidateThreadsTimeoutFallback),
  ]);

  // 費用集計用: app/page.tsx と同じ手順で、流入経路をSlackから検出した求職者一覧を組み立てる
  // (シートに載っていない面談実施済みの求職者も課金対象に含める)。
  const referralCandidates = buildReferralCandidatesFromSlack(
    bundle.candidates,
    threadsResult.threads,
    bundle.settings.referralRates,
  );

  const summary = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    referralCandidates,
    bundle.settings.referralRates,
    targetMonth,
  );
  const summaryLastMonth = getMarketingSummary(
    marketingResult.data,
    bundle.weeklyKpis,
    referralCandidates,
    bundle.settings.referralRates,
    lastMonth,
  );

  return (
    <MarketingReportView
      monthKey={toMonthKey(targetMonth)}
      summary={summary}
      summaryLastMonth={summaryLastMonth}
      generatedAt={new Date()}
    />
  );
}
