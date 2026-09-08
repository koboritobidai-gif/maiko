/**
 * Slack「#21_ra」の【営業日報】から読み取った `RaDailyReport[]` を、RA(リクルーティングアドバイザー)
 * 個人別(authorId単位)+全員合計で月次集計する純関数群。対象者は人数・氏名をハードコードせず、
 * 「日報を投稿した人ごと」に集計する(sales-stats.ts の SALES_NAMES 固定リストとは異なる方針)。
 * 率・単価は分母0のとき null を返す(画面では「—」表示にする)。
 */
import type { RaDailyReport } from "./types";

/** RA1人分、または全員合計1件分の月次集計結果。 */
export interface RaMemberAggregate {
  /** 個人集計のときはSlackユーザーID、合計行は "__total__"。 */
  authorId: string;
  /** 個人集計のときは表示名、合計行は「合計」。 */
  authorName: string;

  callDials: number;
  callConnected: number;
  callAppointments: number;
  /** 通電率(本通/架電数) */
  callConnectRatePercent: number | null;
  /** アポ率(架電アポ獲得/架電数) */
  callAppointmentRatePercent: number | null;

  dmSent: number;
  dmReplies: number;
  dmAppointments: number;
  /** 返信率(DM返信数/DM送信数) */
  dmReplyRatePercent: number | null;
  /** 返信→アポ率(DMアポ獲得/DM返信数) */
  dmReplyToAppointmentRatePercent: number | null;

  eventCount: number;
  eventCardTarget: number;
  eventCardsExchanged: number;
  /** 名刺交換の目標達成率(名刺交換数/名刺交換目標) */
  eventCardAchievementRatePercent: number | null;
  eventDecisionMakerCards: number;
  /** 意思決定者率(意思決定者の名刺数/名刺交換数) */
  eventDecisionMakerRatePercent: number | null;
  eventAppointments: number;
  /** 交流会参加費の合計(円) */
  eventFeeYen: number;
  /** 1アポあたり参加費(参加費合計/交流会アポ獲得)。交流会アポ0件なら null。 */
  eventCostPerAppointmentYen: number | null;
  /** 名刺→アポ率(交流会アポ獲得/名刺交換数) */
  eventCardToAppointmentRatePercent: number | null;

  referralObtained: number;
  referralAppointments: number;

  resultAppointments: number;
  resultMeetings: number;
  resultContracts: number;
  /** アポ→商談率(商談実施数/アポイント数) */
  appointmentToMeetingRatePercent: number | null;
  /** 商談→契約率(契約数/商談実施数) */
  meetingToContractRatePercent: number | null;

  /** その月に日報を出した日数(合計行は各メンバーの報告日数の合計=延べ日数)。 */
  reportDayCount: number;
}

/** ある月のRA営業日報の集計まとめ。 */
export interface RaReportMonthlyAggregate {
  /** 対象月(YYYY-MM) */
  monthKey: string;
  /** 個人別(authorName の五十音順)。日報投稿が1件も無い月は空配列。 */
  members: RaMemberAggregate[];
  /** 全員合計(1件も無い月でも全項目0の行を返す)。 */
  total: RaMemberAggregate;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function yenPer(yenTotal: number, denominator: number): number | null {
  return denominator > 0 ? yenTotal / denominator : null;
}

/** 数値フィールドの合計(undefinedは0扱い)。 */
function sumOf(reports: RaDailyReport[], pick: (r: RaDailyReport) => number | undefined): number {
  return reports.reduce((sum, r) => sum + (pick(r) ?? 0), 0);
}

function buildAggregate(authorId: string, authorName: string, reports: RaDailyReport[]): RaMemberAggregate {
  const callDials = sumOf(reports, (r) => r.callDials);
  const callConnected = sumOf(reports, (r) => r.callConnected);
  const callAppointments = sumOf(reports, (r) => r.callAppointments);

  const dmSent = sumOf(reports, (r) => r.dmSent);
  const dmReplies = sumOf(reports, (r) => r.dmReplies);
  const dmAppointments = sumOf(reports, (r) => r.dmAppointments);

  const eventCount = sumOf(reports, (r) => r.eventCount);
  const eventCardTarget = sumOf(reports, (r) => r.eventCardTarget);
  const eventCardsExchanged = sumOf(reports, (r) => r.eventCardsExchanged);
  const eventDecisionMakerCards = sumOf(reports, (r) => r.eventDecisionMakerCards);
  const eventAppointments = sumOf(reports, (r) => r.eventAppointments);
  const eventFeeYen = sumOf(reports, (r) => r.eventFeeYen);

  const referralObtained = sumOf(reports, (r) => r.referralObtained);
  const referralAppointments = sumOf(reports, (r) => r.referralAppointments);

  const resultAppointments = sumOf(reports, (r) => r.resultAppointments);
  const resultMeetings = sumOf(reports, (r) => r.resultMeetings);
  const resultContracts = sumOf(reports, (r) => r.resultContracts);

  return {
    authorId,
    authorName,
    callDials,
    callConnected,
    callAppointments,
    callConnectRatePercent: rate(callConnected, callDials),
    callAppointmentRatePercent: rate(callAppointments, callDials),
    dmSent,
    dmReplies,
    dmAppointments,
    dmReplyRatePercent: rate(dmReplies, dmSent),
    dmReplyToAppointmentRatePercent: rate(dmAppointments, dmReplies),
    eventCount,
    eventCardTarget,
    eventCardsExchanged,
    eventCardAchievementRatePercent: rate(eventCardsExchanged, eventCardTarget),
    eventDecisionMakerCards,
    eventDecisionMakerRatePercent: rate(eventDecisionMakerCards, eventCardsExchanged),
    eventAppointments,
    eventFeeYen,
    eventCostPerAppointmentYen: yenPer(eventFeeYen, eventAppointments),
    eventCardToAppointmentRatePercent: rate(eventAppointments, eventCardsExchanged),
    referralObtained,
    referralAppointments,
    resultAppointments,
    resultMeetings,
    resultContracts,
    appointmentToMeetingRatePercent: rate(resultMeetings, resultAppointments),
    meetingToContractRatePercent: rate(resultContracts, resultMeetings),
    reportDayCount: reports.length,
  };
}

/**
 * RA営業日報(直近120日分の全件)を、対象月(monthKey=YYYY-MM)で絞り込み、
 * 投稿者(authorId)ごと+全員合計で集計する。対象者は投稿者から自動的に決まる(固定リストなし)。
 */
export function aggregateRaReports(reports: RaDailyReport[], monthKey: string): RaReportMonthlyAggregate {
  const filtered = reports.filter((r) => r.date.slice(0, 7) === monthKey);

  const byAuthor = new Map<string, { authorName: string; reports: RaDailyReport[] }>();
  for (const r of filtered) {
    const group = byAuthor.get(r.authorId);
    if (group) {
      group.reports.push(r);
    } else {
      byAuthor.set(r.authorId, { authorName: r.authorName, reports: [r] });
    }
  }

  const members = [...byAuthor.entries()]
    .map(([authorId, group]) => buildAggregate(authorId, group.authorName, group.reports))
    .sort((a, b) => a.authorName.localeCompare(b.authorName, "ja"));

  const total = buildAggregate("__total__", "合計", filtered);

  return { monthKey, members, total };
}

/** 日報が1件でも存在する月キー(YYYY-MM)の一覧を新しい月順で返す(月ナビ用)。 */
export function listRaReportMonthKeys(reports: RaDailyReport[]): string[] {
  const monthKeys = new Set(reports.map((r) => r.date.slice(0, 7)));
  return [...monthKeys].sort((a, b) => (a < b ? 1 : -1));
}
