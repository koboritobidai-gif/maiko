"use client";

/**
 * クリップボードコピー用の汎用ボタン。
 * 面談AI(フォローメール)・提案書(推薦状全文)の両方から利用する。
 */
import { useState } from "react";

interface CopyButtonProps {
  getText: () => string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export default function CopyButton({
  getText,
  label = "コピー",
  copiedLabel = "コピーしました",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const text = getText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard API unavailable");
      }
    } catch {
      // クリップボードAPIが使えない環境向けのフォールバック
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // 何もできない場合は無視する
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
      }
      style={
        className
          ? undefined
          : {
              background: copied
                ? "color-mix(in srgb, var(--color-good) 16%, transparent)"
                : "color-mix(in srgb, var(--color-navy) 8%, transparent)",
              color: copied ? "var(--color-good)" : "var(--color-navy)",
            }
      }
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
