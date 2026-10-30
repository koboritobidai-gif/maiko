/**
 * KPI表.xlsx(Drive上のExcelファイル)から「入社日が確定した人」を取り出すアダプタ。
 * サービスアカウントのアクセストークンで Drive API(files.get?alt=media)から xlsx をダウンロードし、
 * SheetJS(xlsx)でサーバー側だけでパースする(クライアントには含めない)。
 *
 * 対象タブ「（新）20244～」は、ヘッダー行(35行目または36行目)に
 * 「氏名/企業名/(空)/面談・面接または担当CA/状況・入社日/内定日/承諾日」の7列ブロックが
 * 月ごとに横へ繰り返される構造(右のブロックほど新しい)。「状況/入社日」セルの値は
 * Excel日付(=入社日確定)/「辞退」/「検討中」/空 のいずれかで、日付のものだけを入社確定として拾う。
 */
import * as XLSX from "xlsx";
import type { KpiPlacement } from "../placement-calc";
import { shiftDateKey } from "../placement-calc";

/** KPI表.xlsx のDriveファイルID(環境変数 KPI_XLSX_FILE_ID が優先)。 */
const DEFAULT_KPI_XLSX_FILE_ID = "1vlsAZJ-Ud0xxa7I7dZt9zR-vHl1IQDEL";
/** 読み取り対象タブ名(全角括弧)。表記ゆれ(全半角・空白)は正規化して照合する。 */
const KPI_TAB_NAME = "（新）20244～";
/** 入社日がこの日数より古い行は対象外(今日から過去45日〜未来)。 */
const PAST_WINDOW_DAYS = 45;
/** ヘッダー行を探す行数の上限と、ヘッダーの下に読むデータ行数の上限(実データはヘッダーの下〜25行程度)。 */
const HEADER_SCAN_ROWS = 120;
const DATA_ROWS_BELOW_HEADER = 45;

/** KPI表.xlsx を読めなかった(共有未了の403/404)ことを示すエラー。画面は共有案内を出す。 */
export class KpiXlsxNotSharedError extends Error {}

export function resolveKpiXlsxFileId(): string {
  return process.env.KPI_XLSX_FILE_ID || DEFAULT_KPI_XLSX_FILE_ID;
}

/** Drive API でxlsxのバイナリを取得する(バイナリのため data cache は使わず no-store。5分キャッシュは呼び出し側)。 */
export async function downloadKpiXlsx(accessToken: string, fileId: string): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId,
  )}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (res.status === 403 || res.status === 404) {
    throw new KpiXlsxNotSharedError(
      `KPI表.xlsxをサービスアカウントに共有してください(Drive API status ${res.status})。`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive API(KPI表.xlsxの取得)の呼び出しに失敗しました(status ${res.status}): ${text.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "");
}

/** タブ名を探す(全角半角・空白のゆれを吸収。完全一致を優先し、無ければ「新」と「20244」を含むもの)。 */
export function findKpiSheetName(sheetNames: string[]): string | undefined {
  const target = normalizeLabel(KPI_TAB_NAME);
  return (
    sheetNames.find((n) => normalizeLabel(n) === target) ??
    sheetNames.find((n) => {
      const k = normalizeLabel(n);
      return k.includes("新") && k.includes("20244");
    })
  );
}

const DATE_STRING_RE = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/;

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * セルが日付なら YYYY-MM-DD を返す(日付以外は undefined)。
 * Excelの日付はシリアル値+日付書式で入っているため、書式を見て日付と判定し、SSFで年月日に分解する
 * (Dateオブジェクトに変換するとサーバーのタイムゾーンで日付がずれることがあるため使わない)。
 */
function cellDateKey(cell: XLSX.CellObject | undefined): string | undefined {
  if (!cell) return undefined;
  if (cell.t === "d" && cell.v instanceof Date) {
    return dateKey(cell.v.getFullYear(), cell.v.getMonth() + 1, cell.v.getDate());
  }
  if (cell.t === "n" && typeof cell.v === "number" && cell.z && XLSX.SSF.is_date(String(cell.z))) {
    const parsed = XLSX.SSF.parse_date_code(cell.v);
    if (parsed) return dateKey(parsed.y, parsed.m, parsed.d);
  }
  if (cell.t === "s" && typeof cell.v === "string") {
    const m = DATE_STRING_RE.exec(cell.v.normalize("NFKC").trim());
    if (m) return dateKey(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return undefined;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "s" || cell.t === "n") return String(cell.v).normalize("NFKC").trim();
  return "";
}

/**
 * タブから入社日確定者を取り出す。全セルを走査してヘッダー(値が「氏名」)を見つけ、各ブロックの
 * 列位置を特定したうえで、下の行から 氏名+企業名+状況セルが日付 のものを収集する。
 * 同一(氏名+企業+入社日)は1件にまとめ、today(YYYY-MM-DD)の過去45日より前の入社日は無視する。
 */
export function parseKpiPlacements(ws: XLSX.WorkSheet, today: string): KpiPlacement[] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;

  const lastHeaderRow = Math.min(range.e.r, HEADER_SCAN_ROWS - 1);
  const headers: { r: number; c: number }[] = [];
  for (let r = range.s.r; r <= lastHeaderRow; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (normalizeLabel(cell(r, c)?.v) === "氏名") headers.push({ r, c });
    }
  }

  const earliest = shiftDateKey(today, -PAST_WINDOW_DAYS);
  const found = new Map<string, KpiPlacement>();

  for (const { r: headerRow, c: nameCol } of headers) {
    // ブロック内の列位置: ラベルで探し、見つからなければ標準配置(氏名の右隣=企業名、4つ右=状況/入社日)に倒す。
    let companyCol = nameCol + 1;
    let statusCol = nameCol + 4;
    for (let c = nameCol + 1; c <= Math.min(nameCol + 6, range.e.c); c++) {
      const label = normalizeLabel(cell(headerRow, c)?.v);
      if (label.includes("企業")) companyCol = c;
      else if (label.includes("入社日") || label.startsWith("状況")) statusCol = c;
    }

    // 同じ列の下に別の「氏名」ヘッダーがあれば、そこから先は別表なのでそこまでを読む。
    const nextHeader = headers.find((h) => h.c === nameCol && h.r > headerRow);
    const lastRow = Math.min(range.e.r, headerRow + DATA_ROWS_BELOW_HEADER, (nextHeader?.r ?? Infinity) - 1);

    for (let r = headerRow + 1; r <= lastRow; r++) {
      const name = cellText(cell(r, nameCol));
      const company = cellText(cell(r, companyCol));
      const hireDate = cellDateKey(cell(r, statusCol));
      if (!name || !company || !hireDate) continue;
      if (hireDate < earliest) continue;
      const key = `${name.replace(/[\s　]+/g, "")}|${company.replace(/[\s　]+/g, "")}|${hireDate}`;
      if (!found.has(key)) found.set(key, { name, company, hireDate });
    }
  }

  return [...found.values()].sort((a, b) =>
    a.hireDate === b.hireDate ? a.name.localeCompare(b.name, "ja") : a.hireDate < b.hireDate ? -1 : 1,
  );
}

/** xlsxバイナリから対象タブを読み、入社日確定者を返す。 */
export function parseKpiPlacementsFromWorkbook(data: ArrayBuffer | Uint8Array, today: string): KpiPlacement[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // まずタブ名だけ読み(bookSheets)、対象タブだけを本読みして処理時間・メモリを抑える。
  const names = XLSX.read(bytes, { type: "array", bookSheets: true }).SheetNames;
  const sheetName = findKpiSheetName(names);
  if (!sheetName) {
    throw new Error(`KPI表.xlsxにタブ「${KPI_TAB_NAME}」が見つかりません(タブ一覧: ${names.join(" / ")})。`);
  }
  const wb = XLSX.read(bytes, { type: "array", sheets: sheetName, cellNF: true });
  return parseKpiPlacements(wb.Sheets[sheetName], today);
}

/** KPI表.xlsx をDriveから取得して、入社日確定者を返す。 */
export async function fetchKpiPlacements(accessToken: string, today: string): Promise<KpiPlacement[]> {
  const buffer = await downloadKpiXlsx(accessToken, resolveKpiXlsxFileId());
  return parseKpiPlacementsFromWorkbook(buffer, today);
}
