/**
 * #求職者スレッドから集計した「面談数(主要指標)」「CA別実績」の最終確定値キャッシュ。
 *
 * 背景: コールドスタート直後は #求職者スレッドの返信取得が時間予算(messenger.ts の
 * REPLY_TIME_BUDGET_MS、通常20秒)で打ち切られ、読み込みが「途中まで」の状態になることがある。
 * この状態のまま集計すると面談数・CA別実績がほぼ0件になってしまい、「増えることはあっても
 * 減ることはない」という経営者の運用上の前提が崩れる。
 * 対策として、スレッドが完全に読み込めたとき(CandidateThreadsResult.status === "live" かつ
 * incomplete === false)の集計値だけを Next.js のデータキャッシュ(unstable_cache)に
 * 「最終確定値」として保存し、読み込みが不完全なときはこの保存済みの値を代わりに表示することで、
 * 数値が一時的に0へ落ち込むのを防ぐ。
 */
import { unstable_cache } from "next/cache";
import { loadCandidateThreads, type CandidateThreadsResult } from "./candidate-threads";
import { getCaMonthlyStatsFromThreads, type CaMonthlyStats } from "./slack-ca-stats";
import { getSlackInterviewMonthlyCounts } from "./slack-interviews";
import type { CandidateThread } from "./types";

export interface ThreadStats {
  /** CA別×月別の実績(直近6ヶ月・今月が先頭)。 */
  caStats: CaMonthlyStats[];
  /**
   * 月別の面談実施件数(YYYY-MM → 人数)。getSlackInterviewMonthlyCounts() は Map を返すが、
   * unstable_cache はキャッシュ値をJSONへ直列化して保存するため Map をそのまま保存できない
   * (JSON.stringify は Map を "{}" にしてしまう)。そのため Object.fromEntries で通常の
   * オブジェクトへ変換して保存し、読み出し側(page.tsx)で `new Map(Object.entries(...))` により
   * Map へ戻す。
   */
  interviewCountsByMonth: Record<string, number>;
}

/**
 * スレッド一覧から ThreadStats を計算する純関数。集計ロジック自体(slack-ca-stats.ts /
 * slack-interviews.ts)は変更しない。
 */
export function computeThreadStats(threads: CandidateThread[]): ThreadStats {
  return {
    caStats: getCaMonthlyStatsFromThreads(threads),
    interviewCountsByMonth: Object.fromEntries(getSlackInterviewMonthlyCounts(threads)),
  };
}

/**
 * 最終確定値(最後に完全読み込みできたときの集計)。
 * loadCandidateThreads() の結果が live かつ完全(incomplete: false)でなければ throw する
 * (不完全な集計をキャッシュに残さないための「失敗は保存しない」方針。invoices.ts の
 * PDFテキストキャッシュ(getCachedPdfText)と同じ考え方: unstable_cache は関数が throw すると
 * その結果をキャッシュへ保存しないため、次回呼び出し時にまた新しい値で再挑戦できる)。
 */
const lastGood = unstable_cache(
  async (): Promise<ThreadStats> => {
    const threadsResult = await loadCandidateThreads();
    if (threadsResult.status !== "live" || threadsResult.incomplete) {
      throw new Error(
        "#求職者スレッドの読み込みが不完全なため、CA別実績・面談数の最終確定値を更新しません。",
      );
    }
    return computeThreadStats(threadsResult.threads);
  },
  ["thread-stats-last-good"],
  { revalidate: 900 },
);

/**
 * CA別実績・面談数(主要指標)を、読み込みが不完全なときは保存済みの最終確定値で補いながら返す。
 * - threadsResult が live かつ完全: その場の集計(新鮮かつ完全なので、これが本来欲しい値)を返す。
 *   合わせて裏で lastGood() を実行し、最終確定値を更新しておく(結果は待たず、失敗も無視する)。
 * - 不完全: 保存済みの最終確定値(lastGood())があればそれを返す(usedLastGood: true)。
 *   保存済みの値も無ければ(初回起動直後などで一度も完全読み込みに成功していない場合)、
 *   不完全でもゼロよりはましなのでその場の集計値を返す(こちらは保存しない)。
 */
export async function getThreadStatsWithFallback(
  threadsResult: CandidateThreadsResult,
): Promise<{ stats: ThreadStats; usedLastGood: boolean }> {
  if (threadsResult.status === "live" && !threadsResult.incomplete) {
    void lastGood().catch(() => {});
    return { stats: computeThreadStats(threadsResult.threads), usedLastGood: false };
  }
  try {
    const stats = await lastGood();
    return { stats, usedLastGood: true };
  } catch {
    return { stats: computeThreadStats(threadsResult.threads), usedLastGood: false };
  }
}

/** /api/warm から呼ぶ: 最終確定値の保存を試み、成否を返す。 */
export async function warmThreadStatsLastGood(): Promise<boolean> {
  try {
    await lastGood();
    return true;
  } catch {
    return false;
  }
}
