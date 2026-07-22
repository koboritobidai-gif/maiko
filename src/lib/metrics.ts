/**
 * Tobidai Cockpit - KPI集計ロジック
 * demo-data.ts を唯一の入力とし、KPIの計算はすべてこのファイルを経由する
 * (画面・API・AI応答のいずれも直接 demo-data を集計しないこと)。
 */
import { FEE_RATE, PIPELINE_STAGES } from "./types";
import type { Branch, Candidate, Placement, Project, Stage } from "./types";
import {
  branches,
  candidates,
  COMPANY_MONTHLY_TARGET,
  members,
  placements,
  projects,
  slackPosts,
} from "./demo-data";

const now = new Date();

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
export function getTodayPlacements(): CountAmount {
  return summarize(placements.filter((p) => isSameDay(p.placedAt, now)));
}

/** 月内累計成約(件数・金額)。 */
export function getMonthPlacements(): CountAmount {
  return summarize(placements.filter((p) => isSameMonth(p.placedAt, now)));
}

/** 全社月次目標額。 */
export function getMonthlyTargetAmount(): number {
  return COMPANY_MONTHLY_TARGET;
}

export interface MonthlyAchievement {
  targetAmount: number;
  actualAmount: number;
  /** 達成率(%) */
  rate: number;
}

/** 全社の月次目標達成率。 */
export function getMonthlyAchievement(): MonthlyAchievement {
  const targetAmount = getMonthlyTargetAmount();
  const { amount: actualAmount } = getMonthPlacements();
  const rate = targetAmount > 0 ? (actualAmount / targetAmount) * 100 : 0;
  return { targetAmount, actualAmount, rate };
}

/** 売上見込み(内定+承諾ステージの理論年収 × 手数料率)。 */
export function getForecastRevenue(): number {
  return candidates
    .filter((c) => c.stage === "内定" || c.stage === "承諾")
    .reduce((sum, c) => sum + c.expectedAnnualIncome * FEE_RATE, 0);
}

export interface BranchPerformance {
  branch: Branch;
  targetAmount: number;
  actualAmount: number;
  /** 達成率(%) */
  rate: number;
}

/** 拠点別の月内実績・達成率。 */
export function getBranchPerformance(): BranchPerformance[] {
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
export function getStagePipeline(): StageCount[] {
  return PIPELINE_STAGES.map((stage) => ({
    stage,
    count: candidates.filter((c) => c.stage === stage).length,
  }));
}

/** 辞退(離脱)の人数。 */
export function getWithdrawnCount(): number {
  return candidates.filter((c) => c.stage === "辞退").length;
}

/** プロジェクト一覧(状態順: 遅延→注意→順調)。 */
export function getProjects(): Project[] {
  const order: Record<Project["status"], number> = { 遅延: 0, 注意: 1, 順調: 2 };
  return [...projects].sort((a, b) => order[a.status] - order[b.status]);
}

/** 直近の Slack ハイライト(新しい順)。 */
export function getRecentSlackPosts(limit = 8) {
  return [...slackPosts]
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .slice(0, limit);
}

/** 特定拠点の求職者一覧。 */
export function getCandidatesByBranch(branchId: string): Candidate[] {
  return candidates.filter((c) => c.branchId === branchId);
}

/** 特定CA担当の求職者一覧。 */
export function getCandidatesByCa(caId: string): Candidate[] {
  return candidates.filter((c) => c.caId === caId);
}

/** 特定拠点の月内成約一覧。 */
export function getPlacementsByBranch(branchId: string): Placement[] {
  return placements.filter(
    (p) => p.branchId === branchId && isSameMonth(p.placedAt, now),
  );
}

/** id からメンバーを引く。 */
export function getMemberById(id: string) {
  return members.find((m) => m.id === id);
}

/** id から拠点を引く。 */
export function getBranchById(id: string) {
  return branches.find((b) => b.id === id);
}

/** 名前(部分一致)からメンバーを引く。 */
export function findMemberByName(name: string) {
  return members.find((m) => m.name.includes(name) || name.includes(m.name));
}

/** ダッシュボードで使う全KPIのまとめ。 */
export function getDashboardSummary() {
  return {
    today: getTodayPlacements(),
    month: getMonthPlacements(),
    achievement: getMonthlyAchievement(),
    forecast: getForecastRevenue(),
    branchPerformance: getBranchPerformance(),
    pipeline: getStagePipeline(),
    withdrawnCount: getWithdrawnCount(),
    projects: getProjects(),
    slack: getRecentSlackPosts(),
  };
}
