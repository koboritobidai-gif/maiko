import type { ReactNode } from "react";

/**
 * マーケティング報告(月次 /report/marketing・週次 /report/marketing?week=...)で共通して使う
 * 見た目の部品・書式関数。両レポートで同じデザイン(ネイビー+ゴールド)・同じ表現に揃えるため、
 * ここから import して使う(片方だけ変更して見た目がズレることを防ぐ)。
 */

export const navy = { color: "var(--color-navy)" };
export const muted = { color: "var(--color-text-muted)" };
export const borderColor = { borderColor: "var(--color-border)" };
/** 合計行の下地(アプリ既存のクリーム色)。数字の階層を色で分けて読みやすくするため。 */
export const totalRowBg = { background: "var(--color-cream)" };

/** 日付を「YYYY/MM/DD」表示にする(作成日表示用)。 */
export function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/** 円額を「¥123,456」形式で表示する。 */
export function formatYen(amountYen: number): string {
  return `¥${Math.round(amountYen).toLocaleString("ja-JP")}`;
}

/** 円額(単価等)を表示する。null(分母0で算出不可)は「—」。 */
export function formatYenOrDash(amountYen: number | null): string {
  return amountYen === null ? "—" : formatYen(amountYen);
}

/**
 * セクション見出し(金色の縦バー付き)。全て同じ色・同じ大きさで読みにくいという経営者の
 * 指摘を受け、アプリ既存の配色(ネイビー+ゴールド)の範囲でメリハリを付ける。
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[13px] font-bold" style={navy}>
      <span
        aria-hidden
        className="inline-block h-[14px] w-[3.5px] rounded-full"
        style={{ background: "var(--color-gold)" }}
      />
      {children}
    </h2>
  );
}

/** 主要数値の比較表(1行分)。当期・前期(今月/先月、今週/先週)を並べる。 */
export function CompareRow({
  label,
  current,
  last,
  caption,
}: {
  label: string;
  current: string;
  last: string;
  caption?: string;
}) {
  return (
    <tr className="border-b" style={borderColor}>
      <td className="py-1.5 pr-2 align-top font-medium" style={muted}>
        {label}
        {caption && (
          <div className="text-[9px] font-normal" style={muted}>
            {caption}
          </div>
        )}
      </td>
      {/* 当期の数字が主役: 大きく・太く・ネイビー。前期は比較用に小さく控えめ。 */}
      <td className="py-1.5 pr-2 text-right align-top text-[14px] font-bold" style={navy}>
        {current}
      </td>
      <td className="py-1.5 text-right align-top text-[11px]" style={muted}>
        {last}
      </td>
    </tr>
  );
}
