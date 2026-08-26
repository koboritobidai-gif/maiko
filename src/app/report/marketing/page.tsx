import MarketingReportView from "@/components/MarketingReportView";
import MarketingReportWeeklyView from "@/components/MarketingReportWeeklyView";
import { candidateThreadsTimeoutFallback, loadCandidateThreads } from "@/lib/candidate-threads";
import { dataBundleTimeoutFallback, loadDataBundle } from "@/lib/data-bundle";
import { loadMarketingData, marketingDataTimeoutFallback } from "@/lib/marketing-data";
import { getMarketingSummary, getMarketingWeeklySummary, mondayOfWeek } from "@/lib/metrics";
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

/** Date を YYYY-MM-DD キーに変換する(週次レポートの `week` クエリ・前週/翌週リンク用)。 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `week`(YYYY-MM-DD、対象週の月曜日)クエリパラメータを Date に変換する。
 * 不正な形式・存在しない日付・月曜日以外の日付は、その日(解釈できなければ今日)を含む週の
 * 月曜日へ丸める(仕様: 「不正な日付や月曜以外は、その日を含む週の月曜へ丸める」)。
 */
function parseWeekParam(week: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(week);
  if (m) {
    const [, yStr, moStr, dStr] = m;
    const y = Number(yStr);
    const mo = Number(moStr);
    const d = Number(dStr);
    const candidate = new Date(y, mo - 1, d);
    // Date は月末を超えた日付(例: 2/30)を翌月へ繰り上げてしまうため、構築後の年月日が
    // 入力と一致するかで実在する日付かを確認する。
    if (candidate.getFullYear() === y && candidate.getMonth() === mo - 1 && candidate.getDate() === d) {
      return mondayOfWeek(candidate);
    }
  }
  return mondayOfWeek(new Date());
}

export default async function MarketingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string }>;
}) {
  const { month, week } = await searchParams;

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

  // `week` クエリが付いていれば週次版(全体MTG=毎週木曜12時向け)、無ければ従来どおり月次版。
  if (week !== undefined) {
    const weekStart = parseWeekParam(week);
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
    const lastWeekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7);
    const nextWeekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);

    const summary = getMarketingWeeklySummary(
      marketingResult.data,
      referralCandidates,
      bundle.settings.referralRates,
      weekStart,
    );
    const summaryLastWeek = getMarketingWeeklySummary(
      marketingResult.data,
      referralCandidates,
      bundle.settings.referralRates,
      lastWeekStart,
    );

    return (
      <MarketingReportWeeklyView
        weekStart={weekStart}
        weekEnd={weekEnd}
        summary={summary}
        summaryLastWeek={summaryLastWeek}
        generatedAt={new Date()}
        prevWeekParam={toDateKey(lastWeekStart)}
        nextWeekParam={toDateKey(nextWeekStart)}
      />
    );
  }

  const targetMonth = parseMonthParam(month);
  const lastMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 15);

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
