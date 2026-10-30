"use client";

/**
 * 「入社決定の入金予定(見込み)」セクション(トップ画面・全体タブ。入金予定の金色バーの直下)。
 * KPI表.xlsxで入社日が確定した人ごとに、契約条件(%or固定額)×年収(労働条件通知書)から見込み報酬を出し、
 * 入社月の翌月=入金予定月ごとにまとめて小計を表示する(計算は src/lib/placement-calc.ts、
 * 取得は src/lib/placement-data.ts)。行数は少ない想定のため折りたたまず常時表示する。
 * 条件付き契約などの「要確認」行は、この画面で選択肢(条件ラベル付き)から選ぶか金額を直接入力して確定できる
 * (POST /api/placement-fee → 連携シートに保存 → router.refresh())。確定した行は月小計に入る。
 * 編集系UIの出し分けは既存(/companies の編集UI)に合わせ、ロールによる制限は設けていない。
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import SourceBadge from "@/components/SourceBadge";
import {
  groupPlacementsByMonth,
  MAX_FEE_YEN,
  paymentMonthLabel,
  type FeeOption,
  type PlacementForecastRow,
  type PlacementMonthGroup,
} from "@/lib/placement-calc";
import type { PlacementFeeDecision } from "@/lib/placement-decisions";
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

/** 率オプションの金額(年収が取れているときだけ)。 */
function rateFeeYen(percent: number, annualIncomeYen: number | undefined): number | undefined {
  return annualIncomeYen === undefined ? undefined : Math.round((annualIncomeYen * percent) / 100);
}

/** 選択肢の説明部分。率は「30% → ¥X」(年収未取得なら「30%」)、固定は条件ラベルがあれば「一律¥N」、無ければ「固定¥N」。 */
function optionDetail(option: FeeOption, annualIncomeYen: number | undefined, withAmount: boolean): string {
  if (option.kind === "rate") {
    const fee = withAmount ? rateFeeYen(option.ratePercent, annualIncomeYen) : undefined;
    return fee !== undefined ? `${option.ratePercent}% → ${formatYen(fee)}` : `${option.ratePercent}%`;
  }
  return `${option.label ? "一律" : "固定"}${formatYen(option.amountYen)}`;
}

/** チップの表示: 「事務職(一律¥400,000)」「経験者(35% → ¥1,627,500)」。ラベルが無ければ「35%」「固定¥700,000」。 */
function optionChipText(option: FeeOption, annualIncomeYen: number | undefined): string {
  const detail = optionDetail(option, annualIncomeYen, true);
  return option.label ? `${option.label}(${detail})` : detail;
}

/** 確定済みの内容の表示: 「事務職(一律¥400,000)」「経験者(35%)」「固定¥700,000」。 */
function decisionText(decision: PlacementFeeDecision): string {
  const detail =
    decision.type === "rate"
      ? `${decision.ratePercent}%`
      : `${decision.label ? "一律" : "固定"}${formatYen(decision.feeYen ?? 0)}`;
  return decision.label ? `${decision.label}(${detail})` : detail;
}

function optionMatchesDecision(option: FeeOption, decision: PlacementFeeDecision | undefined): boolean {
  if (!decision || decision.type !== option.kind) return false;
  return option.kind === "rate" ? decision.ratePercent === option.ratePercent : decision.feeYen === option.amountYen;
}

/**
 * 要確認行の確定UI。選択肢のチップ(条件付き契約)+「金額を直接入力」(固定額として保存)。
 * 保存中は全ボタンをdisabledにして「保存中…」を出し、成功したら router.refresh() で再読み込みする。
 */
function FeeDecisionEditor({ row, onDone }: { row: PlacementForecastRow; onDone?: () => void }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [directInput, setDirectInput] = useState("");
  const busy = savingKey !== null || isRefreshing;

  async function post(savingId: string, payload: Record<string, unknown>) {
    setSavingKey(savingId);
    setError(null);
    try {
      const res = await fetch("/api/placement-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, company: row.company, ...payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || "保存に失敗しました。");
      onDone?.();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSavingKey(null);
    }
  }

  function chooseOption(option: FeeOption, index: number) {
    const base = { type: option.kind, label: option.label };
    void post(
      `option-${index}`,
      option.kind === "rate" ? { ...base, ratePercent: option.ratePercent } : { ...base, feeYen: option.amountYen },
    );
  }

  function saveDirect() {
    const value = Number(directInput.normalize("NFKC").replace(/[,\s]/g, "").replace(/円$/, ""));
    if (!Number.isInteger(value) || value < 1 || value > MAX_FEE_YEN) {
      setError(`金額は1〜${MAX_FEE_YEN.toLocaleString("ja-JP")}円の整数で入力してください。`);
      return;
    }
    void post("direct", { type: "fixed", feeYen: value });
  }

  const chipBase = "min-h-[36px] whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-medium disabled:opacity-60";

  return (
    <div className="mt-1 flex flex-col gap-2">
      {row.feeOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.feeOptions.map((option, i) => {
            const selected = optionMatchesDecision(option, row.decision);
            return (
              <button
                key={`${option.kind}-${option.kind === "rate" ? option.ratePercent : option.amountYen}`}
                type="button"
                disabled={busy}
                onClick={() => chooseOption(option, i)}
                className={chipBase}
                style={
                  selected
                    ? { background: "var(--color-navy)", color: "#ffffff", borderColor: "var(--color-navy)" }
                    : { background: "var(--color-card)", color: "var(--color-navy)", borderColor: "var(--color-border)" }
                }
              >
                {savingKey === `option-${i}` ? "保存中…" : optionChipText(option, row.annualIncomeYen)}
              </button>
            );
          })}
        </div>
      )}
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          saveDirect();
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          value={directInput}
          onChange={(e) => setDirectInput(e.target.value)}
          disabled={busy}
          placeholder="金額を直接入力(円)"
          aria-label="金額を直接入力(円)"
          className="min-h-[36px] w-44 rounded-lg px-2.5 py-1.5 text-base outline-none sm:text-[12.5px]"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        />
        <button
          type="submit"
          disabled={busy || directInput.trim() === ""}
          className="min-h-[36px] rounded-full px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          style={{ background: "var(--color-navy)", color: "#ffffff" }}
        >
          {savingKey === "direct" ? "保存中…" : "保存"}
        </button>
        {onDone && (
          <button
            type="button"
            disabled={busy}
            onClick={onDone}
            className="min-h-[36px] rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
            style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
          >
            キャンセル
          </button>
        )}
      </form>
      {error && (
        <p className="text-[11px]" style={{ color: "var(--color-bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** 確定済み行の表示(「確定: 事務職(一律¥400,000)」+「変更」「選択を取り消す」)。 */
function FeeDecisionSummary({ row, decision }: { row: PlacementForecastRow; decision: PlacementFeeDecision }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = clearing || isRefreshing;

  async function clearDecision() {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/placement-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, company: row.company, clear: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || "取り消しに失敗しました。");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "取り消しに失敗しました。");
    } finally {
      setClearing(false);
    }
  }

  const linkClass = "min-h-[28px] text-[11px] underline disabled:opacity-60";
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--color-good)" }}>
          確定: {decisionText(decision)}
        </span>
        <span>(選択済み)</span>
        {!editing && (
          <>
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className={linkClass}>
              変更
            </button>
            <button type="button" disabled={busy} onClick={() => void clearDecision()} className={linkClass}>
              {clearing ? "取り消し中…" : "選択を取り消す"}
            </button>
          </>
        )}
      </p>
      {decision.type === "rate" && row.feeYen === undefined && (
        <p className="text-[11px]" style={{ color: "var(--color-warn)" }}>
          {decision.ratePercent}%で確定済み・年収未取得のため金額は未確定です(年収が取れ次第、自動で金額が入ります)
        </p>
      )}
      {editing && <FeeDecisionEditor row={row} onDone={() => setEditing(false)} />}
      {error && (
        <p className="text-[11px]" style={{ color: "var(--color-bad)" }}>
          {error}
        </p>
      )}
    </div>
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
          {row.invoiced && <Badge label="売上シート記載" tone="muted" />}
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
        {row.needsReview && row.reviewReason && (
          <p className="text-[11px]" style={{ color: "var(--color-warn)" }}>
            {row.reviewReason}
          </p>
        )}
        {/* 売上シート記載の行は、売上シートの金額・入金月を最優先で表示する(経営者指示)。
            確定UI(選択チップ等)は出さない。 */}
        {row.invoiced ? null : row.decision ? (
          <FeeDecisionSummary row={row} decision={row.decision} />
        ) : (
          row.needsReview && <FeeDecisionEditor row={row} />
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
            売上シートの金額(税込)・入金予定に計上済み
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
          {rows.some((r) => r.needsReview || r.decision) && (
            <p>※「要確認」の行は、契約内容の選択肢から選ぶか金額を直接入力して確定できます。確定内容は保存され、月小計に反映されます。</p>
          )}
          {hasInvoiced && (
            <p>
              ※「売上シート記載」は売上シート(翔び台請求書関係)に記載済みの分で、その金額(税込)・入金月を最優先で表示し、月小計にも含めています(上の入金予定(金色)にも同じ金額が入っています)。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
