/**
 * CompanyDirectorySource アダプタ
 * CAが管理する2つの外部スプレッドシート(送客可能企業リスト・求人マトリックス)を取得する層。
 * この機能にはデモモードが無く、`DATA_MODE=live` かつ環境変数(下記)が設定されている場合のみ動作する
 * (未設定時の扱いは呼び出し元 `src/lib/company-data.ts` が status: "unconfigured" として処理する)。
 *
 * ■ シートIDの入れ違い問題
 * 環境変数 `JOB_MATRIX_SHEET_ID` と `REFERRAL_COMPANY_SHEET_ID` は、運用担当者が手作業で設定した際に
 * 中身が入れ違いになっているケースがある(ユーザー入力ミス)。取り違えたまま固定的に読み込むと
 * 誤ったシートを表示・書き込みしてしまうため、起動のたびに両IDへ `spreadsheets.get?fields=properties.title`
 * でタイトルを取得し、タイトル文字列から実際の役割を自動判別する(`resolveSheetRoles` 参照)。
 * どちらのタイトルからも判別できない場合のみ、env名どおり(JOB_MATRIX_SHEET_ID=マトリックス /
 * REFERRAL_COMPANY_SHEET_ID=企業リスト)にフォールバックする。
 *
 * 認証・batchGet 呼び出しは adapters/spreadsheet.ts の実装(RS256 JWT・getAccessToken)を再利用する。
 * 書き込み(状態更新・企業追加)を行うため、spreadsheet.ts 側の JWT scope は
 * `https://www.googleapis.com/auth/spreadsheets`(読み書き)に変更済み。
 */
import { fetchSheetsValuesBatchGet, fetchSheetTabTitles, getAccessToken } from "./spreadsheet";
import type { SheetValuesRow } from "./spreadsheet";

// ─────────────────────────────────────────────
// 共通ユーティリティ(revenue.ts と同様、各アダプタで小さく複製する方針)
// ─────────────────────────────────────────────

function cellToString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function isBlankRow(row: SheetValuesRow): boolean {
  return row.every((cell) => cellToString(cell) === "");
}

/** A1記法のタブ名を引用符で囲む(タブ名中のシングルクォートはエスケープする。revenue.ts と同じ)。 */
function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * ヘッダー行からラベルに一致する列インデックスを探す(0始まり。見つからなければ -1)。
 * まず完全一致を優先し(「休日」「勤務地」等、他の列名の部分文字列になっているラベルが
 * 誤ってヒットしないようにするため)、完全一致が無ければ部分一致にフォールバックする
 * (見出しの表記ゆれへの耐性。revenue.ts の部分一致方式を踏襲)。
 */
function findColumnExactOrIncludes(header: string[], label: string): number {
  const exact = header.findIndex((h) => h === label);
  if (exact >= 0) return exact;
  return header.findIndex((h) => h.includes(label));
}

/** 列インデックス(0始まり)を A1記法の列文字(A, B, ..., Z, AA, ...)に変換する。 */
function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

class CompanyDirectoryParseError extends Error {}

// ─────────────────────────────────────────────
// シート役割判定(入れ違い自動判別)
// ─────────────────────────────────────────────

export interface SheetRoles {
  referralCompanySheetId: string;
  jobMatrixSheetId: string;
}

async function fetchSpreadsheetTitle(sheetId: string, accessToken: string): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}?fields=properties.title`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  // シートのタイトルはめったに変わらないため、データキャッシュに1時間保存して読み取り回数を節約する
  // (Googleの読み取りクォータは60回/分/ユーザーで、ダッシュボードの他のシート読み込みと共有のため)。
  // 429(クォータ超過)・5xx は2秒おいて1回だけ no-store でやり直す。
  let res = await fetch(url, { headers, next: { revalidate: 60 * 60 } });
  if (res.status === 429 || res.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await fetch(url, { headers, cache: "no-store" });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Sheets API(タイトル取得。ID: ${sheetId})の呼び出しに失敗しました(status ${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { properties?: { title?: string } };
  return json.properties?.title ?? "";
}

type SheetRole = "referral" | "matrix" | "unknown";

/** タイトル文字列から、送客可能企業リスト/求人マトリックスのどちらのシートかを判定する。 */
function classifySheetTitle(title: string): SheetRole {
  if (title.includes("送客可能") || title.includes("企業リスト")) return "referral";
  if (title.includes("マトリックス")) return "matrix";
  return "unknown";
}

/**
 * `JOB_MATRIX_SHEET_ID` / `REFERRAL_COMPANY_SHEET_ID` の中身が入れ違いに設定されている運用ミスに
 * 対応するため、両IDのスプレッドシートタイトルを取得して実際の役割を自動判別する。
 * 判別できない場合は環境変数名どおりにフォールバックする(ファイル先頭コメント参照)。
 */
export async function resolveSheetRoles(accessToken: string): Promise<SheetRoles> {
  const envJobMatrix = process.env.JOB_MATRIX_SHEET_ID;
  const envReferral = process.env.REFERRAL_COMPANY_SHEET_ID;
  if (!envJobMatrix || !envReferral) {
    throw new Error(
      "環境変数 JOB_MATRIX_SHEET_ID(求人マトリックス)と REFERRAL_COMPANY_SHEET_ID(送客可能企業リスト)の両方を設定してください。",
    );
  }

  const [titleJobMatrixEnv, titleReferralEnv] = await Promise.all([
    fetchSpreadsheetTitle(envJobMatrix, accessToken),
    fetchSpreadsheetTitle(envReferral, accessToken),
  ]);
  const clsJobMatrixEnv = classifySheetTitle(titleJobMatrixEnv);
  const clsReferralEnv = classifySheetTitle(titleReferralEnv);

  // 「送客可能」「企業リスト」を含む方 = 企業リスト、「マトリックス」を含む方 = 求人マトリックスとして
  // 判定する。どちらのIDに入っていても(入れ違いでも)正しく振り分ける。
  if (clsJobMatrixEnv === "referral" && clsReferralEnv !== "referral") {
    return { referralCompanySheetId: envJobMatrix, jobMatrixSheetId: envReferral };
  }
  if (clsReferralEnv === "referral" && clsJobMatrixEnv !== "referral") {
    return { referralCompanySheetId: envReferral, jobMatrixSheetId: envJobMatrix };
  }
  if (clsJobMatrixEnv === "matrix" && clsReferralEnv !== "matrix") {
    return { referralCompanySheetId: envReferral, jobMatrixSheetId: envJobMatrix };
  }
  if (clsReferralEnv === "matrix" && clsJobMatrixEnv !== "matrix") {
    return { referralCompanySheetId: envJobMatrix, jobMatrixSheetId: envReferral };
  }
  // 判別できなければ env 名どおりにフォールバック
  return { referralCompanySheetId: envReferral, jobMatrixSheetId: envJobMatrix };
}

// ─────────────────────────────────────────────
// A. 送客可能企業リスト
// ─────────────────────────────────────────────

export interface ReferralCompanyJob {
  /** シート上の実行番号(1始まり)。状態更新の書き込み先を特定するために使う。 */
  rowNumber: number;
  no: string;
  status: string;
  /** 企業名セルは縦結合されており2行目以降は空文字で返るため、直前の企業名を引き継いだ値。 */
  companyName: string;
  ra: string;
  meetingMinutes: string;
  companyTool: string;
  referralToolMemo: string;
  contact: string;
  hp: string;
  location: string;
  industry: string;
  jobType: string;
  workStyle: string;
  experience: string;
  ageLimit: string;
  ageNote: string;
  license: string;
  holiday: string;
  conditionalHoliday: string;
  annualHoliday: string;
  foreignerAccept: string;
  minIncome: string;
  incentive: string;
  transfer: string;
  housingSupport: string;
  skills: string;
  deemedOvertime: string;
  memo: string;
  hypothesis: string;
}

export interface ReferralCompanyGroup {
  companyName: string;
  jobs: ReferralCompanyJob[];
}

export interface ReferralColumnIndexes {
  no: number;
  status: number;
  companyName: number;
  ra: number;
  meetingMinutes: number;
  companyTool: number;
  referralToolMemo: number;
  contact: number;
  hp: number;
  location: number;
  industry: number;
  jobType: number;
  workStyle: number;
  experience: number;
  ageLimit: number;
  ageNote: number;
  license: number;
  holiday: number;
  conditionalHoliday: number;
  annualHoliday: number;
  foreignerAccept: number;
  minIncome: number;
  incentive: number;
  transfer: number;
  housingSupport: number;
  skills: number;
  deemedOvertime: number;
  memo: number;
  hypothesis: number;
}

/** ヘッダー文字列(部分一致解決の探索ラベル)。固定の列文字には依存しない(revenue.ts と同じ方式)。 */
const REFERRAL_COLUMN_LABELS: Record<keyof ReferralColumnIndexes, string> = {
  no: "No",
  status: "状態",
  companyName: "企業名",
  ra: "RA",
  meetingMinutes: "打ち合わせ議事録",
  companyTool: "企業ツール",
  referralToolMemo: "送客ツールメモ",
  contact: "担当者連絡先",
  hp: "HP",
  location: "勤務地",
  industry: "業界",
  jobType: "職種",
  workStyle: "営業・事務スタイル",
  experience: "経験有無",
  ageLimit: "年齢(上限)",
  ageNote: "年齢条件 備考",
  license: "運転免許",
  holiday: "休日",
  conditionalHoliday: "条件付き休日",
  annualHoliday: "年間休日",
  foreignerAccept: "外国人受入有無",
  minIncome: "下限固定年収",
  incentive: "インセンティブ",
  transfer: "転勤有無",
  housingSupport: "住宅補助/社宅有無",
  skills: "資格/スキル(あるといい)",
  deemedOvertime: "みなし残業",
  memo: "メモ",
  hypothesis: "仮説すり合わせ・企業説明用",
};

function resolveReferralColumns(header: string[], tabName: string): ReferralColumnIndexes {
  const idx = {} as ReferralColumnIndexes;
  for (const key of Object.keys(REFERRAL_COLUMN_LABELS) as (keyof ReferralColumnIndexes)[]) {
    idx[key] = findColumnExactOrIncludes(header, REFERRAL_COLUMN_LABELS[key]);
  }
  if (idx.companyName < 0 || idx.status < 0) {
    const headerText = header.filter(Boolean).join(" / ") || "(空)";
    throw new CompanyDirectoryParseError(
      `タブ「${tabName}」のヘッダー行に「企業名」または「状態」列が見つかりません(見出し行: ${headerText})。`,
    );
  }
  return idx;
}

/** 先頭3行の中から「企業名」「状態」「RA」を全て含むヘッダー行を探す(タブ選択のフォールバック用)。 */
function findReferralHeaderRowIndex(rows: SheetValuesRow[]): number {
  const limit = Math.min(rows.length, 3);
  for (let i = 0; i < limit; i++) {
    const texts = (rows[i] ?? []).map(cellToString);
    const hasCompany = texts.some((t) => t.includes("企業名"));
    const hasStatus = texts.some((t) => t.includes("状態"));
    const hasRa = texts.some((t) => t === "RA" || t.includes("RA"));
    if (hasCompany && hasStatus && hasRa) return i;
  }
  return -1;
}

function parseReferralRows(
  rows: SheetValuesRow[],
  headerRowIndex: number,
  col: ReferralColumnIndexes,
): ReferralCompanyGroup[] {
  const groupByName = new Map<string, ReferralCompanyGroup>();
  let lastCompanyName = "";

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;

    // 企業名セルは縦結合されており、Values APIでは2行目以降が空文字で返ってくるため、
    // 空なら直前の企業名を引き継いでグループ化する(1社=複数の求人パターン行)。
    const rawCompanyName = cellToString(row[col.companyName]);
    const companyName = rawCompanyName || lastCompanyName;
    if (!companyName) continue; // 企業名が一度も出現していない行(先頭の空行等)は無視
    lastCompanyName = companyName;

    const job: ReferralCompanyJob = {
      rowNumber: i + 1,
      no: cellToString(row[col.no]),
      status: cellToString(row[col.status]),
      companyName,
      ra: cellToString(row[col.ra]),
      meetingMinutes: cellToString(row[col.meetingMinutes]),
      companyTool: cellToString(row[col.companyTool]),
      referralToolMemo: cellToString(row[col.referralToolMemo]),
      contact: cellToString(row[col.contact]),
      hp: cellToString(row[col.hp]),
      location: cellToString(row[col.location]),
      industry: cellToString(row[col.industry]),
      jobType: cellToString(row[col.jobType]),
      workStyle: cellToString(row[col.workStyle]),
      experience: cellToString(row[col.experience]),
      ageLimit: cellToString(row[col.ageLimit]),
      ageNote: cellToString(row[col.ageNote]),
      license: cellToString(row[col.license]),
      holiday: cellToString(row[col.holiday]),
      conditionalHoliday: cellToString(row[col.conditionalHoliday]),
      annualHoliday: cellToString(row[col.annualHoliday]),
      foreignerAccept: cellToString(row[col.foreignerAccept]),
      minIncome: cellToString(row[col.minIncome]),
      incentive: cellToString(row[col.incentive]),
      transfer: cellToString(row[col.transfer]),
      housingSupport: cellToString(row[col.housingSupport]),
      skills: cellToString(row[col.skills]),
      deemedOvertime: cellToString(row[col.deemedOvertime]),
      memo: cellToString(row[col.memo]),
      hypothesis: cellToString(row[col.hypothesis]),
    };

    const existing = groupByName.get(companyName);
    if (existing) {
      existing.jobs.push(job);
    } else {
      groupByName.set(companyName, { companyName, jobs: [job] });
    }
  }

  return Array.from(groupByName.values());
}

export interface ReferralCompanyResult {
  sheetId: string;
  tabName: string;
  header: string[];
  columns: ReferralColumnIndexes;
  groups: ReferralCompanyGroup[];
}

/**
 * 送客可能企業リストを取得する。
 * タブ選択: 名前が「作成途中」のタブがあればそれを使う(将来改名の可能性があるため、無い場合のみ
 * フォールバックとして、各タブ先頭3行に「企業名」「状態」「RA」を含むヘッダー行を持つ最初のタブを探す。
 * タブ名に「求人検索」を含むものは検索ツール画面のため除外する)。
 */
export async function fetchReferralCompanyData(
  accessToken: string,
  sheetId: string,
): Promise<ReferralCompanyResult> {
  const allTitles = await fetchSheetTabTitles(sheetId, accessToken);
  const eligibleTitles = allTitles.filter((t) => !t.includes("求人検索"));
  if (eligibleTitles.length === 0) {
    throw new CompanyDirectoryParseError(
      `送客可能企業リストに読み取り可能なタブがありません(タブ一覧: ${allTitles.join(" / ") || "(なし)"})。`,
    );
  }

  let tabName: string;
  let headerRowIndex: number;

  const exactTab = eligibleTitles.find((t) => t === "作成途中");
  if (exactTab) {
    tabName = exactTab;
    headerRowIndex = 0; // 「作成途中」タブはヘッダーが1行目である前提
  } else {
    // 「作成途中」タブが無い場合、各タブの先頭3行をまとめて取得し、ヘッダー行を持つ最初のタブを探す。
    const probeRanges = eligibleTitles.map((t) => `${quoteSheetTitle(t)}!A1:AZ3`);
    const probeResults = await fetchSheetsValuesBatchGet(sheetId, probeRanges, accessToken);
    const foundIndex = eligibleTitles.findIndex((_, i) => findReferralHeaderRowIndex(probeResults[i] ?? []) >= 0);
    if (foundIndex < 0) {
      throw new CompanyDirectoryParseError(
        `送客可能企業リストのタブが見つかりません(「企業名」「状態」「RA」を含むヘッダー行を持つタブが無い。タブ一覧: ${allTitles.join(" / ")})。`,
      );
    }
    tabName = eligibleTitles[foundIndex];
    headerRowIndex = findReferralHeaderRowIndex(probeResults[foundIndex] ?? []);
  }

  const [rows] = await fetchSheetsValuesBatchGet(sheetId, [`${quoteSheetTitle(tabName)}!A:AZ`], accessToken);
  const header = (rows[headerRowIndex] ?? []).map(cellToString);
  const columns = resolveReferralColumns(header, tabName);
  const groups = parseReferralRows(rows, headerRowIndex, columns);

  return { sheetId, tabName, header, columns, groups };
}

// ─────────────────────────────────────────────
// A. 書き込み: 状態更新・企業追加
// ─────────────────────────────────────────────

export interface UpdateCompanyStatusInput {
  rowNumber: number;
  expectedCompanyName: string;
  status: string;
}

/**
 * 送客可能企業リストの「状態」セルを更新する。
 * 書き込み前にシートを読み直し、rowNumber の行が(企業名の縦結合引き継ぎ解決後)
 * expectedCompanyName と一致するかを確認する(画面表示後にシート側で行が追加/削除され、
 * 行がずれた状態のままユーザーが古い画面から更新してしまう事故を防ぐガード)。
 */
export async function updateCompanyStatus(input: UpdateCompanyStatusInput): Promise<void> {
  const accessToken = await getAccessToken(undefined);
  const roles = await resolveSheetRoles(accessToken);
  const data = await fetchReferralCompanyData(accessToken, roles.referralCompanySheetId);

  const job = data.groups.flatMap((g) => g.jobs).find((j) => j.rowNumber === input.rowNumber);
  if (!job || job.companyName !== input.expectedCompanyName) {
    throw new Error("シートの行がずれた可能性があります。画面を再読み込みしてください。");
  }

  const columnLetter = columnIndexToLetter(data.columns.status);
  const range = `${quoteSheetTitle(data.tabName)}!${columnLetter}${input.rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    roles.referralCompanySheetId,
  )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [[input.status]] }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets への書き込みに失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
  }
}

export interface AppendCompanyInput {
  companyName: string;
  status?: string;
  ra?: string;
  region?: string;
  industry?: string;
  jobType?: string;
  memo?: string;
}

/** 送客可能企業リストの本体タブ末尾に新規企業(1行)を追加する。指定の無い列は空欄のままにする。 */
export async function appendCompany(input: AppendCompanyInput): Promise<void> {
  const accessToken = await getAccessToken(undefined);
  const roles = await resolveSheetRoles(accessToken);
  const data = await fetchReferralCompanyData(accessToken, roles.referralCompanySheetId);
  const col = data.columns;

  const maxNo = data.groups
    .flatMap((g) => g.jobs)
    .reduce((max, j) => Math.max(max, Number(j.no.replace(/[^0-9.-]/g, "")) || 0), 0);

  const row: string[] = new Array(data.header.length).fill("");
  const setIfKnown = (index: number, value: string | undefined) => {
    if (index >= 0 && value) row[index] = value;
  };
  setIfKnown(col.no, String(maxNo + 1));
  setIfKnown(col.status, input.status?.trim() || "募集中");
  setIfKnown(col.companyName, input.companyName);
  setIfKnown(col.ra, input.ra);
  setIfKnown(col.location, input.region);
  setIfKnown(col.industry, input.industry);
  setIfKnown(col.jobType, input.jobType);
  setIfKnown(col.memo, input.memo);

  const range = quoteSheetTitle(data.tabName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    roles.referralCompanySheetId,
  )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets への企業追加に失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
  }
}

// ─────────────────────────────────────────────
// B. 求人マトリックス(読み取り専用)
// ─────────────────────────────────────────────

export interface JobMatrixListing {
  kind: "listing";
  tab: string;
  jobName: string;
  jobCategory: string;
  area: string;
  location: string;
  requirements: string;
  isNew: boolean;
}

export interface JobMatrixCell {
  kind: "matrix";
  tab: string;
  /** 列見出し(「堅実志向」「成長志向」等)。 */
  orientation: string;
  /** 縦ラベル(「法人新規」等。縦結合セルの引き継ぎ解決後)。 */
  category: string;
  /** セル1行目から「◆」等の装飾を除去した会社名。 */
  company: string;
  /** セル2行目以降の条件メモ。 */
  detail: string;
  /** 取り消し線が引かれている(=募集終了)。 */
  closed: boolean;
}

export type JobMatrixEntry = JobMatrixListing | JobMatrixCell;

/** 先頭3行の中から「求人名」を含むヘッダー行を探す(表形式タブの判定・ヘッダー位置特定)。 */
function findListingHeaderRowIndex(rows: SheetValuesRow[]): number {
  const limit = Math.min(rows.length, 3);
  for (let i = 0; i < limit; i++) {
    const texts = (rows[i] ?? []).map(cellToString);
    if (texts.some((t) => t.includes("求人名"))) return i;
  }
  return -1;
}

function parseListingTab(rows: SheetValuesRow[], headerRowIndex: number, tab: string): JobMatrixListing[] {
  const header = (rows[headerRowIndex] ?? []).map(cellToString);
  const col = {
    isNew: findColumnExactOrIncludes(header, "新着"),
    jobCategory: findColumnExactOrIncludes(header, "職種"),
    area: findColumnExactOrIncludes(header, "勤務地エリア"),
    location: findColumnExactOrIncludes(header, "勤務地"),
    requirements: findColumnExactOrIncludes(header, "必須条件"),
    jobName: findColumnExactOrIncludes(header, "求人名"),
  };

  const result: JobMatrixListing[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;
    const jobName = col.jobName >= 0 ? cellToString(row[col.jobName]) : "";
    if (!jobName) continue; // 求人名が無い行(空行・小計等)は無視
    result.push({
      kind: "listing",
      tab,
      jobName,
      jobCategory: col.jobCategory >= 0 ? cellToString(row[col.jobCategory]) : "",
      area: col.area >= 0 ? cellToString(row[col.area]) : "",
      location: col.location >= 0 ? cellToString(row[col.location]) : "",
      requirements: col.requirements >= 0 ? cellToString(row[col.requirements]) : "",
      isNew: col.isNew >= 0 && cellToString(row[col.isNew]).length > 0,
    });
  }
  return result;
}

/** gridData から取得した1セル分の情報(表示文字列+取り消し線有無)。 */
interface GridCellInfo {
  formattedValue: string;
  strikethrough: boolean;
}

/**
 * 全対象タブの gridData(表示文字列+取り消し線)を **1回のAPI呼び出しでまとめて** 取得する。
 * 取り消し線(=募集終了)の判定は Values API ではできないため `spreadsheets.get` の gridData
 * (effectiveFormat / textFormatRuns)を使う。以前はタブごとに1回ずつ呼んでいたが、タブ数×読み取りで
 * Googleの読み取りクォータ(60回/分/ユーザー)を超えて 429 になった実障害があるため、`ranges` を
 * 複数並べて1リクエストに集約し、さらに結果をデータキャッシュに5分保存する(マトリックスは
 * 閲覧専用のため5分の遅れは許容できる)。範囲は各タブ A1:Z300 に制限してレスポンス肥大を防ぐ。
 * セル全体に取り消し線、または先頭のテキストラン(会社名部分)に取り消し線があれば「募集終了」とみなす。
 */
async function fetchGridDataForTabs(
  sheetId: string,
  tabs: string[],
  accessToken: string,
): Promise<Map<string, GridCellInfo[][]>> {
  const params = new URLSearchParams();
  for (const tab of tabs) params.append("ranges", `${quoteSheetTitle(tab)}!A1:Z300`);
  params.append(
    "fields",
    "sheets(properties(title),data(rowData(values(formattedValue,effectiveFormat(textFormat(strikethrough)),textFormatRuns(format(strikethrough))))))",
  );
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  // 429(クォータ超過)・5xx は2秒おいて1回だけ no-store でやり直す(失敗をキャッシュに残さない)。
  let res = await fetch(url, { headers, next: { revalidate: 300 } });
  if (res.status === 429 || res.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await fetch(url, { headers, cache: "no-store" });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Sheets API(求人マトリックスの書式一括取得)に失敗しました(status ${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as {
    sheets?: {
      properties?: { title?: string };
      data?: {
        rowData?: {
          values?: {
            formattedValue?: string;
            effectiveFormat?: { textFormat?: { strikethrough?: boolean } };
            textFormatRuns?: { format?: { strikethrough?: boolean } }[];
          }[];
        }[];
      }[];
    }[];
  };
  const byTab = new Map<string, GridCellInfo[][]>();
  for (const sheet of json.sheets ?? []) {
    const title = sheet.properties?.title ?? "";
    const rowData = sheet.data?.[0]?.rowData ?? [];
    byTab.set(
      title,
      rowData.map((r) =>
        (r.values ?? []).map((v) => {
          const wholeCellStrike = v.effectiveFormat?.textFormat?.strikethrough === true;
          const firstRunStrike = v.textFormatRuns?.[0]?.format?.strikethrough === true;
          return { formattedValue: v.formattedValue ?? "", strikethrough: wholeCellStrike || firstRunStrike };
        }),
      ),
    );
  }
  return byTab;
}

/** セル1行目の先頭にある「◆」等の記号・絵文字装飾を除去して会社名だけを取り出す。 */
function stripCompanyPrefix(text: string): string {
  return text.replace(/^[◆■●○◎★☆※\u{1F300}-\u{1FAFF}☀-➿\s]+/u, "").trim();
}

/**
 * 列見出し行(「堅実志向」「成長志向」等)を先頭5行の中から探す。実物シートは3行目付近だが、
 * タイトル行の有無で多少ズレることがあるため、A列以降(B列〜)に非空セルが2つ以上並ぶ最初の行を
 * 見出し行とみなす(判定は寛容にする)。
 */
function findOrientationRowIndex(cells: GridCellInfo[][]): number {
  const limit = Math.min(cells.length, 5);
  for (let i = 0; i < limit; i++) {
    const row = cells[i] ?? [];
    const nonEmptyAfterA = row.slice(1).filter((c) => c.formattedValue.trim() !== "").length;
    if (nonEmptyAfterA >= 2) return i;
  }
  return -1;
}

function parseMatrixTab(cells: GridCellInfo[][], tab: string): JobMatrixCell[] {
  const orientationRowIndex = findOrientationRowIndex(cells);
  if (orientationRowIndex < 0) return [];
  const orientationRow = cells[orientationRowIndex] ?? [];

  const result: JobMatrixCell[] = [];
  let lastCategory = "";
  for (let r = orientationRowIndex + 1; r < cells.length; r++) {
    const row = cells[r] ?? [];
    // A列(縦ラベル)は縦結合されているため、空セルは直前のカテゴリを引き継ぐ。
    const categoryText = (row[0]?.formattedValue ?? "").trim();
    if (categoryText) lastCategory = categoryText;
    const category = lastCategory;

    for (let c = 1; c < row.length; c++) {
      const cell = row[c];
      if (!cell || !cell.formattedValue.trim()) continue;
      const orientation = (orientationRow[c]?.formattedValue ?? "").trim();
      const lines = cell.formattedValue
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;
      result.push({
        kind: "matrix",
        tab,
        orientation,
        category,
        company: stripCompanyPrefix(lines[0]),
        detail: lines.slice(1).join("\n"),
        closed: cell.strikethrough,
      });
    }
  }
  return result;
}

/**
 * 求人マトリックスを取得する(読み取り専用)。タブ名「求人検索」は検索ツール画面のため除外する。
 * 全対象タブの内容(表示文字列+取り消し線)を gridData の一括取得1回で読み(fetchGridDataForTabs 参照)、
 * 先頭3行に「求人名」を含むヘッダー行があれば表形式(1行=1求人)、無ければマトリックス形式
 * (取り消し線=募集終了)としてパースする。API読み取りは タブ一覧1回+一括取得1回 の計2回に抑える。
 */
export async function fetchJobMatrixData(accessToken: string, sheetId: string): Promise<JobMatrixEntry[]> {
  // タブ一覧はめったに変わらないため5分キャッシュ(クォータ節約。spreadsheet.ts 参照)。
  const allTitles = await fetchSheetTabTitles(sheetId, accessToken, 300);
  const targetTabs = allTitles.filter((t) => !t.includes("求人検索"));
  if (targetTabs.length === 0) return [];

  const gridByTab = await fetchGridDataForTabs(sheetId, targetTabs, accessToken);

  const entries: JobMatrixEntry[] = [];
  for (const tab of targetTabs) {
    const cells = gridByTab.get(tab) ?? [];
    // 表形式タブの判定・パースは表示文字列だけで足りるため、gridData から文字列の行列を作って流用する。
    const rows: SheetValuesRow[] = cells.map((r) => r.map((c) => c.formattedValue));
    const headerRowIndex = findListingHeaderRowIndex(rows);
    if (headerRowIndex >= 0) {
      entries.push(...parseListingTab(rows, headerRowIndex, tab));
    } else {
      entries.push(...parseMatrixTab(cells, tab));
    }
  }

  return entries;
}

// ─────────────────────────────────────────────
// C. 契約企業一覧(読み取り専用)
// ─────────────────────────────────────────────

export interface ContractCompany {
  /** シート上の実行番号(1始まり)。 */
  rowNumber: number;
  companyName: string;
  /** 担当名(清本・本間・江崎 等)。 */
  staff: string;
  /** 契約形態(ほぼ「成果報酬」)。 */
  contractType: string;
  /** 契約内容(自由記述。原文そのまま)。 */
  contractTerms: string;
  /** contractTerms から抽出した報酬表示(「30%」「20〜35%」等の%表記優先。無ければ金額表記、無ければ原文先頭20文字)。 */
  feeLabel: string;
  isContracted: boolean;
  /** 契約書類(「未契約」「クラウドサイン」「書面」等)。 */
  documentType: string;
  memo: string;
  /**
   * 契約書(Googleドライブ等)のURL。運用上、契約書類列の隣やメモ列など貼り付け位置が一定でなく、
   * かつ貼られていない行も多いため、行内のどこかのセルに見つかった場合のみ設定する(任意項目)。
   */
  contractUrl?: string;
}

interface ContractColumnIndexes {
  no: number;
  companyName: number;
  staff: number;
  contractType: number;
  contractTerms: number;
  contracted: number;
  documentType: number;
  confirmed: number;
  memo: number;
}

/** ヘッダー文字列(部分一致解決の探索ラベル)。実物シートのヘッダー1行目をそのまま列挙する。 */
const CONTRACT_COLUMN_LABELS: Record<keyof ContractColumnIndexes, string> = {
  no: "No",
  companyName: "企業",
  staff: "担当名",
  contractType: "契約形態",
  contractTerms: "契約内容",
  contracted: "契約",
  documentType: "契約書類",
  confirmed: "内容確認",
  memo: "メモ",
};

function resolveContractColumns(header: string[], tabName: string): ContractColumnIndexes {
  const idx = {} as ContractColumnIndexes;
  for (const key of Object.keys(CONTRACT_COLUMN_LABELS) as (keyof ContractColumnIndexes)[]) {
    idx[key] = findColumnExactOrIncludes(header, CONTRACT_COLUMN_LABELS[key]);
  }
  if (idx.companyName < 0) {
    const headerText = header.filter(Boolean).join(" / ") || "(空)";
    throw new CompanyDirectoryParseError(
      `タブ「${tabName}」のヘッダー行に「企業」列が見つかりません(見出し行: ${headerText})。`,
    );
  }
  return idx;
}

/** 先頭3行の中から「企業」「契約形態」を両方含むヘッダー行を探す(タブ選択のフォールバック用)。 */
function findContractHeaderRowIndex(rows: SheetValuesRow[]): number {
  const limit = Math.min(rows.length, 3);
  for (let i = 0; i < limit; i++) {
    const texts = (rows[i] ?? []).map(cellToString);
    const hasCompany = texts.some((t) => t.includes("企業"));
    const hasContractType = texts.some((t) => t.includes("契約形態"));
    if (hasCompany && hasContractType) return i;
  }
  return -1;
}

/**
 * 全角の数字・記号(%・~・英数字等)を半角に変換する(Unicode「全角形」ブロック U+FF01-FF5E は
 * 半角と等距離 0xFEE0 だけずれているため一括変換できる)。手入力セルの表記ゆれ(全角%等)を
 * 吸収するために feeLabel 抽出前に通す。
 */
function toHalfWidthAscii(text: string): string {
  return text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * 契約内容の自由記述(例: 「30%」「100万」「20〜35%」「30%〜40%」「事務40万/エンジニア50万」
 * 「提示していない」「交渉できる」「30% 3分割払い」)から、経営者が一目で把握したい報酬表示を
 * 寛容に抽出する。優先順位: ①%表記(範囲表記含む) → ②金額表記(「万」「万円」) → ③どちらも
 * 無ければ原文の先頭20文字。
 */
function extractFeeLabel(contractTerms: string): string {
  const normalized = toHalfWidthAscii(contractTerms);
  // 「20〜35%」のように最初の数字に%が付かない範囲表記、「30%〜40%」のように両方に付く表記、
  // どちらも拾えるよう、1つ目の%は省略可・2つ目の%は必須にする。
  const rangeMatch = normalized.match(/\d+\s*%?\s*[〜~-]\s*\d+\s*%/);
  if (rangeMatch) return rangeMatch[0].replace(/\s+/g, "");
  const singleMatch = normalized.match(/\d+\s*%/);
  if (singleMatch) return singleMatch[0].replace(/\s+/g, "");
  const moneyMatch = normalized.match(/\d+(?:\.\d+)?\s*万円?/);
  if (moneyMatch) return moneyMatch[0].replace(/\s+/g, "");
  return contractTerms.slice(0, 20);
}

/**
 * 契約済み判定(この順で寛容に判定し、いずれか1つでも該当すれば契約済みとみなす):
 * ①契約列に「○」または「◯」がある ②契約書類が空でも「未契約」でもない ③メモに「契約済」を含む。
 * それ以外(契約列が空・契約書類が空か「未契約」・メモにも記載なし)は未契約(商談中)として扱う。
 */
function isContractedRow(contractedCell: string, documentType: string, memo: string): boolean {
  const mark = contractedCell.trim();
  if (mark === "○" || mark === "◯") return true;
  if (documentType && documentType !== "未契約") return true;
  if (memo.includes("契約済")) return true;
  return false;
}

/**
 * 契約書(Googleドライブ等)のURLを抽出する。運用上、契約書類列の隣やメモ列など貼り付け位置が
 * 列単位で一定でないため、列を決め打ちせず行内の全セル(A:M)から https:// で始まる文字列を探す。
 * 優先順位: ① drive.google.com / docs.google.com を含むURL ② 無ければ最初に見つかったURL。
 * 貼られていない行の方が多い運用実態のため、見つからない場合でもエラーにはせず undefined を返す。
 */
function extractContractUrl(row: SheetValuesRow): string | undefined {
  const urls: string[] = [];
  for (const cell of row) {
    const text = cellToString(cell);
    const matches = text.match(/https:\/\/\S+/g);
    if (matches) urls.push(...matches);
  }
  if (urls.length === 0) return undefined;
  return urls.find((u) => u.includes("drive.google.com") || u.includes("docs.google.com")) ?? urls[0];
}

/**
 * 企業名の照合用正規化ヘルパー。契約企業一覧と送客可能企業リストとでは企業名の表記(法人格の
 * 有無・全角/半角スペース)が揺れるため、両者を突き合わせる前にこの関数で正規化して比較する。
 * 空白(半角・全角)と「株式会社」「(株)」「(株)」(半角/全角括弧どちらも)を除去し小文字化する。
 */
export function normalizeCompanyName(name: string): string {
  return name
    .replace(/株式会社/g, "")
    .replace(/[(（]株[)）]/g, "")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

function parseContractRows(
  rows: SheetValuesRow[],
  headerRowIndex: number,
  col: ContractColumnIndexes,
): ContractCompany[] {
  const result: ContractCompany[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;

    const companyName = cellToString(row[col.companyName]);
    if (!companyName) continue; // 企業名が空の行(小計・空行等)はスキップ

    const contractTerms = col.contractTerms >= 0 ? cellToString(row[col.contractTerms]) : "";
    const contractedCell = col.contracted >= 0 ? cellToString(row[col.contracted]) : "";
    const documentType = col.documentType >= 0 ? cellToString(row[col.documentType]) : "";
    const memo = col.memo >= 0 ? cellToString(row[col.memo]) : "";

    result.push({
      rowNumber: i + 1,
      companyName,
      staff: col.staff >= 0 ? cellToString(row[col.staff]) : "",
      contractType: col.contractType >= 0 ? cellToString(row[col.contractType]) : "",
      contractTerms,
      feeLabel: extractFeeLabel(contractTerms),
      isContracted: isContractedRow(contractedCell, documentType, memo),
      documentType,
      memo,
      contractUrl: extractContractUrl(row),
    });
  }
  return result;
}

export interface ContractCompanyResult {
  tabName: string;
  companies: ContractCompany[];
}

/**
 * 契約企業一覧(スプレッドシート「送客可能/契約後の進捗について」タブ「企業一覧」)を取得する
 * (読み取り専用)。タブ選択: 名前が「企業一覧」のタブを優先し、無ければ各タブ先頭3行に
 * 「企業」「契約形態」を含むヘッダー行を持つ最初のタブを使う(送客可能企業リストのタブ探索
 * パターンを踏襲)。API読み取りは タブ一覧1回(+タブ探索が必要な場合のみプローブ1回)+本体取得1回。
 */
export async function fetchContractCompanies(accessToken: string, sheetId: string): Promise<ContractCompanyResult> {
  // タブ一覧はめったに変わらないため5分キャッシュ(クォータ節約。spreadsheet.ts 参照)。
  const allTitles = await fetchSheetTabTitles(sheetId, accessToken, 300);
  if (allTitles.length === 0) {
    throw new CompanyDirectoryParseError("契約企業シートに読み取り可能なタブがありません。");
  }

  let tabName: string;
  let headerRowIndex: number;

  const exactTab = allTitles.find((t) => t === "企業一覧");
  if (exactTab) {
    tabName = exactTab;
    headerRowIndex = 0; // 「企業一覧」タブはヘッダーが1行目である前提
  } else {
    const probeRanges = allTitles.map((t) => `${quoteSheetTitle(t)}!A1:M3`);
    const probeResults = await fetchSheetsValuesBatchGet(sheetId, probeRanges, accessToken);
    const foundIndex = allTitles.findIndex((_, i) => findContractHeaderRowIndex(probeResults[i] ?? []) >= 0);
    if (foundIndex < 0) {
      throw new CompanyDirectoryParseError(
        `契約企業タブが見つかりません(「企業」「契約形態」を含むヘッダー行を持つタブが無い。タブ一覧: ${allTitles.join(" / ")})。`,
      );
    }
    tabName = allTitles[foundIndex];
    headerRowIndex = findContractHeaderRowIndex(probeResults[foundIndex] ?? []);
  }

  const [rows] = await fetchSheetsValuesBatchGet(sheetId, [`${quoteSheetTitle(tabName)}!A:M`], accessToken);
  const header = (rows[headerRowIndex] ?? []).map(cellToString);
  const columns = resolveContractColumns(header, tabName);
  const companies = parseContractRows(rows, headerRowIndex, columns);

  return { tabName, companies };
}
