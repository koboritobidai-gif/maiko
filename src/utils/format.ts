// The uysot CRM works in Uzbek som (UZS). We display som with thousands
// separators and, optionally, a compact form for large sums.

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('ja-JP').format(Math.round(n));
}

export function formatSom(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '0 soʼm';
  if (opts.compact) {
    return `${formatCompact(n)} soʼm`;
  }
  return `${formatNumber(n)} soʼm`;
}

// Uzbek som amounts get very large; compact units keep KPI tiles legible.
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + ' 億';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' 百万';
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + ' 千';
  return formatNumber(n);
}

export function formatPercent(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}
