/**
 * Tobidai Cockpit - KPI集計ロジック
 * すべて DataBundle(または内包する配列)を引数に取る純関数として実装する。
 * demo-data.ts / adapters/* を直接 import しないこと(画面・API・AI応答のいずれも
 * このファイル経由で集計し、実データ・デモデータの両方に同一ロジックを適用する)。
 */
import { PIPELINE_STAGES } from "./types";
import type {
  Branch,
  Candidate,
  DataBundle,
  Member,
  Placement,
  Project,
  SlackPost,
  Stage,
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

/** 全社月次目標額(拠点目標の合計)。 */
export function getMonthlyTargetAmount(branches: Branch[]): number {
  return branches.reduce((sum, b) => sum + b.monthlyTargetAmount, 0);
}

export interface MonthlyAchievement {
  targetAmount: number;
  actualAmount: number;
  /** 達成率(%) */
  rate: number;
}

/** 全社の月次目標達成率。 */
export function getMonthlyAchievement(
  branches: Branch[],
  placements: Placement[],
  now: Date = new Date(),
): MonthlyAchievement {
  const targetAmount = getMonthlyTargetAmount(branches);
  const { amount: actualAmount } = getMonthPlacements(placements, now);
  const rate = targetAmount > 0 ? (actualAmount / targetAmount) * 100 : 0;
  return { targetAmount, actualAmount, rate };
}

/** 売上見込み(内定+承諾ステージの理論年収 × 手数料率)。 */
export function getForecastRevenue(candidates: Candidate[], feeRate: number): number {
  return candidates
    .filter((c) => c.stage === "内定" || c.stage === "承諾")
    .reduce((sum, c) => sum + c.expectedAnnualIncome * feeRate, 0);
}

export interface BranchPerformance {
  branch: Branch;
  targetAmount: number;
  actualAmount: number;
  /** 達成率(%) */
  rate: number;
}

/** 拠点別の月内実績・達成率。 */
export function getBranchPerformance(
  branches: Branch[],
  placements: Placement[],
  now: Date = new Date(),
): BranchPerformance[] {
  return branches.map((branch) => {
    const monthPlacements = placements.filter(
      (p) => p.branchId === branch.id && isSameMonth(p.placedAt, now),
    );
    const actualAmount = monthPlacements.reduce((sum, p) => sum + p.feeAmount, 0);
    const rate =
      branch.monthlyTargetAmount > 0
        ? (actualAmount / branch.monthlyTargetAmount) * 100
        : 0;
    return { branch, targetAmount: branch.monthlyTargetAmount, actualAmount, rate };
  });
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

/** 特定拠点の求職者一覧。 */
export function getCandidatesByBranch(candidates: Candidate[], branchId: string): Candidate[] {
  return candidates.filter((c) => c.branchId === branchId);
}

/** 特定CA担当の求職者一覧。 */
export function getCandidatesByCa(candidates: Candidate[], caId: string): Candidate[] {
  return candidates.filter((c) => c.caId === caId);
}

/** 特定拠点の月内成約一覧。 */
export function getPlacementsByBranch(
  placements: Placement[],
  branchId: string,
  now: Date = new Date(),
): Placement[] {
  return placements.filter((p) => p.branchId === branchId && isSameMonth(p.placedAt, now));
}

/** id からメンバーを引く。 */
export function getMemberById(members: Member[], id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

/** id から拠点を引く。 */
export function getBranchById(branches: Branch[], id: string): Branch | undefined {
  return branches.find((b) => b.id === id);
}

/** 名前(部分一致)からメンバーを引く。 */
export function findMemberByName(members: Member[], name: string): Member | undefined {
  return members.find((m) => m.name.includes(name) || name.includes(m.name));
}

export interface DashboardSummary {
  today: CountAmount;
  month: CountAmount;
  achievement: MonthlyAchievement;
  forecast: number;
  branchPerformance: BranchPerformance[];
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
    achievement: getMonthlyAchievement(bundle.branches, bundle.placements, now),
    forecast: getForecastRevenue(bundle.candidates, bundle.settings.feeRate),
    branchPerformance: getBranchPerformance(bundle.branches, bundle.placements, now),
    pipeline: getStagePipeline(bundle.candidates),
    withdrawnCount: getWithdrawnCount(bundle.candidates),
    projects: getSortedProjects(bundle.projects),
    slack: getRecentSlackPosts(bundle.slackPosts),
  };
}
