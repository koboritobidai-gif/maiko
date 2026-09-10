// Validated categorical palette (from the data-viz design system).
// Order is fixed and validated as a set for both light and dark surfaces —
// assign series in this order, never cycle.
export const SERIES_LIGHT = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
];

export const SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

// uysot brand accent (used for chrome only, not chart series).
export const BRAND = '#006858';

export function seriesColor(index: number, dark: boolean): string {
  const arr = dark ? SERIES_DARK : SERIES_LIGHT;
  return arr[index % arr.length];
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
