/**
 * 全機能(ダッシュボード・AIに聞く・届ける・面談AI・提案書)の唯一のデータ取得口。
 * SpreadsheetSource / MessengerSource アダプタから DataBundle を構築し、
 * モジュールメモリに60秒キャッシュする。
 *
 * DATA_MODE=live の場合、Google Sheets / Slack への接続・パースに失敗すると
 * console.warn した上でデモデータへフォールバックし、sourceStatus / slackStatus に
 * "live-error" を設定する(呼び出し元はこれを見てソースバッジを出し分ける)。
 */
import type { Branch, Candidate, DataBundle, Member, Placement, Project, Settings, SlackPost, SourceStatus } from "./types";
import { DemoSpreadsheetSource, getSpreadsheetSource } from "./adapters/spreadsheet";
import { DemoSlackSource, getMessengerSource } from "./adapters/messenger";

const CACHE_MS = 60_000;
const SLACK_HIGHLIGHT_LIMIT = 20;

let cache: { bundle: DataBundle; expiresAt: number } | null = null;

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

interface SpreadsheetPart {
  candidates: Candidate[];
  placements: Placement[];
  branches: Branch[];
  projects: Project[];
  members: Member[];
  settings: Settings;
  sourceStatus: SourceStatus;
}

async function loadDemoSpreadsheetPart(sourceStatus: SourceStatus): Promise<SpreadsheetPart> {
  const demo = new DemoSpreadsheetSource();
  const [candidates, placements, branches, projects, members, settings] = await Promise.all([
    demo.getCandidates(),
    demo.getPlacements(),
    demo.getBranches(),
    demo.getProjects(),
    demo.getMembers(),
    demo.getSettings(),
  ]);
  return { candidates, placements, branches, projects, members, settings, sourceStatus };
}

async function loadSpreadsheetPart(): Promise<SpreadsheetPart> {
  if (!isLiveMode()) {
    return loadDemoSpreadsheetPart("demo");
  }
  try {
    const source = getSpreadsheetSource();
    const [candidates, placements, branches, projects, members, settings] = await Promise.all([
      source.getCandidates(),
      source.getPlacements(),
      source.getBranches(),
      source.getProjects(),
      source.getMembers(),
      source.getSettings(),
    ]);
    return { candidates, placements, branches, projects, members, settings, sourceStatus: "live" };
  } catch (error) {
    console.warn(
      "[data-bundle] Google Sheets の取得に失敗したため、デモデータへフォールバックします:",
      error,
    );
    return loadDemoSpreadsheetPart("live-error");
  }
}

interface SlackPart {
  slackPosts: SlackPost[];
  slackStatus: SourceStatus;
}

async function loadDemoSlackPart(slackStatus: SourceStatus): Promise<SlackPart> {
  const demo = new DemoSlackSource();
  return { slackPosts: await demo.getRecentPosts(SLACK_HIGHLIGHT_LIMIT), slackStatus };
}

async function loadSlackPart(): Promise<SlackPart> {
  if (!isLiveMode()) {
    return loadDemoSlackPart("demo");
  }
  try {
    const messenger = getMessengerSource();
    const slackPosts = await messenger.getRecentPosts(SLACK_HIGHLIGHT_LIMIT);
    return { slackPosts, slackStatus: "live" };
  } catch (error) {
    console.warn("[data-bundle] Slack の取得に失敗したため、デモ投稿へフォールバックします:", error);
    return loadDemoSlackPart("live-error");
  }
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
