"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ─────────────── Button ─────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light" | "translucent";
type Size = "md" | "lg" | "icon";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[var(--shadow-float)] hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "bg-white text-ink border border-line hover:bg-brand-50 active:bg-brand-100",
  ghost: "bg-transparent text-ink-soft hover:bg-black/5",
  /** 濃い背景の上に置く白ボタン */
  light: "bg-white text-brand-700 hover:bg-white/90 active:bg-white/80",
  /** 濃い背景の上に置く半透明ボタン */
  translucent: "bg-white/15 text-white hover:bg-white/25 active:bg-white/30",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const SIZE: Record<Size, string> = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-6 text-base",
  /** 正方形のアイコンボタン */
  icon: "size-14 p-0",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors " +
  "disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-brand-600 select-none";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cx(BUTTON_BASE, VARIANT[variant], SIZE[size], className)}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      {...props}
      className={cx(BUTTON_BASE, VARIANT[variant], SIZE[size], className)}
    />
  );
}

/* ─────────────── Card ─────────────── */

export function Card({
  tone = "white",
  className,
  children,
  ...rest
}: ComponentProps<"div"> & {
  /** "none" にすると背景色を付けない（className で自由に指定するとき） */
  tone?: "white" | "none";
}) {
  return (
    <div
      {...rest}
      className={cx(
        "rounded-[var(--radius-card)] shadow-[var(--shadow-card)]",
        tone === "white" && "bg-white",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─────────────── 見出し ─────────────── */

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

/* ─────────────── 進捗リング ─────────────── */

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  children,
  trackClass = "text-white/25",
  barClass = "text-mint-400",
}: {
  /** 0〜1 */
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  trackClass?: string;
  barClass?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className={trackClass}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          strokeLinecap="round"
          className={cx(barClass, "transition-[stroke-dashoffset] duration-500")}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ─────────────── 選択カード ─────────────── */

export function OptionCard({
  selected,
  onClick,
  className,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cx(
        "relative w-full overflow-hidden rounded-2xl border-2 text-left transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        selected
          ? "border-mint-400 bg-white/18 shadow-[0_0_0_4px_rgba(52,224,192,0.18)]"
          : "border-white/25 bg-white/8 hover:bg-white/14",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────── 統計チップ ─────────────── */

export function StatChip({
  icon,
  label,
  value,
  tone = "light",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={cx(
        "flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-3",
        tone === "light" ? "bg-white/15 text-white" : "bg-brand-50 text-brand-800",
      )}
    >
      <span className={tone === "light" ? "text-mint-300" : "text-brand-600"}>{icon}</span>
      <span className="tnum text-[17px] font-bold leading-none">{value}</span>
      <span className={cx("text-[11px]", tone === "light" ? "text-white/70" : "text-ink-muted")}>
        {label}
      </span>
    </div>
  );
}

/* ─────────────── 空状態 ─────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
        {icon}
      </span>
      <p className="font-bold">{title}</p>
      <p className="max-w-[26ch] text-[13px] leading-relaxed text-ink-muted">{description}</p>
      {action}
    </div>
  );
}

/* ─────────────── トグル ─────────────── */

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2.5">
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-brand-600" />
        <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
