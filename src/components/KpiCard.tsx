import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
  sourceBadge?: ReactNode;
}

export default function KpiCard({
  label,
  value,
  caption,
  accent,
  sourceBadge,
}: KpiCardProps) {
  return (
    <div className="card flex flex-col gap-1 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[11px] font-medium"
          style={{ color: "var(--color-text-muted)" }}
        >
          {label}
        </span>
        {sourceBadge}
      </div>
      <span
        className="text-[20px] font-bold leading-tight"
        style={{ color: accent ? "var(--color-gold)" : "var(--color-navy)" }}
      >
        {value}
      </span>
      {caption && (
        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          {caption}
        </span>
      )}
    </div>
  );
}
