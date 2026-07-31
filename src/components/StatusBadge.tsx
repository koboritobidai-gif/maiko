import type { ProjectStatus, Stage } from "@/lib/types";

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

/** 求職者ステージ用の配色(StatusBadge と同系統。辞退はグレー扱い)。 */
const STAGE_STYLES: Record<Stage, { bg: string; fg: string; border: string }> = {
  新規登録: {
    bg: "color-mix(in srgb, var(--color-navy) 10%, transparent)",
    fg: "var(--color-navy)",
    border: "color-mix(in srgb, var(--color-navy) 35%, transparent)",
  },
  面談: {
    bg: "color-mix(in srgb, var(--color-gold) 14%, transparent)",
    fg: "var(--color-gold)",
    border: "color-mix(in srgb, var(--color-gold) 40%, transparent)",
  },
  企業提案: {
    bg: "color-mix(in srgb, var(--color-navy-light) 16%, transparent)",
    fg: "var(--color-navy-light)",
    border: "color-mix(in srgb, var(--color-navy-light) 40%, transparent)",
  },
  面接: {
    bg: "color-mix(in srgb, var(--color-warn) 16%, transparent)",
    fg: "var(--color-warn)",
    border: "color-mix(in srgb, var(--color-warn) 45%, transparent)",
  },
  内定: {
    bg: "color-mix(in srgb, var(--color-good) 14%, transparent)",
    fg: "var(--color-good)",
    border: "color-mix(in srgb, var(--color-good) 45%, transparent)",
  },
  承諾: {
    bg: "color-mix(in srgb, var(--color-good) 20%, transparent)",
    fg: "var(--color-good)",
    border: "color-mix(in srgb, var(--color-good) 50%, transparent)",
  },
  入社: {
    bg: "color-mix(in srgb, var(--color-good) 26%, transparent)",
    fg: "var(--color-good)",
    border: "color-mix(in srgb, var(--color-good) 55%, transparent)",
  },
  辞退: {
    bg: "color-mix(in srgb, var(--color-text-muted) 16%, transparent)",
    fg: "var(--color-text-muted)",
    border: "color-mix(in srgb, var(--color-text-muted) 40%, transparent)",
  },
};

export function StageBadge({ stage }: { stage: Stage }) {
  const style = STAGE_STYLES[stage];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
    >
      {stage}
    </span>
  );
}
