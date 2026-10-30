"use client";

/**
 * 「入社決定の入金予定(見込み)」セクション(トップ画面・全体タブ。入金予定の金色バーの直下)。
 * KPI表.xlsxで入社日が確定した人ごとに、契約条件(%or固定額)×年収(労働条件通知書)から見込み報酬を出し、
 * 入社月の翌月=入金予定月ごとにまとめて小計を表示する(計算は src/lib/placement-calc.ts、
 * 取得は src/lib/placement-data.ts)。行数は少ない想定のため折りたたまず常時表示する。
 */
import SourceBadge from "@/components/SourceBadge";
import {
  groupPlacementsByMonth,
  paymentMonthLabel,
  type PlacementForecastRow,
  type PlacementMonthGroup,
} from "@/lib/placement-calc";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { SourceStatus } from "@/lib/types";

/** KPI表.xlsxの共有先(サービスアカウント)。共有未了の案内に表示する。 */
const SERVICE_ACCOUNT_EMAIL = "tobidai-cockpit-reader@static-chiller-503203-q8.iam.gserviceaccount.com";

function formatYen(amountYen: number): string {
  return `¥${Math.round(amountYen).toLocaleString("ja-JP")}`;
}

/** 入社日(YYYY-MM-DD)を「11/9入社」表記にする。 */
function hireDateLabel(hireDate: string): string {
  const [, m, d] = hireDate.split("-").map(Number);
  return `${m}/${d}入社`;
}

/** 契約条件の原文を1〜2行に収まる長さへ短縮する。 */
function shortTerms(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

function Badge({ label, tone }: { label: string; tone: "warn" | "muted" }) {
  const color = tone === "warn" ? "var(--color-warn)" : "var(--color-text-muted)";
  return (
    <span
      className="whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

/** 契約条件の1行表示(種別に応じて「35%」「一律¥500,000」「条件付き: 原文」)。 */
function termsSummary(row: PlacementForecastRow): string {
  if (row.termsKind === "rate" && row.ratePercent !== undefined) return `年収の${row.ratePercent}%`;
  if (row.termsKind === "fixed" && row.feeYen !== undefined) return `固定 ${formatYen(row.feeYen)}`;
  if (row.termsText) return `${row.termsKind === "conditional" ? "条件付き: " : ""}${shortTerms(row.termsText)}`;
  return "契約条件 未登録";
}

function PlacementRow({ row }: { row: PlacementForecastRow }) {
  const incomeLine =
    row.termsKind === "fixed" && row.feeSource === "fixed"
      ? null // 固定報酬は年収不要(労働条件通知書は読まない)
      : row.annualIncomeYen !== undefined
        ? `年収 ${formatYen(row.annualIncomeYen)}(${row.incomeBasis ?? "手動補正"})`
        : "年収 未取得";

  return (
    <div
      className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-card)", opacity: row.invoiced ? 0.7 : 1 }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
            {hireDateLabel(row.hireDate)}
          </span>
          <span className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            {row.name}
          </span>
          <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {row.company}
          </span>
          {row.invoiced && <Badge label="請求書手配済み" tone="muted" />}
          {row.needsReview && <Badge label="要確認" tone="warn" />}
          {row.contractUnconfirmed && <Badge label="契約未確認" tone="muted" />}
          {row.threadUrl && (
            <a
              href={row.threadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              Slack
            </a>
          )}
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          契約: {termsSummary(row)}
          {incomeLine ? ` ／ ${incomeLine}` : ""}
          {row.matchedCompany ? ` ／ 企業一覧上の名称: ${row.matchedCompany}` : ""}
        </p>
        {row.termsKind === "conditional" && (
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            {[
              ...row.rateFeeCandidates.map((c) =>
                c.feeYen !== undefined ? `${c.ratePercent}%なら${formatYen(c.feeYen)}` : `${c.ratePercent}%なら年収×${c.ratePercent}%`,
              ),
              ...row.fixedCandidatesYen.map((y) => `固定なら${formatYen(y)}`),
            ].join(" / ")}
          </p>
        )}
        {row.needsReview && row.reviewReason && (
          <p className="text-[11px]" style={{ color: "var(--color-warn)" }}>
            {row.reviewReason}
          </p>
        )}
        {row.overrideNote && (
          <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            手動補正: {row.overrideNote}
          </p>
        )}
      </div>
      <div className="shrink-0 sm:text-right">
        <p
          className="text-[16px] font-bold leading-tight"
          style={{ color: row.feeYen !== undefined ? "var(--color-gold)" : "var(--color-text-muted)" }}
        >
          {row.feeYen !== undefined ? formatYen(row.feeYen) : "—"}
        </p>
        {row.invoiced && (
          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            小計に含まず
          </p>
        )}
      </div>
    </div>
  );
}

function MonthBlock({ group }: { group: PlacementMonthGroup }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl px-3.5 py-2.5"
        style={{
          background: "color-mix(in srgb, var(--color-gold) 10%, var(--color-card))",
          border: "1px solid color-mix(in srgb, var(--color-gold) 45%, transparent)",
        }}
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
          {paymentMonthLabel(group.payMonth)}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          {group.undeterminedCount > 0 && (
            <span className="text-[11px]" style={{ color: "var(--color-warn)" }}>
              金額未確定 {group.undeterminedCount}件
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            月小計
          </span>
          <span className="text-[18px] font-bold leading-tight" style={{ color: "var(--color-gold)" }}>
            {formatYen(group.subtotalYen)}
          </span>
        </span>
      </div>
      {group.rows.map((row) => (
        <PlacementRow key={row.id} row={row} />
      ))}
    </div>
  );
}

export default function PlacementForecastSection({
  rows,
  status,
  shareNeeded,
  warnings,
  errorMessage,
}: {
  rows: PlacementForecastRow[];
  status: SourceStatus;
  shareNeeded: boolean;
  warnings: string[];
  errorMessage?: string;
}) {
  const groups = groupPlacementsByMonth(rows);
  const hasInvoiced = rows.some((r) => r.invoiced);
  const mutedNote = { color: "var(--color-text-muted)", borderColor: "var(--color-border)", background: "var(--color-card)" };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
          入社決定の入金予定(見込み)
        </h2>
        <SourceBadge label={sourceBadgeLabel("placements", status)} />
      </div>

      {status === "live-error" && (
        <p className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={mutedNote}>
          {shareNeeded ? (
            <>
              KPI表.xlsx をサービスアカウント({SERVICE_ACCOUNT_EMAIL})に閲覧者で共有してください。共有すると、入社日が決まった方の入金予定がここに表示されます。
              {errorMessage ? `(詳細: ${errorMessage})` : ""}
            </>
          ) : (
            <>入社決定の入金予定を読み込めませんでした{errorMessage ? `(${errorMessage})` : ""}。</>
          )}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={mutedNote}>
          {w}
        </p>
      ))}

      {status !== "live-error" && groups.length === 0 && (
        <p className="rounded-lg border px-3 py-2 text-[11px]" style={mutedNote}>
          入社日が確定している方はいません(過去45日〜今後の入社分を表示します)。
        </p>
      )}

      {groups.map((group) => (
        <MonthBlock key={group.payMonth} group={group} />
      ))}

      {groups.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[10px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          <p>※金額は契約条件の額面(税抜)。請求時は消費税10%が加わります</p>
          <p>※入金予定月は入社月の翌月末です。年収は労働条件通知書(Slack「#求職者」)から読み取っており、固定報酬の企業は通知書を確認していません。</p>
          {hasInvoiced && (
            <p>※「請求書手配済み」は売上シートの同じ入金月に同じ求職者名がある分で、二重に期待しないよう月小計には含めていません。</p>
          )}
        </div>
      )}
    </section>
  );
}
