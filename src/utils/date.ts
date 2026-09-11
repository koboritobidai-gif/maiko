import type { DateRange } from '../api/uysot';

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
export function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function shortMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y.slice(2)}/${m}`;
}

/** Default range: last N whole months up to end of current month. */
export function lastMonthsRange(n: number): DateRange {
  const now = new Date();
  const start = startOfMonth(addMonths(now, -(n - 1)));
  const end = endOfMonth(now);
  return { fromDate: toISO(start), toDate: toISO(end) };
}

/** Month keys (YYYY-MM) spanning the range, inclusive. */
export function monthsInRange(range: DateRange): string[] {
  const out: string[] = [];
  const [sy, sm] = range.fromDate.split('-').map(Number);
  const [ey, em] = range.toDate.split('-').map(Number);
  let d = new Date(sy, sm - 1, 1);
  const end = new Date(ey, em - 1, 1);
  while (d <= end) {
    out.push(ymKey(d));
    d = addMonths(d, 1);
  }
  return out;
}

/** unix seconds -> YYYY-MM */
export function ymFromUnix(sec: number): string {
  const d = new Date(sec * 1000);
  return ymKey(d);
}
