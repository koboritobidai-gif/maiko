/**
 * 「入社決定の入金予定(見込み)」で、条件付き契約(例: 『未経験70万/経験者35%』)の「要確認」行を
 * アプリ上で選択して確定した内容の保存・読み込み。
 *
 * 保存先は thread-stats.ts と同じ方式で、連携シート(`process.env.SHEET_ID`)の専用タブ
 * 「アプリ保存用_入社報酬」のセルA1にJSON文字列で保存する(デプロイ・サーバー再起動をまたいでも消えない。
 * 既存の「アプリ保存用」タブには触れない)。A2セルには手で編集しないよう注記を入れる。
 *
 * 見込み報酬の決定優先順位(placement-calc.ts の applyFeeDecision):
 *   ①ここで保存した決定 > ②placement-fee-overrides.ts(コード内手動補正) > ③契約条件・年収からの自動判定
 *
 * 読み込みの失敗は console.warn して空として扱う(画面は落とさない)。書き込みの失敗は例外を投げ、
 * API(/api/placement-fee)がエラーを返して画面に伝える。
 */
import { fetchSheetsValuesBatchGet, getAccessToken } from "./adapters/spreadsheet";
import { MAX_FEE_YEN, normalizeCompanyForMatch, normalizePersonName } from "./placement-calc";
import { createSaveTab, putSheetValue } from "./thread-stats";

/** 条件付き契約の1人分の確定内容。 */
export interface PlacementFeeDecision {
  /** 氏名+企業名の正規化キー(placementDecisionKey)。 */
  key: string;
  name: string;
  company: string;
  /** rate = 年収×率、fixed = 固定額。 */
  type: "rate" | "fixed";
  /** type が rate のときの率(%。1〜100)。 */
  ratePercent?: number;
  /** type が fixed のときの確定額(円・税抜。1〜10,000,000の整数)。 */
  feeYen?: number;
  /** 選んだ選択肢の条件ラベル(例: 「事務職」「未経験」)。直接入力・ラベル無しなら undefined。 */
  label?: string;
  /** 確定日時(ISO文字列)。 */
  decidedAt: string;
}

const SAVE_TAB = "アプリ保存用_入社報酬";
const SAVE_RANGE = `${SAVE_TAB}!A1`;
const SAVE_NOTE_RANGE = `${SAVE_TAB}!A2`;
const SAVE_NOTE_TEXT = "このタブはアプリが入社報酬の確定内容を自動保存するためのものです。手で編集しないでください。";

/** 氏名+企業名の照合キー(空白・敬称・法人格の表記ゆれを除く。placement-calc.ts の正規化を再利用)。 */
export function placementDecisionKey(name: string, company: string): string {
  return `${normalizePersonName(name)}|${normalizeCompanyForMatch(company)}`;
}

// ─────────────────────────────────────────────
// 純関数(マージ・削除・検証)
// ─────────────────────────────────────────────

/** 同じ key の決定は置き換え、無ければ末尾に追加する(元の配列は変更しない)。 */
export function mergeDecision(existing: PlacementFeeDecision[], incoming: PlacementFeeDecision): PlacementFeeDecision[] {
  const replaced = existing.map((d) => (d.key === incoming.key ? incoming : d));
  return existing.some((d) => d.key === incoming.key) ? replaced : [...existing, incoming];
}

/** key 指定で決定を取り除く(=要確認に戻す)。無い key を指定しても何も起きない。 */
export function removeDecision(existing: PlacementFeeDecision[], key: string): PlacementFeeDecision[] {
  return existing.filter((d) => d.key !== key);
}

/** key → 決定 の引き当て用Map。 */
export function decisionsByKey(decisions: PlacementFeeDecision[]): Map<string, PlacementFeeDecision> {
  return new Map(decisions.map((d) => [d.key, d]));
}

function isDecision(value: unknown): value is PlacementFeeDecision {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.key !== "string" ||
    typeof v.name !== "string" ||
    typeof v.company !== "string" ||
    typeof v.decidedAt !== "string"
  ) {
    return false;
  }
  if (v.label !== undefined && typeof v.label !== "string") return false;
  if (v.type === "rate") {
    return typeof v.ratePercent === "number" && Number.isFinite(v.ratePercent) && v.ratePercent > 0 && v.ratePercent <= 100;
  }
  if (v.type === "fixed") {
    return typeof v.feeYen === "number" && Number.isInteger(v.feeYen) && v.feeYen > 0 && v.feeYen <= MAX_FEE_YEN;
  }
  return false;
}

/** A1セルの文字列を決定の配列に解釈する。空欄は空配列、JSONとして壊れていれば例外。 */
export function parseSavedDecisions(raw: unknown): PlacementFeeDecision[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const parsed: unknown = JSON.parse(raw);
  const list = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).decisions : undefined;
  if (!Array.isArray(list)) throw new Error("保存内容の形式が不正です(decisions がありません)。");
  return list.filter(isDecision);
}

// ─────────────────────────────────────────────
// シート読み書き
// ─────────────────────────────────────────────

const MEMORY_CACHE_MS = 5 * 60_000;
let memoryCache: { decisions: PlacementFeeDecision[]; expiresAt: number } | null = null;

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

/** タブからA1を読む。タブがまだ無い(400)場合は空として扱う。それ以外の失敗は例外。 */
async function fetchDecisionsFromSheet(sheetId: string, accessToken: string): Promise<PlacementFeeDecision[]> {
  let rows;
  try {
    [rows] = await fetchSheetsValuesBatchGet(sheetId, [SAVE_RANGE], accessToken, "UNFORMATTED_VALUE");
  } catch (error) {
    if (error instanceof Error && error.message.includes("status 400")) return [];
    throw error;
  }
  return parseSavedDecisions(rows?.[0]?.[0]);
}

/**
 * 保存済みの決定を読む(5分メモリキャッシュ。保存した同じインスタンスでは保存時に更新される)。
 * 失敗しても例外は投げず、空の配列と画面に出す警告文を返す。デモモードでは常に空。
 */
export async function loadPlacementDecisions(): Promise<{ decisions: PlacementFeeDecision[]; warning?: string }> {
  if (!isLiveMode()) return { decisions: [] };
  if (memoryCache && memoryCache.expiresAt > Date.now()) return { decisions: memoryCache.decisions };
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    console.warn("[placement-decisions] 環境変数 SHEET_ID が未設定のため、入社報酬の確定内容を読み込めません。");
    return { decisions: [], warning: "連携シート(SHEET_ID)が未設定のため、選択して確定した報酬を読み込めていません。" };
  }
  try {
    const accessToken = await getAccessToken(undefined);
    const decisions = await fetchDecisionsFromSheet(sheetId, accessToken);
    memoryCache = { decisions, expiresAt: Date.now() + MEMORY_CACHE_MS };
    return { decisions };
  } catch (error) {
    console.warn("[placement-decisions] 入社報酬の確定内容の読み込みに失敗しました:", error);
    return { decisions: [], warning: "選択して確定した報酬を読み込めませんでした(要確認のまま表示しています)。" };
  }
}

/** 同一インスタンス内の同時保存で、片方の更新が消えないよう直列化する。 */
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * 保存済みの決定をシートから読み直し(キャッシュは使わない)、mutate で書き換えて保存する。
 * 読み込みに失敗したときは、既存の決定を消さないよう保存せず例外にする。
 */
function updateDecisions(mutate: (current: PlacementFeeDecision[]) => PlacementFeeDecision[]): Promise<void> {
  const run = async () => {
    if (!isLiveMode()) {
      throw new Error("DATA_MODE が live ではないため、確定内容を保存できません。");
    }
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) throw new Error("環境変数 SHEET_ID が未設定のため、確定内容を保存できません。");

    const accessToken = await getAccessToken(undefined);
    const current = await fetchDecisionsFromSheet(sheetId, accessToken);
    const decisions = mutate(current);
    const json = JSON.stringify({ savedAt: new Date().toISOString(), decisions });

    let res = await putSheetValue(sheetId, SAVE_RANGE, json, accessToken);
    if (!res.ok && res.status === 400) {
      // タブ「アプリ保存用_入社報酬」がまだ無い。作成して注記を入れ、1回だけリトライする。
      await createSaveTab(sheetId, accessToken, SAVE_TAB);
      await putSheetValue(sheetId, SAVE_NOTE_RANGE, SAVE_NOTE_TEXT, accessToken).catch(() => {});
      res = await putSheetValue(sheetId, SAVE_RANGE, json, accessToken);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`入社報酬の確定内容のシート保存に失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
    }
    memoryCache = { decisions, expiresAt: Date.now() + MEMORY_CACHE_MS };
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => {});
  return result;
}

/** 決定を保存する(同じ key は上書き)。失敗時は例外。 */
export function savePlacementDecision(decision: PlacementFeeDecision): Promise<void> {
  return updateDecisions((current) => mergeDecision(current, decision));
}

/** key の決定を取り除く(=要確認に戻す)。失敗時は例外。 */
export function clearPlacementDecision(key: string): Promise<void> {
  return updateDecisions((current) => removeDecision(current, key));
}
