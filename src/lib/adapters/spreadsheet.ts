/**
 * SpreadsheetSource アダプタ
 * 求職者・成約・プロジェクト・メンバー・設定・週次KPIのマスタデータを取得する抽象化層。
 * デモ段階は DemoSpreadsheetSource が demo-data.ts を返す。
 * 実連携は GoogleSheetsSource が Google Sheets の「設定/メンバー/求職者/成約/プロジェクト/週次KPI」
 * 6タブを Values API(batchGet)で読み取り、型へパースする(docs/SHEET_TEMPLATE.md 参照)。
 * googleapis 等の追加npm依存は使わず、node:crypto で RS256 JWT を組み立てて認証する。
 */
import { createSign } from "node:crypto";
import {
  ALL_STAGES,
  CANDIDATE_KPI_KEYS,
  CORPORATE_KPI_KEYS,
  DEFAULT_REFERRAL_RATES,
  FEE_RATE,
} from "../types";
import type {
  Candidate,
  CandidateKpiKey,
  CorporateKpiKey,
  KpiCategory,
  Member,
  Placement,
  Project,
  ReferralRate,
  Settings,
  Stage,
  WeeklyKpiRecord,
} from "../types";
import {
  candidates,
  members,
  placements,
  projects,
  weeklyKpis,
} from "../demo-data";

export interface SpreadsheetSource {
  getCandidates(): Promise<Candidate[]>;
  getPlacements(): Promise<Placement[]>;
  getProjects(): Promise<Project[]>;
  getMembers(): Promise<Member[]>;
  getSettings(): Promise<Settings>;
  getWeeklyKpis(): Promise<WeeklyKpiRecord[]>;
}

/** デモ実装: demo-data.ts の内容をそのまま返す。 */
export class DemoSpreadsheetSource implements SpreadsheetSource {
  async getCandidates(): Promise<Candidate[]> {
    return candidates;
  }
  async getPlacements(): Promise<Placement[]> {
    return placements;
  }
  async getProjects(): Promise<Project[]> {
    return projects;
  }
  async getMembers(): Promise<Member[]> {
    return members;
  }
  async getSettings(): Promise<Settings> {
    return { feeRate: FEE_RATE, referralRates: DEFAULT_REFERRAL_RATES };
  }
  async getWeeklyKpis(): Promise<WeeklyKpiRecord[]> {
    return weeklyKpis;
  }
}

// ─────────────────────────────────────────────
// GoogleSheetsSource: 実連携
// ─────────────────────────────────────────────

/** シート側の値の読み取りエラー(接続元でまとめて catch し、デモへフォールバックする)。 */
class SheetParseError extends Error {}

interface GoogleServiceAccountKey {
  clientEmail: string;
  privateKey: string;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * サービスアカウント鍵JSONの取得元を解決する。
 * `GOOGLE_SERVICE_ACCOUNT_FILE`(鍵ファイルへのパス。1行化不要でおすすめ)が設定されていれば
 * そのファイルを読み込み、無ければ `GOOGLE_SERVICE_ACCOUNT_JSON`(JSON文字列)を使う。
 */
function resolveServiceAccountRaw(): string {
  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (filePath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require("node:fs") as typeof import("node:fs");
      return readFileSync(filePath, "utf8");
    } catch {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_FILE のファイル(${filePath})を読み込めませんでした。パスが正しいか、ファイルが存在するか確認してください(プロジェクト直下に置いた場合は ./service-account.json のように指定します)。`,
      );
    }
  }
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!inlineJson) {
    throw new Error(
      "環境変数 GOOGLE_SERVICE_ACCOUNT_FILE(鍵ファイルのパス)または GOOGLE_SERVICE_ACCOUNT_JSON(鍵JSON文字列)のどちらかを設定してください。",
    );
  }
  return inlineJson;
}

/**
 * `GOOGLE_SERVICE_ACCOUNT_JSON`(鍵JSON文字列)をパースする。
 * 手作業での貼り付けを想定し、よくある崩れ(BOM・前後の引用符・前後の余計な文字・
 * 途中の実改行)は自動で修復を試みる。JSON.parse に失敗しても、client_email と
 * private_key を直接抽出できれば動作させる。
 */
function parseServiceAccountJson(raw: string): GoogleServiceAccountKey {
  // 1) よくある崩れの除去: BOM・前後空白・全体を囲む引用符・{ より前 / } より後のゴミ
  let text = raw.replace(/^﻿/, "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    text = text.slice(braceStart, braceEnd + 1);
  }

  let clientEmail: string | undefined;
  let privateKeyRaw: string | undefined;

  // 2) まず通常の JSON.parse を試す
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (typeof obj.client_email === "string" && obj.client_email) clientEmail = obj.client_email;
    if (typeof obj.private_key === "string" && obj.private_key) privateKeyRaw = obj.private_key;
  } catch {
    // 3) 失敗したら、必要な2項目だけを正規表現で直接抽出する(貼り付け崩れへの最終救済)
    const emailMatch = text.match(/"client_email"\s*:\s*"([^"]+)"/);
    const keyMatch = text.match(/"private_key"\s*:\s*"([^"]+)"/);
    if (emailMatch) clientEmail = emailMatch[1];
    if (keyMatch) privateKeyRaw = keyMatch[1];
    // 引用符がエスケープされた形(\" )で貼り付けられているケースへの追加救済
    if (!clientEmail || !privateKeyRaw) {
      const unescaped = text.replace(/\\"/g, '"');
      const emailMatch2 = unescaped.match(/"client_email"\s*:\s*"([^"]+)"/);
      const keyMatch2 = unescaped.match(/"private_key"\s*:\s*"([^"]+)"/);
      if (!clientEmail && emailMatch2) clientEmail = emailMatch2[1];
      if (!privateKeyRaw && keyMatch2) privateKeyRaw = keyMatch2[1];
    }
  }

  if (!clientEmail || !privateKeyRaw) {
    // 秘密情報を出さずに、原因の切り分けに役立つ診断情報だけを添える
    const diag = [
      `長さ${raw.length}文字`,
      `先頭「${raw.trim().charAt(0) || "(空)"}」`,
      `末尾「${raw.trim().slice(-1) || "(空)"}」`,
      `client_email を含む: ${text.includes("client_email") ? "はい" : "いいえ"}`,
      `private_key を含む: ${text.includes("private_key") ? "はい" : "いいえ"}`,
    ].join(" / ");
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON を読み取れませんでした。鍵ファイル(service-account.json)をメモ帳で開き、Ctrl+A で全選択してコピーした内容をそのまま貼り付けてください。(診断: ${diag})`,
    );
  }

  // 改行が \n エスケープのままでも、実改行に変換されていてもどちらでも動作させる
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;
  return { clientEmail, privateKey };
}

const TOKEN_CACHE_MS = 50 * 60 * 1000; // 50分(Google のアクセストークン有効期限より短めにキャッシュする)
let tokenCache: { token: string; expiresAt: number } | null = null;

/** サービスアカウントの秘密鍵で RS256 署名した JWT を組み立てる。 */
function buildSignedJwt(key: GoogleServiceAccountKey): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: key.clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  let signature: Buffer;
  try {
    signature = signer.sign(key.privateKey);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON の private_key で署名できませんでした。鍵の中身(改行含む)が正しいか確認してください。",
    );
  }
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * サービスアカウントの JWT を Google OAuth2 トークンエンドポイントに交換し、アクセストークンを取得する
 * (メモリキャッシュ付き)。`adapters/marketing.ts`(集客・広告シート連携)からも共用する。
 */
export async function getAccessToken(serviceAccountJson: string | undefined): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  const raw = serviceAccountJson ?? resolveServiceAccountRaw();
  const key = parseServiceAccountJson(raw);
  const jwt = buildSignedJwt(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google OAuth トークン取得に失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) {
    throw new Error(`Google OAuth トークン応答に access_token がありません: ${json.error ?? "unknown error"}`);
  }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + TOKEN_CACHE_MS };
  return tokenCache.token;
}

// ─────────────────────────────────────────────
// Sheets Values API(batchGet)
// ─────────────────────────────────────────────

const TAB_SETTINGS = "設定";
const TAB_MEMBERS = "メンバー";
const TAB_CANDIDATES = "求職者";
const TAB_PLACEMENTS = "成約";
const TAB_PROJECTS = "プロジェクト";
const TAB_WEEKLY_KPI = "週次KPI";
/** 任意タブ。無い/読めない場合は DEFAULT_REFERRAL_RATES にフォールバックする(RANGES には含めない。下記参照)。 */
const TAB_REFERRAL_RATES = "送客単価";

// N列(登録日)・O列(面談日)を含める。既存シート(M列まで)でもエラーにならない(列自体が存在しないだけ)。
const RANGES = [
  `${TAB_SETTINGS}!A:B`,
  `${TAB_MEMBERS}!A:D`,
  `${TAB_CANDIDATES}!A:O`,
  `${TAB_PLACEMENTS}!A:G`,
  `${TAB_PROJECTS}!A:G`,
  `${TAB_WEEKLY_KPI}!A:E`,
];

export type SheetValuesRow = unknown[];
type SheetRow = SheetValuesRow;

/**
 * Sheets Values API の `batchGet` で複数レンジをまとめて取得する汎用ヘルパー。
 * `adapters/marketing.ts`(集客・広告シート連携。タブ名をヘッダーで動的に解決するため
 * 固定レンジの `fetchAllTabs` とは別に汎用の呼び出しが必要)からも共用する。
 */
export async function fetchSheetsValuesBatchGet(
  sheetId: string,
  ranges: string[],
  accessToken: string,
  valueRenderOption: "UNFORMATTED_VALUE" | "FORMATTED_VALUE" = "UNFORMATTED_VALUE",
): Promise<SheetValuesRow[][]> {
  const params = new URLSearchParams();
  for (const range of ranges) params.append("ranges", range);
  params.append("valueRenderOption", valueRenderOption);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}/values:batchGet?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets API の呼び出しに失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { valueRanges?: { values?: SheetValuesRow[] }[] };
  const valueRanges = json.valueRanges ?? [];
  return ranges.map((_, i) => valueRanges[i]?.values ?? []);
}

/**
 * スプレッドシート内の全タブ名を順番どおりに取得する(`adapters/marketing.ts` 専用)。
 * 集客・広告シートはタブ名の末尾に半角スペースが付いている・同名タブが複数存在する等の
 * 揺れがあるため、実際のタブ名一覧をメタデータAPIで確認したうえで trim 一致で解決する。
 */
export async function fetchSheetTabTitles(sheetId: string, accessToken: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Sheets API(タブ一覧取得)の呼び出しに失敗しました(status ${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  return (json.sheets ?? []).map((s) => s.properties?.title ?? "").filter((t) => t !== "");
}

async function fetchAllTabs(sheetId: string, accessToken: string): Promise<SheetRow[][]> {
  return fetchSheetsValuesBatchGet(sheetId, RANGES, accessToken, "UNFORMATTED_VALUE");
}

// ─────────────────────────────────────────────
// パース用ユーティリティ
// ─────────────────────────────────────────────

function cellToString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function isBlankRow(row: SheetRow): boolean {
  return row.every((cell) => cellToString(cell) === "");
}

/** ヘッダー行を除いたデータ行を、空行をスキップしつつ列挙する。row は 1始まりのシート行番号。 */
function* dataRows(rows: SheetRow[], tabName: string): Generator<{ row: SheetRow; rowNumber: number }> {
  if (rows.length === 0) {
    throw new SheetParseError(`タブ「${tabName}」が見つからないか、ヘッダー行がありません。`);
  }
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;
    yield { row, rowNumber: i + 1 };
  }
}

function requireString(row: SheetRow, index: number, field: string, tabName: string, rowNumber: number): string {
  const value = cellToString(row[index]);
  if (!value) {
    throw new SheetParseError(`タブ「${tabName}」${rowNumber}行目: 「${field}」が空です。`);
  }
  return value;
}

function optionalString(row: SheetRow, index: number): string {
  return cellToString(row[index]);
}

/** 任意列を string | undefined として読む(空欄・列自体が無い場合は undefined)。 */
function optionalStringOrUndefined(row: SheetRow, index: number): string | undefined {
  const value = cellToString(row[index]);
  return value ? value : undefined;
}

function requireNumber(row: SheetRow, index: number, field: string, tabName: string, rowNumber: number): number {
  const raw = cellToString(row[index]).replace(/,/g, "");
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「${field}」が数値として読み取れません(値: "${cellToString(row[index])}")。`,
    );
  }
  return n;
}

function optionalNumber(row: SheetRow, index: number): number | null {
  const raw = cellToString(row[index]).replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function requireDate(row: SheetRow, index: number, field: string, tabName: string, rowNumber: number): Date {
  const raw = cellToString(row[index]);
  const match = DATE_RE.exec(raw);
  if (!match) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「${field}」は YYYY-MM-DD 形式で入力してください(値: "${raw}")。列の書式は「書式なしテキスト」を推奨します。`,
    );
  }
  const [, y, mo, d] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 10, 0, 0, 0);
  if (Number.isNaN(date.getTime())) {
    throw new SheetParseError(`タブ「${tabName}」${rowNumber}行目: 「${field}」を日付として解釈できません(値: "${raw}")。`);
  }
  return date;
}

/**
 * 任意の日付列を Date | undefined として読む(空欄・列自体が無い・YYYY-MM-DD形式でない場合は undefined。
 * 求職者タブN列「登録日」・O列「面談日」用。エラーにはしない)。
 */
function optionalDateOrUndefined(row: SheetRow, index: number): Date | undefined {
  const raw = cellToString(row[index]);
  if (!raw) return undefined;
  const match = DATE_RE.exec(raw);
  if (!match) return undefined;
  const [, y, mo, d] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 10, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** 日付列の文字列(YYYY-MM-DD)をそのまま検証だけして返す(週次KPIの「週開始日」用)。 */
function requireDateString(row: SheetRow, index: number, field: string, tabName: string, rowNumber: number): string {
  const raw = cellToString(row[index]);
  if (!DATE_RE.test(raw)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「${field}」は YYYY-MM-DD 形式(月曜日)で入力してください(値: "${raw}")。`,
    );
  }
  return raw;
}

const ROLE_VALUES = ["代表", "CA", "RA"] as const;

function requireRole(row: SheetRow, index: number, tabName: string, rowNumber: number): Member["role"] {
  const raw = requireString(row, index, "役割", tabName, rowNumber);
  if (!(ROLE_VALUES as readonly string[]).includes(raw)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「役割」は ${ROLE_VALUES.join("/")} のいずれかで入力してください(値: "${raw}")。`,
    );
  }
  return raw as Member["role"];
}

function requireStage(row: SheetRow, index: number, tabName: string, rowNumber: number): Stage {
  const raw = requireString(row, index, "ステージ", tabName, rowNumber);
  if (!(ALL_STAGES as readonly string[]).includes(raw)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「ステージ」は ${ALL_STAGES.join("/")} のいずれかで入力してください(値: "${raw}")。`,
    );
  }
  return raw as Stage;
}

const PROJECT_STATUS_VALUES = ["順調", "注意", "遅延"] as const;

function requireProjectStatus(row: SheetRow, index: number, tabName: string, rowNumber: number): Project["status"] {
  const raw = requireString(row, index, "状態", tabName, rowNumber);
  if (!(PROJECT_STATUS_VALUES as readonly string[]).includes(raw)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「状態」は ${PROJECT_STATUS_VALUES.join("/")} のいずれかで入力してください(値: "${raw}")。`,
    );
  }
  return raw as Project["status"];
}

const KPI_CATEGORY_VALUES: KpiCategory[] = ["求職者", "法人"];
const ALL_KPI_KEYS: string[] = [...CANDIDATE_KPI_KEYS, ...CORPORATE_KPI_KEYS];

function requireKpiCategory(row: SheetRow, index: number, tabName: string, rowNumber: number): KpiCategory {
  const raw = requireString(row, index, "区分", tabName, rowNumber);
  if (!(KPI_CATEGORY_VALUES as string[]).includes(raw)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 「区分」は ${KPI_CATEGORY_VALUES.join("/")} のいずれかで入力してください(値: "${raw}")。`,
    );
  }
  return raw as KpiCategory;
}

function requireKpiKey(
  row: SheetRow,
  index: number,
  category: KpiCategory,
  tabName: string,
  rowNumber: number,
): CandidateKpiKey | CorporateKpiKey {
  const raw = requireString(row, index, "項目", tabName, rowNumber);
  const validKeys = category === "求職者" ? CANDIDATE_KPI_KEYS : CORPORATE_KPI_KEYS;
  if (!(validKeys as string[]).includes(raw)) {
    throw new SheetParseError(
      `タブ「${tabName}」${rowNumber}行目: 区分「${category}」の「項目」は ${validKeys.join("/")} のいずれかで入力してください(値: "${raw}")。`,
    );
  }
  return raw as CandidateKpiKey | CorporateKpiKey;
}

// ─────────────────────────────────────────────
// 各タブのパース
// ─────────────────────────────────────────────

function parseSettings(rows: SheetRow[]): Pick<Settings, "feeRate"> {
  let feeRate: number | null = null;
  for (const { row } of dataRows(rows, TAB_SETTINGS)) {
    const label = cellToString(row[0]);
    if (label === "手数料率") {
      const raw = cellToString(row[1]);
      const n = Number(raw);
      if (!raw || !Number.isFinite(n) || n <= 0 || n > 1) {
        throw new SheetParseError(
          `タブ「${TAB_SETTINGS}」: 「手数料率」は 0 より大きく 1 以下の数値(例: 0.35)で入力してください(値: "${raw}")。`,
        );
      }
      feeRate = n;
    }
  }
  if (feeRate === null) {
    throw new SheetParseError(`タブ「${TAB_SETTINGS}」に「手数料率」の行が見つかりません(A列=項目, B列=値)。`);
  }
  return { feeRate };
}

function parseMembers(rows: SheetRow[]): Member[] {
  const result: Member[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_MEMBERS)) {
    const id = requireString(row, 0, "id", TAB_MEMBERS, rowNumber);
    const name = requireString(row, 1, "氏名", TAB_MEMBERS, rowNumber);
    const role = requireRole(row, 2, TAB_MEMBERS, rowNumber);
    const specialty = optionalString(row, 3);
    result.push({ id, name, role, specialty });
  }
  return result;
}

function parseCandidates(rows: SheetRow[]): Candidate[] {
  const result: Candidate[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_CANDIDATES)) {
    const id = requireString(row, 0, "id", TAB_CANDIDATES, rowNumber);
    const name = requireString(row, 1, "氏名", TAB_CANDIDATES, rowNumber);
    const caId = requireString(row, 2, "担当CAid", TAB_CANDIDATES, rowNumber);
    const stage = requireStage(row, 3, TAB_CANDIDATES, rowNumber);
    const desiredRole = requireString(row, 4, "希望職種", TAB_CANDIDATES, rowNumber);
    const incomeMan = requireNumber(row, 5, "理論年収(万円)", TAB_CANDIDATES, rowNumber);
    const updatedAt = requireDate(row, 6, "更新日", TAB_CANDIDATES, rowNumber);
    const latestNote = optionalString(row, 7);
    // I〜M列(任意): 性別 / 年齢 / 流入経路 / 送客先 / 面接結果。
    // 列が無い・空欄でもエラーにしない(既存シート=8列のままでも動作する後方互換のため)。
    const gender = optionalStringOrUndefined(row, 8);
    const age = optionalNumber(row, 9) ?? undefined;
    const inflowChannel = optionalStringOrUndefined(row, 10);
    const referredTo = optionalStringOrUndefined(row, 11);
    const interviewResult = optionalStringOrUndefined(row, 12);
    // N列(任意): 登録日(YYYY-MM-DD)。
    // O列(任意): 面談日(YYYY-MM-DD)。送客パートナーは「面談実施で課金」のため、費用集計の
    // 月内判定は 面談日 > 登録日 > 更新日 の優先順で使う。空欄・列自体が無い場合は undefined。
    const registeredAt = optionalDateOrUndefined(row, 13);
    const interviewedAt = optionalDateOrUndefined(row, 14);
    result.push({
      id,
      name,
      caId,
      stage,
      desiredRole,
      expectedAnnualIncome: Math.round(incomeMan * 10000),
      updatedAt,
      registeredAt,
      interviewedAt,
      latestNote,
      gender,
      age,
      inflowChannel,
      referredTo,
      interviewResult,
    });
  }
  return result;
}

function parsePlacements(rows: SheetRow[], feeRate: number): Placement[] {
  const result: Placement[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_PLACEMENTS)) {
    const id = requireString(row, 0, "id", TAB_PLACEMENTS, rowNumber);
    const candidateName = requireString(row, 1, "求職者名", TAB_PLACEMENTS, rowNumber);
    const companyName = requireString(row, 2, "企業名", TAB_PLACEMENTS, rowNumber);
    const placedAt = requireDate(row, 3, "成約日", TAB_PLACEMENTS, rowNumber);
    const incomeMan = requireNumber(row, 4, "理論年収(万円)", TAB_PLACEMENTS, rowNumber);
    const feeManInput = optionalNumber(row, 5);
    const feeMan = feeManInput ?? incomeMan * feeRate;
    const caId = requireString(row, 6, "担当CAid", TAB_PLACEMENTS, rowNumber);
    result.push({
      id,
      candidateName,
      companyName,
      placedAt,
      feeAmount: Math.round(feeMan * 10000),
      caId,
    });
  }
  return result;
}

function parseProjects(rows: SheetRow[]): Project[] {
  const result: Project[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_PROJECTS)) {
    const id = requireString(row, 0, "id", TAB_PROJECTS, rowNumber);
    const name = requireString(row, 1, "名称", TAB_PROJECTS, rowNumber);
    const department = requireString(row, 2, "担当部門", TAB_PROJECTS, rowNumber);
    const owner = requireString(row, 3, "担当者", TAB_PROJECTS, rowNumber);
    const status = requireProjectStatus(row, 4, TAB_PROJECTS, rowNumber);
    const progressPercent = requireNumber(row, 5, "進捗", TAB_PROJECTS, rowNumber);
    if (progressPercent < 0 || progressPercent > 100) {
      throw new SheetParseError(
        `タブ「${TAB_PROJECTS}」${rowNumber}行目: 「進捗」は 0〜100 の数値で入力してください(値: "${progressPercent}")。`,
      );
    }
    const dueDate = requireDate(row, 6, "期日", TAB_PROJECTS, rowNumber);
    const latestComment = optionalString(row, 7);
    result.push({
      id,
      name,
      department,
      owner,
      status,
      progressPercent: Math.round(progressPercent),
      dueDate,
      latestComment,
    });
  }
  return result;
}

function parseWeeklyKpis(rows: SheetRow[]): WeeklyKpiRecord[] {
  const result: WeeklyKpiRecord[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_WEEKLY_KPI)) {
    const weekStart = requireDateString(row, 0, "週開始日", TAB_WEEKLY_KPI, rowNumber);
    const category = requireKpiCategory(row, 1, TAB_WEEKLY_KPI, rowNumber);
    const key = requireKpiKey(row, 2, category, TAB_WEEKLY_KPI, rowNumber);
    if (!ALL_KPI_KEYS.includes(key)) {
      throw new SheetParseError(`タブ「${TAB_WEEKLY_KPI}」${rowNumber}行目: 「項目」が不正です(値: "${key}")。`);
    }
    const value = requireNumber(row, 3, "値", TAB_WEEKLY_KPI, rowNumber);
    const owner = requireString(row, 4, "入力担当者", TAB_WEEKLY_KPI, rowNumber);
    result.push({ weekStart, category, key, value, owner });
  }
  return result;
}

/**
 * 任意タブ「送客単価」(A列: 経路名 / B列: 1人あたり単価(円)。1行目ヘッダー)を読み取る。
 * `RANGES`(batchGet)には含めない: タブが存在しないと batchGet 全体が失敗し、既存6タブの取得まで
 * 巻き込んでしまうため、別リクエストで取得する。タブが無い・読めない・行が空などどんな理由でも
 * 失敗時は DEFAULT_REFERRAL_RATES にフォールバックし、エラーにしない。
 */
async function fetchReferralRates(sheetId: string, accessToken: string): Promise<ReferralRate[]> {
  try {
    const [rows] = await fetchSheetsValuesBatchGet(
      sheetId,
      [`${TAB_REFERRAL_RATES}!A:B`],
      accessToken,
      "UNFORMATTED_VALUE",
    );
    if (!rows || rows.length < 2) return DEFAULT_REFERRAL_RATES;
    const result: ReferralRate[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (isBlankRow(row)) continue;
      const channel = cellToString(row[0]);
      const unitCostYen = optionalNumber(row, 1);
      if (!channel || unitCostYen === null) continue;
      result.push({ channel, unitCostYen: Math.round(unitCostYen) });
    }
    return result.length > 0 ? result : DEFAULT_REFERRAL_RATES;
  } catch {
    return DEFAULT_REFERRAL_RATES;
  }
}

interface ParsedSheetData {
  settings: Settings;
  members: Member[];
  candidates: Candidate[];
  placements: Placement[];
  projects: Project[];
  weeklyKpis: WeeklyKpiRecord[];
}

/**
 * 実連携: Google スプレッドシート連携。
 * `DATA_MODE=live` かつ `GOOGLE_SERVICE_ACCOUNT_JSON` / `SHEET_ID` が揃っている場合に使用される。
 * 6タブを1回の batchGet でまとめて取得し、インスタンス内でメモ化する
 * (getCandidates 等を複数回呼んでも Sheets API 呼び出しは1回のみ)。
 */
export class GoogleSheetsSource implements SpreadsheetSource {
  private loadingPromise: Promise<ParsedSheetData> | null = null;

  constructor(
    private readonly config: {
      serviceAccountJson?: string;
      sheetId?: string;
    } = {},
  ) {}

  private ensureLoaded(): Promise<ParsedSheetData> {
    if (!this.loadingPromise) {
      this.loadingPromise = this.load().catch((error: unknown) => {
        // 失敗時は次回呼び出しで再試行できるようキャッシュをクリアする
        this.loadingPromise = null;
        throw error;
      });
    }
    return this.loadingPromise;
  }

  private async load(): Promise<ParsedSheetData> {
    if (!this.config.sheetId) {
      throw new Error("環境変数 SHEET_ID が設定されていません。");
    }
    const accessToken = await getAccessToken(this.config.serviceAccountJson);
    const [settingsRows, memberRows, candidateRows, placementRows, projectRows, weeklyKpiRows] =
      await fetchAllTabs(this.config.sheetId, accessToken);
    // 送客単価タブは任意・別リクエスト(上記コメント参照)。失敗しても6タブの取得結果には影響しない。
    const referralRates = await fetchReferralRates(this.config.sheetId, accessToken);

    const settings: Settings = { ...parseSettings(settingsRows), referralRates };
    const members = parseMembers(memberRows);
    const candidates = parseCandidates(candidateRows);
    const placements = parsePlacements(placementRows, settings.feeRate);
    const projects = parseProjects(projectRows);
    const weeklyKpis = parseWeeklyKpis(weeklyKpiRows);

    return { settings, members, candidates, placements, projects, weeklyKpis };
  }

  async getCandidates(): Promise<Candidate[]> {
    return (await this.ensureLoaded()).candidates;
  }
  async getPlacements(): Promise<Placement[]> {
    return (await this.ensureLoaded()).placements;
  }
  async getProjects(): Promise<Project[]> {
    return (await this.ensureLoaded()).projects;
  }
  async getMembers(): Promise<Member[]> {
    return (await this.ensureLoaded()).members;
  }
  async getSettings(): Promise<Settings> {
    return (await this.ensureLoaded()).settings;
  }
  async getWeeklyKpis(): Promise<WeeklyKpiRecord[]> {
    return (await this.ensureLoaded()).weeklyKpis;
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getSpreadsheetSource(): SpreadsheetSource {
  if (process.env.DATA_MODE === "live") {
    return new GoogleSheetsSource({
      // ファイル指定(GOOGLE_SERVICE_ACCOUNT_FILE)を優先するため、ここでは undefined のまま渡し
      // トークン取得時に resolveServiceAccountRaw() で解決する
      serviceAccountJson: undefined,
      sheetId: process.env.SHEET_ID,
    });
  }
  return new DemoSpreadsheetSource();
}
