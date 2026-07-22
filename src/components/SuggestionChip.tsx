/**
 * 「AIに聞く」のサジェストチップ。タップで質問文をそのまま送信できる。
 * Phase 2-B 専用コンポーネント。
 */
interface SuggestionChipProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export default function SuggestionChip({ label, onClick, disabled }: SuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:opacity-50"
      style={{
        background: "color-mix(in srgb, var(--color-navy) 6%, transparent)",
        color: "var(--color-navy)",
        border: "1px solid var(--color-border)",
      }}
    >
      {label}
    </button>
  );
}
