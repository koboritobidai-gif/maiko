/**
 * SpreadsheetSource アダプタ
 * 求職者・成約・拠点・プロジェクト・メンバー・設定のマスタデータを取得する抽象化層。
 * デモ段階は DemoSpreadsheetSource が demo-data.ts を返す。
 * 実連携は GoogleSheetsSource が Google Sheets の「設定/拠点/メンバー/求職者/成約/プロジェクト」
 * 6タブを Values API(batchGet)で読み取り、型へパースする(docs/SHEET_TEMPLATE.md 参照)。
 * googleapis 等の追加npm依存は使わず、node:crypto で RS256 JWT を組み立てて認証する。
 */
import { createSign } from "node:crypto";
import { ALL_STAGES, FEE_RATE } from "../types";
import type { Branch, Candidate, Member, Placement, Project, Settings, Stage } from "../types";
import {
  branches,
  candidates,
  members,
  placements,
  projects,
} from "../demo-data";

export interface SpreadsheetSource {
  getCandidates(): Promise<Candidate[]>;
  getPlacements(): Promise<Placement[]>;
  getBranches(): Promise<Branch[]>;
  getProjects(): Promise<Project[]>;
  getMembers(): Promise<Member[]>;
  getSettings(): Promise<Settings>;
}

/** デモ実装: demo-data.ts の内容をそのまま返す。 */
export class DemoSpreadsheetSource implements SpreadsheetSource {
  async getCandidates(): Promise<Candidate[]> {
    return candidates;
  }
  async getPlacements(): Promise<Placement[]> {
    return placements;
  }
  async getBranches(): Promise<Branch[]> {
    return branches;
  }
  async getProjects(): Promise<Project[]> {
    return projects;
  }
  async getMembers(): Promise<Member[]> {
    return members;
  }
  async getSettings(): Promise<Settings> {
    return { feeRate: FEE_RATE };
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

/** `GOOGLE_SERVICE_ACCOUNT_JSON`(鍵JSON文字列。private_key 内の改行は \n エスケープでも可)をパースする。 */
function parseServiceAccountJson(raw: string): GoogleServiceAccountKey {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON の JSON 解析に失敗しました。サービスアカウントの鍵ファイルの中身をそのまま(1行のJSON文字列として)設定してください。",
    );
  }
  const obj = json as Record<string, unknown>;
  const clientEmail = obj.client_email;
  const privateKeyRaw = obj.private_key;
  if (typeof clientEmail !== "string" || !clientEmail) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON に client_email が含まれていません。");
  }
  if (typeof privateKeyRaw !== "string" || !privateKeyRaw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON に private_key が含まれていません。");
  }
  // .env に貼り付ける際に改行が \n としてエスケープされているケースに対応する
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;
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

/** サービスアカウントの JWT を Google OAuth2 トークンエンドポイントに交換し、アクセストークンを取得する(メモリキャッシュ付き)。 */
async function getAccessToken(serviceAccountJson: string | undefined): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  if (!serviceAccountJson) {
    throw new Error("環境変数 GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません。");
  }
  const key = parseServiceAccountJson(serviceAccountJson);
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
const TAB_BRANCHES = "拠点";
const TAB_MEMBERS = "メンバー";
const TAB_CANDIDATES = "求職者";
const TAB_PLACEMENTS = "成約";
const TAB_PROJECTS = "プロジェクト";

const RANGES = [
  `${TAB_SETTINGS}!A:B`,
  `${TAB_BRANCHES}!A:C`,
  `${TAB_MEMBERS}!A:E`,
  `${TAB_CANDIDATES}!A:I`,
  `${TAB_PLACEMENTS}!A:H`,
  `${TAB_PROJECTS}!A:G`,
];

type SheetRow = unknown[];

async function fetchAllTabs(sheetId: string, accessToken: string): Promise<SheetRow[][]> {
  const params = new URLSearchParams();
  for (const range of RANGES) params.append("ranges", range);
  params.append("valueRenderOption", "UNFORMATTED_VALUE");

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
  const json = (await res.json()) as { valueRanges?: { values?: SheetRow[] }[] };
  const valueRanges = json.valueRanges ?? [];
  return RANGES.map((_, i) => valueRanges[i]?.values ?? []);
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

const ROLE_VALUES = ["CA", "RA", "管理"] as const;

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

// ─────────────────────────────────────────────
// 各タブのパース
// ─────────────────────────────────────────────

function parseSettings(rows: SheetRow[]): Settings {
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

function parseBranches(rows: SheetRow[]): Branch[] {
  const result: Branch[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_BRANCHES)) {
    const id = requireString(row, 0, "id", TAB_BRANCHES, rowNumber);
    const name = requireString(row, 1, "拠点名", TAB_BRANCHES, rowNumber);
    const targetMan = requireNumber(row, 2, "月次目標(万円)", TAB_BRANCHES, rowNumber);
    result.push({ id, name, monthlyTargetAmount: Math.round(targetMan * 10000) });
  }
  return result;
}

function parseMembers(rows: SheetRow[]): Member[] {
  const result: Member[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_MEMBERS)) {
    const id = requireString(row, 0, "id", TAB_MEMBERS, rowNumber);
    const name = requireString(row, 1, "氏名", TAB_MEMBERS, rowNumber);
    const role = requireRole(row, 2, TAB_MEMBERS, rowNumber);
    const branchId = requireString(row, 3, "拠点id", TAB_MEMBERS, rowNumber);
    const specialty = optionalString(row, 4);
    result.push({ id, name, role, branchId, specialty });
  }
  return result;
}

function parseCandidates(rows: SheetRow[]): Candidate[] {
  const result: Candidate[] = [];
  for (const { row, rowNumber } of dataRows(rows, TAB_CANDIDATES)) {
    const id = requireString(row, 0, "id", TAB_CANDIDATES, rowNumber);
    const name = requireString(row, 1, "氏名", TAB_CANDIDATES, rowNumber);
    const caId = requireString(row, 2, "担当CAid", TAB_CANDIDATES, rowNumber);
    const branchId = requireString(row, 3, "拠点id", TAB_CANDIDATES, rowNumber);
    const stage = requireStage(row, 4, TAB_CANDIDATES, rowNumber);
    const desiredRole = requireString(row, 5, "希望職種", TAB_CANDIDATES, rowNumber);
    const incomeMan = requireNumber(row, 6, "理論年収(万円)", TAB_CANDIDATES, rowNumber);
    const updatedAt = requireDate(row, 7, "更新日", TAB_CANDIDATES, rowNumber);
    const latestNote = optionalString(row, 8);
    result.push({
      id,
      name,
      caId,
      branchId,
      stage,
      desiredRole,
      expectedAnnualIncome: Math.round(incomeMan * 10000),
      updatedAt,
      latestNote,
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
    const branchId = requireString(row, 6, "拠点id", TAB_PLACEMENTS, rowNumber);
    const caId = requireString(row, 7, "担当CAid", TAB_PLACEMENTS, rowNumber);
    result.push({
      id,
      candidateName,
      companyName,
      placedAt,
      feeAmount: Math.round(feeMan * 10000),
      branchId,
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

interface ParsedSheetData {
  settings: Settings;
  branches: Branch[];
  members: Member[];
  candidates: Candidate[];
  placements: Placement[];
  projects: Project[];
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
    const [settingsRows, branchRows, memberRows, candidateRows, placementRows, projectRows] =
      await fetchAllTabs(this.config.sheetId, accessToken);

    const settings = parseSettings(settingsRows);
    const branches = parseBranches(branchRows);
    const members = parseMembers(memberRows);
    const candidates = parseCandidates(candidateRows);
    const placements = parsePlacements(placementRows, settings.feeRate);
    const projects = parseProjects(projectRows);

    return { settings, branches, members, candidates, placements, projects };
  }

  async getCandidates(): Promise<Candidate[]> {
    return (await this.ensureLoaded()).candidates;
  }
  async getPlacements(): Promise<Placement[]> {
    return (await this.ensureLoaded()).placements;
  }
  async getBranches(): Promise<Branch[]> {
    return (await this.ensureLoaded()).branches;
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
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getSpreadsheetSource(): SpreadsheetSource {
  if (process.env.DATA_MODE === "live") {
    return new GoogleSheetsSource({
      serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      sheetId: process.env.SHEET_ID,
    });
  }
  return new DemoSpreadsheetSource();
}
