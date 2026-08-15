/**
 * Tobidai Cockpit - KPI集計ロジック
 * すべて DataBundle(または内包する配列)を引数に取る純関数として実装する。
 * demo-data.ts / adapters/* を直接 import しないこと(画面・API・AI応答のいずれも
 * このファイル経由で集計し、実データ・デモデータの両方に同一ロジックを適用する)。
 */
import { PIPELINE_STAGES } from "./types";
import type {
  Candidate,
  CandidateKpiKey,
  CorporateKpiKey,
  DataBundle,
  KpiCategory,
  Member,
  Placement,
  Project,
  SlackPost,
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
