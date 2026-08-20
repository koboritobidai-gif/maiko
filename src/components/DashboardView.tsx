"use client";

import { useState, type ReactNode } from "react";
import KpiCard from "@/components/KpiCard";
import ProgressBar from "@/components/ProgressBar";
import SourceBadge from "@/components/SourceBadge";
import { getCandidatesByCa, getInvoiceMonthlyTotals, getReferralProfit } from "@/lib/metrics";
import type {
  DashboardSummary,
  InvoiceCheckRow,
  MarketingSummary,
  PrimaryMonthSnapshot,
  RevenueMonthSummary,
} from "@/lib/metrics";
import type { SalesMonthlyStats } from "@/lib/sales-stats";
import type { CaMonthlyStats } from "@/lib/slack-ca-stats";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { Candidate, SourceStatus } from "@/lib/types";
import { getRoleProfile, useSession } from "@/store/session";

/** 週開始日(YYYY-MM-DD)を「M/D週」表示に変換する。 */
function formatWeekLabel(weekStart: string): string {
  const [, m, d] = weekStart.split("-").map(Number);
  return `${m}/${d}週`;
}

/** 月キー(YYYY-MM)を「YYYY年M月」表示に変換する。 */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 前月比の差分を「+n」「-n」「±0」の形式で表す(先月表示時は先々月との比較になるため「前月比」表記)。 */
function formatDiff(diff: number, unit = ""): string {
  const rounded = Math.round(diff);
  if (rounded > 0) return `前月比 +${rounded}${unit}`;
  if (rounded < 0) return `前月比 ${rounded}${unit}`;
  return "前月比 ±0";
}

function diffColor(diff: number): string {
  if (diff > 0) return "var(--color-good)";
  if (diff < 0) return "var(--color-bad)";
  return "var(--color-text-muted)";
}

/** KPIカードの下に小さく表示する先月比バッジ。 */
function DiffCaption({ diff, unit }: { diff: number; unit?: string }) {
  return (
    <span className="text-[11px] font-medium" style={{ color: diffColor(diff) }}>
      {formatDiff(diff, unit)}
    </span>
  );
}

type Period = "this" | "last";

/** セクション見出し横の「直近6ヶ月」月選択チップ(スマホは横スクロール)。 */
function MonthChips({
  months,
  value,
  onChange,
}: {
  months: { monthKey: string; label: string }[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex max-w-[70vw] gap-1 overflow-x-auto lg:max-w-none">
      {months.map((m, i) => (
        <button
          key={m.monthKey}
          type="button"
          onClick={() => onChange(i)}
          className="whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={
            i === value
              ? { background: "var(--color-navy)", color: "#ffffff", borderColor: "var(--color-navy)" }
              : {
                  background: "var(--color-card)",
                  color: "var(--color-text-muted)",
                  borderColor: "var(--color-border)",
                }
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** 月キー(YYYY-MM)の前月キーを返す。 */
function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 2, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 月キー(YYYY-MM)を「M月」の短い表示にする。 */
function shortMonthLabel(monthKey: string): string {
  return `${Number(monthKey.split("-")[1])}月`;
}

/** セクション見出し横の「今月/先月」切り替えトグル。 */
function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div
      className="flex overflow-hidden rounded-full border text-[11px]"
      style={{ borderColor: "var(--color-border)" }}
    >
      {(
        [
          ["this", "今月"],
          ["last", "先月"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="px-2.5 py-1 font-medium"
          style={
            period === key
              ? { background: "var(--color-navy)", color: "#ffffff" }
              : { background: "var(--color-card)", color: "var(--color-text-muted)" }
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 求職者・法人ファネル共通の横棒行。diff を渡すと前月比バッジを下段に表示する。 */
function FunnelRow({
  label,
  value,
  maxValue,
  unit = "",
  sub,
  diff,
}: {
  label: string;
  value: number;
  maxValue: number;
  unit?: string;
  sub?: string;
  /** 前月比(選択月 − その前月)。undefined なら非表示 */
  diff?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <span className="w-[104px] shrink-0 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
        <div className="flex-1">
          <ProgressBar
            percent={maxValue > 0 ? (value / maxValue) * 100 : 0}
            color="var(--color-navy)"
            trackColor="var(--color-border)"
            height={10}
          />
        </div>
        <span className="w-[52px] shrink-0 text-right text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
          {value.toLocaleString("ja-JP")}
          {unit}
        </span>
      </div>
      {(sub || diff !== undefined) && (
        <span className="flex flex-wrap gap-x-2 pl-[112px] text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          {diff !== undefined && <DiffCaption diff={diff} unit={unit} />}
          {sub}
        </span>
      )}
    </div>
  );
}

function RateBadge({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: "color-mix(in srgb, var(--color-gold) 14%, transparent)",
        color: "var(--color-gold)",
      }}
    >
      {label} {value.toFixed(1)}%
    </span>
  );
}

/** 円額を「¥123,456」形式で表示する。 */
function formatYen(amountYen: number): string {
  return `¥${Math.round(amountYen).toLocaleString("ja-JP")}`;
}

/** 率(%)を表示する。null(分母0で算出不可)は「—」。 */
function formatPercentOrDash(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

/** 円額(単価等)を表示する。null(分母0で算出不可)は「—」。 */
function formatYenOrDash(amountYen: number | null): string {
  return amountYen === null ? "—" : formatYen(amountYen);
}

/** デフォルト非表示の折りたたみ。ヘッダーの「＋/−」ボタンで開閉する。 */
function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold" style={{ color: "var(--color-navy)" }}>
          {title}
        </span>
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-base leading-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-navy)" }}
        >
          {open ? "−" : "＋"}
        </span>
      </button>
      {open ? <div className="mt-3 overflow-x-auto">{children}</div> : null}
    </div>
  );
}

interface DashboardViewProps {
  summary: DashboardSummary;
  /** 先月分のサマリ(ファネルの「先月」トグル用)。 */
  summaryLastMonth: DashboardSummary;
  /** 先々月分のサマリ(ファネルを「先月」表示にしたときの前月比の比較対象)。 */
  summaryTwoMonthsAgo: DashboardSummary;
  candidates: Candidate[];
  sourceStatus: SourceStatus;
  sourceErrorMessage?: string;
  slackStatus: SourceStatus;
  slackErrorMessage?: string;
  /** 集客・広告セクションの月選択用サマリ(直近6ヶ月、今月が先頭)。 */
  marketingMonths: { monthKey: string; label: string; summary: MarketingSummary }[];
  marketingStatus: SourceStatus;
  marketingErrorMessage?: string;
  /** 送客パートナー請求書(Slack「#請求書」)の自動照合結果。 */
  invoiceChecks: InvoiceCheckRow[];
  /** 直近15件の上限を超えたため点検対象外にしたPDFの件数。 */
  invoiceSkippedCount: number;
  invoiceStatus: SourceStatus;
  invoiceErrorMessage?: string;
  /** 送客売上(翔び台が紹介先企業から貰う金額)の今月・先月まとめ。 */
  revenueSummary: { thisMonth: RevenueMonthSummary; lastMonth: RevenueMonthSummary };
  revenueStatus: SourceStatus;
  revenueErrorMessage?: string;
  /** 主要指標セクションの月選択用スナップショット(直近6ヶ月、今月が先頭)。 */
  primaryMonths: PrimaryMonthSnapshot[];
  /** CA別の月次実績(#求職者スレッドから自動集計。直近6ヶ月、今月が先頭)。 */
  caStats: CaMonthlyStats[];
  /** 営業実績(#21_ra・#22_アポイント報告から自動集計。直近6ヶ月、今月が先頭)。 */
  salesStats: SalesMonthlyStats[];
  salesStatus: SourceStatus;
  salesErrorMessage?: string;
}

export default function DashboardView({
  summary,
  summaryLastMonth,
  summaryTwoMonthsAgo,
  candidates,
  sourceStatus,
  sourceErrorMessage,
  slackStatus,
  marketingMonths,
  marketingStatus,
  marketingErrorMessage,
  invoiceChecks,
  invoiceSkippedCount,
  invoiceStatus,
  invoiceErrorMessage,
  revenueSummary,
  revenueStatus,
  revenueErrorMessage,
  primaryMonths,
  caStats,
  salesStats,
  salesStatus,
  salesErrorMessage,
}: DashboardViewProps) {
  const { role } = useSession();
  // 主要指標・集客/広告・CA別実績・営業実績は直近6ヶ月から月を選択、送客売上・各ファネルは今月⇄先月を切り替えられる。
  const [primaryMonthIdx, setPrimaryMonthIdx] = useState(0);
  const [marketingMonthIdx, setMarketingMonthIdx] = useState(0);
  const [caMonthIdx, setCaMonthIdx] = useState(0);
  const [salesMonthIdx, setSalesMonthIdx] = useState(0);
  const [revenuePeriod, setRevenuePeriod] = useState<Period>("this");
  const [candidateFunnelPeriod, setCandidateFunnelPeriod] = useState<Period>("this");
  const [corporateFunnelPeriod, setCorporateFunnelPeriod] = useState<Period>("this");
  // カテゴリタブ(全体/マーケティング/CA/RA)。データ再取得は行わず、表示するセクションだけを切り替える。
  const [group, setGroup] = useState<"全体" | "マーケティング" | "CA" | "RA">("全体");
  if (!role) return null;

  const profile = getRoleProfile(role);
  const sheetsBadge = sourceBadgeLabel("sheets", sourceStatus);
  const slackBadge = sourceBadgeLabel("slack", slackStatus);
  const marketingBadge = sourceBadgeLabel("marketing", marketingStatus);
  const invoiceBadge = sourceBadgeLabel("invoices", invoiceStatus);
  const salesBadge = sourceBadgeLabel("sales", salesStatus);
  // 請求書が1件も無く、かつ機能未設定(demo=SLACK_INVOICE_CHANNEL未設定 or デモモード)の場合は
  // カード自体を非表示にする(機能OFF扱い。デモモードでは常にデモ請求書が入るため表示される)。
  const showInvoiceCard = invoiceChecks.length > 0 || invoiceStatus !== "demo";
  // 月ごとの支出合計(新しい月順)。
  const invoiceMonthlyTotals = getInvoiceMonthlyTotals(invoiceChecks.map((row) => row.invoice));
  // 金額を読み取れなかった請求書の一覧(理由と一緒に表示する。多すぎる場合は5件まで)。
  const unreadableInvoices = invoiceChecks
    .map((row) => row.invoice)
    .filter((inv) => inv.amountYen === undefined);
  const unreadableInvoicesShown = unreadableInvoices.slice(0, 5);
  const revenueBadge = sourceBadgeLabel("revenue", revenueStatus);
  // 送客売上が1件も無く、かつ機能未設定(demo=REVENUE_SHEET_ID未設定 or デモモード)の場合は
  // セクション自体を非表示にする(請求書チェックと同じ「機能OFF」扱い)。
  const showRevenueSection =
    revenueSummary.thisMonth.records.length > 0 || revenueSummary.lastMonth.records.length > 0 || revenueStatus !== "demo";
  // 送客売上セクションの表示対象(今月/先月トグルで切替)。対応する送客パートナー費用(単価マスタ)は
  // 今月なら marketingSummary、先月なら marketingSummaryLastMonth の referralPartners を使う。
  const rv = revenuePeriod === "this" ? revenueSummary.thisMonth : revenueSummary.lastMonth;
  // 主要指標セクションの表示対象月(直近6ヶ月から選択)。お金の出入り(入=送客売上/
  // 出=広告+SNS+送客費用+その他の支払い)も選択月に連動する。
  const pm = primaryMonths[primaryMonthIdx] ?? primaryMonths[0];
  const moneyInYen = pm.moneyInYen;
  const moneyOutYen = pm.moneyOutYen;
  const moneyNetYen = moneyInYen - moneyOutYen;
  const rvReferralPartners = (revenuePeriod === "this" ? marketingMonths[0] : marketingMonths[1]).summary
    .referralPartners;
  const referralProfit = getReferralProfit(rv, rvReferralPartners);
  const REVENUE_DETAIL_LIMIT = 10;
  const revenueDetailRows = rv.records.slice(0, REVENUE_DETAIL_LIMIT);
  const revenueDetailHiddenCount = rv.records.length - revenueDetailRows.length;
  // 集客・広告セクションの表示対象(直近6ヶ月から月選択)。送客パートナー表の2組の列は
  // 「選択月/その前月」になる(サマリは前月分も内包している)。
  const mkEntry = marketingMonths[marketingMonthIdx] ?? marketingMonths[0];
  const mk = mkEntry.summary;
  const mkPeriodLabels: [string, string] = [
    shortMonthLabel(mkEntry.monthKey),
    shortMonthLabel(prevMonthKey(mkEntry.monthKey)),
  ];
  const googleAd = mk.channels.find((c) => c.channel === "Google広告");
  const metaAd = mk.channels.find((c) => c.channel === "Meta広告");
  const { transitionRates } = mk;

  // ca ロール(佐藤CA)は自分の担当求職者数を先頭に見せる。
  const isCa = role === "ca";
  const myCandidates = isCa ? getCandidatesByCa(candidates, profile.memberId) : [];
  const myActiveCandidates = myCandidates.filter((c) => c.stage !== "辞退");

  const { weeklyTrend } = summary;
  // 主要指標カードは選択月のスナップショット、各ファネルは今月/先月トグルで切替。
  const primary = pm.primary;
  const candidateFunnel =
    candidateFunnelPeriod === "this" ? summary.candidateFunnel : summaryLastMonth.candidateFunnel;
  const corporateFunnel =
    corporateFunnelPeriod === "this" ? summary.corporateFunnel : summaryLastMonth.corporateFunnel;
  // 営業ファネルの前月比の比較対象(今月表示→先月、先月表示→先々月)。
  const corporateFunnelPrev =
    corporateFunnelPeriod === "this" ? summaryLastMonth.corporateFunnel : summaryTwoMonthsAgo.corporateFunnel;
  // PV数の行は非表示のため、横棒の基準はLINE登録数(表示中の最大値)とする。
  const candidateFunnelMax = Math.max(1, candidateFunnel.lineRegistrations);
  const corporateFunnelMax = Math.max(
    1,
    corporateFunnel.businessCards,
    corporateFunnel.appointments.total,
    corporateFunnel.meetings.total,
  );

  // CA別実績セクションの月選択(直近6ヶ月)。primaryMonths と同じ月範囲・基準日で計算されているため、
  // 見出し用のラベル(「今月(8月)」「7月」形式)はそのまま再利用する。
  const caMonths = caStats.map((s, i) => ({
    monthKey: s.monthKey,
    label: primaryMonths[i]?.label ?? formatMonthLabel(s.monthKey),
  }));
  const caMonth = caStats[caMonthIdx] ?? caStats[0];
  const caRows = caMonth?.rows ?? [];
  const caTotal = caRows.reduce(
    (sum, r) => ({
      interviews: sum.interviews + r.interviews,
      advancedToInterview: sum.advancedToInterview + r.advancedToInterview,
      interviewEventCount: sum.interviewEventCount + r.interviewEventCount,
      offers: sum.offers + r.offers,
      withdrawn: sum.withdrawn + r.withdrawn,
    }),
    { interviews: 0, advancedToInterview: 0, interviewEventCount: 0, offers: 0, withdrawn: 0 },
  );
  const caTotalAdvanceRatePercent = caTotal.interviews > 0 ? (caTotal.advancedToInterview / caTotal.interviews) * 100 : null;
  const caTotalOfferRatePercent = caTotal.interviews > 0 ? (caTotal.offers / caTotal.interviews) * 100 : null;
  const caTotalWithdrawnRatePercent = caTotal.interviews > 0 ? (caTotal.withdrawn / caTotal.interviews) * 100 : null;

  // 営業実績セクションの月選択(直近6ヶ月)。primaryMonths と同じ月範囲・基準日で計算されているため、
  // 見出し用のラベル(「今月(8月)」「7月」形式)はそのまま再利用する。
  const salesMonths = salesStats.map((s, i) => ({
    monthKey: s.monthKey,
    label: primaryMonths[i]?.label ?? formatMonthLabel(s.monthKey),
  }));
  const salesMonth = salesStats[salesMonthIdx] ?? salesStats[0];
  const salesRows = salesMonth?.rows ?? [];
  const salesTotal = salesRows.reduce(
    (sum, r) => ({
      calls: sum.calls + r.calls,
      mails: sum.mails + r.mails,
      lineCount: sum.lineCount + r.lineCount,
      connects: sum.connects + r.connects,
      received: sum.received + r.received,
      appointments: sum.appointments + r.appointments,
      meetings: sum.meetings + r.meetings,
      contracts: sum.contracts + r.contracts,
    }),
    { calls: 0, mails: 0, lineCount: 0, connects: 0, received: 0, appointments: 0, meetings: 0, contracts: 0 },
  );
  // メール/LINE/本通/受電の列は、その月の報告に1件でも数字があるときだけ表示する(空列で表を広げない)。
  const salesOptionalCols = [
    { key: "mails" as const, label: "メール", show: salesTotal.mails > 0 },
    { key: "lineCount" as const, label: "LINE", show: salesTotal.lineCount > 0 },
    { key: "connects" as const, label: "本通", show: salesTotal.connects > 0 },
    { key: "received" as const, label: "受電", show: salesTotal.received > 0 },
  ].filter((c) => c.show);
  // 全月0件(=live未導入)ならセクション自体を非表示にする(請求書チェック等と同じパターン)。
  const showSalesSection = salesStats.some((s) => s.rows.length > 0) || salesStatus !== "demo";

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-8 pt-4 lg:gap-8 lg:px-8 lg:pb-12 lg:pt-6">
      {isCa && (
        <div
          className="card flex items-center justify-between p-3.5"
          style={{ borderColor: "var(--color-gold)" }}
        >
          <div>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              あなたの担当求職者(佐藤CA)
            </p>
            <p className="mt-0.5 text-lg font-bold" style={{ color: "var(--color-navy)" }}>
              {myActiveCandidates.length}名
            </p>
          </div>
          <SourceBadge label={sheetsBadge} />
        </div>
      )}

      {/* カテゴリタブ: 全体/マーケティング/CA/RA でセクション表示を絞り込む(データ再取得なし)。 */}
      <div className="flex flex-wrap gap-1.5">
        {(["全体", "マーケティング", "CA", "RA"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold"
            style={
              group === g
                ? { background: "var(--color-navy)", color: "#ffffff", borderColor: "var(--color-navy)" }
                : {
                    background: "var(--color-card)",
                    color: "var(--color-text-muted)",
                    borderColor: "var(--color-border)",
                  }
            }
          >
            {g}
          </button>
        ))}
      </div>

      {/* 1. 主要指標(直近6ヶ月の月選択)【全体】 */}
      {group === "全体" && (
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            主要指標({formatMonthLabel(pm.monthKey)})
          </h2>
          <div className="flex items-center gap-2">
            <MonthChips months={primaryMonths} value={primaryMonthIdx} onChange={setPrimaryMonthIdx} />
            <SourceBadge label={sheetsBadge} />
          </div>
        </div>
        {sourceStatus === "live-error" && sourceErrorMessage && (
          <p
            className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              color: "var(--color-bad)",
              borderColor: "var(--color-bad)",
              background: "var(--color-card)",
            }}
          >
            接続エラーの内容: {sourceErrorMessage}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
          <KpiCard
            label="面談数"
            value={`${primary.interviews.value}件`}
            caption={<DiffCaption diff={primary.interviews.diff} unit="件" />}
            accent
          />
          <KpiCard
            label="内定者数"
            value={`${primary.offers.value}名`}
            caption={<DiffCaption diff={primary.offers.diff} unit="名" />}
            accent
          />
          <KpiCard
            label="採用決定"
            value={`${primary.candidatePlacements.value}名`}
            caption={<DiffCaption diff={primary.candidatePlacements.diff} unit="名" />}
          />
          {/* 経営者の要望により、「成功報酬」は週次KPIの法人契約金額ではなく
              翔び台請求書関係シート(売上シート)の入金月合計を表示する(未連携時は案内を表示)。 */}
          <KpiCard
            label="成功報酬"
            value={formatYen(moneyInYen)}
            caption={
              showRevenueSection
                ? `${shortMonthLabel(pm.monthKey)}末入金分`
                : "未連携: Vercelに REVENUE_SHEET_ID を設定すると表示されます"
            }
            accent
          />
        </div>
        {/* お金の出入り(支出=広告+SNS+送客費用+その他の支払い)。売上シート未導入の間は非表示。 */}
        {showRevenueSection && (
          <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
            <KpiCard
              label="支出(全体)"
              value={formatYen(moneyOutYen)}
              caption={`広告費+SNS+請求書${
                pm.unreadableInvoiceCount > 0
                  ? `(※金額を読み取れないPDFが${pm.unreadableInvoiceCount}件あり、未反映)`
                  : ""
              }`}
            />
            <KpiCard
              label="差引(売上−費用)"
              value={`${moneyNetYen < 0 ? "-" : ""}${formatYen(Math.abs(moneyNetYen))}`}
              caption={
                <span
                  className="text-[11px] font-medium"
                  style={{ color: moneyNetYen >= 0 ? "var(--color-good)" : "var(--color-bad)" }}
                >
                  {moneyNetYen >= 0 ? "黒字" : "赤字"}
                </span>
              }
            />
          </div>
        )}
      </section>
      )}

      {/* 1.5 集客・広告(直近6ヶ月の月選択)【マーケティング】 */}
      {group === "マーケティング" && (
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            集客・広告({formatMonthLabel(mkEntry.monthKey)})
          </h2>
          <div className="flex items-center gap-2">
            <MonthChips months={marketingMonths} value={marketingMonthIdx} onChange={setMarketingMonthIdx} />
            <SourceBadge label={marketingBadge} />
          </div>
        </div>
        {marketingStatus === "live-error" && marketingErrorMessage && (
          <p
            className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              color: "var(--color-bad)",
              borderColor: "var(--color-bad)",
              background: "var(--color-card)",
            }}
          >
            接続エラーの内容: {marketingErrorMessage}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5 lg:gap-4">
          <KpiCard
            label="広告費用合計"
            value={formatYen(mk.totalCost)}
            caption={`広告 ${formatYen(
              mk.channels.reduce((sum, c) => sum + c.cost, 0),
            )} + SNS ${formatYen(mk.sns.cost)} + 送客 ${formatYen(mk.referralTotalYen)}`}
            accent
          />
          <KpiCard label="LINE登録合計" value={`${mk.totalLineRegs.toLocaleString("ja-JP")}人`} />
          <KpiCard label="面談予約合計" value={`${mk.totalReservations.toLocaleString("ja-JP")}件`} />
          <KpiCard label="面談実績合計" value={`${mk.totalInterviews.toLocaleString("ja-JP")}件`} />
          <KpiCard label="面接回数" value={`${mk.interviewsCombined.toLocaleString("ja-JP")}件`} />
        </div>
        {/* 面談単価カード: 全体 = 費用合計(広告+SNS+送客) ÷ 面談実績合計。
            アイドマ = Google+Meta広告の費用 ÷ 面談数、リズリアライズ = SNSの費用 ÷ 面談数。 */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4">
          <KpiCard
            label="面談単価(全体)"
            value={formatYenOrDash(mk.totalInterviews > 0 ? mk.totalCost / mk.totalInterviews : null)}
            caption="費用合計(広告+SNS+送客) ÷ 面談実績合計"
            accent
          />
          <KpiCard
            label="面談単価(アイドマ広告)"
            value={formatYenOrDash(
              (googleAd?.interviews ?? 0) + (metaAd?.interviews ?? 0) > 0
                ? ((googleAd?.cost ?? 0) + (metaAd?.cost ?? 0)) /
                    ((googleAd?.interviews ?? 0) + (metaAd?.interviews ?? 0))
                : null,
            )}
            caption="Google+Meta広告の費用 ÷ 面談数"
          />
          <KpiCard
            label="面談単価(リズリアライズ)"
            value={formatYenOrDash(mk.sns.costPerInterview)}
            caption="SNS運用の費用 ÷ 面談数"
          />
        </div>
        <Collapsible title="媒体別">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">媒体</th>
                <th className="pb-2 pr-2 text-right font-medium">費用</th>
                <th className="pb-2 pr-2 text-right font-medium">LINE登録</th>
                <th className="pb-2 pr-2 text-right font-medium">予約</th>
                <th className="pb-2 pr-2 text-right font-medium">面談</th>
                <th className="pb-2 pr-2 text-right font-medium">CPA</th>
                <th className="pb-2 text-right font-medium">面談単価</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              <tr>
                <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                  Google広告
                </td>
                <td className="py-2 pr-2 text-right">{formatYen(googleAd?.cost ?? 0)}</td>
                <td className="py-2 pr-2 text-right">{(googleAd?.lineRegs ?? 0).toLocaleString("ja-JP")}人</td>
                <td className="py-2 pr-2 text-right">{(googleAd?.reservations ?? 0).toLocaleString("ja-JP")}件</td>
                <td className="py-2 pr-2 text-right">{(googleAd?.interviews ?? 0).toLocaleString("ja-JP")}件</td>
                <td className="py-2 pr-2 text-right">{formatYenOrDash(googleAd?.cpa ?? null)}</td>
                <td className="py-2 text-right">{formatYenOrDash(googleAd?.costPerInterview ?? null)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                  Meta広告
                </td>
                <td className="py-2 pr-2 text-right">{formatYen(metaAd?.cost ?? 0)}</td>
                <td className="py-2 pr-2 text-right">{(metaAd?.lineRegs ?? 0).toLocaleString("ja-JP")}人</td>
                <td className="py-2 pr-2 text-right">{(metaAd?.reservations ?? 0).toLocaleString("ja-JP")}件</td>
                <td className="py-2 pr-2 text-right">{(metaAd?.interviews ?? 0).toLocaleString("ja-JP")}件</td>
                <td className="py-2 pr-2 text-right">{formatYenOrDash(metaAd?.cpa ?? null)}</td>
                <td className="py-2 text-right">{formatYenOrDash(metaAd?.costPerInterview ?? null)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                  SNS運用(リズリアライズ)
                </td>
                <td className="py-2 pr-2 text-right">{formatYen(mk.sns.cost)}</td>
                <td className="py-2 pr-2 text-right">{mk.sns.lineRegs.toLocaleString("ja-JP")}人</td>
                <td className="py-2 pr-2 text-right">—</td>
                <td className="py-2 pr-2 text-right">{mk.sns.interviews.toLocaleString("ja-JP")}件</td>
                <td className="py-2 pr-2 text-right">{formatYenOrDash(mk.sns.cpa)}</td>
                <td className="py-2 text-right">{formatYenOrDash(mk.sns.costPerInterview)}</td>
              </tr>
            </tbody>
          </table>
        </Collapsible>
        <div className="flex flex-wrap gap-1.5">
          {transitionRates.clickToLineRegRatePercent !== null && (
            <RateBadge label="クリック→LINE登録率" value={transitionRates.clickToLineRegRatePercent} />
          )}
          {transitionRates.lineToReservationRatePercent !== null && (
            <RateBadge label="LINE→予約率" value={transitionRates.lineToReservationRatePercent} />
          )}
          {transitionRates.reservationToInterviewRatePercent !== null && (
            <RateBadge label="予約→面談実行率" value={transitionRates.reservationToInterviewRatePercent} />
          )}
          {transitionRates.snsPlayToLpRatePercent !== null && (
            <RateBadge label="SNS再生→LP率" value={transitionRates.snsPlayToLpRatePercent} />
          )}
        </div>
        <Collapsible title="送客パートナー(成果報酬)">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">経路</th>
                <th className="pb-2 pr-2 text-right font-medium">単価</th>
                <th className="pb-2 pr-2 text-right font-medium">面談({mkPeriodLabels[0]})</th>
                <th className="pb-2 pr-2 text-right font-medium">費用({mkPeriodLabels[0]})</th>
                <th className="pb-2 pr-2 text-right font-medium">面談({mkPeriodLabels[1]})</th>
                <th className="pb-2 text-right font-medium">費用({mkPeriodLabels[1]})</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {mk.referralPartners
                // 経営者の要望: 対象者0名の経路は行を出さない(選択月・前月とも0名なら非表示)。
                .filter((r) => {
                  const last = mk.referralPartnersLastMonth.find((l) => l.channel === r.channel);
                  return r.count > 0 || (last?.count ?? 0) > 0;
                })
                .map((r) => {
                const last = mk.referralPartnersLastMonth.find((l) => l.channel === r.channel);
                return (
                  <tr key={r.channel}>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                      {r.channel}
                    </td>
                    <td className="py-2 pr-2 text-right">{formatYen(r.unitCostYen)}</td>
                    <td className="py-2 pr-2 text-right">{r.count.toLocaleString("ja-JP")}名</td>
                    <td className="py-2 pr-2 text-right">{formatYen(r.costYen)}</td>
                    <td className="py-2 pr-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                      {(last?.count ?? 0).toLocaleString("ja-JP")}名
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                      {formatYen(last?.costYen ?? 0)}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700 }}>
                <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                  合計
                </td>
                <td className="py-2 pr-2 text-right">—</td>
                <td className="py-2 pr-2 text-right">
                  {mk.referralPartners
                    .reduce((sum, r) => sum + r.count, 0)
                    .toLocaleString("ja-JP")}
                  名
                </td>
                <td className="py-2 pr-2 text-right">{formatYen(mk.referralTotalYen)}</td>
                <td className="py-2 pr-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                  {mk.referralPartnersLastMonth
                    .reduce((sum, r) => sum + r.count, 0)
                    .toLocaleString("ja-JP")}
                  名
                </td>
                <td className="py-2 text-right" style={{ color: "var(--color-text-muted)" }}>
                  {formatYen(mk.referralLastMonthTotalYen)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            対象人数 = 流入経路が一致し面談を実施した求職者(面談後の辞退も含む)。今月・先月とも面談日(未入力時は登録日→更新日)の月で判定。流入経路・面談日はシートに加え、#求職者スレッドの「◯◯様流入」「面談実施」の記載からも自動検出。
          </p>
        </Collapsible>
      </section>
      )}

      {/* 1.6 請求書チェック(#請求書)【全体】 */}
      {group === "全体" && showInvoiceCard && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              請求書チェック(#請求書)
            </h2>
            <SourceBadge label={invoiceBadge} />
          </div>
          {invoiceStatus === "live-error" && invoiceErrorMessage && (
            <p
              className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
              style={{
                color: "var(--color-bad)",
                borderColor: "var(--color-bad)",
                background: "var(--color-card)",
              }}
            >
              接続エラーの内容: {invoiceErrorMessage}
            </p>
          )}
          {/* 月ごとの支出合計だけをシンプルに表示する(1件ずつの明細・照合結果は「AIに聞く」で回答)。 */}
          <div className="card p-3.5">
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
              {invoiceMonthlyTotals.map((m) => (
                <div key={m.month} className="flex items-baseline justify-between py-2">
                  <span className="text-[12px] font-medium" style={{ color: "var(--color-navy)" }}>
                    {formatMonthLabel(m.month)}の支払い(月末払い)
                  </span>
                  <span className="text-right">
                    <span className="text-[16px] font-bold" style={{ color: "var(--color-kpi-value)" }}>
                      {formatYen(m.totalYen)}
                    </span>
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      ({m.count.toLocaleString("ja-JP")}件
                      {m.unreadableCount > 0 ? `+読取不可${m.unreadableCount}件` : ""})
                    </span>
                  </span>
                </div>
              ))}
              {invoiceMonthlyTotals.length === 0 && (
                <p className="py-3 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  Slack「#請求書」から読み取れた請求書はまだありません。
                </p>
              )}
            </div>
            {unreadableInvoicesShown.length > 0 && (
              <div
                className="mt-2 flex flex-col gap-1 rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <p className="text-[11px] font-semibold" style={{ color: "var(--color-navy)" }}>
                  金額を読み取れなかったPDF({unreadableInvoices.length}件・合計に未反映)
                </p>
                {unreadableInvoicesShown.map((inv, i) => (
                  <p key={i} className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    ・{inv.fileName} — {inv.parseNote ?? "請求金額を読み取れませんでした。"}
                    {inv.permalink && (
                      <a
                        href={inv.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 font-semibold"
                        style={{ color: "var(--color-gold)" }}
                      >
                        Slackで開く →
                      </a>
                    )}
                  </p>
                ))}
                {unreadableInvoices.length > unreadableInvoicesShown.length && (
                  <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    他{unreadableInvoices.length - unreadableInvoicesShown.length}件。
                  </p>
                )}
              </div>
            )}
            {/* 差異の警告バナーは経営者の指示で廃止(照合の詳細は従来どおり「AIに聞く」で確認できる)。 */}
            <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              内訳(請求月・会社・金額)は「AIに聞く」で「請求書の内訳は?」と質問すると見られます。
              {invoiceSkippedCount > 0 ? ` 他${invoiceSkippedCount}件のPDFは対象外(直近50件まで)。` : ""}
            </p>
          </div>
        </section>
      )}

      {/* 1.7 送客売上(貰う金額)【マーケティング】 */}
      {group === "マーケティング" && showRevenueSection && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              送客売上({revenuePeriod === "this" ? "今月" : "先月"})
            </h2>
            <div className="flex items-center gap-2">
              <PeriodToggle period={revenuePeriod} onChange={setRevenuePeriod} />
              <SourceBadge label={revenueBadge} />
            </div>
          </div>
          {revenueStatus === "live-error" && revenueErrorMessage && (
            <p
              className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
              style={{
                color: "var(--color-bad)",
                borderColor: "var(--color-bad)",
                background: "var(--color-card)",
              }}
            >
              接続エラーの内容: {revenueErrorMessage}
            </p>
          )}

          {/* 経路別テーブル */}
          <div className="card overflow-x-auto p-3.5">
            <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
              経路別
            </p>
            <table className="w-full min-w-[420px] text-left text-[12px]">
              <thead>
                <tr style={{ color: "var(--color-text-muted)" }}>
                  <th className="pb-2 pr-2 font-medium">経路</th>
                  <th className="pb-2 pr-2 text-right font-medium">件数</th>
                  <th className="pb-2 text-right font-medium">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {rv.byChannel.map((c) => (
                  <tr key={c.channel}>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                      {c.channel}
                    </td>
                    <td className="py-2 pr-2 text-right">{c.count.toLocaleString("ja-JP")}件</td>
                    <td className="py-2 text-right">{formatYen(c.amountYen)}</td>
                  </tr>
                ))}
                {rv.byChannel.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-center" style={{ color: "var(--color-text-muted)" }}>
                      対象期間の送客売上はまだありません。
                    </td>
                  </tr>
                )}
                <tr style={{ fontWeight: 700 }}>
                  <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                    合計
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {rv.records.length.toLocaleString("ja-JP")}件
                  </td>
                  <td className="py-2 text-right">{formatYen(rv.totalYen)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 企業別明細テーブル */}
          <Collapsible title="企業別明細">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr style={{ color: "var(--color-text-muted)" }}>
                  <th className="pb-2 pr-2 font-medium">企業</th>
                  <th className="pb-2 pr-2 font-medium">求職者</th>
                  <th className="pb-2 pr-2 font-medium">流入経路</th>
                  <th className="pb-2 text-right font-medium">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {revenueDetailRows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                      {r.company}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.candidateName ?? "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.inflowChannel}</td>
                    <td className="py-2 text-right whitespace-nowrap">{formatYen(r.amountYen)}</td>
                  </tr>
                ))}
                {revenueDetailRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-center" style={{ color: "var(--color-text-muted)" }}>
                      対象期間の送客売上はまだありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {revenueDetailHiddenCount > 0 && (
              <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                他{revenueDetailHiddenCount}件。
              </p>
            )}
          </Collapsible>

          {/* 送客パートナー収支 */}
          <Collapsible title={`送客パートナー収支(${revenuePeriod === "this" ? "今月" : "先月"})`}>
            <table className="w-full min-w-[420px] text-left text-[12px]">
              <thead>
                <tr style={{ color: "var(--color-text-muted)" }}>
                  <th className="pb-2 pr-2 font-medium">経路</th>
                  <th className="pb-2 pr-2 text-right font-medium">売上</th>
                  <th className="pb-2 pr-2 text-right font-medium">費用</th>
                  <th className="pb-2 text-right font-medium">利益</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {referralProfit.rows
                  // 売上・費用とも0円の経路は行を出さない(経路が増えても表が0行で埋まらないように)。
                  .filter((row) => row.revenueYen > 0 || row.costYen > 0)
                  .map((row) => (
                  <tr key={row.channel}>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                      {row.channel}
                    </td>
                    <td className="py-2 pr-2 text-right">{formatYen(row.revenueYen)}</td>
                    <td className="py-2 pr-2 text-right">{formatYen(row.costYen)}</td>
                    <td
                      className="py-2 text-right font-semibold"
                      style={{ color: row.profitYen >= 0 ? "var(--color-good)" : "var(--color-bad)" }}
                    >
                      {formatYen(row.profitYen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[12px]"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                売上合計 {formatYen(referralProfit.totalRevenueYen)} − 送客費用合計 {formatYen(referralProfit.totalCostYen)} = 利益
              </span>
              <span
                className="font-bold"
                style={{ color: referralProfit.totalProfitYen >= 0 ? "var(--color-good)" : "var(--color-bad)" }}
              >
                {formatYen(referralProfit.totalProfitYen)}
              </span>
            </div>
            <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              入金月ベースで集計(タブ「YYYY年M月」の内容は翌月末入金のため、翌月分として表示)。経路の対応付けは部分一致。
            </p>
          </Collapsible>
        </section>
      )}

      {/* 2. 求職者ファネル(月内)【CA】。営業ファネルとは行き先タブが異なるためグリッドを解体し独立させる。 */}
      {group === "CA" && (
      <div className="max-w-[640px]">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            求職者({candidateFunnelPeriod === "this" ? "今月" : "先月"})
          </h2>
          <div className="flex items-center gap-2">
            <PeriodToggle period={candidateFunnelPeriod} onChange={setCandidateFunnelPeriod} />
            <SourceBadge label={sheetsBadge} />
          </div>
        </div>
        <div className="card flex flex-col gap-3 p-3.5">
          <div className="flex flex-col gap-2.5">
            <FunnelRow
              label="LINE登録"
              value={candidateFunnel.lineRegistrations}
              maxValue={candidateFunnelMax}
              unit="人"
            />
            <FunnelRow
              label="面談予約"
              value={candidateFunnel.interviewBookings}
              maxValue={candidateFunnelMax}
              unit="件"
            />
            <FunnelRow label="面談" value={candidateFunnel.interviews} maxValue={candidateFunnelMax} unit="件" />
            <FunnelRow
              label="面接"
              value={candidateFunnel.interviewsCombined}
              maxValue={candidateFunnelMax}
              unit="件"
              sub={`1次〜最終前 ${candidateFunnel.earlyInterviews}件 / 最終 ${candidateFunnel.finalInterviews}件`}
            />
            <FunnelRow label="内定" value={candidateFunnel.offers} maxValue={candidateFunnelMax} unit="名" />
            <FunnelRow
              label="採用決定"
              value={candidateFunnel.placements}
              maxValue={candidateFunnelMax}
              unit="名"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
            <RateBadge label="LINE登録率" value={candidateFunnel.lineRegistrationRatePercent} />
            <RateBadge label="面談実行率" value={candidateFunnel.interviewExecutionRatePercent} />
            <RateBadge label="面談移行率" value={candidateFunnel.interviewConversionRatePercent} />
          </div>
        </div>
      </section>
      </div>
      )}

      {/* 3. 法人営業ファネル(月内)【RA】。求職者ファネルとは行き先タブが異なるためグリッドを解体し独立させる。 */}
      {group === "RA" && (
      <div className="max-w-[640px]">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            営業({corporateFunnelPeriod === "this" ? "今月" : "先月"})
          </h2>
          <div className="flex items-center gap-2">
            <PeriodToggle period={corporateFunnelPeriod} onChange={setCorporateFunnelPeriod} />
            <SourceBadge label={sheetsBadge} />
          </div>
        </div>
        <div className="card flex flex-col gap-2.5 p-3.5">
          <FunnelRow
            label="名刺交換"
            value={corporateFunnel.businessCards}
            maxValue={corporateFunnelMax}
            unit="件"
            diff={corporateFunnel.businessCards - corporateFunnelPrev.businessCards}
          />
          <FunnelRow
            label="アポイント"
            value={corporateFunnel.appointments.total}
            maxValue={corporateFunnelMax}
            unit="件"
            diff={corporateFunnel.appointments.total - corporateFunnelPrev.appointments.total}
            sub={`主権 ${corporateFunnel.appointments.sovereign}件 / 非主権 ${corporateFunnel.appointments.nonSovereign}件 / 外部 ${corporateFunnel.appointments.external}件`}
          />
          <FunnelRow
            label="商談"
            value={corporateFunnel.meetings.total}
            maxValue={corporateFunnelMax}
            unit="件"
            diff={corporateFunnel.meetings.total - corporateFunnelPrev.meetings.total}
            sub={`主権 ${corporateFunnel.meetings.sovereign}件 / 非主権 ${corporateFunnel.meetings.nonSovereign}件 / 外部 ${corporateFunnel.meetings.external}件`}
          />
          <div className="flex items-center justify-between border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              契約
            </span>
            <span className="flex items-baseline gap-2">
              <DiffCaption
                diff={corporateFunnel.contracts.count - corporateFunnelPrev.contracts.count}
                unit="件"
              />
              <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                {corporateFunnel.contracts.count}件・{corporateFunnel.contracts.amountMan.toLocaleString("ja-JP")}万円
              </span>
            </span>
          </div>
        </div>
      </section>
      </div>
      )}

      {/* 3.5 CA別実績(#求職者)【CA】 */}
      {group === "CA" && (
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            CA別実績(#求職者)({formatMonthLabel(caMonth?.monthKey ?? caMonths[0]?.monthKey ?? "")})
          </h2>
          <div className="flex items-center gap-2">
            <MonthChips months={caMonths} value={caMonthIdx} onChange={setCaMonthIdx} />
            <SourceBadge label={slackBadge} />
          </div>
        </div>
        <div className="card overflow-x-auto p-3.5">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">CA</th>
                <th className="pb-2 pr-2 text-right font-medium">面談</th>
                <th className="pb-2 pr-2 text-right font-medium">面接(件数)</th>
                <th className="pb-2 pr-2 text-right font-medium">面接移行率</th>
                <th className="pb-2 pr-2 text-right font-medium">内定(率)</th>
                <th className="pb-2 text-right font-medium">離脱(率)</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {caRows.map((r) => (
                <tr key={r.ca}>
                  <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                    {r.ca}
                  </td>
                  <td className="py-2 pr-2 text-right">{r.interviews.toLocaleString("ja-JP")}件</td>
                  <td className="py-2 pr-2 text-right">
                    {r.advancedToInterview.toLocaleString("ja-JP")}名({r.interviewEventCount.toLocaleString("ja-JP")}件)
                  </td>
                  <td className="py-2 pr-2 text-right">{formatPercentOrDash(r.advanceRatePercent)}</td>
                  <td className="py-2 pr-2 text-right">
                    {r.offers.toLocaleString("ja-JP")}名({formatPercentOrDash(r.offerRatePercent)})
                  </td>
                  <td className="py-2 text-right">
                    {r.withdrawn.toLocaleString("ja-JP")}名({formatPercentOrDash(r.withdrawnRatePercent)})
                  </td>
                </tr>
              ))}
              {caRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center" style={{ color: "var(--color-text-muted)" }}>
                    この月の面談実施の記録がありません。
                  </td>
                </tr>
              )}
              {caRows.length > 0 && (
                <tr style={{ fontWeight: 700 }}>
                  <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                    合計
                  </td>
                  <td className="py-2 pr-2 text-right">{caTotal.interviews.toLocaleString("ja-JP")}件</td>
                  <td className="py-2 pr-2 text-right">
                    {caTotal.advancedToInterview.toLocaleString("ja-JP")}名({caTotal.interviewEventCount.toLocaleString("ja-JP")}件)
                  </td>
                  <td className="py-2 pr-2 text-right">{formatPercentOrDash(caTotalAdvanceRatePercent)}</td>
                  <td className="py-2 pr-2 text-right">
                    {caTotal.offers.toLocaleString("ja-JP")}名({formatPercentOrDash(caTotalOfferRatePercent)})
                  </td>
                  <td className="py-2 text-right">
                    {caTotal.withdrawn.toLocaleString("ja-JP")}名({formatPercentOrDash(caTotalWithdrawnRatePercent)})
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* 3.6 営業実績(#21_ra・アポイント報告)【RA】 */}
      {group === "RA" && showSalesSection && (
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              営業実績(#ra・アポイント報告)({formatMonthLabel(salesMonth?.monthKey ?? salesMonths[0]?.monthKey ?? "")})
            </h2>
            <div className="flex items-center gap-2">
              <MonthChips months={salesMonths} value={salesMonthIdx} onChange={setSalesMonthIdx} />
              <SourceBadge label={salesBadge} />
            </div>
          </div>
          {salesStatus === "live-error" && salesErrorMessage && (
            <p
              className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
              style={{
                color: "var(--color-bad)",
                borderColor: "var(--color-bad)",
                background: "var(--color-card)",
              }}
            >
              接続エラーの内容: {salesErrorMessage}
            </p>
          )}
          <div className="card overflow-x-auto p-3.5">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr style={{ color: "var(--color-text-muted)" }}>
                  <th className="pb-2 pr-2 font-medium">営業</th>
                  <th className="pb-2 pr-2 text-right font-medium">架電数</th>
                  {salesOptionalCols.map((c) => (
                    <th key={c.key} className="pb-2 pr-2 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th className="pb-2 pr-2 text-right font-medium">アポ獲得</th>
                  <th className="pb-2 pr-2 text-right font-medium">商談数</th>
                  <th className="pb-2 text-right font-medium">契約数</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {salesRows.map((r) => (
                  <tr key={r.member}>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                      {r.member}
                    </td>
                    <td className="py-2 pr-2 text-right">{r.calls.toLocaleString("ja-JP")}件</td>
                    {salesOptionalCols.map((c) => (
                      <td key={c.key} className="py-2 pr-2 text-right">
                        {r[c.key].toLocaleString("ja-JP")}件
                      </td>
                    ))}
                    <td className="py-2 pr-2 text-right">
                      {r.appointments.toLocaleString("ja-JP")}件
                      {r.appointmentRoutes.length > 0 && (
                        <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                          {r.appointmentRoutes.map((rt) => `${rt.route}${rt.count}`).join("・")}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">{r.meetings.toLocaleString("ja-JP")}件</td>
                    <td className="py-2 text-right">{r.contracts.toLocaleString("ja-JP")}件</td>
                  </tr>
                ))}
                {salesRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5 + salesOptionalCols.length}
                      className="py-3 text-center"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      この月の報告がありません。
                    </td>
                  </tr>
                )}
                {salesRows.length > 0 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                      合計
                    </td>
                    <td className="py-2 pr-2 text-right">{salesTotal.calls.toLocaleString("ja-JP")}件</td>
                    {salesOptionalCols.map((c) => (
                      <td key={c.key} className="py-2 pr-2 text-right">
                        {salesTotal[c.key].toLocaleString("ja-JP")}件
                      </td>
                    ))}
                    <td className="py-2 pr-2 text-right">{salesTotal.appointments.toLocaleString("ja-JP")}件</td>
                    <td className="py-2 pr-2 text-right">{salesTotal.meetings.toLocaleString("ja-JP")}件</td>
                    <td className="py-2 text-right">{salesTotal.contracts.toLocaleString("ja-JP")}件</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              架電数・メール・LINE・本通・受電=#raの架電数報告スレッド(12時・15時)の返信を1日分合算(報告に書かれた項目のみ列に表示)。商談・契約=業務報告スレッドから。アポ獲得=#22_アポイント報告の1投稿=1件(業務予定報告は集計対象外)。
            </p>
          </div>
        </section>
      )}

      {/* 4. 週次推移(直近5週)・月次推移(直近6ヶ月、lgでは左右2カラム)【全体】 */}
      {group === "全体" && (
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            週次推移(直近5週)
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div className="card overflow-x-auto p-3.5">
          <table className="w-full min-w-[360px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">週</th>
                <th className="pb-2 pr-2 text-right font-medium">面談数</th>
                <th className="pb-2 pr-2 text-right font-medium">内定者数</th>
                <th className="pb-2 text-right font-medium">契約金額</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {weeklyTrend.map((row, i) => (
                <tr key={row.weekStart}>
                  <td className="py-2 pr-2 font-medium" style={{ color: "var(--color-navy)" }}>
                    {formatWeekLabel(row.weekStart)}
                    {i === weeklyTrend.length - 1 && (
                      <span className="ml-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        (直近)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right">{row.interviews}件</td>
                  <td className="py-2 pr-2 text-right">{row.offers}名</td>
                  <td className="py-2 text-right">{row.contractAmountMan.toLocaleString("ja-JP")}万円</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            運用注記: KPIは毎週月曜に前週分を入力(木曜12:00に週次定例MTG)。
          </p>
        </div>
      </section>

      {/* 4b. 月次推移(直近6ヶ月・管理者向け) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            月次推移(直近6ヶ月)
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div className="card overflow-x-auto p-3 lg:p-3.5">
          <table className="w-full min-w-[520px] text-left text-[11px] lg:min-w-0 lg:text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-1.5 font-medium">月</th>
                <th className="pb-2 pr-1.5 text-right font-medium">面談数</th>
                <th className="pb-2 pr-1.5 text-right font-medium">内定者数</th>
                <th className="pb-2 pr-1.5 text-right font-medium">採用決定</th>
                <th className="pb-2 pr-1.5 text-right font-medium">契約金額</th>
                <th className="pb-2 pr-1.5 text-right font-medium">PV数</th>
                <th className="pb-2 text-right font-medium">LINE登録</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {summary.monthlyHistory.map((row, i) => {
                const isCurrentMonth = i === summary.monthlyHistory.length - 1;
                const rowStyle = isCurrentMonth
                  ? { fontWeight: 700, background: "color-mix(in srgb, var(--color-gold) 6%, transparent)" }
                  : undefined;
                return (
                  <tr key={row.month} style={rowStyle}>
                    <td
                      className="whitespace-nowrap py-2 pr-1.5 font-medium"
                      style={{ color: isCurrentMonth ? "var(--color-gold)" : "var(--color-navy)" }}
                    >
                      {formatMonthLabel(row.month)}
                      {isCurrentMonth && (
                        <span className="ml-1 text-[10px] font-normal" style={{ color: "var(--color-text-muted)" }}>
                          (当月)
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">{row.interviews}件</td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">{row.offers}名</td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">{row.candidatePlacements}名</td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">{row.contractAmountMan.toLocaleString("ja-JP")}万円</td>
                    <td className="whitespace-nowrap py-2 pr-1.5 text-right">{row.pv.toLocaleString("ja-JP")}</td>
                    <td className="whitespace-nowrap py-2 text-right">{row.lineRegistrations.toLocaleString("ja-JP")}人</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            週次入力(毎週月曜に前週分)を月単位で集計した推移です。当月はデータが揃うまで少なめに表示されます。
          </p>
        </div>
      </section>
      </div>
      )}

      {/* 求職者パイプライン・Slack最新ハイライトのセクションは経営者の指示で廃止
          (Slack本体を見る運用のため。ハイライトの取得自体も data-bundle.ts 側で停止し軽量化)。 */}
    </div>
  );
}
