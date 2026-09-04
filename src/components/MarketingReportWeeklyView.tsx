import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import {
  borderColor,
  CompareRow,
  formatDateYmd,
  formatYen,
  formatYenOrDash,
  muted,
  navy,
  SectionTitle,
  totalRowBg,
} from "@/components/marketing-report-shared";
import type { MarketingWeeklySummary } from "@/lib/metrics";

/** 週の開始日・終了日から「2026年8月24日週(8/24〜8/30)」形式のラベルを作る。 */
function formatWeekLabel(weekStart: Date, weekEnd: Date): string {
  const y = weekStart.getFullYear();
  const m1 = weekStart.getMonth() + 1;
  const d1 = weekStart.getDate();
  const m2 = weekEnd.getMonth() + 1;
  const d2 = weekEnd.getDate();
  return `${y}年${m1}月${d1}日週(${m1}/${d1}〜${m2}/${d2})`;
}

/** 送客パートナー(成果報酬)の対象人数合計。 */
function referralCount(w: MarketingWeeklySummary): number {
  return w.referralPartners.reduce((sum, r) => sum + r.count, 0);
}

/**
 * 「今週」「先週」のいずれかでSNS(リズリアライズ)週次実績が取得できない(シート未入力)場合の注記。
 * LINE登録・面談実施数は取得できた週だけSNS分を合算しているため、その旨を正直に示す。
 */
function snsAvailabilityNote(current: MarketingWeeklySummary, last: MarketingWeeklySummary): string | undefined {
  // 契約終了後(2026年9月以降)の週はそもそも実績が無いのが正常な状態のため、
  // 「シートに未入力」扱いにはしない(今週・先週で契約期間の内外が分かれるケースにも対応)。
  const missing: string[] = [];
  if (!current.sns.contractEnded && !current.sns.available) missing.push("今週");
  if (!last.sns.contractEnded && !last.sns.available) missing.push("先週");
  if (missing.length === 0) return undefined;
  return `※SNS(リズリアライズ)の週次実績が${missing.join("・")}分シートに未入力のため、広告分のみで集計しています`;
}

interface MarketingReportWeeklyViewProps {
  /** 対象週の月曜日。 */
  weekStart: Date;
  /** 対象週の日曜日。 */
  weekEnd: Date;
  /** 対象週の集客・広告サマリ。 */
  summary: MarketingWeeklySummary;
  /** 前週(その前の7日間)の集客・広告サマリ(全体サマリー表の「先週」列用)。 */
  summaryLastWeek: MarketingWeeklySummary;
  /** レポート作成日時(表示は日付のみ)。 */
  generatedAt: Date;
  /** 前週リンクの `week` クエリ値(YYYY-MM-DD、前週の月曜日)。 */
  prevWeekParam: string;
  /** 翌週リンクの `week` クエリ値(YYYY-MM-DD、翌週の月曜日)。 */
  nextWeekParam: string;
}

/**
 * 全体MTG(毎週木曜12時)用「マーケティング週次報告」1枚資料。月次版(MarketingReportView)と
 * 同じ見た目の部品(marketing-report-shared)を使い、対象週(月曜〜日曜)の実績を今週/先週で比較する。
 * 印刷(ブラウザの印刷→PDF保存)で使うため、Sidebar/Header/TabBar は globals.css 側で
 * `print:hidden` にして紙面から除外している(ページ内のナビゲーションリンクも同様に除外)。
 */
export default function MarketingReportWeeklyView({
  weekStart,
  weekEnd,
  summary,
  summaryLastWeek,
  generatedAt,
  prevWeekParam,
  nextWeekParam,
}: MarketingReportWeeklyViewProps) {
  const referralTotalCount = referralCount(summary);
  const referralRows = summary.referralPartners.filter((r) => r.count > 0);
  const referralUnitCost = referralTotalCount > 0 ? summary.referralTotalYen / referralTotalCount : null;
  const snsNote = snsAvailabilityNote(summary, summaryLastWeek);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-6 py-6 text-[13px] leading-snug print:max-w-none print:gap-2 print:px-0 print:py-0 print:text-[12px]">
      {/* 全体MTGで画面共有しながら説明する資料のため、印刷はA4横(landscape)に固定する。
          globals.css のグローバル印刷設定(A4縦・請求書/invoiceが使用)はこのページ内スタイルで
          上書きするだけで、globals.css 自体は変更しない。1ページに収まる密度で作る。 */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>

      {/* ナビゲーション(月次版へ・前週/翌週。印刷時は除外)。 */}
      <nav className="print:hidden flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={muted}>
        <Link href="/report/marketing" className="underline underline-offset-2">
          ← 月次版を見る
        </Link>
        <span aria-hidden>|</span>
        <Link href={`/report/marketing?week=${prevWeekParam}`} className="underline underline-offset-2">
          ← 前週
        </Link>
        <Link href={`/report/marketing?week=${nextWeekParam}`} className="underline underline-offset-2">
          翌週 →
        </Link>
      </nav>

      {/* ヘッダー */}
      <header className="report-section flex items-start justify-between gap-4 border-b pb-2.5" style={borderColor}>
        <div>
          <h1 className="text-[24px] font-bold" style={navy}>
            マーケティング週次報告
          </h1>
          <p className="mt-1 text-[18px] font-bold" style={{ color: "var(--color-gold)" }}>
            {formatWeekLabel(weekStart, weekEnd)}
          </p>
          <p className="mt-1 text-[12px]" style={muted}>
            株式会社翔び台 / 作成日 {formatDateYmd(generatedAt)}
          </p>
        </div>
        <PrintButton />
      </header>

      {/* 1. 全体サマリー(広告+SNS+送客パートナー合算、今週/先週比較)。最上段・全幅で大きく表示する。 */}
      <section className="report-section flex flex-col gap-1.5">
        <SectionTitle>全体サマリー</SectionTitle>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b" style={{ ...borderColor, color: "var(--color-text-muted)" }}>
              <th className="pb-2 pr-3 text-[13px] font-medium">指標</th>
              <th className="pb-2 pr-3 text-right text-[13px] font-medium">今週</th>
              <th className="pb-2 text-right text-[13px] font-medium">先週</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow
              label="LINE登録"
              current={`${(summary.totalLineRegs + referralCount(summary)).toLocaleString("ja-JP")}人`}
              last={`${(summaryLastWeek.totalLineRegs + referralCount(summaryLastWeek)).toLocaleString("ja-JP")}人`}
              caption={["※送客パートナー経由の人数を含む", snsNote].filter(Boolean).join(" ")}
            />
            <CompareRow
              label="予約"
              current={`${summary.totalReservations.toLocaleString("ja-JP")}件`}
              last={`${summaryLastWeek.totalReservations.toLocaleString("ja-JP")}件`}
              caption="※送客パートナー・SNSは予約を計測しないため広告経由のみ"
            />
            <CompareRow
              label="面談実施数"
              current={`${summary.totalInterviews.toLocaleString("ja-JP")}件`}
              last={`${summaryLastWeek.totalInterviews.toLocaleString("ja-JP")}件`}
            />
            <CompareRow
              label="週の費用"
              current={formatYen(summary.totalCost)}
              last={formatYen(summaryLastWeek.totalCost)}
            />
            <CompareRow
              label="面談単価(週)"
              current={formatYenOrDash(summary.costPerInterview)}
              last={formatYenOrDash(summaryLastWeek.costPerInterview)}
            />
          </tbody>
        </table>
        <p className="text-[11px]" style={muted}>
          ※SNS運用は月額固定のため週次費用には含めていません。
        </p>
      </section>

      {/* 2. 内訳(送客パートナー・広告)は横2段組みにして、横幅を活かす。 */}
      <div className="grid grid-cols-2 gap-6 print:gap-4">
        {/* 2-1. 送客パートナー(成果報酬・今週) */}
        <section className="report-section flex flex-col gap-1.5">
          <SectionTitle>送客パートナー(今週)</SectionTitle>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b" style={{ ...borderColor, color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">経路</th>
                <th className="pb-2 pr-2 text-right font-medium">単価</th>
                <th className="pb-2 pr-2 text-right font-medium">面談</th>
                <th className="pb-2 text-right font-medium">費用</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b" style={{ ...borderColor, ...totalRowBg, fontWeight: 700 }}>
                <td className="py-1 pl-1 pr-2 whitespace-nowrap" style={navy}>
                  合計
                </td>
                <td className="py-1 pr-2 text-right text-[14px] tabular-nums" style={navy}>{formatYenOrDash(referralUnitCost)}</td>
                <td className="py-1 pr-2 text-right text-[14px] tabular-nums" style={navy}>{referralTotalCount.toLocaleString("ja-JP")}名</td>
                <td className="py-1 pr-1 text-right text-[14px] tabular-nums" style={navy}>{formatYen(summary.referralTotalYen)}</td>
              </tr>
              {referralRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-1 text-center" style={muted}>
                    今週の対象者はいません
                  </td>
                </tr>
              ) : (
                referralRows.map((r) => (
                  <tr key={r.channel} className="border-b" style={borderColor}>
                    <td className="py-1 pr-2 font-medium whitespace-nowrap" style={navy}>
                      {r.channel}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{formatYen(r.unitCostYen)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{r.count.toLocaleString("ja-JP")}名</td>
                    <td className="py-1 text-right tabular-nums">{formatYen(r.costYen)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* 2-2. 広告内訳(アイドマ広告=Google+Meta / リズリアライズ=SNS運用、今週) */}
        <section className="report-section flex flex-col gap-1.5">
          <SectionTitle>広告内訳(今週)</SectionTitle>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b" style={{ ...borderColor, color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">区分</th>
                <th className="pb-2 pr-2 text-right font-medium">費用</th>
                <th className="pb-2 pr-2 text-right font-medium">LINE登録</th>
                <th className="pb-2 pr-2 text-right font-medium">予約</th>
                <th className="pb-2 pr-2 text-right font-medium">面談</th>
                <th className="pb-2 text-right font-medium">面談単価</th>
              </tr>
            </thead>
            <tbody>
              <tr className={summary.sns.available ? "border-b" : undefined} style={borderColor}>
                <td className="py-1 pr-2 font-medium whitespace-nowrap" style={navy}>
                  昼職キャリア広告
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatYen(summary.ad.cost)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{summary.ad.lineRegs.toLocaleString("ja-JP")}人</td>
                <td className="py-1 pr-2 text-right tabular-nums">{summary.ad.reservations.toLocaleString("ja-JP")}件</td>
                <td className="py-1 pr-2 text-right tabular-nums">{summary.ad.interviews.toLocaleString("ja-JP")}件</td>
                <td className="py-1 text-right tabular-nums">{formatYenOrDash(summary.ad.costPerInterview)}</td>
              </tr>
              {!summary.sns.contractEnded && summary.sns.available && (
                <tr>
                  <td className="py-1 pr-2 font-medium whitespace-nowrap" style={navy}>
                    リズリアライズ
                  </td>
                  {/* 費用・予約・面談単価は週次では出せない指標(月額固定費/計測なし)のため「—」。 */}
                  <td className="py-1 pr-2 text-right tabular-nums">—</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{summary.sns.lineRegs.toLocaleString("ja-JP")}人</td>
                  <td className="py-1 pr-2 text-right tabular-nums">—</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{summary.sns.interviews.toLocaleString("ja-JP")}件</td>
                  <td className="py-1 text-right tabular-nums">—</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[11px]" style={muted}>
            {summary.sns.contractEnded
              ? "※リズリアライズは2026年8月で契約終了"
              : summary.sns.available
                ? "※リズリアライズは月額固定費のため週次の費用・面談単価は算出していません。予約数も計測していません。"
                : "※リズリアライズは今週分の週次実績がシートに未入力のため掲載していません。"}
          </p>
        </section>
      </div>

      {/* 単価の「—」表示についての注記。 */}
      <p className="text-[11px]" style={muted}>
        「—」は分母が0件などのため算出できないこと、または週次では算出しない指標であることを示します。
      </p>
    </div>
  );
}
