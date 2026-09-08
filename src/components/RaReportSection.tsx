"use client";

/**
 * RA(リクルーティングアドバイザー)営業日報セクション(RAタブ)。
 * Slack「#21_ra」に投稿される【営業日報】スレッド(src/lib/adapters/ra-reports.ts が自動集計)を、
 * 個人別+2人合計の月次カードと日別一覧で表示する。運用前提: SLACK_RA_CHANNEL が未設定の間は
 * この機能自体が「未導入」扱いのため、呼び出し元(DashboardView.tsx)が status を見てこのセクション
 * ごと非表示にする(status === "demo" かつ reports が0件のとき)。
 * 経営者要望: 交流会は「参加費に対する1アポあたり費用」等の割合系指標を強調表示する。
 */
import { useState, type ReactNode } from "react";
import SourceBadge from "@/components/SourceBadge";
import { aggregateRaReports, listRaReportMonthKeys, type RaMemberAggregate } from "@/lib/ra-report-metrics";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { RaDailyReport, SourceStatus } from "@/lib/types";

/** 円額を「¥123,456」形式で表示する(DashboardView.tsx と同じ書式)。 */
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

/** 月キー(YYYY-MM)を「YYYY年M月」表示に変換する。 */
function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 月キー(YYYY-MM)を算出する(JSTではなくサーバー/ブラウザのローカル日時。他セクションの月選択と同じ扱い)。 */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** デフォルト非表示の折りたたみ(DashboardView.tsx の Collapsible と同じ見た目)。 */
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

/** 見出し横の「‹ 2026年9月 ›」月ナビ。日報が存在する月(+今月)のみ移動できる。 */
function MonthArrowNav({
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  label: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="前の月"
        className="grid h-6 w-6 place-items-center rounded-full border text-[13px] leading-none disabled:opacity-30"
        style={{ borderColor: "var(--color-border)", color: "var(--color-navy)" }}
      >
        ‹
      </button>
      <span className="min-w-[92px] text-center text-[12px] font-semibold tabular-nums" style={{ color: "var(--color-navy)" }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="次の月"
        className="grid h-6 w-6 place-items-center rounded-full border text-[13px] leading-none disabled:opacity-30"
        style={{ borderColor: "var(--color-border)", color: "var(--color-navy)" }}
      >
        ›
      </button>
    </div>
  );
}

/** カード内の小さな指標行(ラベル+値、値は tabular-nums)。 */
function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <span className="text-right text-[12px] font-medium tabular-nums" style={{ color: "var(--color-navy)" }}>
        {value}
        {sub && (
          <span className="ml-1.5 text-[10px] font-normal" style={{ color: "var(--color-text-muted)" }}>
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

/** 個人別・合計共通のカード。emphasized(合計)は少し大きく強調する。 */
function RaMemberCard({ aggregate, emphasized }: { aggregate: RaMemberAggregate; emphasized?: boolean }) {
  const a = aggregate;
  return (
    <div
      className="card flex flex-col gap-3 p-3.5"
      style={emphasized ? { borderColor: "var(--color-navy)", borderWidth: 1.5 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={emphasized ? "text-[15px] font-bold" : "text-[13px] font-bold"} style={{ color: "var(--color-navy)" }}>
          {a.authorName}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          報告 {a.reportDayCount.toLocaleString("ja-JP")}日
        </span>
      </div>

      {/* 本日の成果(月合計)。 */}
      <div className="grid grid-cols-3 gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            アポイント
          </span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: "var(--color-navy)" }}>
            {a.resultAppointments.toLocaleString("ja-JP")}件
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            商談({formatPercentOrDash(a.appointmentToMeetingRatePercent)})
          </span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: "var(--color-navy)" }}>
            {a.resultMeetings.toLocaleString("ja-JP")}件
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            契約({formatPercentOrDash(a.meetingToContractRatePercent)})
          </span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: "var(--color-navy)" }}>
            {a.resultContracts.toLocaleString("ja-JP")}件
          </span>
        </div>
      </div>

      {/* 架電・DM。 */}
      <div className="flex flex-col gap-1 border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
        <StatRow
          label="架電"
          value={`${a.callDials.toLocaleString("ja-JP")}件`}
          sub={`本通${a.callConnected.toLocaleString("ja-JP")}(${formatPercentOrDash(a.callConnectRatePercent)}) / アポ${a.callAppointments.toLocaleString("ja-JP")}(${formatPercentOrDash(a.callAppointmentRatePercent)})`}
        />
        <StatRow
          label="DM"
          value={`${a.dmSent.toLocaleString("ja-JP")}件`}
          sub={`返信${a.dmReplies.toLocaleString("ja-JP")}(${formatPercentOrDash(a.dmReplyRatePercent)}) / アポ${a.dmAppointments.toLocaleString("ja-JP")}`}
        />
      </div>

      {/* 交流会。経営者要望: 参加費合計・1アポあたり費用を強調表示する。 */}
      <div
        className="flex flex-col gap-1.5 rounded-lg p-2.5"
        style={{ background: "color-mix(in srgb, var(--color-gold) 8%, var(--color-card))" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: "var(--color-navy)" }}>
            交流会
          </span>
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            参加{a.eventCount.toLocaleString("ja-JP")}回
          </span>
        </div>
        <StatRow
          label="名刺交換"
          value={`${a.eventCardsExchanged.toLocaleString("ja-JP")}/${a.eventCardTarget.toLocaleString("ja-JP")}件`}
          sub={`達成率${formatPercentOrDash(a.eventCardAchievementRatePercent)}`}
        />
        <StatRow
          label="意思決定者名刺"
          value={`${a.eventDecisionMakerCards.toLocaleString("ja-JP")}件`}
          sub={formatPercentOrDash(a.eventDecisionMakerRatePercent)}
        />
        <StatRow
          label="交流会アポ"
          value={`${a.eventAppointments.toLocaleString("ja-JP")}件`}
          sub={`名刺→アポ ${formatPercentOrDash(a.eventCardToAppointmentRatePercent)}`}
        />
        <div className="mt-1 flex items-center justify-between border-t pt-1.5" style={{ borderColor: "color-mix(in srgb, var(--color-gold) 30%, transparent)" }}>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            参加費合計
          </span>
          <span className="text-[15px] font-bold tabular-nums" style={{ color: "var(--color-gold)" }}>
            {formatYen(a.eventFeeYen)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            1アポあたり費用
          </span>
          <span className="text-[15px] font-bold tabular-nums" style={{ color: "var(--color-gold)" }}>
            {formatYenOrDash(a.eventCostPerAppointmentYen)}
          </span>
        </div>
      </div>

      {/* 紹介・リファラル。 */}
      <div className="border-t pt-2.5" style={{ borderColor: "var(--color-border)" }}>
        <StatRow
          label="紹介"
          value={`獲得${a.referralObtained.toLocaleString("ja-JP")}件`}
          sub={`アポ${a.referralAppointments.toLocaleString("ja-JP")}件`}
        />
      </div>
    </div>
  );
}

interface RaReportSectionProps {
  /** RA営業日報(直近120日分の全件。数値のみ、自由記述は含まない)。 */
  reports: RaDailyReport[];
  status: SourceStatus;
  errorMessage?: string;
}

export default function RaReportSection({ reports, status, errorMessage }: RaReportSectionProps) {
  // 日報が存在する月+今月(まだ日報が無くても既定表示できるように)を新しい月順で並べる。
  const nowMonthKey = currentMonthKey();
  const monthKeySet = new Set(listRaReportMonthKeys(reports));
  monthKeySet.add(nowMonthKey);
  const monthKeys = [...monthKeySet].sort((a, b) => (a < b ? 1 : -1));
  const [monthIdx, setMonthIdx] = useState(0);
  const monthKey = monthKeys[monthIdx] ?? nowMonthKey;

  const aggregate = aggregateRaReports(reports, monthKey);
  const raBadge = sourceBadgeLabel("raReports", status);

  const dailyRows = [...reports]
    .filter((r) => r.date.slice(0, 7) === monthKey)
    .sort((a, b) => (a.date === b.date ? b.postedAt.getTime() - a.postedAt.getTime() : b.date < a.date ? -1 : 1));

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
          営業日報(#RAチャンネルから自動集計)
        </h2>
        <div className="flex items-center gap-2">
          <MonthArrowNav
            label={formatMonthLabel(monthKey)}
            canPrev={monthIdx < monthKeys.length - 1}
            canNext={monthIdx > 0}
            onPrev={() => setMonthIdx((i) => Math.min(i + 1, monthKeys.length - 1))}
            onNext={() => setMonthIdx((i) => Math.max(i - 1, 0))}
          />
          <SourceBadge label={raBadge} />
        </div>
      </div>

      {status === "live-error" && errorMessage && (
        <p
          className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
          style={{ color: "var(--color-bad)", borderColor: "var(--color-bad)", background: "var(--color-card)" }}
        >
          接続エラーの内容: {errorMessage}
        </p>
      )}

      {/* 2人合計(大きめ)+個人別(横並び・モバイルは縦)。 */}
      <RaMemberCard aggregate={aggregate.total} emphasized />
      {aggregate.members.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:gap-4">
          {aggregate.members.map((m) => (
            <RaMemberCard key={m.authorId} aggregate={m} />
          ))}
        </div>
      )}
      {aggregate.members.length === 0 && (
        <p className="px-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          この月はまだ日報の投稿がありません。
        </p>
      )}

      <Collapsible title="＋ 日別一覧">
        <table className="w-full min-w-[840px] text-left text-[12px]">
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="pb-2 pr-2 font-medium">日付</th>
              <th className="pb-2 pr-2 font-medium">氏名</th>
              <th className="pb-2 pr-2 text-right font-medium">架電(数/本通/アポ)</th>
              <th className="pb-2 pr-2 text-right font-medium">DM(送/返/アポ)</th>
              <th className="pb-2 pr-2 text-right font-medium">交流会(参加/名刺/アポ/参加費)</th>
              <th className="pb-2 pr-2 text-right font-medium">紹介(獲得/アポ)</th>
              <th className="pb-2 text-right font-medium">成果(アポ/商談/契約)</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {dailyRows.map((r) => (
              <tr key={`${r.authorId}-${r.date}`}>
                <td className="py-2 pr-2 whitespace-nowrap tabular-nums" style={{ color: "var(--color-navy)" }}>
                  {r.date}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap font-medium" style={{ color: "var(--color-navy)" }}>
                  {r.authorName}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                  {r.callDials ?? 0}/{r.callConnected ?? 0}/{r.callAppointments ?? 0}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                  {r.dmSent ?? 0}/{r.dmReplies ?? 0}/{r.dmAppointments ?? 0}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                  {r.eventCount ?? 0}/{r.eventCardsExchanged ?? 0}/{r.eventAppointments ?? 0}/
                  {r.eventFeeYen ? formatYen(r.eventFeeYen) : "¥0"}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">
                  {r.referralObtained ?? 0}/{r.referralAppointments ?? 0}
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {r.resultAppointments ?? 0}/{r.resultMeetings ?? 0}/{r.resultContracts ?? 0}
                </td>
              </tr>
            ))}
            {dailyRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-center" style={{ color: "var(--color-text-muted)" }}>
                  この月の報告がありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Collapsible>
    </section>
  );
}
