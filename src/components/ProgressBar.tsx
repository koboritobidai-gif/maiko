interface ProgressBarProps {
  /** 0-100 の範囲(範囲外は自動でクランプ) */
  percent: number;
  color?: string;
  trackColor?: string;
  height?: number;
}

export default function ProgressBar({
  percent,
  color = "var(--color-gold)",
  trackColor = "var(--color-border)",
  height = 8,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ background: trackColor, height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped}%`, background: color }}
      />
    </div>
  );
}
