/** 日付ユーティリティ。日付は "YYYY-MM-DD" 文字列で統一して扱う。 */

const TZ = "Asia/Tokyo";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日本時間での今日を "YYYY-MM-DD" で返す。 */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** "YYYY-MM-DD" を UTC 正午の Date に。時差でのずれを避けるため正午を使う。 */
function toDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

/** a から b までの日数（b - a）。 */
export function daysBetween(a: string, b: string): number {
  const diff = toDate(b).getTime() - toDate(a).getTime();
  return Math.round(diff / 86_400_000);
}

export function addDays(ymd: string, days: number): string {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO タイムスタンプから日本時間の日付部分を取り出す。 */
export function isoToYmd(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** 2026-09-10 → 9/10(木) */
export function formatShort(ymd: string | null): string {
  if (!ymd) return "未設定";
  const d = toDate(ymd);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

/** 2026-09-10 → 2026/09/10(木) */
export function formatLong(ymd: string | null): string {
  if (!ymd) return "未設定";
  const d = toDate(ymd);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}/${mm}/${dd}(${WEEKDAYS[d.getUTCDay()]})`;
}

/** 「あと3日」「2日超過」「本日」のように期限までの距離を言葉にする。 */
export function duePhrase(due: string | null, base = today()): string {
  if (!due) return "期限なし";
  const left = daysBetween(base, due);
  if (left < 0) return `${Math.abs(left)}日超過`;
  if (left === 0) return "本日期限";
  return `あと${left}日`;
}
