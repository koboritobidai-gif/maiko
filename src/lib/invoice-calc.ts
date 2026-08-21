/**
 * 請求書作成ページ(/invoice)の日付・金額計算ユーティリティ。
 * どちらも経営者確認済みの固定ルールなので、画面側では触らずここに集約する。
 *
 * - 請求日 = 入金月の1日。
 * - お支払期限 = 入金月の末日。ただし末日が土曜・日曜・日本の祝日なら、その直前の平日
 *   (土日・祝日を除く)まで繰り上げる(振込対応できない休業日を支払期限にしないための運用ルール)。
 * - 金額は売上シート上「税込」で管理されているため、税抜(単価・小計) = Math.round(税込 ÷ 1.1)、
 *   消費税 = 税込 − 税抜 の順で逆算する。税抜と消費税をそれぞれ独立に四捨五入すると
 *   「小計+消費税」がシートの税込金額と1円ズレることがあるため、必ず税込を起点に
 *   「税抜を四捨五入→消費税は差分」の順で求め、合計が常にシートの金額と一致するようにしている。
 */

export interface JpHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * 2026年・2027年の日本の祝日(内閣府発表ベース。振替休日・国民の休日を含む)。
 * 春分の日・秋分の日は国立天文台の暦要項(前年2月頃の官報)で確定するため、2028年以降の分を
 * 追加する際は最新の発表を確認してから追記すること(未追加の年はこの配列に日付が無いため、
 * 末日がその年の祝日と重なっていても土日判定のみで繰り上げ計算される点に注意)。
 */
export const JP_HOLIDAYS: JpHoliday[] = [
  // 2026年(祝日16件+振替休日1件+国民の休日1件=18件)
  { date: "2026-01-01", name: "元日" },
  { date: "2026-01-12", name: "成人の日" },
  { date: "2026-02-11", name: "建国記念の日" },
  { date: "2026-02-23", name: "天皇誕生日" },
  { date: "2026-03-20", name: "春分の日" },
  { date: "2026-04-29", name: "昭和の日" },
  { date: "2026-05-03", name: "憲法記念日" },
  { date: "2026-05-04", name: "みどりの日" },
  { date: "2026-05-05", name: "こどもの日" },
  { date: "2026-05-06", name: "振替休日(5/3憲法記念日)" },
  { date: "2026-07-20", name: "海の日" },
  { date: "2026-08-11", name: "山の日" },
  { date: "2026-09-21", name: "敬老の日" },
  { date: "2026-09-22", name: "国民の休日(敬老の日と秋分の日の間)" },
  { date: "2026-09-23", name: "秋分の日" },
  { date: "2026-10-12", name: "スポーツの日" },
  { date: "2026-11-03", name: "文化の日" },
  { date: "2026-11-23", name: "勤労感謝の日" },
  // 2027年(祝日16件+振替休日1件=17件)
  { date: "2027-01-01", name: "元日" },
  { date: "2027-01-11", name: "成人の日" },
  { date: "2027-02-11", name: "建国記念の日" },
  { date: "2027-02-23", name: "天皇誕生日" },
  { date: "2027-03-21", name: "春分の日" },
  { date: "2027-03-22", name: "振替休日(3/21春分の日)" },
  { date: "2027-04-29", name: "昭和の日" },
  { date: "2027-05-03", name: "憲法記念日" },
  { date: "2027-05-04", name: "みどりの日" },
  { date: "2027-05-05", name: "こどもの日" },
  { date: "2027-07-19", name: "海の日" },
  { date: "2027-08-11", name: "山の日" },
  { date: "2027-09-20", name: "敬老の日" },
  { date: "2027-09-23", name: "秋分の日" },
  { date: "2027-10-11", name: "スポーツの日" },
  { date: "2027-11-03", name: "文化の日" },
  { date: "2027-11-23", name: "勤労感謝の日" },
];

const HOLIDAY_SET = new Set(JP_HOLIDAYS.map((h) => h.date));

/** Date を YYYY-MM-DD (ローカル日付ベース)に変換する。 */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 土日、または JP_HOLIDAYS に載っている祝日でなければ true。 */
export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay(); // 0=日曜, 6=土曜
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAY_SET.has(toIsoDate(d));
}

/**
 * 入金月(YYYY-MM)から請求日を求める。
 * 入金月の1日を起点に、土日・祝日である間は1日ずつ後ろへ送り「その月の最初の平日」にする
 * (経営者の指示: 請求日も土日祝を避け、支払期限と同じ月の最初の平日を自動記載する)。
 */
export function getDefaultIssueDate(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  while (!isBusinessDay(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * 入金月(YYYY-MM)からお支払期限を求める。
 * 入金月の末日を起点に、土日・祝日である間は1日ずつ遡って直近の平日にする。
 */
export function getDefaultDueDate(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 0); // 翌月0日 = 当月末日
  while (!isBusinessDay(d)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** 請求日の表示形式「2026年9月1日」。 */
export function formatIssueDateLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 支払期限の表示形式「2026/9/30」。 */
export function formatDueDateLabel(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** Date を <input type="date"> 用の YYYY-MM-DD に変換する。 */
export function toDateInputValue(d: Date): string {
  return toIsoDate(d);
}

/** <input type="date"> の YYYY-MM-DD 文字列を Date に変換する(不正値は null)。 */
export function parseDateInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface InvoiceTaxBreakdown {
  /** 税込合計(売上シートの金額そのまま) */
  totalYen: number;
  /** 税抜(単価・小計) = Math.round(税込 ÷ 1.1) */
  subtotalYen: number;
  /** 消費税 = 税込 − 税抜 */
  taxYen: number;
}

/**
 * 税込金額から税抜・消費税を逆算する(経営者確認済み: 売上シートの金額は税込)。
 * 税抜 = Math.round(税込 ÷ 1.1)、消費税 = 税込 − 税抜、の順で計算する(コメントはファイル冒頭参照)。
 */
export function splitTaxIncluded(totalYen: number): InvoiceTaxBreakdown {
  const subtotalYen = Math.round(totalYen / 1.1);
  const taxYen = totalYen - subtotalYen;
  return { totalYen, subtotalYen, taxYen };
}

/** 円額を「¥123,456」形式で表示する(アプリ既存の表記に合わせる)。 */
export function formatYen(amountYen: number): string {
  return `¥${Math.round(amountYen).toLocaleString("ja-JP")}`;
}

/** 入金月(YYYY-MM)を「2026年9月末入金分」形式のラベルに変換する。 */
export function formatInflowMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}年${m}月末入金分`;
}

/** 今日の日付から入金月キー(YYYY-MM)を求める(「空白から作成」時の既定日付用)。 */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
