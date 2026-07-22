import type { ProjectStatus } from "@/lib/types";

const STYLES: Record<ProjectStatus, { bg: string; fg: string; border: string }> = {
  順調: {
    bg: "color-mix(in srgb, var(--color-good) 14%, transparent)",
    fg: "var(--color-good)",
    border: "color-mix(in srgb, var(--color-good) 45%, transparent)",
  },
  注意: {
    bg: "color-mix(in srgb, var(--color-warn) 16%, transparent)",
    fg: "var(--color-warn)",
    border: "color-mix(in srgb, var(--color-warn) 45%, transparent)",
  },
  遅延: {
    bg: "color-mix(in srgb, var(--color-bad) 14%, transparent)",
    fg: "var(--color-bad)",
    border: "color-mix(in srgb, var(--color-bad) 45%, transparent)",
  },
};

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  const style = STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
    >
      {status}
    </span>
  );
}
