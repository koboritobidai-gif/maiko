/**
 * Tobidai Cockpit - KPI集計ロジック
 * すべて DataBundle(または内包する配列)を引数に取る純関数として実装する。
 * demo-data.ts / adapters/* を直接 import しないこと(画面・API・AI応答のいずれも
 * このファイル経由で集計し、実データ・デモデータの両方に同一ロジックを適用する)。
 */
import { ALL_STAGES, PIPELINE_STAGES } from "./types";
import type {
  AdDailyRecord,
  Candidate,
  CandidateKpiKey,
  CorporateKpiKey,
  DataBundle,
  KpiCategory,
  MarketingData,
  Member,
  Placement,
  Project,
  ReferralInvoice,
  ReferralRate,
  RevenueRecord,
  SlackPost,
  SnsWeeklyRecord,
  Stage,
  WeeklyKpiRecord,
} from "./types";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** `weekStart`("YYYY-MM-DD")を Date に変換する。月次集計は週の開始日(月曜)が属する月を採用する。 */
function weekStartToDate(weekStart: string): Date {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export interface CountAmount {
  count: number;
  amount: number;
}

function summarize(list: Placement[]): CountAmount {
  return {
    count: list.length,
    amount: list.reduce((sum, p) => sum + p.feeAmount, 0),
  };
}

/** 本日の成約(件数・金額)。 */
export function getTodayPlacements(placements: Placement[], now: Date = new Date()): CountAmount {
  return summarize(placements.filter((p) => isSameDay(p.placedAt, now)));
}

/** 月内累計成約(件数・金額)。 */
export function getMonthPlacements(placements: Placement[], now: Date = new Date()): CountAmount {
  return summarize(placements.filter((p) => isSameMonth(p.placedAt, now)));
}

/** 特定CA担当分の月内累計成約(件数・手数料合計)。CA個別実績の集計に使用する。 */
export function getCaMonthPlacements(
  placements: Placement[],
  caId: string,
  now: Date = new Date(),
): CountAmount {
  return summarize(placements.filter((p) => p.caId === caId && isSameMonth(p.placedAt, now)));
}

/** 売上見込み(内定+承諾ステージの理論年収 × 手数料率)。 */
export function getForecastRevenue(candidates: Candidate[], feeRate: number): number {
  return candidates
    .filter((c) => c.stage === "内定" || c.stage === "承諾")
    .reduce((sum, c) => sum + c.expectedAnnualIncome * feeRate, 0);
}

export interface StageCount {
  stage: Stage;
  count: number;
}

/** ステージ別の求職者数(パイプライン、辞退は含まない)。 */
export function getStagePipeline(candidates: Candidate[]): StageCount[] {
  return PIPELINE_STAGES.map((stage) => ({
    stage,
    count: candidates.filter((c) => c.stage === stage).length,
  }));
}

/** 辞退(離脱)の人数。 */
export function getWithdrawnCount(candidates: Candidate[]): number {
  return candidates.filter((c) => c.stage === "辞退").length;
}

/** プロジェクト一覧(状態順: 遅延→注意→順調)。 */
export function getSortedProjects(projects: Project[]): Project[] {
  const order: Record<Project["status"], number> = { 遅延: 0, 注意: 1, 順調: 2 };
  return [...projects].sort((a, b) => order[a.status] - order[b.status]);
}

/** 直近の Slack ハイライト(新しい順)。 */
export function getRecentSlackPosts(slackPosts: SlackPost[], limit = 8): SlackPost[] {
  return [...slackPosts]
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .slice(0, limit);
}

/** 特定CA担当の求職者一覧。 */
export function getCandidatesByCa(candidates: Candidate[], caId: string): Candidate[] {
  return candidates.filter((c) => c.caId === caId);
}

export interface CaStageBreakdown {
  stage: Stage;
  count: number;
}

/** 特定CA担当の求職者数(ステージ別内訳、辞退含む)。CA個別実績の集計に使用する。 */
export function getCaCandidateBreakdown(candidates: Candidate[], caId: string): CaStageBreakdown[] {
  const mine = getCandidatesByCa(candidates, caId);
  return ALL_STAGES.map((stage) => ({ stage, count: mine.filter((c) => c.stage === stage).length }));
}

/** id からメンバーを引く。 */
export function getMemberById(members: Member[], id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

/** 名前(部分一致)からメンバーを引く。 */
export function findMemberByName(members: Member[], name: string): Member | undefined {
  return members.find((m) => m.name.includes(name) || name.includes(m.name));
}

// ─────────────────────────────────────────────
// 週次KPI: 自動計算率(純関数。シートには入れない)
// ─────────────────────────────────────────────

/** LINE登録率(%) = LINE登録人数 / PV数 */
export function lineRegistrationRate(pv: number, lineRegistrations: number): number {
  return pv > 0 ? (lineRegistrations / pv) * 100 : 0;
}

/** 面談実行率(%) = 面談数 / 面談予約数 */
export function interviewExecutionRate(interviews: number, interviewBookings: number): number {
  return interviewBookings > 0 ? (interviews / interviewBookings) * 100 : 0;
}

/** 面談移行率(%) = 面談数 / LINE登録人数 */
export function interviewConversionRate(interviews: number, lineRegistrations: number): number {
  return lineRegistrations > 0 ? (interviews / lineRegistrations) * 100 : 0;
}

// ─────────────────────────────────────────────
// 週次KPI: 集計(純関数)
// ─────────────────────────────────────────────

type KpiKey = CandidateKpiKey | CorporateKpiKey;

function filterKpi(records: WeeklyKpiRecord[], category: KpiCategory, key: KpiKey): WeeklyKpiRecord[] {
  return records.filter((r) => r.category === category && r.key === key);
}

/** 指定した区分・項目の合計値(絞り込んだレコード全体の単純合計)。 */
export function sumWeeklyKpi(records: WeeklyKpiRecord[], category: KpiCategory, key: KpiKey): number {
  return filterKpi(records, category, key).reduce((sum, r) => sum + r.value, 0);
}

/** 今月合計(週の開始日=月曜が属する月で判定)。 */
export function getMonthlyKpiTotal(
  records: WeeklyKpiRecord[],
  category: KpiCategory,
  key: KpiKey,
  now: Date = new Date(),
): number {
  const inMonth = filterKpi(records, category, key).filter((r) =>
    isSameMonth(weekStartToDate(r.weekStart), now),
  );
  return inMonth.reduce((sum, r) => sum + r.value, 0);
}

/** 先月合計。 */
export function getLastMonthKpiTotal(
  records: WeeklyKpiRecord[],
  category: KpiCategory,
  key: KpiKey,
  now: Date = new Date(),
): number {
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getMonthlyKpiTotal(records, category, key, lastMonthRef);
}

export interface KpiMonthComparison {
  /** 今月合計 */
  value: number;
  /** 先月合計 */
  previousValue: number;
  /** 今月 − 先月 */
  diff: number;
}

/** 今月合計・先月合計・差分をまとめて返す。 */
export function getKpiMonthComparison(
  records: WeeklyKpiRecord[],
  category: KpiCategory,
  key: KpiKey,
  now: Date = new Date(),
): KpiMonthComparison {
  const value = getMonthlyKpiTotal(records, category, key, now);
  const previousValue = getLastMonthKpiTotal(records, category, key, now);
  return { value, previousValue, diff: value - previousValue };
}

export interface WeeklyKpiTrendPoint {
  weekStart: string;
  value: number;
}

/** 直近 n 週(既定5週)の週次推移(週開始日 昇順)。 */
export function getRecentWeeklyKpiTrend(
  records: WeeklyKpiRecord[],
  category: KpiCategory,
  key: KpiKey,
  weeks = 5,
): WeeklyKpiTrendPoint[] {
  const byWeek = new Map<string, number>();
  for (const r of filterKpi(records, category, key)) {
    byWeek.set(r.weekStart, (byWeek.get(r.weekStart) ?? 0) + r.value);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(-weeks)
    .map(([weekStart, value]) => ({ weekStart, value }));
}

export interface OwnerKpiTotal {
  owner: string;
  total: number;
}

/** 担当者別合計(値の大きい順)。 */
export function getKpiTotalsByOwner(
  records: WeeklyKpiRecord[],
  category: KpiCategory,
  key: KpiKey,
): OwnerKpiTotal[] {
  const byOwner = new Map<string, number>();
  for (const r of filterKpi(records, category, key)) {
    byOwner.set(r.owner, (byOwner.get(r.owner) ?? 0) + r.value);
  }
  return [...byOwner.entries()]
    .map(([owner, total]) => ({ owner, total }))
    .sort((a, b) => b.total - a.total);
}

export interface OwnerMonthlyKpiEntry {
  category: KpiCategory;
  key: CandidateKpiKey | CorporateKpiKey;
  total: number;
}

/** 特定担当者の今月の週次KPI入力分(区分・項目ごとの合計。値0の項目は除く)。CA個別実績で使用する。 */
export function getMonthlyKpiEntriesByOwner(
  records: WeeklyKpiRecord[],
  ownerName: string,
  now: Date = new Date(),
): OwnerMonthlyKpiEntry[] {
  const inMonth = records.filter(
    (r) => r.owner === ownerName && isSameMonth(weekStartToDate(r.weekStart), now),
  );
  const byKey = new Map<string, OwnerMonthlyKpiEntry>();
  for (const r of inMonth) {
    const mapKey = `${r.category}::${r.key}`;
    const existing = byKey.get(mapKey);
    if (existing) existing.total += r.value;
    else byKey.set(mapKey, { category: r.category, key: r.key, total: r.value });
  }
  return [...byKey.values()].filter((e) => e.total !== 0);
}

export interface BlockRateSummary {
  /** 週次KPIに「ブロック数」の入力実績が1件でもあるか(任意項目のため未入力の場合がある)。 */
  hasAnyData: boolean;
  /** 今月のブロック数合計。 */
  blockCount: number;
  /** 今月のLINE登録人数合計。 */
  lineRegistrations: number;
  /** ブロック率(%) = ブロック数 / LINE登録人数。未入力または分母0の場合は null。 */
  ratePercent: number | null;
}

/** ブロック率(今月、Lステップのブロック数 ÷ LINE登録人数)。「ブロック数」は任意項目のため未入力の場合がある。 */
export function getBlockRate(records: WeeklyKpiRecord[], now: Date = new Date()): BlockRateSummary {
  const hasAnyData = records.some((r) => r.category === "求職者" && r.key === "ブロック数");
  const blockCount = getMonthlyKpiTotal(records, "求職者", "ブロック数", now);
  const lineRegistrations = getMonthlyKpiTotal(records, "求職者", "LINE登録人数", now);
  return {
    hasAnyData,
    blockCount,
    lineRegistrations,
    ratePercent: hasAnyData && lineRegistrations > 0 ? (blockCount / lineRegistrations) * 100 : null,
  };
}

// ─────────────────────────────────────────────
// ダッシュボード用のまとめ
// ─────────────────────────────────────────────

export interface CandidateFunnel {
  pv: number;
  lineRegistrations: number;
  interviewBookings: number;
  interviews: number;
  /** 面接(1次〜最終前 + 最終) */
  interviewsCombined: number;
  earlyInterviews: number;
  finalInterviews: number;
  offers: number;
  placements: number;
  lineRegistrationRatePercent: number;
  interviewExecutionRatePercent: number;
  interviewConversionRatePercent: number;
}

/** 求職者ファネル(月内累計)をまとめて取得する。 */
export function getCandidateFunnel(
  records: WeeklyKpiRecord[],
  now: Date = new Date(),
): CandidateFunnel {
  const get = (key: CandidateKpiKey) => getMonthlyKpiTotal(records, "求職者", key, now);
  const pv = get("PV数");
  const lineRegistrations = get("LINE登録人数");
  const interviewBookings = get("面談予約数");
  const interviews = get("面談数");
  const earlyInterviews = get("1次〜最終前面接数");
  const finalInterviews = get("最終面接数");
  const offers = get("内定者数");
  const placementsCount = get("採用決定求職者数");

  return {
    pv,
    lineRegistrations,
    interviewBookings,
    interviews,
    interviewsCombined: earlyInterviews + finalInterviews,
    earlyInterviews,
    finalInterviews,
    offers,
    placements: placementsCount,
    lineRegistrationRatePercent: lineRegistrationRate(pv, lineRegistrations),
    interviewExecutionRatePercent: interviewExecutionRate(interviews, interviewBookings),
    interviewConversionRatePercent: interviewConversionRate(interviews, lineRegistrations),
  };
}

export interface AppointmentBreakdown {
  sovereign: number;
  nonSovereign: number;
  external: number;
  total: number;
}

export interface CorporateFunnel {
  businessCards: number;
  appointments: AppointmentBreakdown;
  meetings: AppointmentBreakdown;
  existingMeetings: { sovereign: number; nonSovereign: number; total: number };
  contracts: { count: number; amountMan: number };
  hiringCompanies: number;
}

/** 法人営業ファネル(月内累計)をまとめて取得する。 */
export function getCorporateFunnel(
  records: WeeklyKpiRecord[],
  now: Date = new Date(),
): CorporateFunnel {
  const get = (key: CorporateKpiKey) => getMonthlyKpiTotal(records, "法人", key, now);
  const apptSovereign = get("アポイント数(主権)");
  const apptNonSovereign = get("アポイント数(非主権)");
  const apptExternal = get("アポイント数(外部)");
  const meetingSovereign = get("商談数(主権)");
  const meetingNonSovereign = get("商談数(非主権)");
  const meetingExternal = get("商談数(外部)");
  const existingSovereign = get("既存商談数(主権)");
  const existingNonSovereign = get("既存商談数(非主権)");

  return {
    businessCards: get("名刺交換数"),
    appointments: {
      sovereign: apptSovereign,
      nonSovereign: apptNonSovereign,
      external: apptExternal,
      total: apptSovereign + apptNonSovereign + apptExternal,
    },
    meetings: {
      sovereign: meetingSovereign,
      nonSovereign: meetingNonSovereign,
      external: meetingExternal,
      total: meetingSovereign + meetingNonSovereign + meetingExternal,
    },
    existingMeetings: {
      sovereign: existingSovereign,
      nonSovereign: existingNonSovereign,
      total: existingSovereign + existingNonSovereign,
    },
    contracts: { count: get("契約数"), amountMan: get("契約金額") },
    hiringCompanies: get("採用決定法人数"),
  };
}

export interface PrimaryKpis {
  /** 面談数(求職者) */
  interviews: KpiMonthComparison;
  /** 内定者数(求職者) */
  offers: KpiMonthComparison;
  /** 採用決定求職者数 */
  candidatePlacements: KpiMonthComparison;
  /** 新規契約金額(万円、法人) */
  contractAmountMan: KpiMonthComparison;
}

/** ダッシュボード先頭の主要指標(今月・先月比)。 */
export function getPrimaryKpis(records: WeeklyKpiRecord[], now: Date = new Date()): PrimaryKpis {
  return {
    interviews: getKpiMonthComparison(records, "求職者", "面談数", now),
    offers: getKpiMonthComparison(records, "求職者", "内定者数", now),
    candidatePlacements: getKpiMonthComparison(records, "求職者", "採用決定求職者数", now),
    contractAmountMan: getKpiMonthComparison(records, "法人", "契約金額", now),
  };
}

export interface WeeklyTrendRow {
  weekStart: string;
  interviews: number;
  offers: number;
  contractAmountMan: number;
}

/** 直近5週の 面談数・内定者数・契約金額 推移(週開始日 昇順)。 */
export function getWeeklyTrendRows(records: WeeklyKpiRecord[], weeks = 5): WeeklyTrendRow[] {
  const interviewsTrend = getRecentWeeklyKpiTrend(records, "求職者", "面談数", weeks);
  const offersTrend = getRecentWeeklyKpiTrend(records, "求職者", "内定者数", weeks);
  const contractTrend = getRecentWeeklyKpiTrend(records, "法人", "契約金額", weeks);

  const weekStarts = interviewsTrend.map((p) => p.weekStart);
  const findValue = (trend: WeeklyKpiTrendPoint[], weekStart: string) =>
    trend.find((p) => p.weekStart === weekStart)?.value ?? 0;

  return weekStarts.map((weekStart) => ({
    weekStart,
    interviews: findValue(interviewsTrend, weekStart),
    offers: findValue(offersTrend, weekStart),
    contractAmountMan: findValue(contractTrend, weekStart),
  }));
}

export interface MonthlyKpiPoint {
  /** 対象月("YYYY-MM") */
  month: string;
  /** 面談数(求職者) */
  interviews: number;
  /** 内定者数(求職者) */
  offers: number;
  /** 採用決定求職者数 */
  candidatePlacements: number;
  /** 契約金額(万円、法人) */
  contractAmountMan: number;
  /** PV数(求職者) */
  pv: number;
  /** LINE登録人数(求職者) */
  lineRegistrations: number;
}

/** 月初(YYYY-MM)の Date からラベル用のキー文字列を作る。 */
function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * weeklyKpis から月別集計(直近 n ヶ月、既定6ヶ月・古い月→新しい月の昇順)を返す。
 * 管理者向けダッシュボードの「月次推移」セクション用。
 */
export function getMonthlyKpiHistory(
  records: WeeklyKpiRecord[],
  months = 6,
  now: Date = new Date(),
): MonthlyKpiPoint[] {
  const points: MonthlyKpiPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({
      month: toMonthKey(ref),
      interviews: getMonthlyKpiTotal(records, "求職者", "面談数", ref),
      offers: getMonthlyKpiTotal(records, "求職者", "内定者数", ref),
      candidatePlacements: getMonthlyKpiTotal(records, "求職者", "採用決定求職者数", ref),
      contractAmountMan: getMonthlyKpiTotal(records, "法人", "契約金額", ref),
      pv: getMonthlyKpiTotal(records, "求職者", "PV数", ref),
      lineRegistrations: getMonthlyKpiTotal(records, "求職者", "LINE登録人数", ref),
    });
  }
  return points;
}

export interface DashboardSummary {
  today: CountAmount;
  month: CountAmount;
  forecast: number;
  primary: PrimaryKpis;
  candidateFunnel: CandidateFunnel;
  corporateFunnel: CorporateFunnel;
  weeklyTrend: WeeklyTrendRow[];
  monthlyHistory: MonthlyKpiPoint[];
  pipeline: StageCount[];
  withdrawnCount: number;
  projects: Project[];
  slack: SlackPost[];
}

/** ダッシュボードで使う全KPIのまとめ。 */
export function getDashboardSummary(bundle: DataBundle, now: Date = new Date()): DashboardSummary {
  return {
    today: getTodayPlacements(bundle.placements, now),
    month: getMonthPlacements(bundle.placements, now),
    forecast: getForecastRevenue(bundle.candidates, bundle.settings.feeRate),
    primary: getPrimaryKpis(bundle.weeklyKpis, now),
    candidateFunnel: getCandidateFunnel(bundle.weeklyKpis, now),
    corporateFunnel: getCorporateFunnel(bundle.weeklyKpis, now),
    weeklyTrend: getWeeklyTrendRows(bundle.weeklyKpis, 5),
    monthlyHistory: getMonthlyKpiHistory(bundle.weeklyKpis, 6, now),
    pipeline: getStagePipeline(bundle.candidates),
    withdrawnCount: getWithdrawnCount(bundle.candidates),
    projects: getSortedProjects(bundle.projects),
    slack: getRecentSlackPosts(bundle.slackPosts),
  };
}

// ─────────────────────────────────────────────
// 集客・広告データ(アイドマ=広告運用シート / リズリアライズ=SNS運用シート)の集計
// ─────────────────────────────────────────────

/** 分母0のときは null(UIでは「—」表示)にする率(%)。 */
function rateOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

/** 分母0のときは null(UIでは「—」表示)にする単価(円)。 */
function divOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export interface AdChannelSummary {
  channel: "Google広告" | "Meta広告";
  cost: number;
  impressions: number;
  clicks: number;
  lineRegs: number;
  reservations: number;
  interviews: number;
  /** クリック率(%) = クリック数 / 表示回数 */
  ctr: number | null;
  /** 遷移率(%) = LINE登録数 / クリック数 */
  regRate: number | null;
  /** 予約率(%) = 面談予約数 / LINE登録数 */
  reserveRate: number | null;
  /** 面談実行率(%) = 面談実施数 / 面談予約数 */
  execRate: number | null;
  /** 登録単価(円) = 費用 / LINE登録数 */
  cpa: number | null;
  /** 面談単価(円) = 費用 / 面談実施数 */
  costPerInterview: number | null;
}

function summarizeAdChannel(
  records: AdDailyRecord[],
  channel: "Google広告" | "Meta広告",
  now: Date,
): AdChannelSummary {
  const inMonth = records.filter((r) => r.channel === channel && isSameMonth(r.date, now));
  const cost = inMonth.reduce((sum, r) => sum + r.cost, 0);
  const impressions = inMonth.reduce((sum, r) => sum + r.impressions, 0);
  const clicks = inMonth.reduce((sum, r) => sum + r.clicks, 0);
  const lineRegs = inMonth.reduce((sum, r) => sum + r.lineRegs, 0);
  const reservations = inMonth.reduce((sum, r) => sum + r.reservations, 0);
  const interviews = inMonth.reduce((sum, r) => sum + r.interviews, 0);
  return {
    channel,
    cost,
    impressions,
    clicks,
    lineRegs,
    reservations,
    interviews,
    ctr: rateOrNull(clicks, impressions),
    regRate: rateOrNull(lineRegs, clicks),
    reserveRate: rateOrNull(reservations, lineRegs),
    execRate: rateOrNull(interviews, reservations),
    cpa: divOrNull(cost, lineRegs),
    costPerInterview: divOrNull(cost, interviews),
  };
}

export interface SnsSummary {
  /** SNS運用の月額固定費用(円)。週次実績とは別の固定値。 */
  cost: number;
  plays: number;
  profileVisits: number;
  lpViews: number;
  lineRegs: number;
  interviews: number;
  /** LP遷移率(%) = LP閲覧合計 / 合計再生数 */
  lpRate: number | null;
  /** LINE登録率(%) = LINE登録(実) / LP閲覧合計 */
  regRate: number | null;
  /** 登録単価(円) = 月額費用 / LINE登録(実) */
  cpa: number | null;
  /** 面談単価(円) = 月額費用 / 面談(実) */
  costPerInterview: number | null;
}

function summarizeSns(records: SnsWeeklyRecord[], monthlyCostYen: number, now: Date): SnsSummary {
  const inMonth = records.filter((r) => isSameMonth(r.weekStart, now));
  const plays = inMonth.reduce((sum, r) => sum + r.plays, 0);
  const profileVisits = inMonth.reduce((sum, r) => sum + r.profileVisits, 0);
  const lpViews = inMonth.reduce((sum, r) => sum + r.lpViews, 0);
  const lineRegs = inMonth.reduce((sum, r) => sum + r.lineRegs, 0);
  const interviews = inMonth.reduce((sum, r) => sum + r.interviews, 0);
  return {
    cost: monthlyCostYen,
    plays,
    profileVisits,
    lpViews,
    lineRegs,
    interviews,
    lpRate: rateOrNull(lpViews, plays),
    regRate: rateOrNull(lineRegs, lpViews),
    cpa: divOrNull(monthlyCostYen, lineRegs),
    costPerInterview: divOrNull(monthlyCostYen, interviews),
  };
}

/** 送客パートナー(成果報酬型)1経路分の月内実績。 */
export interface ReferralPartnerSummary {
  /** 経路名(単価マスタの表記そのまま) */
  channel: string;
  /** 1人あたり単価(円) */
  unitCostYen: number;
  /** 対象人数(月内に面談を実施した人数。面談後の辞退も含む) */
  count: number;
  /** 費用(円) = unitCostYen × count */
  costYen: number;
}

/** 面談実施が確実とみなせるステージ(面談以降)。辞退は面談日の有無で個別判定する。 */
const REFERRAL_INTERVIEWED_STAGES: Stage[] = ["面談", "企業提案", "面接", "内定", "承諾", "入社"];

function normalizeChannelText(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * 送客パートナー費用(面談実施で課金)のまとめ。単価マスタ(`referralRates`)の順に、count=0 の経路も含めて返す。
 * 対象人数のカウント規則:
 * 1. 求職者の流入経路(inflowChannel)が単価マスタの経路名と部分一致(trim・大文字小文字無視)
 * 2. 面談を実施している = ステージが面談以降、または辞退でも面談日(O列)が入っている
 *    (面談前に辞退した人は課金対象外)
 * 3. 月の帰属は面談実施月 = 面談日があればそれ、無ければ 登録日→更新日 で近似
 */
export function getReferralPartnerSummary(
  candidates: Candidate[],
  referralRates: ReferralRate[],
  now: Date = new Date(),
): ReferralPartnerSummary[] {
  return referralRates.map((rate) => {
    const normalizedChannel = normalizeChannelText(rate.channel);
    const count = candidates.filter((c) => {
      if (!c.inflowChannel) return false;
      const interviewed =
        REFERRAL_INTERVIEWED_STAGES.includes(c.stage) || (c.stage === "辞退" && c.interviewedAt !== undefined);
      if (!interviewed) return false;
      if (!normalizeChannelText(c.inflowChannel).includes(normalizedChannel)) return false;
      const referenceDate = c.interviewedAt ?? c.registeredAt ?? c.updatedAt;
      return isSameMonth(referenceDate, now);
    }).length;
    return {
      channel: rate.channel,
      unitCostYen: rate.unitCostYen,
      count,
      costYen: rate.unitCostYen * count,
    };
  });
}

export interface MarketingTransitionRates {
  /** クリック→LINE登録率(%)。Google広告・Meta広告の合算値。 */
  clickToLineRegRatePercent: number | null;
  /** LINE→予約率(%)。Google広告・Meta広告の合算値。 */
  lineToReservationRatePercent: number | null;
  /** 予約→面談実行率(%)。Google広告・Meta広告の合算値。 */
  reservationToInterviewRatePercent: number | null;
  /** SNS再生→LP率(%)。 */
  snsPlayToLpRatePercent: number | null;
}

export interface MarketingSummary {
  /** 媒体別(Google広告・Meta広告)の月内サマリ。 */
  channels: AdChannelSummary[];
  /** SNS運用(リズリアライズ)の月内サマリ。 */
  sns: SnsSummary;
  /** 送客パートナー(成果報酬型)の月内サマリ。単価マスタ順、count=0の経路も含む。 */
  referralPartners: ReferralPartnerSummary[];
  /** 送客パートナー費用合計(円)。 */
  referralTotalYen: number;
  /** 送客パートナーの先月サマリ(同じ課金ルールで先月に面談実施した人数・費用)。単価マスタ順。 */
  referralPartnersLastMonth: ReferralPartnerSummary[];
  /** 送客パートナー費用の先月合計(円)。 */
  referralLastMonthTotalYen: number;
  /** 広告費用合計(Google広告+Meta広告)+SNS月額+送客パートナー費用。 */
  totalCost: number;
  totalLineRegs: number;
  /** 面談予約合計(Google広告+Meta広告。SNSは予約数を計測しないため含まない)。 */
  totalReservations: number;
  totalInterviews: number;
  /** 面接回数(週次KPIの1次〜最終前面接数+最終面接数、月内合計)。既存の getCandidateFunnel を再利用。 */
  interviewsCombined: number;
  transitionRates: MarketingTransitionRates;
}

/** 集客・広告データ(月内)のまとめ。ダッシュボード「集客・広告(月内)」セクション・AI応答の両方で使用する。 */
export function getMarketingSummary(
  data: MarketingData,
  weeklyKpis: WeeklyKpiRecord[],
  candidates: Candidate[],
  referralRates: ReferralRate[],
  now: Date = new Date(),
): MarketingSummary {
  const google = summarizeAdChannel(data.adDaily, "Google広告", now);
  const meta = summarizeAdChannel(data.adDaily, "Meta広告", now);
  const sns = summarizeSns(data.snsWeekly, data.snsMonthlyCostYen, now);
  const referralPartners = getReferralPartnerSummary(candidates, referralRates, now);
  const referralTotalYen = referralPartners.reduce((sum, r) => sum + r.costYen, 0);
  // 先月分。基準日は先月15日(月初・月末の日数差の影響を受けない)。
  const lastMonthReference = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const referralPartnersLastMonth = getReferralPartnerSummary(candidates, referralRates, lastMonthReference);
  const referralLastMonthTotalYen = referralPartnersLastMonth.reduce((sum, r) => sum + r.costYen, 0);

  const adClicks = google.clicks + meta.clicks;
  const adLineRegs = google.lineRegs + meta.lineRegs;
  const adReservations = google.reservations + meta.reservations;
  const adInterviews = google.interviews + meta.interviews;

  return {
    channels: [google, meta],
    sns,
    referralPartners,
    referralTotalYen,
    referralPartnersLastMonth,
    referralLastMonthTotalYen,
    totalCost: google.cost + meta.cost + sns.cost + referralTotalYen,
    totalLineRegs: adLineRegs + sns.lineRegs,
    totalReservations: adReservations,
    totalInterviews: adInterviews + sns.interviews,
    interviewsCombined: getCandidateFunnel(weeklyKpis, now).interviewsCombined,
    transitionRates: {
      clickToLineRegRatePercent: rateOrNull(adLineRegs, adClicks),
      lineToReservationRatePercent: rateOrNull(adReservations, adLineRegs),
      reservationToInterviewRatePercent: rateOrNull(adInterviews, adReservations),
      snsPlayToLpRatePercent: sns.lpRate,
    },
  };
}

// ─────────────────────────────────────────────
// 週次レポート(全体MTG向け、月曜〜日曜)の集計
// 月次(getMarketingSummary 以下)とは別関数として新設し、既存の月次集計ロジックには
// 手を入れない。レコードの粒度が異なる指標を混同しないよう、ここでの方針は:
// - 広告(Google広告・Meta広告)は AdDailyRecord が「日付」を持つ日次レコードのため、
//   週の範囲(月曜0時〜翌週月曜0時未満)でそのまま絞り込める(=週で切れる)。
// - SNS運用(リズリアライズ)は SnsWeeklyRecord 自体が「週1レコード」の粒度
//   (weekStart=シート「期間」欄から算出した月曜日、値はその週1週間分の実績)のため、
//   対象週の月曜日と weekStart が完全一致するレコードがあれば週の値として使える。
//   ただし当該週分がまだシートに入力されていない(または月をまたいだ直近の週で欠測)場合は
//   一致するレコードが無く、その場合は「取得できない週」として扱い、値を合算しない
//   (available=false。呼び出し側で注記を出す)。
// - 送客パートナーは Candidate.interviewedAt(面談日)が週内かどうかで判定する
//   (月次の getReferralPartnerSummary と異なり、登録日・更新日へのフォールバックはしない。
//   週次は「面談日そのもの」でしか週に帰属させられないため)。
// - SNS運用の月額固定費(495,000円)は特定の週に按分できないため totalCost には含めない
//   (呼び出し側で注記を表示する)。
// ─────────────────────────────────────────────

/** 日付の時刻部分を切り捨てる。 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `days` 日後(負数で前)の日付(時刻切り捨て)を返す。 */
function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** 日付を「YYYY-MM-DD」キーに変換する(週次レポートのURLクエリ・週ラベル用)。 */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 指定日が属する週の月曜日を返す(週次レポートの週定義: 月曜〜日曜)。 */
export function mondayOfWeek(d: Date): Date {
  const date = startOfDay(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // 日曜(0)は前週月曜まで6日戻す
  return addDays(date, diff);
}

/** `date` が `weekStart`(月曜0時)を起点とする週(月曜〜日曜)に含まれるか。 */
function isDateInWeek(date: Date, weekStart: Date): boolean {
  const start = startOfDay(weekStart).getTime();
  const end = addDays(startOfDay(weekStart), 7).getTime(); // 翌週月曜0時(排他的上限)
  const t = date.getTime();
  return t >= start && t < end;
}

/** 週次: Google広告+Meta広告の合算実績(日次レコードを週の範囲で絞り込んで合計)。 */
export interface WeeklyAdSummary {
  cost: number;
  lineRegs: number;
  reservations: number;
  interviews: number;
  /** 面談単価(円) = 費用 / 面談実施数(分母0ならnull)。 */
  costPerInterview: number | null;
}

function summarizeAdWeek(records: AdDailyRecord[], weekStart: Date): WeeklyAdSummary {
  const inWeek = records.filter((r) => isDateInWeek(r.date, weekStart));
  const cost = inWeek.reduce((sum, r) => sum + r.cost, 0);
  const lineRegs = inWeek.reduce((sum, r) => sum + r.lineRegs, 0);
  const reservations = inWeek.reduce((sum, r) => sum + r.reservations, 0);
  const interviews = inWeek.reduce((sum, r) => sum + r.interviews, 0);
  return { cost, lineRegs, reservations, interviews, costPerInterview: divOrNull(cost, interviews) };
}

/**
 * 週次: SNS運用(リズリアライズ)の実績。SnsWeeklyRecord は元々「週1レコード」の粒度のため、
 * 対象週の月曜日と一致するレコードがあればその週の値をそのまま使う。無ければ available=false
 * (その週の実績がシートにまだ無い/欠測。呼び出し側で「取得できない」旨を注記する)。
 */
export interface WeeklySnsSummary {
  /** その週の週次トラッキング実績が取得できたか。false の場合 lineRegs/interviews は 0 固定。 */
  available: boolean;
  lineRegs: number;
  interviews: number;
}

function summarizeSnsWeek(records: SnsWeeklyRecord[], weekStart: Date): WeeklySnsSummary {
  const record = records.find((r) => isSameDay(r.weekStart, weekStart));
  if (!record) return { available: false, lineRegs: 0, interviews: 0 };
  return { available: true, lineRegs: record.lineRegs, interviews: record.interviews };
}

/** 面談実施が確実とみなせるか(月次の getReferralPartnerSummary と同じ判定基準)。 */
function isReferralInterviewedForWeek(c: Candidate): boolean {
  return REFERRAL_INTERVIEWED_STAGES.includes(c.stage) || (c.stage === "辞退" && c.interviewedAt !== undefined);
}

/**
 * 送客パートナー費用(週次版)。月次の getReferralPartnerSummary と異なり、月の帰属に
 * 登録日・更新日へフォールバックしない(面談日=interviewedAt が対象週内の人数のみをカウントする)。
 */
export function getReferralPartnerSummaryForWeek(
  candidates: Candidate[],
  referralRates: ReferralRate[],
  weekStart: Date,
): ReferralPartnerSummary[] {
  return referralRates.map((rate) => {
    const normalizedChannel = normalizeChannelText(rate.channel);
    const count = candidates.filter((c) => {
      if (!c.inflowChannel || !c.interviewedAt) return false;
      if (!isReferralInterviewedForWeek(c)) return false;
      if (!normalizeChannelText(c.inflowChannel).includes(normalizedChannel)) return false;
      return isDateInWeek(c.interviewedAt, weekStart);
    }).length;
    return {
      channel: rate.channel,
      unitCostYen: rate.unitCostYen,
      count,
      costYen: rate.unitCostYen * count,
    };
  });
}

export interface MarketingWeeklySummary {
  /** 対象週の月曜日(YYYY-MM-DD)。 */
  weekStart: string;
  /** 対象週の日曜日(YYYY-MM-DD)。 */
  weekEnd: string;
  /** アイドマ広告(Google広告+Meta広告)の週合計。 */
  ad: WeeklyAdSummary;
  /** SNS運用(リズリアライズ)の週次実績。取得できない週は available=false。 */
  sns: WeeklySnsSummary;
  /** 送客パートナー(週内に面談実施)の内訳。単価マスタ順、count=0の経路も含む。 */
  referralPartners: ReferralPartnerSummary[];
  /** 送客パートナー費用(週)合計(円)。 */
  referralTotalYen: number;
  /** LINE登録合計 = 広告 + (取得できた週のみ)SNS。 */
  totalLineRegs: number;
  /** 予約合計 = 広告のみ(送客パートナー・SNSは予約を計測しないため)。 */
  totalReservations: number;
  /** 面談実施数合計 = 広告 + 送客パートナー + (取得できた週のみ)SNS。 */
  totalInterviews: number;
  /** 週の費用 = 広告(Google+Meta)費用 + 送客パートナー費用。SNS運用の月額固定費は含まない。 */
  totalCost: number;
  /** 面談単価(週) = totalCost / totalInterviews(0件ならnull)。 */
  costPerInterview: number | null;
}

/**
 * 集客・広告データ(週次、月曜〜日曜)のまとめ。全体MTG(毎週木曜)向けの週次レポート専用。
 * `weekStart` は対象週の月曜日(時刻は問わない。関数内で切り捨てる)。
 */
export function getMarketingWeeklySummary(
  data: MarketingData,
  referralCandidates: Candidate[],
  referralRates: ReferralRate[],
  weekStart: Date,
): MarketingWeeklySummary {
  const monday = startOfDay(weekStart);
  const ad = summarizeAdWeek(data.adDaily, monday);
  const sns = summarizeSnsWeek(data.snsWeekly, monday);
  const referralPartners = getReferralPartnerSummaryForWeek(referralCandidates, referralRates, monday);
  const referralTotalYen = referralPartners.reduce((sum, r) => sum + r.costYen, 0);
  const referralCount = referralPartners.reduce((sum, r) => sum + r.count, 0);

  const totalInterviews = ad.interviews + referralCount + (sns.available ? sns.interviews : 0);
  const totalCost = ad.cost + referralTotalYen;

  return {
    weekStart: toDateKey(monday),
    weekEnd: toDateKey(addDays(monday, 6)),
    ad,
    sns,
    referralPartners,
    referralTotalYen,
    totalLineRegs: ad.lineRegs + (sns.available ? sns.lineRegs : 0),
    totalReservations: ad.reservations,
    totalInterviews,
    totalCost,
    costPerInterview: totalInterviews > 0 ? totalCost / totalInterviews : null,
  };
}

// ─────────────────────────────────────────────
// 送客パートナー請求書(Slack「#請求書」)の自動照合
// ─────────────────────────────────────────────

export type InvoiceCheckStatus =
  | "match"
  | "mismatch"
  | "unreadable"
  | "unknown-partner"
  | "out-of-range"
  // STORY(別事業)のスレッド由来など、画面の合計・差異判定には含めない請求書(invoice.excludedFromTotals)。
  // 行自体は返す(「AIに聞く」の会社別・スレッド別集計で使うため)。
  | "excluded";

export interface InvoiceCheckRow {
  invoice: ReferralInvoice;
  /** アプリ側の計算値(円)。対象月・経路が特定できない場合は undefined。 */
  computedYen?: number;
  /** 請求額 − アプリ計算値(円)。mismatch のときのみ。 */
  diffYen?: number;
  status: InvoiceCheckStatus;
}

/**
 * Slack「#請求書」から読み取った送客パートナー請求書と、アプリ側の自動計算値(面談実施で課金、
 * getReferralPartnerSummary 由来)を突き合わせる(純関数)。
 * - パートナー名が特定できない請求書は "unknown-partner"、金額が読み取れない請求書は "unreadable"
 *   とし、いずれもアプリ計算値との比較は行わない(computedYen なし)。
 * - 対象月が今月・先月のいずれでもない請求書は "out-of-range"(誤って別の月の請求書を取り違えて
 *   アップロードした場合に、的外れな差異アラートを出さないための安全弁)。
 * - 金額が完全一致すれば "match"、そうでなければ "mismatch"(diffYen = 請求額 − アプリ計算値)。
 * - 並びは投稿日の新しい順。
 */
/** #請求書の支払月ごとの支出合計(全請求書。トップ画面の月次サマリ表示用)。 */
export interface InvoiceMonthTotal {
  /** 支払月(YYYY-MM) */
  month: string;
  /** 金額を読み取れた請求書の合計(円) */
  totalYen: number;
  /** 金額を読み取れた請求書の件数 */
  count: number;
  /** 金額を読み取れなかった請求書の件数(合計に未反映。注意書き用) */
  unreadableCount: number;
}

/**
 * #請求書の全請求書を対象月ごとに合計する(新しい月順)。
 * トップ画面では1件ずつの明細は出さず、この月次合計だけを表示する(内訳は「AIに聞く」で回答する)。
 */
export function getInvoiceMonthlyTotals(invoices: ReferralInvoice[]): InvoiceMonthTotal[] {
  const byMonth = new Map<string, InvoiceMonthTotal>();
  for (const inv of invoices) {
    // STORY(別事業)のスレッド由来の請求書は、画面の支出合計には従来どおり含めない
    // (経営者の指示。excludedFromTotals は adapters/invoices.ts が付与)。
    if (inv.excludedFromTotals) continue;
    const entry = byMonth.get(inv.targetMonth) ?? {
      month: inv.targetMonth,
      totalYen: 0,
      count: 0,
      unreadableCount: 0,
    };
    if (inv.amountYen !== undefined) {
      entry.totalYen += inv.amountYen;
      entry.count += 1;
    } else {
      entry.unreadableCount += 1;
    }
    byMonth.set(inv.targetMonth, entry);
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

/** 対象月ごとの「その他の支払い」(#請求書のうち送客パートナー以外の請求書)の合計。 */
export interface OtherInvoiceCosts {
  totalYen: number;
  /** 合計に含めた請求書の件数 */
  count: number;
  /** 金額を読み取れず合計に含められなかった件数(画面で注意書きを出すため) */
  unreadableCount: number;
}

/**
 * #請求書のうち送客パートナー以外の請求書(partnerChannel が特定できないもの)を、指定月分だけ合計する。
 * 「出ていくお金」の全体額 = 広告+SNS+送客パートナー費用(面談ベースの計算値)+この「その他の支払い」。
 * 送客パートナーの請求書は計算値側で既に費用計上しているため、ここに含めると二重計上になる(除外する)。
 */
export function getOtherInvoiceCostsForMonth(
  invoices: ReferralInvoice[],
  monthKey: string,
): OtherInvoiceCosts {
  const target = invoices.filter((inv) => !inv.partnerChannel && inv.targetMonth === monthKey);
  const readable = target.filter((inv) => inv.amountYen !== undefined);
  return {
    totalYen: readable.reduce((sum, inv) => sum + (inv.amountYen ?? 0), 0),
    count: readable.length,
    unreadableCount: target.length - readable.length,
  };
}

/** YYYY-MM 形式の月キー。 */
function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 今月・先月の「その他の支払い」合計(getOtherInvoiceCostsForMonth の2ヶ月版)。 */
export function getOtherInvoiceCosts(
  invoices: ReferralInvoice[],
  now: Date = new Date(),
): { thisMonth: OtherInvoiceCosts; lastMonth: OtherInvoiceCosts } {
  return {
    thisMonth: getOtherInvoiceCostsForMonth(invoices, monthKeyOf(now)),
    lastMonth: getOtherInvoiceCostsForMonth(invoices, monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 15))),
  };
}

/**
 * 主要指標セクションの「月選択」用スナップショット(直近nヶ月、今月が先頭)。
 * 各月の主要KPI(前月比付き)と、お金の出入り(入=送客売上シートの対象月合計 /
 * 出=広告+SNS+送客パートナー費用+その他の支払い)をまとめて返す。
 */
export interface PrimaryMonthSnapshot {
  /** 対象月(YYYY-MM) */
  monthKey: string;
  /** 表示ラベル(「今月(8月)」「7月」「2025年12月」など。年をまたいだら年も付ける) */
  label: string;
  primary: PrimaryKpis;
  /** 貰うお金(送客売上シートの入金月合計、円) */
  moneyInYen: number;
  /**
   * 出ていくお金(円)= 広告費(その月)+SNS固定+#請求書のその月支払い全額(パートナー請求書含む)。
   * 「その月に実際に財布から出るお金」の現金ベースで、成功報酬(入金月ベース)と揃えている。
   * 送客パートナーの面談実施ベースの計算値はここには使わない(送客パートナー表・請求書照合専用)。
   */
  moneyOutYen: number;
  /** #請求書で金額を読み取れず支出合計に含められなかった件数 */
  unreadableInvoiceCount: number;
}

export function getPrimaryMonthSnapshots(
  weeklyKpis: WeeklyKpiRecord[],
  marketingData: MarketingData,
  referralCandidates: Candidate[],
  referralRates: ReferralRate[],
  revenueRecords: RevenueRecord[],
  invoices: ReferralInvoice[],
  /**
   * Slack「#求職者」から検出した面談実施の月別件数(YYYY-MM → 人数)。
   * 週次KPIシートは週1回の手入力のため当月分が0のままになりがちで、経営者の要望により
   * 面談数は「シート入力とSlack検出の多い方」を表示する(過去月のシート確定値は保ちつつ、
   * 当月はSlackの面談メモが即反映される)。
   */
  slackInterviewCountsByMonth?: Map<string, number>,
  now: Date = new Date(),
  months = 6,
): PrimaryMonthSnapshot[] {
  const interviewsForMonth = (ref: Date): number => {
    const sheet = getMonthlyKpiTotal(weeklyKpis, "求職者", "面談数", ref);
    const slack = slackInterviewCountsByMonth?.get(monthKeyOf(ref)) ?? 0;
    // 過去月でシートに入力がある場合はKPI表の確定値を優先する(経営者の指摘: Slack検出は
    // 同一人物の重複スレッドやメモ形式の誤検出で実際より多く出ることがあり、7月35件が
    // 47件に化けた実例があった)。Slack検出で補うのは「当月」と「シート未入力(0)の月」のみ。
    const isPastMonth = monthKeyOf(ref) < monthKeyOf(now);
    if (isPastMonth && sheet > 0) return sheet;
    return Math.max(sheet, slack);
  };
  const snapshots: PrimaryMonthSnapshot[] = [];
  for (let i = 0; i < months; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const monthKey = monthKeyOf(ref);
    const label =
      i === 0
        ? `今月(${ref.getMonth() + 1}月)`
        : ref.getFullYear() === now.getFullYear()
          ? `${ref.getMonth() + 1}月`
          : `${ref.getFullYear()}年${ref.getMonth() + 1}月`;
    const marketing = getMarketingSummary(marketingData, weeklyKpis, referralCandidates, referralRates, ref);
    // #請求書のその月支払いの全請求書(パートナー請求書含む)。STORY(別事業)スレッド由来の請求書
    // (excludedFromTotals)は、経営者の指示により画面の支出合計・読取不可件数には従来どおり含めない。
    const monthInvoices = invoices.filter((inv) => inv.targetMonth === monthKey && !inv.excludedFromTotals);
    // SNS運用のリズアライズは月固定費(MARKETING_SNS_MONTHLY_COST=¥495,000)として広告費側で
    // 既に計上済みで、同じ金額の請求書PDFが#請求書にも投稿される運用のため、支出の計算では
    // リズアライズの請求書を除外して二重計上を防ぐ(請求書チェックカードの合計はチャンネルの
    // 実態どおり全件のまま。表記ゆれに備え「リズアライズ/リズリアライズ」と英語表記
    // 「RYSREALIZE」(経営者確認。スペース入り・大文字小文字の揺れも許容)に一致させる)。
    const SNS_VENDOR_RE = /リズリ?アライズ|RYS\s*REALIZE/i;
    let dedupedInvoices = monthInvoices.filter(
      (inv) => !SNS_VENDOR_RE.test(`${inv.vendorName ?? ""} ${inv.fileName}`),
    );
    // 名前で特定できない場合の保険: PDFの会社名抽出やファイル名に「リズアライズ」が含まれない
    // 実請求書があったため、SNS月額固定費と同額(かつ送客パートナー請求書ではない)の請求書を
    // その月1件だけ除外する(同額の別請求書を誤除外しないよう、名前一致が無い月のみ・1件限定)。
    const snsMonthlyCostYen = Number(process.env.MARKETING_SNS_MONTHLY_COST ?? "") || 0;
    if (dedupedInvoices.length === monthInvoices.length && snsMonthlyCostYen > 0) {
      const snsIndex = dedupedInvoices.findIndex(
        (inv) => inv.amountYen === snsMonthlyCostYen && !inv.partnerChannel,
      );
      if (snsIndex >= 0) {
        dedupedInvoices = dedupedInvoices.filter((_, i) => i !== snsIndex);
      }
    }
    const invoicePaidYen = dedupedInvoices.reduce((sum, inv) => sum + (inv.amountYen ?? 0), 0);
    const unreadableInvoiceCount = dedupedInvoices.filter((inv) => inv.amountYen === undefined).length;
    const moneyInYen = revenueRecords
      .filter((r) => r.month === monthKey)
      .reduce((sum, r) => sum + r.amountYen, 0);
    // 面談数だけはシート入力とSlack検出の多い方に差し替える(上記 slackInterviewCountsByMonth 参照)。
    const primary = getPrimaryKpis(weeklyKpis, ref);
    const interviews = interviewsForMonth(ref);
    const previousInterviews = interviewsForMonth(new Date(ref.getFullYear(), ref.getMonth() - 1, 15));
    primary.interviews = {
      value: interviews,
      previousValue: previousInterviews,
      diff: interviews - previousInterviews,
    };
    snapshots.push({
      monthKey,
      label,
      primary,
      moneyInYen,
      // 広告費+SNS(totalCost から面談ベースの送客費用を除いたもの)+#請求書のその月支払い全額。
      moneyOutYen: marketing.totalCost - marketing.referralTotalYen + invoicePaidYen,
      unreadableInvoiceCount,
    });
  }
  return snapshots;
}

export function getInvoiceChecks(
  invoices: ReferralInvoice[],
  referralPartnersThisMonth: ReferralPartnerSummary[],
  referralPartnersLastMonth: ReferralPartnerSummary[],
  now: Date = new Date(),
): InvoiceCheckRow[] {
  const thisMonthKey = toMonthKey(now);
  const lastMonthKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  return [...invoices]
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .map((invoice): InvoiceCheckRow => {
      // STORY(別事業)のスレッド由来の請求書は、行自体は返す(「AIに聞く」の会社別・スレッド別
      // 集計で使うため)が、差異判定・画面の合計には一切算入しない(経営者の指示。画面はSTORY除外の
      // まま据え置く)。
      if (invoice.excludedFromTotals) {
        return { invoice, status: "excluded" };
      }
      if (!invoice.partnerChannel) {
        return { invoice, status: "unknown-partner" };
      }
      if (invoice.amountYen === undefined) {
        return { invoice, status: "unreadable" };
      }
      // targetMonth は支払月。送客パートナーの請求は「前月の面談実施分を翌月に支払う」運用のため、
      // 費用の対象月 = 支払月の前月として、アプリ計算値(面談実施月ベース)と突き合わせる。
      const [payYear, payMonth] = invoice.targetMonth.split("-").map(Number);
      const costRef = new Date(payYear, payMonth - 2, 15);
      const costMonthKey = toMonthKey(costRef);
      const summaryList =
        costMonthKey === thisMonthKey
          ? referralPartnersThisMonth
          : costMonthKey === lastMonthKey
            ? referralPartnersLastMonth
            : null;
      if (!summaryList) {
        return { invoice, status: "out-of-range" };
      }
      const computedYen = summaryList.find((r) => r.channel === invoice.partnerChannel)?.costYen ?? 0;
      if (computedYen === invoice.amountYen) {
        return { invoice, computedYen, status: "match" };
      }
      return { invoice, computedYen, diffYen: invoice.amountYen - computedYen, status: "mismatch" };
    });
}

// ─────────────────────────────────────────────
// 送客売上(翔び台が紹介先企業から「貰う」金額)のまとめ
// ─────────────────────────────────────────────

/** 送客売上、経路別1件分。 */
export interface RevenueChannelSummary {
  channel: string;
  amountYen: number;
  count: number;
}

/** 送客売上、1ヶ月分のまとめ。 */
export interface RevenueMonthSummary {
  /** 対象月(YYYY-MM) */
  month: string;
  totalYen: number;
  /** 経路別内訳(金額の大きい順) */
  byChannel: RevenueChannelSummary[];
  /** 企業別明細(金額の大きい順) */
  records: RevenueRecord[];
}

function summarizeRevenueMonth(records: RevenueRecord[], month: string): RevenueMonthSummary {
  const monthRecords = records.filter((r) => r.month === month);
  const totalYen = monthRecords.reduce((sum, r) => sum + r.amountYen, 0);

  const byChannelMap = new Map<string, { amountYen: number; count: number }>();
  for (const r of monthRecords) {
    const current = byChannelMap.get(r.inflowChannel) ?? { amountYen: 0, count: 0 };
    current.amountYen += r.amountYen;
    current.count += 1;
    byChannelMap.set(r.inflowChannel, current);
  }
  const byChannel = [...byChannelMap.entries()]
    .map(([channel, v]) => ({ channel, amountYen: v.amountYen, count: v.count }))
    .sort((a, b) => b.amountYen - a.amountYen);

  return {
    month,
    totalYen,
    byChannel,
    records: [...monthRecords].sort((a, b) => b.amountYen - a.amountYen),
  };
}

/**
 * 送客売上(翔び台が紹介先企業から貰う金額)の今月・先月まとめ。「今月」は now の暦月(YYYY-MM)と
 * タブ月が一致するレコード、「先月」はその前月(基準日は先月15日、月初・月末の日数差の影響を受けない。
 * getMarketingSummary の lastMonthReference と同じ考え方)。
 */
export function getRevenueSummary(
  records: RevenueRecord[],
  now: Date = new Date(),
): { thisMonth: RevenueMonthSummary; lastMonth: RevenueMonthSummary } {
  const thisMonthKey = toMonthKey(now);
  const lastMonthKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  return {
    thisMonth: summarizeRevenueMonth(records, thisMonthKey),
    lastMonth: summarizeRevenueMonth(records, lastMonthKey),
  };
}

/** 経路名の「本体」(括弧書き注記を除いた部分)。「2peace(Tさん)」→「2peace」。 */
function referralChannelCore(channel: string): string {
  return channel.split("(")[0].trim();
}

/** 送客パートナー(成果報酬)1経路分の売上・費用・利益。 */
export interface ReferralProfitRow {
  channel: string;
  revenueYen: number;
  costYen: number;
  profitYen: number;
}

/**
 * 送客パートナー経由の利益(売上−費用)をまとめる(純関数)。rows は単価マスタ順
 * (`referralPartners` の順)。売上側の経路名は部分一致(trim・大文字小文字無視。「KANOA紹介」→
 * 「KANOA」に集約)で対応付ける。referralPartners に無い経路の売上(求人媒体・紹介など)は
 * rows に含めないが、totalRevenueYen は月の売上全体(`revenueMonth.totalYen`)を使う。
 * totalCostYen は referralPartners の費用合計、totalProfitYen = totalRevenueYen − totalCostYen。
 */
export function getReferralProfit(
  revenueMonth: RevenueMonthSummary,
  referralPartners: ReferralPartnerSummary[],
): { rows: ReferralProfitRow[]; totalRevenueYen: number; totalCostYen: number; totalProfitYen: number } {
  const rows: ReferralProfitRow[] = referralPartners.map((partner) => {
    const normalizedCore = normalizeChannelText(referralChannelCore(partner.channel));
    const revenueYen = revenueMonth.byChannel
      .filter((c) => normalizeChannelText(c.channel).includes(normalizedCore))
      .reduce((sum, c) => sum + c.amountYen, 0);
    return {
      channel: partner.channel,
      revenueYen,
      costYen: partner.costYen,
      profitYen: revenueYen - partner.costYen,
    };
  });
  const totalCostYen = referralPartners.reduce((sum, p) => sum + p.costYen, 0);
  const totalRevenueYen = revenueMonth.totalYen;
  return { rows, totalRevenueYen, totalCostYen, totalProfitYen: totalRevenueYen - totalCostYen };
}
