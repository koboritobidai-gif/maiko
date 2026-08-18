/**
 * Slack「#求職者」スレッドから、CA(キャリアアドバイザー)ごと×月ごとの実績(面談・面接・内定・離脱)
 * を自動集計する(docs/DESIGN.md 4.1 参照)。
 *
 * 運用: CAは求職者と「面談」したら最後まで同じ求職者をサポートする。求職者データベースは
 * Slack「#求職者」チャンネル(1人1スレッド、`CandidateThread`型)で、スレッドに返信を投稿している
 * 人がその求職者の担当CAという運用実態を、以下のルールで機械的に判定する。
 *
 * 担当CAの判定(優先順、経営者の運用ルール「面談結果・面接結果を投稿している人が担当」に基づく):
 * 1. スレッド内で最初に「面談実施」または「面接実施」を報告した返信の投稿者(表示名と `CA_NAMES` の
 *    部分一致・大文字小文字無視で解決)。
 * 2. 上記が無い、または投稿者がどのCAにも一致しない場合のフォールバック: 返信の投稿者名がCA姓と
 *    一致する数が最多のCA(同数なら先に投稿した方)。
 * 3. どちらでも一致しなければ「その他」に集約する。
 *
 * 面談実施月(集計の基準月)は `slack-interviews.ts` の `getSlackInterviewDatesByName` を再利用し、
 * 面談日が検出できたスレッドのみを集計対象とする(面談実施月のコホートとして数え、面接・内定・離脱は
 * その後いつ起きても同じ月に帰属させる)。
 *
 * スレッド内イベント検出は返信本文の行単位で行い、「予定/日程/調整/予約/リスケ/キャンセル/延期」を
 * 含む行は未実施の言及として除外する(「来週面接予定」等の誤検出防止)。
 */
import { getSlackInterviewDatesByName } from "./slack-interviews";
import type { CandidateThread } from "./types";

/**
 * 実在のCA名簿(経営者申告)。`Member[]`(メンバータブ由来。今井/佐藤/富田)はまだ実際のCA体制に
 * 追随できていないため、CA別実績(このモジュール限定)はメンバータブではなくこの固定リストで判定する。
 * パイプラインの担当CA表示など他機能は従来どおり `Member[]` を使う(このモジュールでは参照しない)。
 */
export const CA_NAMES = ["佐藤", "竹林", "別府", "寺本", "松永"];

/** 未実施(日程調整・予約段階)を示す語。この語を含む行はイベント検出から除外する。 */
const NOT_DONE_RE = /予定|日程|調整|予約|リスケ|キャンセル|延期/;

/**
 * 面談実施の報告(slack-interviews.ts の INTERVIEW_DONE_RE と同じ検出ルール)。担当CA判定の一次シグナルにも使う。
 * 現場では「面談結果)8/10」のようなタイトルで結果を投稿する運用のため、「面談結果」も実施の報告とみなす。
 */
const INTERVIEW_DONE_RE = /面談.{0,3}(実施|完了|終了)|面談済み|面談(を|は)?しました|面談結果/;

/**
 * 面接実施の報告(1次・二次・最終等)。1人で複数回あり得るため延べ件数として数える。
 * 「面接結果)」のタイトル投稿も実施の報告とみなす。
 */
const INTERVIEW_EVENT_RE = /(?:1次|一次|2次|二次|3次|最終)?\s*面接.{0,4}(実施|終了|完了|通過)|面接済み|面接結果/;

/** 氏名照合用の正規化(半角・全角の空白を除去。slack-interviews.ts と同じ)。 */
function normalizeName(name: string): string {
  return name.replace(/[\s　]/g, "");
}

/** 行が「面談実施」または「面接実施」の報告か(未実施を示す語を含む行は除外)。 */
function isInterviewOrInterviewEventLine(line: string): boolean {
  if (NOT_DONE_RE.test(line)) return false;
  return INTERVIEW_DONE_RE.test(line) || INTERVIEW_EVENT_RE.test(line);
}

/** 表示名にCA姓(CA_NAMES)が含まれるか(部分一致・大文字小文字無視)で対応するCA名を探す。 */
function findCaNameByAuthor(author: string): string | undefined {
  const lower = author.toLowerCase();
  return CA_NAMES.find((name) => lower.includes(name.toLowerCase()));
}

/**
 * スレッドの担当CA名を判定する。
 * 1. 「面談実施」または「面接実施」を最初に報告した返信の投稿者(CA_NAMES に一致する場合)
 * 2. 無ければ、返信の投稿者名がCA姓と一致する数が最多のCA(同数は先に投稿した方)
 * 3. どちらでも一致しなければ undefined(呼び出し側で「その他」に分類する)
 */
function determineResponsibleCaName(thread: CandidateThread): string | undefined {
  // 1. 面談実施・面接実施の報告をした最初の返信の投稿者(replies は古い順)。
  for (const reply of thread.replies) {
    const isReport = reply.text.split("\n").some(isInterviewOrInterviewEventLine);
    if (!isReport) continue;
    const ca = findCaNameByAuthor(reply.author);
    if (ca) return ca;
  }

  // 2. フォールバック: 返信数最多のCA(同数なら先に投稿した方)。
  const tally = new Map<string, { count: number; firstPostedAtMs: number }>();
  for (const reply of thread.replies) {
    const ca = findCaNameByAuthor(reply.author);
    if (!ca) continue;
    const entry = tally.get(ca);
    if (entry) {
      entry.count += 1;
    } else {
      tally.set(ca, { count: 1, firstPostedAtMs: reply.postedAt.getTime() });
    }
  }
  if (tally.size === 0) return undefined;
  return [...tally.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].firstPostedAtMs - b[1].firstPostedAtMs,
  )[0][0];
}

interface ThreadOutcome {
  /** 面接実施の延べ件数(1次・最終など複数回あり得る) */
  interviewEventCount: number;
  /** 面接へ進んだか(interviewEventCount >= 1) */
  advancedToInterview: boolean;
  /** 内定の言及があるか(辞退・取り消し・見送りを伴わないもの) */
  hasOffer: boolean;
  /** 離脱(辞退・クローズ等)の言及があるか */
  hasWithdrawn: boolean;
}

/** スレッド全文(返信)から面接・内定・離脱のイベントを検出する。 */
function computeThreadOutcome(thread: CandidateThread): ThreadOutcome {
  let interviewEventCount = 0;
  let hasOffer = false;
  let hasWithdrawn = false;

  for (const reply of thread.replies) {
    const lines = reply.text.split("\n").filter((line) => !NOT_DONE_RE.test(line));
    // 面接実施は「返信の数」を数える(1返信内に複数行該当しても1件)。
    if (lines.some((line) => INTERVIEW_EVENT_RE.test(line))) {
      interviewEventCount += 1;
    }
    for (const line of lines) {
      if (line.includes("内定") && !/辞退|取り消し|見送り/.test(line)) hasOffer = true;
      if (/辞退|クローズ|離脱|お見送り/.test(line)) hasWithdrawn = true;
    }
  }

  return {
    interviewEventCount,
    advancedToInterview: interviewEventCount > 0,
    hasOffer,
    hasWithdrawn,
  };
}

/** CA名(CA_NAMES のいずれか)。どのCAにも紐付かない場合 "その他" */
const OTHER_CA_LABEL = "その他";

/** CA別×月別の実績1行。 */
export interface CaMonthlyStat {
  /** CA名(CA_NAMES のいずれか)。どのCAにも紐付かない場合 "その他" */
  ca: string;
  /** 面談実施人数(そのCA担当・その月に面談実施) */
  interviews: number;
  /** 面接へ進んだ人数 */
  advancedToInterview: number;
  /** 面接の実施件数(1次・最終など延べ回数) */
  interviewEventCount: number;
  /** 面接への移行率(%) = advancedToInterview / interviews。interviews 0なら null */
  advanceRatePercent: number | null;
  /** 内定人数 */
  offers: number;
  /** 内定率(%)。interviews 0なら null */
  offerRatePercent: number | null;
  /** 離脱(辞退)人数 */
  withdrawn: number;
  /** 離脱率(%)。interviews 0なら null */
  withdrawnRatePercent: number | null;
}

/** ある月のCA別実績まとめ。 */
export interface CaMonthlyStats {
  /** 対象月(YYYY-MM) */
  monthKey: string;
  /** 面談0のCAは含めない。CA名順(CA_NAMES の並び順→その他) */
  rows: CaMonthlyStat[];
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * CA別×月別の実績(直近nヶ月分、今月が先頭)を、Slack「#求職者」スレッドから集計する(純関数)。
 * 対象CAは `CA_NAMES`(固定リスト、経営者申告)で、`Member[]`(メンバータブ)は使わない。
 * 面談実施月のコホートで集計する(面接・内定・離脱はその後いつ起きても面談を実施した月に帰属させる)。
 */
export function getCaMonthlyStatsFromThreads(
  threads: CandidateThread[],
  now: Date = new Date(),
  months = 6,
): CaMonthlyStats[] {
  const interviewDates = getSlackInterviewDatesByName(threads);

  // スレッドごとの面談実施月・担当CA・イベント集計を先に1回だけ計算しておく(月ごとのループで使い回す)。
  const threadStats = threads
    .map((thread) => {
      const interviewedAt = interviewDates.get(normalizeName(thread.name));
      if (!interviewedAt) return null;
      const caName = determineResponsibleCaName(thread);
      return {
        monthKey: monthKeyOf(interviewedAt),
        caLabel: caName ?? OTHER_CA_LABEL,
        // 表示順: CA_NAMES の並び順→その他。
        caOrder: caName ? CA_NAMES.indexOf(caName) : CA_NAMES.length,
        ...computeThreadOutcome(thread),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const snapshots: CaMonthlyStats[] = [];
  for (let i = 0; i < months; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const monthKey = monthKeyOf(ref);

    const rowsMap = new Map<
      string,
      { ca: string; order: number; interviews: number; advancedToInterview: number; interviewEventCount: number; offers: number; withdrawn: number }
    >();
    for (const t of threadStats) {
      if (t.monthKey !== monthKey) continue;
      let row = rowsMap.get(t.caLabel);
      if (!row) {
        row = {
          ca: t.caLabel,
          order: t.caOrder,
          interviews: 0,
          advancedToInterview: 0,
          interviewEventCount: 0,
          offers: 0,
          withdrawn: 0,
        };
        rowsMap.set(t.caLabel, row);
      }
      row.interviews += 1;
      row.interviewEventCount += t.interviewEventCount;
      if (t.advancedToInterview) row.advancedToInterview += 1;
      if (t.hasOffer) row.offers += 1;
      if (t.hasWithdrawn) row.withdrawn += 1;
    }

    const rows: CaMonthlyStat[] = [...rowsMap.values()]
      .sort((a, b) => a.order - b.order)
      .map((row) => ({
        ca: row.ca,
        interviews: row.interviews,
        advancedToInterview: row.advancedToInterview,
        interviewEventCount: row.interviewEventCount,
        advanceRatePercent: row.interviews > 0 ? (row.advancedToInterview / row.interviews) * 100 : null,
        offers: row.offers,
        offerRatePercent: row.interviews > 0 ? (row.offers / row.interviews) * 100 : null,
        withdrawn: row.withdrawn,
        withdrawnRatePercent: row.interviews > 0 ? (row.withdrawn / row.interviews) * 100 : null,
      }));

    snapshots.push({ monthKey, rows });
  }
  return snapshots;
}
