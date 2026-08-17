"use client";

import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import ProgressBar from "@/components/ProgressBar";
import SourceBadge from "@/components/SourceBadge";
import StatusBadge from "@/components/StatusBadge";
import { getCandidatesByCa } from "@/lib/metrics";
import type { DashboardSummary, MarketingSummary } from "@/lib/metrics";
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

/** 先月比の差分を「+n」「-n」「±0」の形式で表す。 */
function formatDiff(diff: number, unit = ""): string {
  const rounded = Math.round(diff);
  if (rounded > 0) return `先月比 +${rounded}${unit}`;
  if (rounded < 0) return `先月比 ${rounded}${unit}`;
  return "先月比 ±0";
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
  candidates: Candidate[];
  sourceStatus: SourceStatus;
  sourceErrorMessage?: string;
  slackStatus: SourceStatus;
  slackErrorMessage?: string;
  marketingSummary: MarketingSummary;
  marketingStatus: SourceStatus;
  marketingErrorMessage?: string;
}

export default function DashboardView({
  summary,
  candidates,
  sourceStatus,
  sourceErrorMessage,
  slackStatus,
  slackErrorMessage,
  marketingSummary,
  marketingStatus,
  marketingErrorMessage,
}: DashboardViewProps) {
  const { role } = useSession();
  if (!role) return null;

  const profile = getRoleProfile(role);
  const sheetsBadge = sourceBadgeLabel("sheets", sourceStatus);
  const slackBadge = sourceBadgeLabel("slack", slackStatus);
  const marketingBadge = sourceBadgeLabel("marketing", marketingStatus);
  const googleAd = marketingSummary.channels.find((c) => c.channel === "Google広告");
  const metaAd = marketingSummary.channels.find((c) => c.channel === "Meta広告");
  const { transitionRates } = marketingSummary;

  // ca ロール(佐藤CA)は自分の担当求職者数を先頭に見せる。
  const isCa = role === "ca";
  const myCandidates = isCa ? getCandidatesByCa(candidates, profile.memberId) : [];
  const myActiveCandidates = myCandidates.filter((c) => c.stage !== "辞退");

  const maxStageCount = Math.max(1, ...summary.pipeline.map((s) => s.count));

  const { candidateFunnel, corporateFunnel, primary, weeklyTrend } = summary;
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

      {/* 1. 主要指標(今月) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            主要指標(今月)
          </h2>
          <SourceBadge label={sheetsBadge} />
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
          <KpiCard
            label="新規契約金額"
            value={`${primary.contractAmountMan.value.toLocaleString("ja-JP")}万円`}
            caption={<DiffCaption diff={primary.contractAmountMan.diff} unit="万円" />}
          />
        </div>
      </section>

      {/* 1.5 集客・広告(月内) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            集客・広告(月内)
          </h2>
          <SourceBadge label={marketingBadge} />
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
            value={formatYen(marketingSummary.totalCost)}
            caption={`広告 ${formatYen(
              marketingSummary.channels.reduce((sum, c) => sum + c.cost, 0),
            )} + SNS ${formatYen(marketingSummary.sns.cost)} + 送客 ${formatYen(marketingSummary.referralTotalYen)}`}
            accent
          />
          <KpiCard label="LINE登録合計" value={`${marketingSummary.totalLineRegs.toLocaleString("ja-JP")}人`} />
          <KpiCard label="面談予約合計" value={`${marketingSummary.totalReservations.toLocaleString("ja-JP")}件`} />
          <KpiCard label="面談実績合計" value={`${marketingSummary.totalInterviews.toLocaleString("ja-JP")}件`} />
          <KpiCard label="面接回数" value={`${marketingSummary.interviewsCombined.toLocaleString("ja-JP")}件`} />
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
                <td className="py-2 pr-2 text-right">{formatYen(marketingSummary.sns.cost)}</td>
                <td className="py-2 pr-2 text-right">{marketingSummary.sns.lineRegs.toLocaleString("ja-JP")}人</td>
                <td className="py-2 pr-2 text-right">—</td>
                <td className="py-2 pr-2 text-right">{marketingSummary.sns.interviews.toLocaleString("ja-JP")}件</td>
                <td className="py-2 pr-2 text-right">{formatYenOrDash(marketingSummary.sns.cpa)}</td>
                <td className="py-2 text-right">{formatYenOrDash(marketingSummary.sns.costPerInterview)}</td>
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
          <table className="w-full min-w-[420px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">経路</th>
                <th className="pb-2 pr-2 text-right font-medium">単価</th>
                <th className="pb-2 pr-2 text-right font-medium">面談人数</th>
                <th className="pb-2 text-right font-medium">費用(月内)</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {marketingSummary.referralPartners.map((r) => (
                <tr key={r.channel}>
                  <td className="py-2 pr-2 font-medium whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                    {r.channel}
                  </td>
                  <td className="py-2 pr-2 text-right">{formatYen(r.unitCostYen)}</td>
                  <td className="py-2 pr-2 text-right">{r.count.toLocaleString("ja-JP")}名</td>
                  <td className="py-2 text-right">{formatYen(r.costYen)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--color-navy)" }}>
                  合計
                </td>
                <td className="py-2 pr-2 text-right">—</td>
                <td className="py-2 pr-2 text-right">
                  {marketingSummary.referralPartners
                    .reduce((sum, r) => sum + r.count, 0)
                    .toLocaleString("ja-JP")}
                  名
                </td>
                <td className="py-2 text-right">{formatYen(marketingSummary.referralTotalYen)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            対象人数 = 流入経路が一致し面談を実施した求職者(面談後の辞退も含む)。月の判定は面談日(未入力時は登録日→更新日)。
          </p>
        </div>
      </section>

      {/* 2-3. 求職者ファネル・法人営業ファネル(lgでは左右2カラム) */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            求職者ファネル(月内)
          </h2>
          <SourceBadge label={sheetsBadge} />
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
            法人営業ファネル(月内)
          </h2>
          <SourceBadge label={sheetsBadge} />
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
