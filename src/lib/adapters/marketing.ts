/**
 * MarketingSource アダプタ
 * 集客・広告データ(外部スプレッドシート2つ)を取得する抽象化層。
 * - アイドマ(広告運用シート、`MARKETING_AD_SHEET_ID`): タブ「Google広告 」(末尾に半角スペース)・
 *   「Meta広告」の日次実績
 * - リズリアライズ(SNS運用シート、`MARKETING_SNS_SHEET_ID`): タブ「週次トラッキング」の週次実績
 * デモ段階は DemoMarketingSource が直近2ヶ月分のデモデータを返す。
 * 実連携は GoogleSheetsMarketingSource が adapters/spreadsheet.ts の認証(RS256 JWT)・
 * batchGet 呼び出しを再利用し、2つのシートをそれぞれ読み取る。
 */
import type { AdDailyRecord, MarketingData, SnsWeeklyRecord } from "../types";
import {
  fetchSheetsValuesBatchGet,
  fetchSheetTabTitles,
  getAccessToken,
} from "./spreadsheet";
import type { SheetValuesRow } from "./spreadsheet";

export interface MarketingSource {
  getMarketingData(): Promise<MarketingData>;
}

/** シート側の値の読み取りエラー(接続元でまとめて catch し、デモへフォールバックする)。 */
class MarketingParseError extends Error {}

/** アイドマ/リズリアライズのシートIDが入れ替わっていないか確認するよう促す共通の案内文。 */
const SHEET_MISMATCH_HINT =
  "アイドマ/リズリアライズのシートIDが入れ替わっていないか確認してください。";

export const DEFAULT_SNS_MONTHLY_COST_YEN = 495_000;

// ─────────────────────────────────────────────
// デモ実装
// ─────────────────────────────────────────────

/** シード付き簡易乱数生成器(demo-data.ts と同じアルゴリズム。実行のたびに値がブレすぎないようにするため)。 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** 週の月曜日を返す(demo-data.ts の mondayOf と同じロジック)。 */
function mondayOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/** 実行日基準で直近2ヶ月分(日次広告実績・週次SNS実績)のリアルなデモデータを生成する。 */
function buildDemoMarketingData(): MarketingData {
  const now = new Date();
  const rng = mulberry32(20260815);

  // 広告運用(アイドマ)日次: Google広告は費用1000〜3000円/LINE登録0〜3/予約0〜2/面談0〜1、
  // Meta広告は運用開始前を想定しゼロ行(タブ自体は存在するがまだ配信していない状態)。
  const adDaily: AdDailyRecord[] = [];
  const AD_DAYS = 61;
  for (let i = AD_DAYS - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 10, 0, 0, 0);
    const impressions = randInt(rng, 3000, 9000);
    const clicks = Math.min(randInt(rng, 60, 220), impressions);
    const lineRegs = Math.min(randInt(rng, 0, 3), clicks);
    const reservations = Math.min(randInt(rng, 0, 2), lineRegs);
    const interviews = Math.min(randInt(rng, 0, 1), reservations);
    const cost = randInt(rng, 1000, 3000);
    adDaily.push({
      channel: "Google広告",
      date,
      cost,
      impressions,
      clicks,
      lineRegs,
      reservations,
      interviews,
    });
    adDaily.push({
      channel: "Meta広告",
      date,
      cost: 0,
      impressions: 0,
      clicks: 0,
      lineRegs: 0,
      reservations: 0,
      interviews: 0,
    });
  }

  // SNS運用(リズリアライズ)週次: 再生数は数千〜数万、ファネルが不自然に逆転しないよう
  // 前段の値でクランプしながら生成する。
  const snsWeekly: SnsWeeklyRecord[] = [];
  const SNS_WEEKS = 9;
  for (let w = SNS_WEEKS - 1; w >= 0; w--) {
    const weekStart = mondayOf(now);
    weekStart.setDate(weekStart.getDate() - w * 7);
    weekStart.setHours(10, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}-${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

    const plays = randInt(rng, 3000, 42000);
    const profileVisits = Math.min(randInt(rng, 150, 2200), plays);
    const lpViews = Math.min(randInt(rng, 80, 900), profileVisits);
    const lineRegs = Math.min(randInt(rng, 5, 120), lpViews);
    const interviews = Math.min(randInt(rng, 0, 6), lineRegs);

    snsWeekly.push({ weekStart, label, plays, profileVisits, lpViews, lineRegs, interviews });
  }

  return { adDaily, snsWeekly, snsMonthlyCostYen: DEFAULT_SNS_MONTHLY_COST_YEN };
}

// デモデータは実行日(モジュール読み込み時の new Date())基準で1回だけ生成し、以後は使い回す
// (demo-data.ts の weeklyKpis と同じ方針)。
const DEMO_MARKETING_DATA: MarketingData = buildDemoMarketingData();

/** デモ実装: 直近2ヶ月分の生成済みデモデータを返す。 */
export class DemoMarketingSource implements MarketingSource {
  async getMarketingData(): Promise<MarketingData> {
    return DEMO_MARKETING_DATA;
  }
}

// ─────────────────────────────────────────────
// GoogleSheetsMarketingSource: 実連携
// ─────────────────────────────────────────────

function cellToString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function isBlankRow(row: SheetValuesRow): boolean {
  return row.every((cell) => cellToString(cell) === "");
}

/** 空欄・「—」等は 0 として扱う(数値化できない値も 0 扱い)。 */
function toNumberOrZero(cell: unknown): number {
  if (cell === undefined || cell === null) return 0;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : 0;
  const raw = String(cell).trim();
  if (raw === "" || raw === "—" || raw === "-" || raw === "―") return 0;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** ヘッダー候補行を探す: 指定した文字列を「すべて」含むセルが揃っている行を上から探す。 */
function findHeaderRowIndex(rows: SheetValuesRow[], mustIncludeAll: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const texts = (rows[i] ?? []).map(cellToString);
    if (mustIncludeAll.every((needle) => texts.some((t) => t.includes(needle)))) {
      return i;
    }
  }
  return -1;
}

function findColumnIndex(headerRow: SheetValuesRow, predicate: (text: string) => boolean): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (predicate(cellToString(headerRow[i]))) return i;
  }
  return -1;
}

function findColumnIndices(headerRow: SheetValuesRow, predicate: (text: string) => boolean): number[] {
  const result: number[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    if (predicate(cellToString(headerRow[i]))) result.push(i);
  }
  return result;
}

/** Google スプレッドシートのシリアル日付(1899-12-30起点)を Date に変換する。 */
function excelSerialToDate(serial: number): Date {
  const epochUtcMs = Date.UTC(1899, 11, 30);
  const ms = epochUtcMs + Math.round(serial) * 86_400_000;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0, 0, 0);
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 日付セルを Date として解釈する(シリアル数値 or YYYY-MM-DD 文字列)。解釈できなければ null。 */
function parseFlexibleDate(cell: unknown): Date | null {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return excelSerialToDate(cell);
  }
  if (typeof cell === "string") {
    const raw = cell.trim();
    const m = YMD_RE.exec(raw);
    if (m) {
      const [, y, mo, d] = m;
      return new Date(Number(y), Number(mo) - 1, Number(d), 10, 0, 0, 0);
    }
  }
  return null;
}

/** A1記法のタブ名を引用符で囲む(タブ名中のシングルクォートはエスケープする)。 */
function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * タブ名(trim一致)候補の中から、実データ行数が最も多いものを選んで返す。
 * 「Google広告 」(末尾スペースあり、実データ)と「Google広告」(スペース無し、別テンプレート)の
 * ように trim すると同名になるタブが複数存在するケースに対応するための解決処理。
 */
async function resolveAdTab(
  sheetId: string,
  accessToken: string,
  allTitles: string[],
  targetTrimmedName: string,
  sheetLabel: string,
): Promise<{ title: string; rows: SheetValuesRow[] }> {
  const candidates = allTitles.filter((t) => t.trim() === targetTrimmedName);
  if (candidates.length === 0) {
    throw new MarketingParseError(
      `${sheetLabel}に「${targetTrimmedName}」タブが見つかりません。${SHEET_MISMATCH_HINT}`,
    );
  }
  const ranges = candidates.map((t) => `${quoteSheetTitle(t)}!A1:Z2000`);
  const allRows = await fetchSheetsValuesBatchGet(sheetId, ranges, accessToken, "UNFORMATTED_VALUE");

  if (candidates.length === 1) {
    return { title: candidates[0], rows: allRows[0] ?? [] };
  }

  // 同名タブ(trim一致)が複数 → ヘッダー行(「日付」「費用」を含む行)以降のデータ行数が多い方を採用
  let best: { title: string; rows: SheetValuesRow[]; dataRowCount: number } = {
    title: candidates[0],
    rows: allRows[0] ?? [],
    dataRowCount: -1,
  };
  candidates.forEach((title, i) => {
    const rows = allRows[i] ?? [];
    const headerIdx = findHeaderRowIndex(rows, ["日付", "費用"]);
    const dataRowCount =
      headerIdx >= 0 ? rows.slice(headerIdx + 1).filter((r) => !isBlankRow(r)).length : 0;
    if (dataRowCount > best.dataRowCount) {
      best = { title, rows, dataRowCount };
    }
  });
  return { title: best.title, rows: best.rows };
}

/** 広告運用シート(Google広告/Meta広告タブ)の1タブ分を AdDailyRecord[] にパースする。 */
function parseAdSheetRows(
  rows: SheetValuesRow[],
  channel: "Google広告" | "Meta広告",
  tabLabel: string,
): AdDailyRecord[] {
  const headerIdx = findHeaderRowIndex(rows, ["日付", "費用"]);
  if (headerIdx < 0) {
    throw new MarketingParseError(
      `タブ「${tabLabel}」でヘッダー行(「日付」「費用」を含む行)が見つかりません。${SHEET_MISMATCH_HINT}`,
    );
  }
  const header = rows[headerIdx] ?? [];
  const dateIdx = findColumnIndex(header, (t) => t.includes("日付"));
  const costIdx = findColumnIndex(header, (t) => t.includes("費用"));
  const impressionsIdx = findColumnIndex(header, (t) => t.includes("表示回数"));
  const clicksIdx = findColumnIndex(header, (t) => t.includes("クリック数"));
  const lineRegsIdx = findColumnIndex(header, (t) => t.includes("LINE登録数"));
  const reservationsIdx = findColumnIndex(header, (t) => t.includes("面談予約数"));
  const interviewsIdx = findColumnIndex(header, (t) => t.includes("面談実施数"));

  if (dateIdx < 0 || costIdx < 0) {
    throw new MarketingParseError(
      `タブ「${tabLabel}」で「日付」または「費用」の列が見つかりません。${SHEET_MISMATCH_HINT}`,
    );
  }

  const records: AdDailyRecord[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;
    const date = parseFlexibleDate(row[dateIdx]);
    if (!date) continue; // 日付として読めない行(集計行・注記行など)はスキップ
    records.push({
      channel,
      date,
      cost: toNumberOrZero(row[costIdx]),
      impressions: impressionsIdx >= 0 ? toNumberOrZero(row[impressionsIdx]) : 0,
      clicks: clicksIdx >= 0 ? toNumberOrZero(row[clicksIdx]) : 0,
      lineRegs: lineRegsIdx >= 0 ? toNumberOrZero(row[lineRegsIdx]) : 0,
      reservations: reservationsIdx >= 0 ? toNumberOrZero(row[reservationsIdx]) : 0,
      interviews: interviewsIdx >= 0 ? toNumberOrZero(row[interviewsIdx]) : 0,
    });
  }
  return records;
}

const PERIOD_RE = /^(\d{1,2})\/(\d{1,2})\s*[-〜~]\s*(\d{1,2})\/(\d{1,2})$/;

/** SNS運用シート「週次トラッキング」タブを SnsWeeklyRecord[] にパースする。 */
function parseSnsWeeklyRows(rows: SheetValuesRow[], startYear: number): SnsWeeklyRecord[] {
  const headerIdx = findHeaderRowIndex(rows, ["週", "期間"]);
  if (headerIdx < 0) {
    throw new MarketingParseError(
      `タブ「週次トラッキング」でヘッダー行(「週」「期間」を含む行)が見つかりません。${SHEET_MISMATCH_HINT}`,
    );
  }
  const header = rows[headerIdx] ?? [];
  const periodIdx = findColumnIndex(header, (t) => t.includes("期間"));
  const playsIdx = findColumnIndex(header, (t) => t.includes("再生数"));
  const lpViewsIdx = findColumnIndex(header, (t) => t.includes("LP閲覧"));
  const lineRegsIdx = findColumnIndex(header, (t) => t.includes("LINE登録"));
  const interviewsIdx = findColumnIndex(header, (t) => t.includes("面談"));
  const profileIdxs = findColumnIndices(header, (t) => t.includes("プロフ") && t.includes("遷移"));

  if (periodIdx < 0) {
    throw new MarketingParseError(
      `タブ「週次トラッキング」で「期間」列が見つかりません。${SHEET_MISMATCH_HINT}`,
    );
  }

  const records: SnsWeeklyRecord[] = [];
  let year = startYear;
  let prevMonth: number | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;
    const periodRaw = cellToString(row[periodIdx]);
    const m = PERIOD_RE.exec(periodRaw);
    if (!m) continue; // 合計行・注記行などはスキップ
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (prevMonth !== null && month < prevMonth) year += 1;
    prevMonth = month;
    const weekStart = new Date(year, month - 1, day, 10, 0, 0, 0);

    records.push({
      weekStart,
      label: periodRaw,
      plays: playsIdx >= 0 ? toNumberOrZero(row[playsIdx]) : 0,
      profileVisits: profileIdxs.reduce((sum, idx) => sum + toNumberOrZero(row[idx]), 0),
      lpViews: lpViewsIdx >= 0 ? toNumberOrZero(row[lpViewsIdx]) : 0,
      lineRegs: lineRegsIdx >= 0 ? toNumberOrZero(row[lineRegsIdx]) : 0,
      interviews: interviewsIdx >= 0 ? toNumberOrZero(row[interviewsIdx]) : 0,
    });
  }
  return records;
}

interface GoogleSheetsMarketingConfig {
  serviceAccountJson?: string;
  adSheetId?: string;
  snsSheetId?: string;
  snsMonthlyCostYen: number;
}

/**
 * 実連携: 集客・広告データ(アイドマ=広告運用シート / リズリアライズ=SNS運用シート)。
 * `DATA_MODE=live` かつ `MARKETING_AD_SHEET_ID` / `MARKETING_SNS_SHEET_ID` が揃っている場合に使用される。
 * 認証(サービスアカウントJWT・アクセストークン取得)は adapters/spreadsheet.ts の実装を再利用する。
 */
export class GoogleSheetsMarketingSource implements MarketingSource {
  private loadingPromise: Promise<MarketingData> | null = null;

  constructor(private readonly config: GoogleSheetsMarketingConfig) {}

  private ensureLoaded(): Promise<MarketingData> {
    if (!this.loadingPromise) {
      this.loadingPromise = this.load().catch((error: unknown) => {
        this.loadingPromise = null;
        throw error;
      });
    }
    return this.loadingPromise;
  }

  private async load(): Promise<MarketingData> {
    if (!this.config.adSheetId) {
      throw new Error("環境変数 MARKETING_AD_SHEET_ID が設定されていません。");
    }
    if (!this.config.snsSheetId) {
      throw new Error("環境変数 MARKETING_SNS_SHEET_ID が設定されていません。");
    }
    const accessToken = await getAccessToken(this.config.serviceAccountJson);

    // アイドマ(広告運用)シート: Google広告(末尾スペースあり)/Meta広告 の2タブ
    const adTitles = await fetchSheetTabTitles(this.config.adSheetId, accessToken);
    const googleTab = await resolveAdTab(
      this.config.adSheetId,
      accessToken,
      adTitles,
      "Google広告",
      "アイドマ(広告運用)シート",
    );
    const metaTab = await resolveAdTab(
      this.config.adSheetId,
      accessToken,
      adTitles,
      "Meta広告",
      "アイドマ(広告運用)シート",
    );
    const adDaily = [
      ...parseAdSheetRows(googleTab.rows, "Google広告", googleTab.title),
      ...parseAdSheetRows(metaTab.rows, "Meta広告", metaTab.title),
    ];

    // リズリアライズ(SNS運用)シート: 週次トラッキングタブ
    const snsTitles = await fetchSheetTabTitles(this.config.snsSheetId, accessToken);
    const snsTitle = snsTitles.find((t) => t.trim() === "週次トラッキング");
    if (!snsTitle) {
      throw new MarketingParseError(
        `リズリアライズ(SNS運用)シートに「週次トラッキング」タブが見つかりません。${SHEET_MISMATCH_HINT}`,
      );
    }
    const [snsRows] = await fetchSheetsValuesBatchGet(
      this.config.snsSheetId,
      [`${quoteSheetTitle(snsTitle)}!A1:Z2000`],
      accessToken,
      "UNFORMATTED_VALUE",
    );
    const snsWeekly = parseSnsWeeklyRows(snsRows, 2026);

    return { adDaily, snsWeekly, snsMonthlyCostYen: this.config.snsMonthlyCostYen };
  }

  async getMarketingData(): Promise<MarketingData> {
    return this.ensureLoaded();
  }
}

/** `MARKETING_SNS_MONTHLY_COST` 環境変数(円)を解決する。未設定・不正値なら既定値。 */
function resolveSnsMonthlyCostYen(): number {
  const raw = process.env.MARKETING_SNS_MONTHLY_COST;
  if (!raw) return DEFAULT_SNS_MONTHLY_COST_YEN;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SNS_MONTHLY_COST_YEN;
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getMarketingSource(): MarketingSource {
  if (process.env.DATA_MODE === "live") {
    return new GoogleSheetsMarketingSource({
      serviceAccountJson: undefined,
      adSheetId: process.env.MARKETING_AD_SHEET_ID,
      snsSheetId: process.env.MARKETING_SNS_SHEET_ID,
      snsMonthlyCostYen: resolveSnsMonthlyCostYen(),
    });
  }
  return new DemoMarketingSource();
}
