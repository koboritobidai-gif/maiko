/**
 * 全機能(ダッシュボード・AIに聞く・届ける・面談AI・提案書)の唯一のデータ取得口。
 * SpreadsheetSource / MessengerSource アダプタから DataBundle を構築し、
 * モジュールメモリに60秒キャッシュする。
 *
 * DATA_MODE=live の場合、Google Sheets / Slack への接続・パースに失敗すると
 * console.warn した上でデモデータへフォールバックし、sourceStatus / slackStatus に
 * "live-error" を設定する(呼び出し元はこれを見てソースバッジを出し分ける)。
 */
import type {
  Candidate,
  DataBundle,
  Member,
  Placement,
  Project,
  Settings,
  SlackPost,
  SourceStatus,
  WeeklyKpiRecord,
} from "./types";
import { DemoSpreadsheetSource, getSpreadsheetSource } from "./adapters/spreadsheet";
import { DemoSlackSource } from "./adapters/messenger";
import {
  candidates as demoCandidates,
  members as demoMembers,
  placements as demoPlacements,
  projects as demoProjects,
  slackPosts as demoSlackPosts,
  weeklyKpis as demoWeeklyKpis,
} from "./demo-data";
import { isNextDynamicUsageError } from "./next-dynamic-usage-error";
import { TIMEOUT_FALLBACK_MESSAGE } from "./with-timeout";
import { DEFAULT_REFERRAL_RATES, FEE_RATE } from "./types";

const CACHE_MS = 60_000;
const SLACK_HIGHLIGHT_LIMIT = 20;

let cache: { bundle: DataBundle; expiresAt: number } | null = null;

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

interface SpreadsheetPart {
  candidates: Candidate[];
  placements: Placement[];
  projects: Project[];
  members: Member[];
  settings: Settings;
  weeklyKpis: WeeklyKpiRecord[];
  sourceStatus: SourceStatus;
  sourceErrorMessage?: string;
}

async function loadDemoSpreadsheetPart(sourceStatus: SourceStatus): Promise<SpreadsheetPart> {
  const demo = new DemoSpreadsheetSource();
  const [candidates, placements, projects, members, settings, weeklyKpis] = await Promise.all([
    demo.getCandidates(),
    demo.getPlacements(),
    demo.getProjects(),
    demo.getMembers(),
    demo.getSettings(),
    demo.getWeeklyKpis(),
  ]);
  return { candidates, placements, projects, members, settings, weeklyKpis, sourceStatus };
}

async function loadSpreadsheetPart(): Promise<SpreadsheetPart> {
  if (!isLiveMode()) {
    return loadDemoSpreadsheetPart("demo");
  }
  try {
    const source = getSpreadsheetSource();
    const [candidates, placements, projects, members, settings, weeklyKpis] = await Promise.all([
      source.getCandidates(),
      source.getPlacements(),
      source.getProjects(),
      source.getMembers(),
      source.getSettings(),
      source.getWeeklyKpis(),
    ]);
    return { candidates, placements, projects, members, settings, weeklyKpis, sourceStatus: "live" };
  } catch (error) {
    if (isNextDynamicUsageError(error)) throw error;
    console.warn(
      "[data-bundle] Google Sheets の取得に失敗したため、デモデータへフォールバックします:",
      error,
    );
    const part = await loadDemoSpreadsheetPart("live-error");
    return {
      ...part,
      sourceErrorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

interface SlackPart {
  slackPosts: SlackPost[];
  slackStatus: SourceStatus;
  slackErrorMessage?: string;
}

async function loadDemoSlackPart(slackStatus: SourceStatus): Promise<SlackPart> {
  const demo = new DemoSlackSource();
  return { slackPosts: await demo.getRecentPosts(SLACK_HIGHLIGHT_LIMIT), slackStatus };
}

async function loadSlackPart(): Promise<SlackPart> {
  if (!isLiveMode()) {
    return loadDemoSlackPart("demo");
  }
  // Slack最新ハイライトは経営者の指示で廃止(Slack本体を見る運用のため)。ライブでは取得せず
  // 空を返し、ハイライト用チャンネル群への conversations.history 呼び出しを無くして
  // ダッシュボードの読み込みを軽くする(slackStatus はCA別実績等のバッジ表示用に "live" を返す)。
  return { slackPosts: [], slackStatus: "live" };
}

async function buildDataBundle(): Promise<DataBundle> {
  const [sheet, slack] = await Promise.all([loadSpreadsheetPart(), loadSlackPart()]);
  return { ...sheet, ...slack };
}

/** DataBundle を取得する(60秒メモリキャッシュ)。`forceRefresh: true` でキャッシュを無視して再取得する。 */
export async function loadDataBundle(forceRefresh = false): Promise<DataBundle> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.bundle;
  }
  const bundle = await buildDataBundle();
  cache = { bundle, expiresAt: Date.now() + CACHE_MS };
  return bundle;
}

/**
 * `withTimeout` が時間切れ時に返すフォールバック値。live取得失敗時のフォールバック
 * (デモデータ+ステータス "live-error")と同じ構造を、同期関数として組み立てる
 * (loadSpreadsheetPart/loadSlackPart の失敗時フォールバックは非同期だが、実体は
 * demo-data.ts の値をそのまま返すだけのため、ここでは直接参照して同期的に返す)。
 * 裏側では buildDataBundle() が走り続けており、完了すればモジュールキャッシュに反映される。
 */
export function dataBundleTimeoutFallback(): DataBundle {
  return {
    candidates: demoCandidates,
    placements: demoPlacements,
    projects: demoProjects,
    members: demoMembers,
    settings: { feeRate: FEE_RATE, referralRates: DEFAULT_REFERRAL_RATES },
    weeklyKpis: demoWeeklyKpis,
    sourceStatus: "live-error",
    sourceErrorMessage: TIMEOUT_FALLBACK_MESSAGE,
    slackPosts: [...demoSlackPosts]
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .slice(0, SLACK_HIGHLIGHT_LIMIT),
    slackStatus: "live-error",
    slackErrorMessage: TIMEOUT_FALLBACK_MESSAGE,
  };
}
