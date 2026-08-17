/**
 * RevenueSource アダプタ
 * 送客売上(翔び台が紹介先企業から「貰う」金額)を取得する抽象化層。`ReferralInvoice`
 * (#請求書=送客パートナーへ「払う」費用)とは対になる、逆方向のお金の流れを扱う。
 * 経営者が専用スプレッドシート(`REVENUE_SHEET_ID`)に、入金月ごとにタブを分けて記録している運用
 * (タブ名「2026年6月」形式=対象月。入金は翌月末)。
 * デモ段階は DemoRevenueSource が demo-data.ts のデモ売上を返す。
 * 実連携は GoogleSheetsRevenueSource が adapters/spreadsheet.ts の認証(RS256 JWT)・batchGet
 * 呼び出しを再利用し、対象月タブを最大6枚まで読み取る(marketing.ts と同じ構成)。
 */
import type { RevenueRecord } from "../types";
import { revenueRecords as demoRevenueRecords } from "../demo-data";
import {
  fetchSheetsValuesBatchGet,
  fetchSheetTabTitles,
  getAccessToken,
} from "./spreadsheet";
import type { SheetValuesRow } from "./spreadsheet";

export interface RevenueSource {
  getRevenueRecords(): Promise<RevenueRecord[]>;
}

/** シート側の値の読み取りエラー(接続元でまとめて catch し、デモへフォールバックする)。 */
class RevenueParseError extends Error {}

// ─────────────────────────────────────────────
// デモ実装
// ─────────────────────────────────────────────

/** デモ実装: demo-data.ts のデモ売上(今月・先月の2ヶ月分)をそのまま返す。 */
export class DemoRevenueSource implements RevenueSource {
  async getRevenueRecords(): Promise<RevenueRecord[]> {
    return demoRevenueRecords;
  }
}

// ─────────────────────────────────────────────
// GoogleSheetsRevenueSource: 実連携
// ─────────────────────────────────────────────

/** タブ名「2026年6月」形式(=対象月。入金は翌月末の運用)にマッチする正規表現。「支払い」タブ等は対象外。 */
const MONTH_TAB_RE = /^(\d{4})年(\d{1,2})月$/;

/** 新しい月順に読みに行く対象タブの上限(直近半年あれば十分なため)。 */
const MAX_MONTH_TABS = 6;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(year: number, month1to12: number): string {
  return `${year}-${pad2(month1to12)}`;
}

function cellToString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function isBlankRow(row: SheetValuesRow): boolean {
  return row.every((cell) => cellToString(cell) === "");
}

/** A1記法のタブ名を引用符で囲む(タブ名中のシングルクォートはエスケープする)。 */
function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * 金額セルを数値化する。数値セルはそのまま。文字列は「¥」「￥」「円」「,」「空白」を除去し、
 * 全角数字は半角に変換してから Number() する(実物シートは「¥385,000」形式のテキストセル)。
 * 変換できなければ null。
 */
function parseAmountCell(cell: unknown): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const raw = cellToString(cell);
  if (!raw) return null;
  const halfWidth = raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const stripped = halfWidth.replace(/[¥￥円,\s]/g, "");
  if (!stripped) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * 見出し行を先頭5行の中から探す。実物シートは1行目がタイトル(「7月末入金分」等)、2行目が
 * スマートチップ埋め込みセルのため、見出し(3行目「会社名/求職者/流入経路/金額/…」)を
 * 決め打ちにせず、「金額」を含み、かつ「会社名(会社/企業)」または「流入経路(経路)」を含む行を探す。
 */
function findHeaderRowIndex(rows: SheetValuesRow[]): number {
  const limit = Math.min(rows.length, 5);
  for (let i = 0; i < limit; i++) {
    const texts = (rows[i] ?? []).map(cellToString);
    const hasAmount = texts.some((t) => t.includes("金額"));
    const hasCompany = texts.some((t) => t.includes("会社") || t.includes("企業") || t.includes("送客先"));
    const hasChannel = texts.some((t) => t.includes("流入経路") || t.includes("経路"));
    if (hasAmount && (hasCompany || hasChannel)) return i;
  }
  return -1;
}

function findColumnIndex(headerRow: SheetValuesRow, predicate: (text: string) => boolean): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (predicate(cellToString(headerRow[i]))) return i;
  }
  return -1;
}

/**
 * 1タブ分の行を RevenueRecord[] にパースする。
 * データ行の採用条件は「会社名」「金額」の両方が入っている行のみ(下端にプルダウンだけ残った
 * 空行が多数あるための対策)。「合計」「小計」を経路・会社名セルに含む行は手元集計行とみなしスキップする。
 * 金額が数値として読み取れない・0以下の行もエラーにせずスキップする(記載ミス・確認中の行を想定)。
 */
function parseRevenueTab(rows: SheetValuesRow[], tabTitle: string, month: string): RevenueRecord[] {
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) {
    const firstRowText = (rows[0] ?? []).map(cellToString).filter(Boolean).join(" / ") || "(空行)";
    throw new RevenueParseError(
      `タブ「${tabTitle}」で見出し行(「金額」と「会社名」または「流入経路」を含む行)が先頭5行に見つかりません(1行目: ${firstRowText})。`,
    );
  }
  const header = rows[headerIdx] ?? [];
  const companyIdx = findColumnIndex(
    header,
    (t) => t.includes("会社名") || t.includes("会社") || t.includes("企業") || t.includes("送客先"),
  );
  const channelIdx = findColumnIndex(header, (t) => t.includes("流入経路") || t.includes("経路"));
  const amountIdx = findColumnIndex(header, (t) => t.includes("金額") || t.includes("報酬") || t.includes("売上"));
  const candidateIdx = findColumnIndex(header, (t) => t.includes("求職者"));

  if (companyIdx < 0 || channelIdx < 0 || amountIdx < 0) {
    const headerText = header.map(cellToString).filter(Boolean).join(" / ") || "(空行)";
    const missing = [
      companyIdx < 0 ? "企業(会社名/会社/企業/送客先)" : null,
      channelIdx < 0 ? "流入経路(流入経路/経路)" : null,
      amountIdx < 0 ? "金額(金額/報酬/売上)" : null,
    ]
      .filter((s): s is string => s !== null)
      .join("・");
    throw new RevenueParseError(
      `タブ「${tabTitle}」の見出し行に「${missing}」列が見つかりません(見出し行: ${headerText})。`,
    );
  }

  const records: RevenueRecord[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;
    const company = cellToString(row[companyIdx]);
    const channel = cellToString(row[channelIdx]);
    // 会社名が無い行(プルダウンだけの空行等)はスキップ
    if (!company) continue;
    // 手元集計行(合計/小計)の混入対策
    if (company.includes("合計") || company.includes("小計") || channel.includes("合計") || channel.includes("小計")) {
      continue;
    }
    const amountYen = parseAmountCell(row[amountIdx]);
    if (amountYen === null || amountYen <= 0) continue; // 数値化できない・0以下の行はエラーにせずスキップ

    records.push({
      month,
      inflowChannel: channel || "不明",
      company,
      candidateName: candidateIdx >= 0 ? cellToString(row[candidateIdx]) || undefined : undefined,
      amountYen: Math.round(amountYen),
    });
  }
  return records;
}

interface GoogleSheetsRevenueConfig {
  serviceAccountJson?: string;
  sheetId?: string;
}

/**
 * 実連携: 送客売上スプレッドシート(月別タブ)。
 * `DATA_MODE=live` かつ `REVENUE_SHEET_ID` が設定されている場合に使用される。
 * 認証(サービスアカウントJWT・アクセストークン取得)は adapters/spreadsheet.ts の実装を再利用する。
 */
export class GoogleSheetsRevenueSource implements RevenueSource {
  private loadingPromise: Promise<RevenueRecord[]> | null = null;

  constructor(private readonly config: GoogleSheetsRevenueConfig = {}) {}

  private ensureLoaded(): Promise<RevenueRecord[]> {
    if (!this.loadingPromise) {
      this.loadingPromise = this.load().catch((error: unknown) => {
        this.loadingPromise = null;
        throw error;
      });
    }
    return this.loadingPromise;
  }

  private async load(): Promise<RevenueRecord[]> {
    if (!this.config.sheetId) {
      throw new Error("環境変数 REVENUE_SHEET_ID が設定されていません。");
    }
    const accessToken = await getAccessToken(this.config.serviceAccountJson);
    const titles = await fetchSheetTabTitles(this.config.sheetId, accessToken);

    // タブ名「YYYY年M月」形式(=対象月)のものだけを対象にし、新しい月順に最大6タブまで読む。
    const monthTabs = titles
      .map((title) => {
        const trimmed = title.trim();
        const m = MONTH_TAB_RE.exec(trimmed);
        return m ? { title, year: Number(m[1]), month: Number(m[2]) } : null;
      })
      .filter((t): t is { title: string; year: number; month: number } => t !== null)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, MAX_MONTH_TABS);

    if (monthTabs.length === 0) return [];

    const ranges = monthTabs.map((t) => `${quoteSheetTitle(t.title)}!A:Z`);
    const allRows = await fetchSheetsValuesBatchGet(this.config.sheetId, ranges, accessToken, "UNFORMATTED_VALUE");

    const records: RevenueRecord[] = [];
    monthTabs.forEach((tab, i) => {
      records.push(...parseRevenueTab(allRows[i] ?? [], tab.title, monthKey(tab.year, tab.month)));
    });
    return records;
  }

  async getRevenueRecords(): Promise<RevenueRecord[]> {
    return this.ensureLoaded();
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getRevenueSource(): RevenueSource {
  if (process.env.DATA_MODE === "live") {
    return new GoogleSheetsRevenueSource({
      serviceAccountJson: undefined,
      sheetId: process.env.REVENUE_SHEET_ID,
    });
  }
  return new DemoRevenueSource();
}
