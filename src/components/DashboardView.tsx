"use client";

import Link from "next/link";
import { useState } from "react";
import KpiCard from "@/components/KpiCard";
import ProgressBar from "@/components/ProgressBar";
import SourceBadge from "@/components/SourceBadge";
import StatusBadge from "@/components/StatusBadge";
import { getCandidatesByCa, getInvoiceMonthlyTotals, getReferralProfit } from "@/lib/metrics";
import type {
  DashboardSummary,
  InvoiceCheckRow,
  MarketingSummary,
  PrimaryMonthSnapshot,
  RevenueMonthSummary,
} from "@/lib/metrics";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { Candidate, SourceStatus } from "@/lib/types";
import { getRoleProfile, useSession } from "@/store/session";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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

/** 求職者・法人ファネル共通の横棒行。 */
function FunnelRow({
  label,
  value,
  maxValue,
  unit = "",
  sub,
}: {
  label: string;
  value: number;
  maxValue: number;
  unit?: string;
  sub?: string;
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
      {sub && (
        <span className="pl-[112px] text-[10px]" style={{ color: "var(--color-text-muted)" }}>
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

/** 円額(単価等)を表示する。null(分母0で算出不可)は「—」。 */
function formatYenOrDash(amountYen: number | null): string {
  return amountYen === null ? "—" : formatYen(amountYen);
}


interface DashboardViewProps {
  summary: DashboardSummary;
  /** 先月分のサマリ(主要指標セクションの「先月」トグル用)。 */
  summaryLastMonth: DashboardSummary;
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
}

export default function DashboardView({
  summary,
  summaryLastMonth,
  candidates,
  sourceStatus,
  sourceErrorMessage,
  slackStatus,
  slackErrorMessage,
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
}: DashboardViewProps) {
  const { role } = useSession();
  // 主要指標・集客/広告は直近6ヶ月から月を選択、送客売上・各ファネルは今月⇄先月を切り替えられる。
  const [primaryMonthIdx, setPrimaryMonthIdx] = useState(0);
  const [marketingMonthIdx, setMarketingMonthIdx] = useState(0);
  const [revenuePeriod, setRevenuePeriod] = useState<Period>("this");
  const [candidateFunnelPeriod, setCandidateFunnelPeriod] = useState<Period>("this");
  const [corporateFunnelPeriod, setCorporateFunnelPeriod] = useState<Period>("this");
  if (!role) return null;

  const profile = getRoleProfile(role);
  const sheetsBadge = sourceBadgeLabel("sheets", sourceStatus);
  const slackBadge = sourceBadgeLabel("slack", slackStatus);
  const marketingBadge = sourceBadgeLabel("marketing", marketingStatus);
  const invoiceBadge = sourceBadgeLabel("invoices", invoiceStatus);
  // 請求書が1件も無く、かつ機能未設定(demo=SLACK_INVOICE_CHANNEL未設定 or デモモード)の場合は
  // カード自体を非表示にする(機能OFF扱い。デモモードでは常にデモ請求書が入るため表示される)。
  const showInvoiceCard = invoiceChecks.length > 0 || invoiceStatus !== "demo";
  // 月ごとの支出合計(新しい月順)と、送客パートナー請求書の差異件数(警告表示用)。
  const invoiceMonthlyTotals = getInvoiceMonthlyTotals(invoiceChecks.map((row) => row.invoice));
  const invoiceMismatchCount = invoiceChecks.filter((row) => row.status === "mismatch").length;
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

  const maxStageCount = Math.max(1, ...summary.pipeline.map((s) => s.count));

  const { weeklyTrend } = summary;
  // 主要指標カードは選択月のスナップショット、各ファネルは今月/先月トグルで切替。
  const primary = pm.primary;
  const candidateFunnel =
    candidateFunnelPeriod === "this" ? summary.candidateFunnel : summaryLastMonth.candidateFunnel;
  const corporateFunnel =
    corporateFunnelPeriod === "this" ? summary.corporateFunnel : summaryLastMonth.corporateFunnel;
  const candidateFunnelMax = Math.max(1, candidateFunnel.pv);
  const corporateFunnelMax = Math.max(
    1,
    corporateFunnel.businessCards,
    corporateFunnel.appointments.total,
    corporateFunnel.meetings.total,
  );

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

      {/* 1. 主要指標(直近6ヶ月の月選択) */}
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
            label="採用決定(求職者)"
            value={`${primary.candidatePlacements.value}名`}
            caption={<DiffCaption diff={primary.candidatePlacements.diff} unit="名" />}
          />
          {/* 経営者の要望により、「成功報酬」は週次KPIの法人契約金額ではなく
              翔び台請求書関係シート(売上シート)の入金月合計を表示する(未連携時は案内を表示)。 */}
          <KpiCard
            label="成功報酬(貰うお金)"
            value={formatYen(moneyInYen)}
            caption={
              showRevenueSection
                ? `${shortMonthLabel(pm.monthKey)}末入金分(翔び台請求書関係シート)`
                : "未連携: Vercelに REVENUE_SHEET_ID を設定すると表示されます"
            }
            accent
          />
        </div>
        {/* お金の出入り(支出=広告+SNS+送客費用+その他の支払い)。売上シート未導入の間は非表示。 */}
        {showRevenueSection && (
          <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
            <KpiCard
              label="出ていくお金(全体)"
              value={formatYen(moneyOutYen)}
              caption={`広告+SNS+送客費用+その他の支払い${
                pm.unreadableInvoiceCount > 0
                  ? `(※#請求書に金額を読み取れないPDFが${pm.unreadableInvoiceCount}件あり、未反映)`
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

      {/* 1.5 集客・広告(直近6ヶ月の月選択) */}
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
        <div className="card overflow-x-auto p-3.5">
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
        </div>
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
        <div className="card overflow-x-auto p-3.5">
          <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
            送客パートナー(成果報酬)
          </p>
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
              {mk.referralPartners.map((r) => {
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
        </div>
      </section>

      {/* 1.6 請求書チェック(#請求書) */}
      {showInvoiceCard && (
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
                    {formatMonthLabel(m.month)}分の支払い
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
            {invoiceMismatchCount > 0 && (
              <p
                className="mt-2 rounded-lg border px-3 py-2 text-[11px] font-medium"
                style={{ color: "var(--color-bad)", borderColor: "var(--color-bad)" }}
              >
                ⚠️ 送客パートナーの請求書{invoiceMismatchCount}件でアプリ計算との差異があります。「AIに聞く」で「請求書は合ってる?」と質問すると詳細が見られます。
              </p>
            )}
            <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              内訳(請求月・会社・金額)は「AIに聞く」で「請求書の内訳は?」と質問すると見られます。
              {invoiceSkippedCount > 0 ? ` 他${invoiceSkippedCount}件のPDFは対象外(直近50件まで)。` : ""}
            </p>
          </div>
        </section>
      )}

      {/* 1.7 送客売上(貰う金額) */}
      {showRevenueSection && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              送客売上(貰う金額)({revenuePeriod === "this" ? "今月" : "先月"})
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
          <div className="card overflow-x-auto p-3.5">
            <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
              企業別明細
            </p>
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
          </div>

          {/* 送客パートナー収支 */}
          <div className="card overflow-x-auto p-3.5">
            <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
              送客パートナー収支({revenuePeriod === "this" ? "今月" : "先月"})
            </p>
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
                {referralProfit.rows.map((row) => (
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
          </div>
        </section>
      )}

      {/* 2-3. 求職者ファネル・法人営業ファネル(lgでは左右2カラム) */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            求職者ファネル({candidateFunnelPeriod === "this" ? "今月" : "先月"})
          </h2>
          <div className="flex items-center gap-2">
            <PeriodToggle period={candidateFunnelPeriod} onChange={setCandidateFunnelPeriod} />
            <SourceBadge label={sheetsBadge} />
          </div>
        </div>
        <div className="card flex flex-col gap-3 p-3.5">
          <div className="flex flex-col gap-2.5">
            <FunnelRow label="PV数" value={candidateFunnel.pv} maxValue={candidateFunnelMax} unit="" />
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

      {/* 3. 法人営業ファネル(月内) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            法人営業ファネル({corporateFunnelPeriod === "this" ? "今月" : "先月"})
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
          />
          <FunnelRow
            label="アポイント"
            value={corporateFunnel.appointments.total}
            maxValue={corporateFunnelMax}
            unit="件"
            sub={`主権 ${corporateFunnel.appointments.sovereign}件 / 非主権 ${corporateFunnel.appointments.nonSovereign}件 / 外部 ${corporateFunnel.appointments.external}件`}
          />
          <FunnelRow
            label="商談"
            value={corporateFunnel.meetings.total}
            maxValue={corporateFunnelMax}
            unit="件"
            sub={`主権 ${corporateFunnel.meetings.sovereign}件 / 非主権 ${corporateFunnel.meetings.nonSovereign}件 / 外部 ${corporateFunnel.meetings.external}件`}
          />
          <div className="flex items-center justify-between border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              契約
            </span>
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
              {corporateFunnel.contracts.count}件・{corporateFunnel.contracts.amountMan.toLocaleString("ja-JP")}万円
            </span>
          </div>
        </div>
      </section>
      </div>

      {/* 4. 週次推移(直近5週)・月次推移(直近6ヶ月、lgでは左右2カラム) */}
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

      {/* 5-6. 求職者パイプライン・プロジェクト進捗(lgでは左右2カラム) */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            求職者パイプライン(ステージ別)
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href="/candidates"
              className="text-[11px] font-semibold whitespace-nowrap"
              style={{ color: "var(--color-gold)" }}
            >
              一覧を見る →
            </Link>
            <SourceBadge label={sheetsBadge} />
          </div>
        </div>
        <div className="card flex flex-col gap-2.5 p-3.5">
          {summary.pipeline.map((s) => (
            <div key={s.stage} className="flex items-center gap-2.5">
              <span
                className="w-[64px] shrink-0 text-[11px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {s.stage}
              </span>
              <div className="flex-1">
                <ProgressBar
                  percent={(s.count / maxStageCount) * 100}
                  color="var(--color-navy)"
                  trackColor="var(--color-border)"
                  height={10}
                />
              </div>
              <span
                className="w-[28px] shrink-0 text-right text-[12px] font-semibold"
                style={{ color: "var(--color-navy)" }}
              >
                {s.count}
              </span>
            </div>
          ))}
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            辞退・クローズ {summary.withdrawnCount}名(パイプライン外)
          </p>
        </div>
      </section>

      {/* 6. プロジェクト進捗 */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            プロジェクト進捗
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div className="flex flex-col gap-2.5">
          {summary.projects.map((p) => (
            <div key={p.id} className="card flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                  {p.name}
                </span>
                <StatusBadge status={p.status} />
              </div>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {p.department} ・ {p.owner}
              </p>
              <ProgressBar
                percent={p.progressPercent}
                color={
                  p.status === "遅延"
                    ? "var(--color-bad)"
                    : p.status === "注意"
                      ? "var(--color-warn)"
                      : "var(--color-good)"
                }
              />
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                進捗 {p.progressPercent}% ・ 期日 {formatDate(p.dueDate)}
              </span>
              <p
                className="rounded-lg px-2.5 py-1.5 text-[12px]"
                style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
              >
                {p.latestComment}
              </p>
            </div>
          ))}
        </div>
      </section>
      </div>

      {/* 7. Slack 最新ハイライト(全幅。lgでは内部を2カラムのマス目に) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            Slack 最新ハイライト
          </h2>
          <SourceBadge label={slackBadge} />
        </div>
        {slackStatus === "live-error" && slackErrorMessage && (
          <p
            className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              color: "var(--color-bad)",
              borderColor: "var(--color-bad)",
              background: "var(--color-card)",
            }}
          >
            接続エラーの内容: {slackErrorMessage}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {summary.slack.map((post) => (
            <div key={post.id} className="card flex flex-col gap-1 p-3.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold" style={{ color: "var(--color-gold)" }}>
                  {post.channel}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  {formatDate(post.postedAt)} {formatTime(post.postedAt)}
                </span>
              </div>
              <p className="text-[12px] font-medium" style={{ color: "var(--color-navy)" }}>
                {post.author}
              </p>
              <p className="text-[13px] leading-relaxed">{post.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
