import type { ReactNode } from "react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export default function PlaceholderPage({
  title,
  description,
  icon,
}: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
          color: "var(--color-navy)",
        }}
      >
        {icon}
      </div>
      <h1 className="text-lg font-bold" style={{ color: "var(--color-navy)" }}>
        {title}
      </h1>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        {description}
      </p>
      <span
        className="mt-2 rounded-full px-3 py-1 text-[11px] font-medium"
        style={{
          background: "color-mix(in srgb, var(--color-gold) 16%, transparent)",
          color: "var(--color-gold)",
        }}
      >
        Phase 2 で実装予定
      </span>
    </div>
  );
}
