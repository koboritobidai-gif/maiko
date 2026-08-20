import PrintButton from "@/components/PrintButton";
import type { MarketingSummary } from "@/lib/metrics";

/** 月キー(YYYY-MM)を「YYYY年M月」表示に変換する。DashboardView と同じ表記。 */
function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 日付を「YYYY/MM/DD」表示にする(作成日表示用)。 */
function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/** 円額を「¥123,456」形式で表示する。 */
function formatYen(amountYen: number): string {
  return `¥${Math.round(amountYen).toLocaleString("ja-JP")}`;
}

/** 円額(単価等)を表示する。null(分母0で算出不可)は「—」。 */
function formatYenOrDash(amountYen: number | null): string {
  return amountYen === null ? "—" : formatYen(amountYen);
}

const navy = { color: "var(--color-navy)" };
const muted = { color: "var(--color-text-muted)" };
const borderColor = { borderColor: "var(--color-border)" };
/** 合計行の下地(アプリ既存のクリーム色)。数字の階層を色で分けて読みやすくするため。 */
const totalRowBg = { background: "var(--color-cream)" };

/**
 * セクション見出し(金色の縦バー付き)。全て同じ色・同じ大きさで読みにくいという経営者の
 * 指摘を受け、アプリ既存の配色(ネイビー+ゴールド)の範囲でメリハリを付ける。
 */
function SectionTitle({ children }: { children: React.ReactNode }) {
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

/** 送客パートナー(成果報酬)の対象人数合計。 */
function referralCount(mk: MarketingSummary): number {
  return mk.referralPartners.reduce((sum, r) => sum + r.count, 0);
}

/**
 * 集客・広告(送客パートナー含む)の全体まとめ。
 * - 面談実施数 = 広告・SNS経由の面談(mk.totalInterviews)+ 送客パートナー経由の面談人数
 * - 全体費用 = mk.totalCost(広告+SNS+送客の合計。既存の getMarketingSummary の定義そのまま)
 * - 面談単価(全体) = 全体費用 ÷ 面談実施数(0件なら null)
 */
function overallTotals(mk: MarketingSummary): { interviews: number; cost: number; unitCost: number | null } {
  const interviews = mk.totalInterviews + referralCount(mk);
  const cost = mk.totalCost;
  return { interviews, cost, unitCost: interviews > 0 ? cost / interviews : null };
}

/**
 * 広告(アイドマ=Google+Meta)・SNS運用(リズリアライズ)の内訳。DashboardView 集客・広告セクションの
 * 呼称・計算式(該当コメント参照)と同一。送客パートナーはここには含めない。
 */
function adSnsBreakdown(mk: MarketingSummary) {
  const google = mk.channels.find((c) => c.channel === "Google広告");
  const meta = mk.channels.find((c) => c.channel === "Meta広告");
  const idomaCost = (google?.cost ?? 0) + (meta?.cost ?? 0);
  const idomaLineRegs = (google?.lineRegs ?? 0) + (meta?.lineRegs ?? 0);
  const idomaReservations = (google?.reservations ?? 0) + (meta?.reservations ?? 0);
  const idomaInterviews = (google?.interviews ?? 0) + (meta?.interviews ?? 0);
  const idoma = {
    cost: idomaCost,
    lineRegs: idomaLineRegs,
    reservations: idomaReservations,
    interviews: idomaInterviews,
    unitCost: idomaInterviews > 0 ? idomaCost / idomaInterviews : null,
  };
  const sns = {
    cost: mk.sns.cost,
    lineRegs: mk.sns.lineRegs,
    interviews: mk.sns.interviews,
    unitCost: mk.sns.costPerInterview,
  };
  // 合計(広告Google+Meta+SNS運用)。面談・LINE登録・予約はいずれも getMarketingSummary の
  // 合計値(totalLineRegs/totalReservations/totalInterviews)と一致する(送客パートナー除く)。
  const totalCost = idoma.cost + sns.cost;
  const total = {
    cost: totalCost,
    lineRegs: mk.totalLineRegs,
    reservations: mk.totalReservations,
    interviews: mk.totalInterviews,
    unitCost: mk.totalInterviews > 0 ? totalCost / mk.totalInterviews : null,
  };
  return { idoma, sns, total };
}

/** 主要数値の比較表(1行分)。今月・先月を並べる。 */
function CompareRow({
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
      {/* 今月の数字が主役: 大きく・太く・ネイビー。先月は比較用に小さく控えめ。 */}
      <td className="py-1.5 pr-2 text-right align-top text-[14px] font-bold" style={navy}>
        {current}
      </td>
      <td className="py-1.5 text-right align-top text-[11px]" style={muted}>
        {last}
      </td>
    </tr>
  );
}

interface MarketingReportViewProps {
  /** 対象月(YYYY-MM)。 */
  monthKey: string;
  /** 対象月の集客・広告サマリ。 */
  summary: MarketingSummary;
  /** 前月の集客・広告サマリ(全体サマリー表の「先月」列用)。 */
  summaryLastMonth: MarketingSummary;
  /** レポート作成日時(表示は日付のみ)。 */
  generatedAt: Date;
}

/**
 * 全体MTG用「マーケティング報告」1枚資料。A4縦1枚に収まる密度で、
 * 全体サマリー(広告・SNS・送客パートナー合算、今月/先月比較)と、送客パートナー・広告/SNSの
 * 内訳(今月分)をまとめる。印刷(ブラウザの印刷→PDF保存)で使うため、Sidebar/Header/TabBar は
 * globals.css 側で `print:hidden` にして紙面から除外している。
 */
export default function MarketingReportView({
  monthKey,
  summary,
  summaryLastMonth,
  generatedAt,
}: MarketingReportViewProps) {
  const overall = overallTotals(summary);
  const overallLastMonth = overallTotals(summaryLastMonth);
  const { idoma, sns, total: adSnsTotal } = adSnsBreakdown(summary);
  const referralRows = summary.referralPartners.filter((r) => r.count > 0);
  const referralTotalCount = referralCount(summary);
  const referralUnitCost = referralTotalCount > 0 ? summary.referralTotalYen / referralTotalCount : null;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6 text-[12px] leading-tight print:max-w-none print:gap-3 print:px-0 print:py-0 print:text-[11px]">
      {/* ヘッダー */}
      <header className="report-section flex items-start justify-between gap-4 border-b pb-3" style={borderColor}>
        <div>
          <h1 className="text-xl font-bold" style={navy}>
            マーケティング報告
          </h1>
          <p className="mt-1 text-sm font-bold" style={{ color: "var(--color-gold)" }}>
            {formatMonthLabel(monthKey)}
          </p>
          <p className="mt-1 text-[11px]" style={muted}>
            株式会社翔び台 / 作成日 {formatDateYmd(generatedAt)}
          </p>
        </div>
        <PrintButton />
      </header>

      {/* 1. 全体サマリー(広告+SNS+送客パートナー合算、今月/先月比較) */}
      <section className="report-section">
        <div className="mb-1.5">
          <SectionTitle>全体サマリー</SectionTitle>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b" style={{ ...borderColor, color: "var(--color-text-muted)" }}>
              <th className="pb-1.5 pr-2 font-medium">指標</th>
              <th className="pb-1.5 pr-2 text-right font-medium">今月</th>
              <th className="pb-1.5 text-right font-medium">先月</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow
              label="LINE登録"
              current={`${summary.totalLineRegs.toLocaleString("ja-JP")}人`}
              last={`${summaryLastMonth.totalLineRegs.toLocaleString("ja-JP")}人`}
            />
            <CompareRow
              label="予約"
              current={`${summary.totalReservations.toLocaleString("ja-JP")}件`}
              last={`${summaryLastMonth.totalReservations.toLocaleString("ja-JP")}件`}
              caption="※送客パートナーは予約なし(いきなり面談)のため広告・SNS経由のみ"
            />
            <CompareRow
              label="面談実施数"
              current={`${overall.interviews.toLocaleString("ja-JP")}件`}
              last={`${overallLastMonth.interviews.toLocaleString("ja-JP")}件`}
            />
            <CompareRow label="全体費用" current={formatYen(overall.cost)} last={formatYen(overallLastMonth.cost)} />
            <CompareRow
              label="面談単価(全体)"
              current={formatYenOrDash(overall.unitCost)}
              last={formatYenOrDash(overallLastMonth.unitCost)}
            />
          </tbody>
        </table>
      </section>

      {/* 2-1. 送客パートナー(成果報酬・今月) */}
      <section className="report-section flex flex-col gap-1.5">
        <SectionTitle>送客パートナー({formatMonthLabel(monthKey)})</SectionTitle>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b" style={{ ...borderColor, color: "var(--color-text-muted)" }}>
              <th className="pb-1.5 pr-2 font-medium">経路</th>
              <th className="pb-1.5 pr-2 text-right font-medium">単価</th>
              <th className="pb-1.5 pr-2 text-right font-medium">面談</th>
              <th className="pb-1.5 text-right font-medium">費用</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ ...borderColor, ...totalRowBg, fontWeight: 700 }}>
              <td className="py-1.5 pl-1 pr-2 whitespace-nowrap" style={navy}>
                合計
              </td>
              <td className="py-1.5 pr-2 text-right text-[13px]" style={navy}>{formatYenOrDash(referralUnitCost)}</td>
              <td className="py-1.5 pr-2 text-right text-[13px]" style={navy}>{referralTotalCount.toLocaleString("ja-JP")}名</td>
              <td className="py-1.5 pr-1 text-right text-[13px]" style={navy}>{formatYen(summary.referralTotalYen)}</td>
            </tr>
            {referralRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-2 text-center" style={muted}>
                  今月の対象者はいません
                </td>
              </tr>
            ) : (
              referralRows.map((r) => (
                <tr key={r.channel} className="border-b" style={borderColor}>
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap" style={navy}>
                    {r.channel}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{formatYen(r.unitCostYen)}</td>
                  <td className="py-1.5 pr-2 text-right">{r.count.toLocaleString("ja-JP")}名</td>
                  <td className="py-1.5 text-right">{formatYen(r.costYen)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* 2-2. SNS広告(アイドマ広告=Google+Meta / リズリアライズ=SNS運用、今月) */}
      <section className="report-section flex flex-col gap-1.5">
        <SectionTitle>SNS広告({formatMonthLabel(monthKey)})</SectionTitle>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b" style={{ ...borderColor, color: "var(--color-text-muted)" }}>
              <th className="pb-1.5 pr-2 font-medium">区分</th>
              <th className="pb-1.5 pr-2 text-right font-medium">費用</th>
              <th className="pb-1.5 pr-2 text-right font-medium">LINE登録</th>
              <th className="pb-1.5 pr-2 text-right font-medium">予約</th>
              <th className="pb-1.5 pr-2 text-right font-medium">面談</th>
              <th className="pb-1.5 text-right font-medium">面談単価</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ ...borderColor, ...totalRowBg, fontWeight: 700 }}>
              <td className="py-1.5 pl-1 pr-2 whitespace-nowrap" style={navy}>
                合計
              </td>
              <td className="py-1.5 pr-2 text-right text-[13px]" style={navy}>{formatYen(adSnsTotal.cost)}</td>
              <td className="py-1.5 pr-2 text-right text-[13px]" style={navy}>{adSnsTotal.lineRegs.toLocaleString("ja-JP")}人</td>
              <td className="py-1.5 pr-2 text-right text-[13px]" style={navy}>{adSnsTotal.reservations.toLocaleString("ja-JP")}件</td>
              <td className="py-1.5 pr-2 text-right text-[13px]" style={navy}>{adSnsTotal.interviews.toLocaleString("ja-JP")}件</td>
              <td className="py-1.5 pr-1 text-right text-[13px]" style={navy}>{formatYenOrDash(adSnsTotal.unitCost)}</td>
            </tr>
            <tr className="border-b" style={borderColor}>
              <td className="py-1.5 pr-2 font-medium whitespace-nowrap" style={navy}>
                アイドマ広告
              </td>
              <td className="py-1.5 pr-2 text-right">{formatYen(idoma.cost)}</td>
              <td className="py-1.5 pr-2 text-right">{idoma.lineRegs.toLocaleString("ja-JP")}人</td>
              <td className="py-1.5 pr-2 text-right">{idoma.reservations.toLocaleString("ja-JP")}件</td>
              <td className="py-1.5 pr-2 text-right">{idoma.interviews.toLocaleString("ja-JP")}件</td>
              <td className="py-1.5 text-right">{formatYenOrDash(idoma.unitCost)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-2 font-medium whitespace-nowrap" style={navy}>
                リズリアライズ
              </td>
              <td className="py-1.5 pr-2 text-right">{formatYen(sns.cost)}</td>
              <td className="py-1.5 pr-2 text-right">{sns.lineRegs.toLocaleString("ja-JP")}人</td>
              <td className="py-1.5 pr-2 text-right">—</td>
              <td className="py-1.5 pr-2 text-right">{sns.interviews.toLocaleString("ja-JP")}件</td>
              <td className="py-1.5 text-right">{formatYenOrDash(sns.unitCost)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 単価の「—」表示についての注記。 */}
      <p className="text-[9px]" style={muted}>
        「—」は分母が0件などのため算出できないことを示します。
      </p>
    </div>
  );
}
