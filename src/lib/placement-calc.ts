/**
 * 「入社決定の入金予定(見込み)」の計算ロジック(純関数のみ。サーバー専用の依存を一切含まないため、
 * 型だけクライアントコンポーネントからも import できる)。
 *
 * 経営者ルール:
 * - 報酬見込み = 年収×%(例: 35%なら年収の35%)、または固定額(例: 一律50万)
 * - 入金予定月 = 入社月の翌月(例: 11月入社→12月末入金)
 * - 金額は契約条件の額面(税抜)
 */
import type { PlacementFeeOverride } from "./placement-fee-overrides";
import type { RevenueRecord } from "./types";

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

/** 契約内容の解釈結果。条件が複数あるものは自動で確定させず conditional とする。 */
export type FeeTerms =
  | { kind: "rate"; ratePercent: number; text: string }
  | { kind: "fixed"; amountYen: number; text: string }
  | { kind: "conditional"; text: string; rateCandidates: number[]; fixedCandidatesYen: number[] }
  /** 数字(%・万)が読み取れない/契約内容が空。 */
  | { kind: "unknown"; text: string };

/** 労働条件通知書から読み取った年収。 */
export interface ExtractedIncome {
  annualIncomeYen: number;
  /** 抽出根拠の短い文字列(例: 「年収465万円(通知書記載)」「月給30万円×12で推定」)。 */
  basis: string;
  /** 月給×12からの推定か(年収の記載が無かった場合)。 */
  estimated: boolean;
}

/** KPI表から取り出した入社日確定者1名。 */
export interface KpiPlacement {
  name: string;
  company: string;
  /** 入社日(YYYY-MM-DD。タイムゾーンの影響を受けない文字列で保持する)。 */
  hireDate: string;
}

/** 画面に出す1人分の行(クライアントへ渡すためシリアライズ可能な値のみ)。 */
export interface PlacementForecastRow {
  id: string;
  name: string;
  company: string;
  hireDate: string;
  /** 入金予定月(YYYY-MM。入社月の翌月)。 */
  payMonth: string;
  termsKind: FeeTerms["kind"];
  /** 契約条件の原文(企業一覧シートの契約内容。企業が見つからないときは空)。 */
  termsText: string;
  /** 企業一覧シート上の企業名(KPI表の表記と異なるときの確認用。未一致なら undefined)。 */
  matchedCompany?: string;
  /** 企業一覧の「契約」列が契約済みでない(商談中等)可能性。 */
  contractUnconfirmed: boolean;
  ratePercent?: number;
  rateCandidates: number[];
  fixedCandidatesYen: number[];
  annualIncomeYen?: number;
  /** 年収の抽出根拠(未取得なら undefined)。 */
  incomeBasis?: string;
  incomeEstimated: boolean;
  /** 確定した見込み報酬(円・税抜)。確定できない行は undefined。 */
  feeYen?: number;
  /** 条件付き契約で、年収が取れている場合の「率候補ごとの金額」。 */
  rateFeeCandidates: { ratePercent: number; feeYen?: number }[];
  feeSource?: "rate" | "fixed" | "manual";
  /** 人の確認が必要か(条件付き契約・年収未取得・契約条件未登録など)。 */
  needsReview: boolean;
  reviewReason?: string;
  /** 手動補正(placement-fee-overrides.ts)を適用した場合のメモ。 */
  overrideNote?: string;
  /** Slack「#求職者」スレッドへのリンク(見つかった場合のみ)。 */
  threadUrl?: string;
  /** 売上シートに同じ求職者名が同じ入金月で載っている(=請求書手配済み。月小計に含めない)。 */
  invoiced: boolean;
}

export interface PlacementMonthGroup {
  payMonth: string;
  rows: PlacementForecastRow[];
  /** 月小計(請求書手配済みの行を除く、金額が確定している行の合計)。 */
  subtotalYen: number;
  /** 小計に含められていない行数(要確認・金額未確定。請求書手配済みは除く)。 */
  undeterminedCount: number;
  invoicedCount: number;
}

// ─────────────────────────────────────────────
// 入金予定月
// ─────────────────────────────────────────────

/** 入社日(YYYY-MM-DD)から入金予定月(入社月の翌月、YYYY-MM)を求める。例: 2026-11-09 → 2026-12。 */
export function paymentMonthOf(hireDate: string): string {
  const [y, m] = hireDate.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 「12月末入金予定」表記。 */
export function paymentMonthLabel(payMonth: string): string {
  return `${Number(payMonth.split("-")[1])}月末入金予定`;
}

/** 日本時間の今日(YYYY-MM-DD)。サーバーはUTCで動くため、日付の境目がずれないよう+9時間して求める。 */
export function todayJstKey(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD から days 日前(負なら後)の YYYY-MM-DD。 */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// 契約内容のパース
// ─────────────────────────────────────────────

/** ①②…のような項目番号(NFKCで数字に潰れる前に原文で数える)。 */
const ENUM_MARKER_RE = /[①-⑳❶-❿⓵-⓾]/g;
/** 経験の有無・職種・条件付きを示す語。1つの率/金額だけでも、条件付きとして人の確認に回す。 */
const CONDITION_WORD_RE = /未経験|経験者|経験あり|経験なし|職種|場合|但し|ただし|確約|以外|以上|以下|により異なる/;
const RATE_RE = /(?<![\d.])(\d{1,2}(?:\.\d)?)\s*%/g;
const FIXED_RE = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*万/g;

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * 企業一覧シートの契約内容(自由記述)を解釈する。
 * - 単一の%のみ → rate型(例: 「35％」「35％　分割支払い」)
 * - 単一の「N万」のみ → fixed型(例: 「一律50万」)
 * - 複数条件(未経験/経験者/職種別/①②の列挙 等) → conditional型(原文を保持し、率候補・固定額候補を両方返す)
 * - 数字が読み取れない → unknown型
 */
export function parseFeeTerms(raw: string): FeeTerms {
  const text = raw.trim();
  const markerCount = (text.match(ENUM_MARKER_RE) ?? []).length;
  // ②30％ のように項目番号が数字に潰れて「230%」にならないよう、NFKCの前に区切り文字へ置き換える。
  const normalized = text.replace(ENUM_MARKER_RE, " ").normalize("NFKC");
  const rates = uniq([...normalized.matchAll(RATE_RE)].map((m) => Number(m[1])));
  const fixed = uniq(
    [...normalized.matchAll(FIXED_RE)]
      .map((m) => Math.round(Number(m[1].replace(/,/g, "")) * 10_000))
      .filter((yen) => yen > 0),
  );
  const count = rates.length + fixed.length;
  if (count === 0) return { kind: "unknown", text };

  const isConditional = count >= 2 || markerCount >= 2 || CONDITION_WORD_RE.test(normalized);
  if (isConditional) return { kind: "conditional", text, rateCandidates: rates, fixedCandidatesYen: fixed };
  if (rates.length === 1) return { kind: "rate", ratePercent: rates[0], text };
  return { kind: "fixed", amountYen: fixed[0], text };
}

// ─────────────────────────────────────────────
// 年収の抽出(労働条件通知書のPDFテキストから)
// ─────────────────────────────────────────────

const MONEY_RE = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(万\s*円?|円)/g;
/** 年収の妥当範囲(これを外れる金額は別項目の誤検出とみなす)。 */
const ANNUAL_MIN_YEN = 1_000_000;
const ANNUAL_MAX_YEN = 30_000_000;
/** 月給の妥当範囲。 */
const MONTHLY_MIN_YEN = 100_000;
const MONTHLY_MAX_YEN = 2_000_000;
/** キーワードの後ろ何文字までを「近く(同じ行か直後)」とみなすか。 */
const NEAR_WINDOW = 70;

/** 文字列中の金額(円)を出現順にすべて返す。「465万円」「4,650,000円」の両方に対応。 */
function amountsIn(text: string): number[] {
  const amounts: number[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    amounts.push(Math.round(m[2].startsWith("万") ? n * 10_000 : n));
  }
  return amounts;
}

/** 円額を「465万円」「28.5万円」表記にする(抽出根拠の表示用)。 */
function formatManYen(yen: number): string {
  const man = yen / 10_000;
  return `${Number.isInteger(man) ? man : man.toFixed(1)}万円`;
}

/**
 * キーワード(正規表現)の近く(直後 NEAR_WINDOW 文字、別項目のラベルが出たらそこまで)にある
 * 妥当範囲内の最初の金額を返す。
 */
function findAmountNear(
  text: string,
  keyword: RegExp,
  stopLabels: RegExp,
  min: number,
  max: number,
  skipIfPrecededBy?: RegExp,
): number | undefined {
  const re = new RegExp(keyword.source, "g");
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    // 「前職年収」「希望年収」など、今回の条件ではない年収は対象外にする。
    if (skipIfPrecededBy && skipIfPrecededBy.test(text.slice(Math.max(0, start - 3), start))) continue;
    let window = text.slice(start + m[0].length, start + m[0].length + NEAR_WINDOW);
    const stop = window.search(stopLabels);
    if (stop >= 0) window = window.slice(0, stop);
    const hit = amountsIn(window).find((yen) => yen >= min && yen <= max);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * 労働条件通知書(PDFテキスト)から年収を抽出する。優先順位:
 * 1. 「想定年収/理論年収/年収」の近く(同じ行か直後)の金額
 * 2. 無ければ「月給/基本給」の金額×12(賞与が「◯ヶ月」表記でも加算しない。estimated: true)
 * 3. 取れなければ undefined
 */
export function extractAnnualIncome(rawText: string): ExtractedIncome | undefined {
  const text = rawText.normalize("NFKC").replace(/[¥￥]/g, "");
  const annualStop = /月給|基本給|月額|賞与|手当|時給|日給/;
  const skipPrefix = /前職|希望|現|前年|過去/;

  for (const keyword of [/想定年収|理論年収/, /年収/]) {
    const yen = findAmountNear(text, keyword, annualStop, ANNUAL_MIN_YEN, ANNUAL_MAX_YEN, skipPrefix);
    if (yen !== undefined) {
      return { annualIncomeYen: yen, basis: `年収${formatManYen(yen)}(通知書記載)`, estimated: false };
    }
  }

  const monthlyStop = /賞与|手当|時給|日給|年収/;
  for (const keyword of [/月給/, /基本給/, /月額/]) {
    const yen = findAmountNear(text, keyword, monthlyStop, MONTHLY_MIN_YEN, MONTHLY_MAX_YEN);
    if (yen !== undefined) {
      return {
        annualIncomeYen: yen * 12,
        basis: `月給${formatManYen(yen)}×12で推定`,
        estimated: true,
      };
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────
// 名前・企業名の照合
// ─────────────────────────────────────────────

/** 氏名の照合用正規化: 全角半角統一・空白除去・敬称(様/さん/殿)の除去。 */
export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/(?:様|さん|殿)$/, "");
}

/** 氏名が空白で姓名に分かれていればその姓。分かれていなければ undefined。 */
export function surnameOf(name: string): string | undefined {
  const tokens = name.normalize("NFKC").trim().split(/[\s　]+/);
  return tokens.length >= 2 && tokens[0] ? tokens[0] : undefined;
}

/** 企業名の照合用正規化: 法人格(株式会社等)・空白を除去し小文字化する。 */
export function normalizeCompanyForMatch(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)|\(合\)|㈱|㈲/g, "")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

/**
 * KPI表の企業名に対応する企業一覧の行を探す(法人格・空白を除いた部分一致)。
 * 完全一致を優先し、次に契約済みの企業、次に名前の近い(長さの差が小さい)ものを選ぶ。
 */
export function findCompanyMatch<T extends { companyName: string; isContracted: boolean }>(
  companyName: string,
  companies: T[],
): T | undefined {
  const target = normalizeCompanyForMatch(companyName);
  if (target.length < 2) return undefined;
  const matches = companies
    .map((c) => ({ company: c, key: normalizeCompanyForMatch(c.companyName) }))
    .filter(({ key }) => key.length >= 2 && (key.includes(target) || target.includes(key)));
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    const exactA = a.key === target ? 0 : 1;
    const exactB = b.key === target ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    const contractedA = a.company.isContracted ? 0 : 1;
    const contractedB = b.company.isContracted ? 0 : 1;
    if (contractedA !== contractedB) return contractedA - contractedB;
    return Math.abs(a.key.length - target.length) - Math.abs(b.key.length - target.length);
  });
  return matches[0].company;
}

/**
 * 氏名に対応する求職者スレッドを探す。スレッド親本文に氏名(姓+名、空白・「様」ゆれ許容)を含むものを採用し、
 * 複数あれば最近更新されたもの。見つからなければ、姓のみ一致で「候補がちょうど1件のとき」だけ採用する。
 */
export function findThreadForName<T extends { parentText: string; updatedAt: Date }>(
  name: string,
  threads: T[],
): T | undefined {
  const full = normalizePersonName(name);
  if (full.length < 2) return undefined;
  const squash = (t: T) => t.parentText.normalize("NFKC").replace(/[\s　]+/g, "");
  const exact = threads
    .filter((t) => squash(t).includes(full))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  if (exact.length > 0) return exact[0];

  const surname = surnameOf(name);
  if (!surname || surname.length < 2) return undefined;
  const bySurname = threads.filter((t) => squash(t).includes(surname));
  return bySurname.length === 1 ? bySurname[0] : undefined;
}

// ─────────────────────────────────────────────
// 行の組み立て・集計
// ─────────────────────────────────────────────

export interface BuildRowInput {
  placement: KpiPlacement;
  /** 企業一覧に該当企業が見つからなければ undefined。 */
  company?: { companyName: string; isContracted: boolean; contractTerms: string };
  /** 企業一覧自体を読めなかった(シート未共有等)。 */
  feeSheetUnavailable?: boolean;
  income?: ExtractedIncome;
  /** 年収を探したが取れなかった理由(スレッド未発見・PDF無し等)。 */
  incomeMissingReason?: string;
  override?: PlacementFeeOverride;
  threadUrl?: string;
}

const yen = (n: number) => Math.round(n);

/** 契約条件・年収・手動補正から1人分の行(見込み報酬・要確認フラグ)を組み立てる。 */
export function buildForecastRow(input: BuildRowInput): PlacementForecastRow {
  const { placement, company, override } = input;
  const terms: FeeTerms | undefined = company ? parseFeeTerms(company.contractTerms) : undefined;
  const income: ExtractedIncome | undefined =
    override?.annualIncomeYen !== undefined
      ? { annualIncomeYen: override.annualIncomeYen, basis: "手動補正の年収", estimated: false }
      : input.income;

  const row: PlacementForecastRow = {
    id: `${normalizePersonName(placement.name)}|${normalizeCompanyForMatch(placement.company)}|${placement.hireDate}`,
    name: placement.name,
    company: placement.company,
    hireDate: placement.hireDate,
    payMonth: paymentMonthOf(placement.hireDate),
    termsKind: terms?.kind ?? "unknown",
    termsText: company?.contractTerms.trim() ?? "",
    matchedCompany:
      company && normalizeCompanyForMatch(company.companyName) !== normalizeCompanyForMatch(placement.company)
        ? company.companyName
        : undefined,
    contractUnconfirmed: company ? !company.isContracted : false,
    rateCandidates: terms?.kind === "conditional" ? terms.rateCandidates : [],
    fixedCandidatesYen: terms?.kind === "conditional" ? terms.fixedCandidatesYen : [],
    annualIncomeYen: income?.annualIncomeYen,
    incomeBasis: income?.basis,
    incomeEstimated: income?.estimated ?? false,
    rateFeeCandidates: [],
    needsReview: false,
    overrideNote: override ? override.note : undefined,
    threadUrl: input.threadUrl,
    invoiced: false,
  };

  // 手動補正の見込み報酬は最優先(人が判断した確定値)。
  if (override?.feeYen !== undefined) {
    row.feeYen = yen(override.feeYen);
    row.feeSource = "manual";
    return row;
  }

  if (!terms) {
    row.needsReview = true;
    row.reviewReason = input.feeSheetUnavailable
      ? "企業一覧シートを読み込めませんでした"
      : "企業一覧シートに該当企業が見つかりません";
    return row;
  }

  if (terms.kind === "fixed") {
    row.feeYen = yen(terms.amountYen);
    row.feeSource = "fixed";
    return row;
  }

  if (terms.kind === "rate") {
    row.ratePercent = terms.ratePercent;
    if (income) {
      row.feeYen = yen((income.annualIncomeYen * terms.ratePercent) / 100);
      row.feeSource = "rate";
    } else {
      row.needsReview = true;
      row.reviewReason = input.incomeMissingReason ?? "年収を取得できません";
    }
    return row;
  }

  if (terms.kind === "conditional") {
    row.needsReview = true;
    row.reviewReason = "契約条件が複数あるため自動では確定できません";
    row.rateFeeCandidates = terms.rateCandidates.map((ratePercent) => ({
      ratePercent,
      feeYen: income ? yen((income.annualIncomeYen * ratePercent) / 100) : undefined,
    }));
    return row;
  }

  row.needsReview = true;
  row.reviewReason = "契約内容から報酬条件(%・金額)を読み取れません";
  return row;
}

/**
 * 売上シート(送客売上)に同じ求職者名が同じ入金月で載っている行を「請求書手配済み」とする
 * (二重に期待しないよう、月小計には含めない)。氏名は空白・「様」を除いて照合する。
 */
export function markInvoicedPlacements(
  rows: PlacementForecastRow[],
  revenueRecords: Pick<RevenueRecord, "month" | "candidateName">[],
): PlacementForecastRow[] {
  const invoiced = new Set<string>();
  for (const r of revenueRecords) {
    if (!r.candidateName) continue;
    invoiced.add(`${r.month}|${normalizePersonName(r.candidateName)}`);
  }
  return rows.map((row) => ({
    ...row,
    invoiced: invoiced.has(`${row.payMonth}|${normalizePersonName(row.name)}`),
  }));
}

/** 入金予定月ごとにグループ化し、月小計を求める(入金月の昇順、月内は入社日順)。 */
export function groupPlacementsByMonth(rows: PlacementForecastRow[]): PlacementMonthGroup[] {
  const byMonth = new Map<string, PlacementForecastRow[]>();
  for (const row of rows) {
    byMonth.set(row.payMonth, [...(byMonth.get(row.payMonth) ?? []), row]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([payMonth, monthRows]) => {
      const sorted = [...monthRows].sort((a, b) =>
        a.hireDate === b.hireDate ? a.name.localeCompare(b.name, "ja") : a.hireDate < b.hireDate ? -1 : 1,
      );
      const counted = sorted.filter((r) => !r.invoiced);
      return {
        payMonth,
        rows: sorted,
        subtotalYen: counted.reduce((sum, r) => sum + (r.feeYen ?? 0), 0),
        undeterminedCount: counted.filter((r) => r.feeYen === undefined).length,
        invoicedCount: sorted.length - counted.length,
      };
    });
}
