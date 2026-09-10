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

export function monthLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function shortMonthLabel(iso: string): string {
  // iso: YYYY-MM
  const [y, m] = iso.split('-');
  return `${y.slice(2)}/${m}`;
}

export function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Default range: last N whole months up to end of current month. */
export function lastMonthsRange(n: number): DateRange {
  const now = new Date();
  const start = startOfMonth(addMonths(now, -(n - 1)));
  const end = endOfMonth(now);
  return { startDate: toISO(start), finishDate: toISO(end) };
}

/** List of month keys (YYYY-MM) spanning the range, inclusive. */
export function monthsInRange(range: DateRange): string[] {
  const out: string[] = [];
  const [sy, sm] = range.startDate.split('-').map(Number);
  const [ey, em] = range.finishDate.split('-').map(Number);
  let d = new Date(sy, sm - 1, 1);
  const end = new Date(ey, em - 1, 1);
  while (d <= end) {
    out.push(ymKey(d));
    d = addMonths(d, 1);
  }
  return out;
}
