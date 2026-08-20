"use client";

/**
 * MTG資料(マーケティング報告)の印刷ボタン。
 * `window.print()` を呼ぶだけの薄いクライアントコンポーネント。レポート本体
 * (MarketingReportView)はサーバーコンポーネントのまま保てるよう、ボタンだけを切り出している。
 * 印刷時はボタン自体を紙面に出さない(`print:hidden`)。
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold"
      style={{ background: "var(--color-navy)", color: "#ffffff" }}
    >
      PDFに保存(印刷)
    </button>
  );
}
