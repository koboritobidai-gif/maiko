/**
 * #求職者スレッドから集計した「面談数(主要指標)」「CA別実績」の最終確定値の保存・読み込み。
 *
 * 【unstable_cache を撤去した理由】
 * 以前はここを Next.js のデータキャッシュ(unstable_cache)に保存していたが、unstable_cache の
 * キャッシュキーはビルド(デプロイ)ごとに変わる。つまりデプロイのたびに保存内容が消える。
 * 機能追加でデプロイするたびに「最終確定値」が空へ戻り、直後のコールドスタート(#求職者スレッドの
 * 返信取得がmessenger.tsの時間予算で打ち切られ読み込みが不完全になるタイミング)と重なると、
 * フォールバック先も空のため面談数が0へ落ち込んでいた。「前にも直したのに直っていない」という
 * 経営者からの指摘はこれが原因(直した対策自体がデプロイで毎回消えていた)。
 * 対策として、保存先を Google スプレッドシート(連携シート `process.env.SHEET_ID`)の専用タブ
 * 「アプリ保存用」に変更する。デプロイ・サーバー再起動をまたいでも消えない。
 * 加えて、月ごとの面談数は「保存済みの値より減らない(常に大きい方を残す)」マージルールを設ける。
 * 経営者の運用上の前提(面談数は増えることはあっても減ることはない)を守るためで、スレッドが
 * 読み込み対象期間(messenger.ts の120日ウィンドウ)から外れて古い月の集計が自然減少する
 * ケースからも数値を守る意味がある。
 */
import { fetchSheetsValuesBatchGet, getAccessToken } from "./adapters/spreadsheet";
import { loadCandidateThreads, type CandidateThreadsResult } from "./candidate-threads";
import { getCaMonthlyStatsFromThreads, type CaMonthlyStats } from "./slack-ca-stats";
import { getSlackInterviewMonthlyCounts } from "./slack-interviews";
import type { CandidateThread } from "./types";

export interface ThreadStats {
  /** CA別×月別の実績(直近6ヶ月・今月が先頭)。 */
  caStats: CaMonthlyStats[];
  /**
   * 月別の面談実施件数(YYYY-MM → 人数)。getSlackInterviewMonthlyCounts() は Map を返すが、
   * JSON(シート保存・page.tsx への受け渡し)は Map をそのまま扱えないため、Object.fromEntries で
   * 通常のオブジェクトへ変換して保持する。読み出し側(page.tsx)で `new Map(Object.entries(...))`
   * により Map へ戻す。
   */
  interviewCountsByMonth: Record<string, number>;
}

/**
 * スレッド一覧から ThreadStats を計算する純関数。集計ロジック自体(slack-ca-stats.ts /
 * slack-interviews.ts)は変更しない。
 */
export function computeThreadStats(threads: CandidateThread[]): ThreadStats {
  return {
    caStats: getCaMonthlyStatsFromThreads(threads),
    interviewCountsByMonth: Object.fromEntries(getSlackInterviewMonthlyCounts(threads)),
  };
}

// ─────────────────────────────────────────────
// シート保存(専用タブ「アプリ保存用」セルA1にJSON文字列で保存)
// ─────────────────────────────────────────────

const SAVE_TAB = "アプリ保存用";
const SAVE_RANGE = `${SAVE_TAB}!A1`;
const SAVE_NOTE_RANGE = `${SAVE_TAB}!A2`;
const SAVE_NOTE_TEXT =
  "このタブはアプリが集計の最終確定値(面談数・CA別実績)を自動保存するためのものです。手で編集しないでください。";

interface SavedThreadStats extends ThreadStats {
  savedAt: string;
}

function isLiveMode(): boolean {
  return process.env.DATA_MODE === "live";
}

/** 5分のメモリキャッシュ(読み込み済みの保存値)。シートの読み取りクォータを消費しすぎないため。 */
const MEMORY_CACHE_MS = 5 * 60_000;
let memoryCache: { value: SavedThreadStats | null; expiresAt: number } | null = null;

function isSavedThreadStats(value: unknown): value is SavedThreadStats {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.savedAt === "string" &&
    Array.isArray(v.caStats) &&
    typeof v.interviewCountsByMonth === "object" &&
    v.interviewCountsByMonth !== null
  );
}

/**
 * 専用タブ「アプリ保存用」のA1セルから保存済みの最終確定値を読む(5分メモリキャッシュ)。
 * DATA_MODE が live でない・SHEET_ID 未設定・タブが無い・JSONとして壊れている等、
 * どんな理由でも例外を投げず null を返す(呼び出し元は「保存済みの値が無い」として扱う)。
 */
async function readSavedThreadStats(useMemoryCache: boolean): Promise<SavedThreadStats | null> {
  if (!isLiveMode()) return null;
  if (useMemoryCache && memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.value;
  }
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) return null;
  try {
    const accessToken = await getAccessToken(undefined);
    const [rows] = await fetchSheetsValuesBatchGet(sheetId, [SAVE_RANGE], accessToken, "UNFORMATTED_VALUE");
    const raw = rows?.[0]?.[0];
    let value: SavedThreadStats | null = null;
    if (typeof raw === "string" && raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isSavedThreadStats(parsed)) value = parsed;
      } catch {
        // JSONとして壊れている場合は null 扱い(下の memoryCache 保存・return で処理)。
      }
    }
    memoryCache = { value, expiresAt: Date.now() + MEMORY_CACHE_MS };
    return value;
  } catch (error) {
    console.warn("[thread-stats] 保存済みの最終確定値の読み込みに失敗しました:", error);
    return null;
  }
}

/**
 * Sheets の values.update(PUT)。company-directory.ts の書き込みパターン(PUT /values/{range})を
 * 踏襲するが、valueInputOption は USER_ENTERED ではなく RAW を使う: USER_ENTERED だとセルの中身
 * (JSON文字列。日付らしき部分文字列や数式らしき "=" 始まりを含みうる)がGoogle Sheets側で日付や
 * 数式として解釈されてしまう恐れがあるため。
 */
async function putSheetValue(sheetId: string, range: string, value: string, accessToken: string): Promise<Response> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  return fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [[value]] }),
    cache: "no-store",
  });
}

/** `spreadsheets:batchUpdate` の addSheet でタブ「アプリ保存用」を新規作成する。 */
async function createSaveTab(sheetId: string, accessToken: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SAVE_TAB } } }] }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`タブ「${SAVE_TAB}」の作成に失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
  }
}

/**
 * 最終確定値をシートへ保存する。DATA_MODE が live でない・SHEET_ID 未設定・共有権限エラー等、
 * どんな理由で失敗しても例外は投げず console.warn するだけで false を返す(画面表示は継続させる。
 * 呼び出し元はこの戻り値を待たない=画面のレスポンスをブロックしない)。
 * タブ「アプリ保存用」が無い場合(values.update が 400 で失敗)は `spreadsheets:batchUpdate` の
 * addSheet でタブを作成し、用途をA2セルに注記として書き込んでから1回だけリトライする。
 */
async function saveThreadStats(value: SavedThreadStats): Promise<boolean> {
  if (!isLiveMode()) return false;
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    console.warn("[thread-stats] 環境変数 SHEET_ID が未設定のため、最終確定値をシートへ保存できません。");
    return false;
  }
  const json = JSON.stringify(value);
  try {
    const accessToken = await getAccessToken(undefined);
    let res = await putSheetValue(sheetId, SAVE_RANGE, json, accessToken);
    if (!res.ok && res.status === 400) {
      // タブ「アプリ保存用」が存在しない可能性が高い(例: Unable to parse range)。
      // 作成してから1回だけリトライする。
      await createSaveTab(sheetId, accessToken);
      await putSheetValue(sheetId, SAVE_NOTE_RANGE, SAVE_NOTE_TEXT, accessToken).catch(() => {});
      res = await putSheetValue(sheetId, SAVE_RANGE, json, accessToken);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`最終確定値のシート保存に失敗しました(status ${res.status}): ${text.slice(0, 300)}`);
    }
    memoryCache = { value, expiresAt: Date.now() + MEMORY_CACHE_MS };
    return true;
  } catch (error) {
    console.warn("[thread-stats] 最終確定値のシート保存に失敗しました:", error);
    return false;
  }
}

// ─────────────────────────────────────────────
// マージロジック
// ─────────────────────────────────────────────

/**
 * 月ごとの面談数を max マージする(ファイル冒頭コメント参照: 経営者ルール「面談数は増えることは
 * あっても減ることはない」を守るため。かつ、スレッドが読み込み対象期間から外れて古い月の集計が
 * 自然減少するのを防ぐため)。保存済みの値と新しい値を月ごとに比較し、大きい方を残す。
 */
function mergeInterviewCountsByMonth(
  saved: Record<string, number> | undefined,
  fresh: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...fresh };
  if (saved) {
    for (const [month, savedCount] of Object.entries(saved)) {
      merged[month] = Math.max(merged[month] ?? 0, savedCount);
    }
  }
  return merged;
}

/**
 * 完全読み込みできたときの新しい集計を、保存済みの最終確定値とマージする。
 * - interviewCountsByMonth: 月ごとに max マージ(上記コメント参照)。
 * - caStats: マージしない。CA別×月別の各行は面談・面接・内定・離脱の内訳から通過率などを
 *   計算しており、値ごとに保存済みと新しい方を混ぜて max を取ると内訳と率の整合性が壊れる
 *   (例: 面談数だけ古い方が残り、内定数は新しい方が残る、といったちぐはぐな組み合わせが起こり得る)。
 *   そのため caStats は完全計算のたびに丸ごと置き換える。
 */
function mergeWithSaved(fresh: ThreadStats, saved: SavedThreadStats | null): ThreadStats {
  return {
    caStats: fresh.caStats,
    interviewCountsByMonth: mergeInterviewCountsByMonth(saved?.interviewCountsByMonth, fresh.interviewCountsByMonth),
  };
}

// ─────────────────────────────────────────────
// 公開インターフェース
// ─────────────────────────────────────────────

/**
 * CA別実績・面談数(主要指標)を、読み込みが不完全なときは保存済みの最終確定値で補いながら返す。
 * - threadsResult が live かつ完全: その場の集計を計算し、保存済みの最終確定値(メモリキャッシュ可)と
 *   interviewCountsByMonth を max マージした値を画面へ返す。合わせて裏でシートへ保存する
 *   (結果は待たず、失敗は console.warn のみで画面表示は継続する)。
 * - 不完全: 保存済みの最終確定値があればそれを返す(usedLastGood: true)。
 *   保存済みの値も無ければ(初回起動直後などで一度も完全読み込みに成功していない場合)、
 *   不完全でもゼロよりはましなのでその場の集計値を返す(こちらは保存しない)。
 * DATA_MODE が live でない(デモ)場合は内部でシート保存/読みが自動的にスキップされ、
 * 常にその場の集計を返す(従来どおりの動作)。
 */
export async function getThreadStatsWithFallback(
  threadsResult: CandidateThreadsResult,
): Promise<{ stats: ThreadStats; usedLastGood: boolean }> {
  if (threadsResult.status === "live" && !threadsResult.incomplete) {
    const fresh = computeThreadStats(threadsResult.threads);
    const saved = await readSavedThreadStats(true);
    const merged = mergeWithSaved(fresh, saved);
    void saveThreadStats({ savedAt: new Date().toISOString(), ...merged }).catch(() => {});
    return { stats: merged, usedLastGood: false };
  }
  const saved = await readSavedThreadStats(true);
  if (saved) {
    return { stats: { caStats: saved.caStats, interviewCountsByMonth: saved.interviewCountsByMonth }, usedLastGood: true };
  }
  return { stats: computeThreadStats(threadsResult.threads), usedLastGood: false };
}

/**
 * /api/warm から呼ぶ: #求職者スレッドを読み込み、完全に読み込めていれば最終確定値を
 * マージしてシートへ保存する。保存できたら true(DATA_MODE が live でない、読み込みが
 * 不完全、シート保存に失敗した等、いずれの場合も false)。
 */
export async function warmThreadStatsLastGood(): Promise<boolean> {
  const threadsResult = await loadCandidateThreads();
  if (threadsResult.status !== "live" || threadsResult.incomplete) {
    return false;
  }
  const fresh = computeThreadStats(threadsResult.threads);
  const saved = await readSavedThreadStats(true);
  const merged = mergeWithSaved(fresh, saved);
  return saveThreadStats({ savedAt: new Date().toISOString(), ...merged });
}
