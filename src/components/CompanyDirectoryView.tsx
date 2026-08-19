"use client";

/**
 * 「企業・求人」ページ。CAが管理する2つのGoogleスプレッドシート
 * (送客可能企業リスト・求人マトリックス)を一元的に検索・閲覧できるようにする。
 * 編集可能なのは送客可能企業リストの「状態」変更と「新規企業の追加」のみ(それ以外は閲覧専用)。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import {
  normalizeCompanyName,
  type ContractCompany,
  type JobMatrixCell,
  type JobMatrixEntry,
  type ReferralCompanyGroup,
  type ReferralCompanyJob,
} from "@/lib/adapters/company-directory";
import type { CompanyDataStatus, ContractDataResult } from "@/lib/company-data";
import KpiCard from "@/components/KpiCard";

type ReferralStatusFilter = "全て" | "募集中" | "募集停止" | "未設定";
type MainTab = "referral" | "matrix" | "contracts";

interface CompanyDirectoryViewProps {
  referralGroups: ReferralCompanyGroup[];
  jobMatrix: JobMatrixEntry[];
  status: CompanyDataStatus;
  errorMessage?: string;
  contracts: ContractDataResult;
}

function statusBadgeLabel(status: CompanyDataStatus): string {
  if (status === "live") return "Sheets(連携中)";
  if (status === "live-error") return "Sheets(接続エラー)";
  return "Sheets(未設定)";
}

/** 送客可能企業リストの「状態」セレクトの配色(募集中=良い/募集停止=中立グレー/空欄=注意)。 */
function statusStyle(status: string): { bg: string; fg: string; border: string } {
  if (status === "募集中") {
    return {
      bg: "color-mix(in srgb, var(--color-good) 14%, transparent)",
      fg: "var(--color-good)",
      border: "color-mix(in srgb, var(--color-good) 45%, transparent)",
    };
  }
  if (status === "募集停止") {
    return {
      bg: "color-mix(in srgb, var(--color-text-muted) 16%, transparent)",
      fg: "var(--color-text-muted)",
      border: "color-mix(in srgb, var(--color-text-muted) 40%, transparent)",
    };
  }
  return {
    bg: "color-mix(in srgb, var(--color-warn) 16%, transparent)",
    fg: "var(--color-warn)",
    border: "color-mix(in srgb, var(--color-warn) 45%, transparent)",
  };
}

function uniqueSorted(values: (string | undefined)[]): string[] {
  const set = new Set(values.filter((v): v is string => Boolean(v && v.trim())));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

/** 検索対象文字列に部分一致するか(企業名・職種・業界・勤務地・メモ等)。 */
function matchesReferralQuery(job: ReferralCompanyJob, query: string): boolean {
  if (!query) return true;
  const haystack = [
    job.companyName,
    job.jobType,
    job.industry,
    job.location,
    job.memo,
    job.hypothesis,
    job.ra,
  ]
    .filter(Boolean)
    .join(" ");
  return haystack.includes(query);
}

// ─────────────────────────────────────────────
// セットアップ手順(status: "unconfigured" 用)
// ─────────────────────────────────────────────

function SetupInstructions() {
  return (
    <div
      className="card flex flex-col gap-2.5 p-4 text-[12px] leading-relaxed"
      style={{ color: "var(--color-text)" }}
    >
      <p className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
        企業・求人ページはまだ設定されていません
      </p>
      <p style={{ color: "var(--color-text-muted)" }}>
        以下の手順で有効化してください(反映には環境変数の再設定後、アプリの再起動が必要です)。
      </p>
      <ol className="flex flex-col gap-1.5 pl-4" style={{ listStyleType: "decimal" }}>
        <li>
          環境変数 <code className="rounded bg-[var(--color-cream)] px-1 py-0.5">JOB_MATRIX_SHEET_ID</code>
          (求人マトリックスのスプレッドシートID)を設定する。
        </li>
        <li>
          環境変数{" "}
          <code className="rounded bg-[var(--color-cream)] px-1 py-0.5">REFERRAL_COMPANY_SHEET_ID</code>
          (送客可能企業リストのスプレッドシートID)を設定する。
        </li>
        <li>
          両方のスプレッドシートを、サービスアカウント(<code className="rounded bg-[var(--color-cream)] px-1 py-0.5">GOOGLE_SERVICE_ACCOUNT_FILE</code> /{" "}
          <code className="rounded bg-[var(--color-cream)] px-1 py-0.5">GOOGLE_SERVICE_ACCOUNT_JSON</code> のメールアドレス)に
          <strong>「編集者」権限</strong>で共有する。状態変更・企業追加をアプリから書き込むため、
          閲覧者権限だけでは書き込みに失敗します(求人マトリックス側は読み取り専用のため閲覧者権限のみで問題ありません)。
        </li>
        <li>
          環境変数 <code className="rounded bg-[var(--color-cream)] px-1 py-0.5">DATA_MODE=live</code> を設定する。
        </li>
      </ol>
      <p style={{ color: "var(--color-text-muted)" }}>
        ※ 2つのIDが入れ違いに設定されていても、シートのタイトルから自動判別するため問題ありません。
      </p>
      <p style={{ color: "var(--color-text-muted)" }}>
        ※ 契約企業サマリー・契約企業タブは環境変数 <code className="rounded bg-[var(--color-cream)] px-1 py-0.5">CONTRACT_COMPANY_SHEET_ID</code>{" "}
        を追加設定すると有効になります(任意・閲覧者権限で共有すればよい)。
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
      style={{ color: "var(--color-bad)", borderColor: "var(--color-bad)", background: "var(--color-card)" }}
    >
      接続エラーの内容: {message}
    </p>
  );
}

// ─────────────────────────────────────────────
// 契約企業(共通部品。送客可能企業タブの見出し連携でも使う)
// ─────────────────────────────────────────────

/** 契約済み/未契約の小バッジ配色(契約済み=緑・未契約=グレー。statusStyle と同じ配色方針)。 */
function contractStatusStyle(isContracted: boolean): { bg: string; fg: string; border: string } {
  if (isContracted) {
    return {
      bg: "color-mix(in srgb, var(--color-good) 14%, transparent)",
      fg: "var(--color-good)",
      border: "color-mix(in srgb, var(--color-good) 45%, transparent)",
    };
  }
  return {
    bg: "color-mix(in srgb, var(--color-text-muted) 16%, transparent)",
    fg: "var(--color-text-muted)",
    border: "color-mix(in srgb, var(--color-text-muted) 40%, transparent)",
  };
}

function ContractStatusBadge({ isContracted }: { isContracted: boolean }) {
  const style = contractStatusStyle(isContracted);
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
    >
      {isContracted ? "契約済み" : "未契約"}
    </span>
  );
}

/** 報酬バッジ。%表記(feeLabel に % を含む)はゴールドで強調し、金額表記等はグレーの控えめ表示にする。 */
function FeeBadge({ label }: { label: string }) {
  const isPercent = label.includes("%");
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={
        isPercent
          ? {
              background: "color-mix(in srgb, var(--color-gold) 16%, transparent)",
              color: "var(--color-gold)",
              border: "1px solid color-mix(in srgb, var(--color-gold) 45%, transparent)",
            }
          : {
              background: "var(--color-cream)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }
      }
    >
      {label || "-"}
    </span>
  );
}

/** 契約書(Googleドライブ等)へのリンク。運用上、貼られていない行の方が多いため呼び出し側は url がある場合のみ描画する。 */
function ContractDocumentLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-[11px] font-semibold underline"
      style={{ color: "var(--color-gold)" }}
    >
      契約書を開く →
    </a>
  );
}

/**
 * 送客可能企業リストの企業名と契約企業一覧を突き合わせる(どちらかがどちらかを正規化後の文字列を
 * 含んでいれば一致とみなす、部分一致の緩い判定)。正規化は adapter の normalizeCompanyName を再利用する。
 * 同一企業が契約企業シートに複数行ある場合は最初に見つかった行を採用する。
 */
function findContractMatch(companyName: string, contracts: ContractCompany[]): ContractCompany | undefined {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized) return undefined;
  return contracts.find((c) => {
    const cn = normalizeCompanyName(c.companyName);
    return cn.length > 0 && (normalized.includes(cn) || cn.includes(normalized));
  });
}

/** サマリーカード列(契約企業数・商談中数・契約形態の内訳)。契約企業タブの上・送客可能企業タブの上に常時表示する。 */
function ContractSummaryCards({ companies }: { companies: ContractCompany[] }) {
  // シートに載っている企業は全て「送客できる企業」という経営者の運用のため、
  // 全体数を主役にし、その中を契約済み/未契約に分けて見せる。
  const contractedCount = companies.filter((c) => c.isContracted).length;
  const uncontractedCount = companies.length - contractedCount;

  // 契約形態の内訳は「成果報酬/その他」の2分ではなく、実際の値ごとに数える
  // (経営者から「その他◯社の内訳は?」と質問があったため。空欄は「未入力」として明示する)。
  const typeCounts = new Map<string, number>();
  for (const c of companies) {
    const key = c.contractType || "未入力";
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }
  const typeBreakdown = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
      <KpiCard label="送客可能企業(全体)" value={`${companies.length}社`} accent caption="契約企業シートに記載の全社" />
      <KpiCard label="契約済み" value={`${contractedCount}社`} accent caption="契約締結済み" />
      <KpiCard label="未契約" value={`${uncontractedCount}社`} caption="商談中・契約書類なし" />
      {/* 内訳は値の種類数が可変で文字量が多いため、KpiCard ではなく行リストのカードで見せる。 */}
      <div className="card flex flex-col gap-1 p-3.5">
        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
          契約形態の内訳
        </span>
        <div className="flex flex-col gap-0.5">
          {typeBreakdown.map(([type, count]) => (
            <div key={type} className="flex items-baseline justify-between gap-2">
              <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                {type}
              </span>
              <span className="text-[14px] font-bold" style={{ color: "var(--color-kpi-value)" }}>
                {count}社
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 送客可能企業リスト
// ─────────────────────────────────────────────

const REFERRAL_DETAIL_ROWS: { label: string; key: keyof ReferralCompanyJob }[] = [
  { label: "打ち合わせ議事録", key: "meetingMinutes" },
  { label: "企業ツール", key: "companyTool" },
  { label: "送客ツールメモ", key: "referralToolMemo" },
  { label: "担当者連絡先", key: "contact" },
  { label: "経験有無", key: "experience" },
  { label: "年齢(上限)", key: "ageLimit" },
  { label: "年齢条件 備考", key: "ageNote" },
  { label: "運転免許", key: "license" },
  { label: "休日", key: "holiday" },
  { label: "条件付き休日", key: "conditionalHoliday" },
  { label: "年間休日", key: "annualHoliday" },
  { label: "外国人受入有無", key: "foreignerAccept" },
  { label: "インセンティブ", key: "incentive" },
  { label: "転勤有無", key: "transfer" },
  { label: "住宅補助/社宅有無", key: "housingSupport" },
  { label: "資格/スキル(あるといい)", key: "skills" },
  { label: "みなし残業", key: "deemedOvertime" },
  { label: "仮説すり合わせ・企業説明用", key: "hypothesis" },
];

function ReferralStatusSelect({
  job,
  onChange,
  disabled,
}: {
  job: ReferralCompanyJob;
  onChange: (job: ReferralCompanyJob, next: string) => void;
  disabled: boolean;
}) {
  const style = statusStyle(job.status);
  return (
    <select
      value={job.status || ""}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(job, e.target.value)}
      className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none"
      style={{ background: style.bg, color: style.fg, borderColor: style.border }}
    >
      <option value="募集中">募集中</option>
      <option value="募集停止">募集停止</option>
      {!job.status && <option value="">(未設定)</option>}
    </select>
  );
}

function ReferralJobRow({
  job,
  onChangeStatus,
  updating,
}: {
  job: ReferralCompanyJob;
  onChangeStatus: (job: ReferralCompanyJob, next: string) => void;
  updating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = [job.jobType, job.workStyle, job.experience && `経験:${job.experience}`, job.holiday]
    .filter(Boolean)
    .join(" ・ ");

  return (
    <div className="flex flex-col border-t first:border-t-0" style={{ borderColor: "var(--color-border)" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--color-text)" }}>
            {job.jobType || "(職種未設定)"}
          </span>
          {summary && (
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {summary}
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {job.minIncome ? `下限年収 ${job.minIncome}` : "下限年収 未設定"}
            {job.ageLimit ? ` ・ 年齢上限 ${job.ageLimit}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReferralStatusSelect job={job} onChange={onChangeStatus} disabled={updating} />
          <span className="text-[11px]" style={{ color: "var(--color-gold)" }}>
            {expanded ? "閉じる ▲" : "詳細 ▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3 text-[12px] leading-relaxed">
          {job.hp && (
            <p>
              <span style={{ color: "var(--color-text-muted)" }}>HP: </span>
              <a
                href={job.hp.startsWith("http") ? job.hp : `https://${job.hp}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: "var(--color-gold)" }}
              >
                {job.hp}
              </a>
            </p>
          )}
          {job.memo && (
            <p
              className="rounded-lg px-2.5 py-1.5"
              style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
            >
              {job.memo}
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {REFERRAL_DETAIL_ROWS.filter((row) => job[row.key]).map((row) => (
              <p key={row.label}>
                <span style={{ color: "var(--color-text-muted)" }}>{row.label}: </span>
                <span style={{ color: "var(--color-text)" }}>{String(job[row.key])}</span>
              </p>
            ))}
          </div>
          <p className="text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
            No.{job.no || "-"} ・ RA: {job.ra || "-"} ・ 業界: {job.industry || "-"} ・ 勤務地: {job.location || "-"}
          </p>
        </div>
      )}
    </div>
  );
}

interface AddCompanyForm {
  companyName: string;
  status: string;
  ra: string;
  region: string;
  industry: string;
  jobType: string;
  memo: string;
}

const EMPTY_ADD_FORM: AddCompanyForm = {
  companyName: "",
  status: "募集中",
  ra: "",
  region: "",
  industry: "",
  jobType: "",
  memo: "",
};

function AddCompanyForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<AddCompanyForm>(EMPTY_ADD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof AddCompanyForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) {
      setError("企業名は必須です。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "append", ...form }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error || "追加に失敗しました。");
      }
      setForm(EMPTY_ADD_FORM);
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text)",
  } as const;

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-2.5 p-3.5">
      <p className="text-[12.5px] font-bold" style={{ color: "var(--color-navy)" }}>
        企業を追加
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          企業名 ※必須
          <input
            required
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          状態
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={inputStyle}
          >
            <option value="募集中">募集中</option>
            <option value="募集停止">募集停止</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          RA
          <input
            value={form.ra}
            onChange={(e) => update("ra", e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          勤務地
          <input
            value={form.region}
            onChange={(e) => update("region", e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          業界
          <input
            value={form.industry}
            onChange={(e) => update("industry", e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          職種
          <input
            value={form.jobType}
            onChange={(e) => update("jobType", e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={inputStyle}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        メモ
        <textarea
          value={form.memo}
          onChange={(e) => update("memo", e.target.value)}
          rows={2}
          className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
          style={inputStyle}
        />
      </label>
      {error && (
        <p className="text-[11px]" style={{ color: "var(--color-bad)" }}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
          style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
          style={{ background: "var(--color-navy)", color: "#ffffff", opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? "追加中…" : "追加する"}
        </button>
      </div>
    </form>
  );
}

function ReferralCompanyTab({
  groups: initialGroups,
  contractCompanies,
}: {
  groups: ReferralCompanyGroup[];
  /** 契約企業一覧(見出し行の報酬・契約状況バッジ表示用。未設定/未取得時は空配列)。 */
  contractCompanies: ContractCompany[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReferralStatusFilter>("全て");
  const [locationFilter, setLocationFilter] = useState("全て");
  const [industryFilter, setIndustryFilter] = useState("全て");
  const [jobTypeFilter, setJobTypeFilter] = useState("全て");
  const [showAddForm, setShowAddForm] = useState(false);
  const [updatingRow, setUpdatingRow] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // 企業名→契約企業行(部分一致で最初に見つかったもの)のマップ。groups・contractCompanies が
  // 変わらない限り再計算しない(タブ切り替えのたびに O(企業数×契約企業数) を回さないため)。
  const contractMatchByCompany = useMemo(() => {
    const map = new Map<string, ContractCompany>();
    if (contractCompanies.length === 0) return map;
    for (const group of initialGroups) {
      const match = findContractMatch(group.companyName, contractCompanies);
      if (match) map.set(group.companyName, match);
    }
    return map;
  }, [initialGroups, contractCompanies]);

  const allJobs = useMemo(() => groups.flatMap((g) => g.jobs), [groups]);
  const locations = useMemo(() => uniqueSorted(allJobs.map((j) => j.location)), [allJobs]);
  const industries = useMemo(() => uniqueSorted(allJobs.map((j) => j.industry)), [allJobs]);
  const jobTypes = useMemo(() => uniqueSorted(allJobs.map((j) => j.jobType)), [allJobs]);

  const filteredGroups = useMemo(() => {
    const q = query.trim();
    return groups
      .map((group) => {
        const jobs = group.jobs.filter((job) => {
          if (statusFilter === "未設定" && job.status) return false;
          if (statusFilter !== "全て" && statusFilter !== "未設定" && job.status !== statusFilter) return false;
          if (locationFilter !== "全て" && job.location !== locationFilter) return false;
          if (industryFilter !== "全て" && job.industry !== industryFilter) return false;
          if (jobTypeFilter !== "全て" && job.jobType !== jobTypeFilter) return false;
          if (!matchesReferralQuery(job, q) && !group.companyName.includes(q)) return false;
          return true;
        });
        return { companyName: group.companyName, jobs };
      })
      .filter((g) => g.jobs.length > 0);
  }, [groups, query, statusFilter, locationFilter, industryFilter, jobTypeFilter]);

  async function handleStatusChange(job: ReferralCompanyJob, nextStatus: string) {
    const prevStatus = job.status;
    setStatusError(null);
    setUpdatingRow(job.rowNumber);
    setGroups((gs) =>
      gs.map((g) => ({
        ...g,
        jobs: g.jobs.map((j) => (j.rowNumber === job.rowNumber ? { ...j, status: nextStatus } : j)),
      })),
    );
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateStatus",
          rowNumber: job.rowNumber,
          expectedCompanyName: job.companyName,
          status: nextStatus,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error || "更新に失敗しました。");
      }
    } catch (err) {
      // 失敗時は元の状態に戻す(optimistic更新の巻き戻し)
      setGroups((gs) =>
        gs.map((g) => ({
          ...g,
          jobs: g.jobs.map((j) => (j.rowNumber === job.rowNumber ? { ...j, status: prevStatus } : j)),
        })),
      );
      setStatusError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setUpdatingRow(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="企業名・職種・メモ等で検索"
        className="rounded-full px-4 py-2.5 text-[13px] outline-none"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="状態"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ReferralStatusFilter)}
          options={["全て", "募集中", "募集停止", "未設定"]}
        />
        <FilterSelect label="勤務地" value={locationFilter} onChange={setLocationFilter} options={["全て", ...locations]} />
        <FilterSelect label="業界" value={industryFilter} onChange={setIndustryFilter} options={["全て", ...industries]} />
        <FilterSelect label="職種" value={jobTypeFilter} onChange={setJobTypeFilter} options={["全て", ...jobTypes]} />
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="ml-auto rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
          style={{ background: "var(--color-navy)", color: "#ffffff" }}
        >
          ＋ 企業を追加
        </button>
      </div>

      {statusError && (
        <p className="text-[11px]" style={{ color: "var(--color-bad)" }}>
          {statusError}
        </p>
      )}
      {showAddForm && <AddCompanyForm onDone={() => setShowAddForm(false)} />}

      {filteredGroups.length === 0 && (
        <p className="py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          該当する企業が見つかりませんでした。
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {filteredGroups.map((group) => {
          const contractMatch = contractMatchByCompany.get(group.companyName);
          return (
          <div key={group.companyName} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5" style={{ background: "var(--color-cream)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-bold" style={{ color: "var(--color-navy)" }}>
                  {group.companyName}
                </span>
                {contractMatch && (
                  <>
                    <FeeBadge label={`報酬 ${contractMatch.feeLabel}`} />
                    <ContractStatusBadge isContracted={contractMatch.isContracted} />
                  </>
                )}
              </div>
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                求人 {group.jobs.length}件
              </span>
            </div>
            <div>
              {group.jobs.map((job) => (
                <ReferralJobRow
                  key={job.rowNumber}
                  job={job}
                  onChangeStatus={handleStatusChange}
                  updating={updatingRow === job.rowNumber}
                />
              ))}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 求人マトリックス(読み取り専用)
// ─────────────────────────────────────────────

function isListing(entry: JobMatrixEntry): entry is Extract<JobMatrixEntry, { kind: "listing" }> {
  return entry.kind === "listing";
}
function isMatrixCell(entry: JobMatrixEntry): entry is JobMatrixCell {
  return entry.kind === "matrix";
}

function matchesMatrixQuery(entry: JobMatrixEntry, query: string): boolean {
  if (!query) return true;
  const haystack = isListing(entry)
    ? [entry.jobName, entry.jobCategory, entry.area, entry.location, entry.requirements, entry.tab]
    : [entry.company, entry.category, entry.orientation, entry.detail, entry.tab];
  return haystack.filter(Boolean).join(" ").includes(query);
}

function JobMatrixTab({ entries }: { entries: JobMatrixEntry[] }) {
  const [query, setQuery] = useState("");
  const [tabFilter, setTabFilter] = useState("全て");
  const [hideClosed, setHideClosed] = useState(true);

  const tabs = useMemo(() => uniqueSorted(entries.map((e) => e.tab)), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return entries.filter((entry) => {
      if (tabFilter !== "全て" && entry.tab !== tabFilter) return false;
      if (hideClosed && isMatrixCell(entry) && entry.closed) return false;
      if (!matchesMatrixQuery(entry, q)) return false;
      return true;
    });
  }, [entries, query, tabFilter, hideClosed]);

  const listings = filtered.filter(isListing);
  const matrixCells = filtered.filter(isMatrixCell);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="会社名・求人名・条件等で検索"
        className="rounded-full px-4 py-2.5 text-[13px] outline-none"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="元タブ" value={tabFilter} onChange={setTabFilter} options={["全て", ...tabs]} />
        <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text)" }}>
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
          募集終了を隠す
        </label>
        <span className="ml-auto text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
          閲覧専用(このタブからは編集できません)
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          該当する求人が見つかりませんでした。
        </p>
      )}

      {listings.length > 0 && (
        <div className="card overflow-x-auto p-3.5">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">求人名</th>
                <th className="pb-2 pr-2 font-medium">職種</th>
                <th className="pb-2 pr-2 font-medium">勤務地エリア</th>
                <th className="pb-2 pr-2 font-medium">勤務地</th>
                <th className="pb-2 pr-2 font-medium">必須条件</th>
                <th className="pb-2 pr-2 font-medium">元タブ</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((entry, i) => (
                <tr key={`${entry.tab}-${entry.jobName}-${i}`} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-1.5 pr-2 font-semibold" style={{ color: "var(--color-navy)" }}>
                    {entry.isNew && (
                      <span
                        className="mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--color-gold)", color: "#ffffff" }}
                      >
                        新着
                      </span>
                    )}
                    {entry.jobName}
                  </td>
                  <td className="py-1.5 pr-2">{entry.jobCategory || "-"}</td>
                  <td className="py-1.5 pr-2">{entry.area || "-"}</td>
                  <td className="py-1.5 pr-2">{entry.location || "-"}</td>
                  <td className="py-1.5 pr-2">{entry.requirements || "-"}</td>
                  <td className="py-1.5 pr-2" style={{ color: "var(--color-text-muted)" }}>
                    {entry.tab}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matrixCells.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {matrixCells.map((entry, i) => (
            <div
              key={`${entry.tab}-${entry.company}-${i}`}
              className="card flex flex-col gap-1.5 p-3.5"
              style={entry.closed ? { opacity: 0.6 } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="text-[13px] font-bold"
                  style={{
                    color: "var(--color-navy)",
                    textDecorationLine: entry.closed ? "line-through" : undefined,
                  }}
                >
                  {entry.company}
                </span>
                {entry.closed && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--color-bad) 14%, transparent)",
                      color: "var(--color-bad)",
                      border: "1px solid color-mix(in srgb, var(--color-bad) 40%, transparent)",
                    }}
                  >
                    募集終了
                  </span>
                )}
              </div>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {entry.orientation || "-"} ・ {entry.category || "-"}
              </p>
              {entry.detail && (
                <p className="whitespace-pre-line text-[11.5px] leading-relaxed" style={{ color: "var(--color-text)" }}>
                  {entry.detail}
                </p>
              )}
              <p className="text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
                元タブ: {entry.tab}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 契約企業タブ(読み取り専用)
// ─────────────────────────────────────────────

/** 検索対象文字列に部分一致するか(企業名・担当・契約形態・契約内容・契約書類・メモ)。 */
function matchesContractQuery(company: ContractCompany, query: string): boolean {
  if (!query) return true;
  const haystack = [
    company.companyName,
    company.staff,
    company.contractType,
    company.contractTerms,
    company.documentType,
    company.memo,
  ]
    .filter(Boolean)
    .join(" ");
  return haystack.includes(query);
}

function ContractCompanyRow({ company }: { company: ContractCompany }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <td className="py-2 pr-2 font-semibold" style={{ color: "var(--color-navy)" }}>
          {company.companyName}
        </td>
        <td className="py-2 pr-2">{company.staff || "-"}</td>
        <td className="py-2 pr-2">{company.contractType || "-"}</td>
        <td className="py-2 pr-2">
          <FeeBadge label={company.feeLabel} />
        </td>
        <td className="py-2 pr-2">
          <ContractStatusBadge isContracted={company.isContracted} />
        </td>
        <td className="py-2 pr-2">{company.documentType || "-"}</td>
        <td className="max-w-[220px] truncate py-2 pr-2" style={{ color: "var(--color-text-muted)" }}>
          {company.memo || "-"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t" style={{ borderColor: "var(--color-border)" }}>
          <td colSpan={7} className="px-2 pb-3 pt-1">
            <div
              className="flex flex-col gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed"
              style={{ background: "var(--color-cream)" }}
            >
              <p>
                <span style={{ color: "var(--color-text-muted)" }}>契約内容(原文): </span>
                <span style={{ color: "var(--color-text)" }}>{company.contractTerms || "(未記入)"}</span>
              </p>
              {company.memo && (
                <p>
                  <span style={{ color: "var(--color-text-muted)" }}>メモ: </span>
                  <span style={{ color: "var(--color-text)" }}>{company.memo}</span>
                </p>
              )}
              {/* 契約書URLは貼られていない行の方が多い運用実態のため、見つかった行だけリンクを出す。 */}
              {company.contractUrl && <ContractDocumentLink url={company.contractUrl} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ContractCompanyTab({ companies }: { companies: ContractCompany[] }) {
  const [query, setQuery] = useState("");
  const [contractedOnly, setContractedOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    return companies.filter((c) => {
      if (contractedOnly && !c.isContracted) return false;
      if (!matchesContractQuery(c, q)) return false;
      return true;
    });
  }, [companies, query, contractedOnly]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="企業名・担当・契約内容・メモ等で検索"
        className="rounded-full px-4 py-2.5 text-[13px] outline-none"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text)" }}>
          <input
            type="checkbox"
            checked={contractedOnly}
            onChange={(e) => setContractedOnly(e.target.checked)}
          />
          契約済みのみ
        </label>
        <span className="ml-auto text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
          閲覧専用・行クリックで契約内容の全文を表示
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          該当する企業が見つかりませんでした。
        </p>
      )}

      {filtered.length > 0 && (
        <div className="card overflow-x-auto p-3.5">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="pb-2 pr-2 font-medium">企業</th>
                <th className="pb-2 pr-2 font-medium">担当</th>
                <th className="pb-2 pr-2 font-medium">契約形態</th>
                <th className="pb-2 pr-2 font-medium">報酬</th>
                <th className="pb-2 pr-2 font-medium">契約状況</th>
                <th className="pb-2 pr-2 font-medium">契約書類</th>
                <th className="pb-2 pr-2 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <ContractCompanyRow key={company.rowNumber} company={company} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 共通UI
// ─────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border px-2.5 py-1 text-[12px] outline-none"
        style={{ background: "var(--color-card)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function CompanyDirectoryView({
  referralGroups,
  jobMatrix,
  status,
  errorMessage,
  contracts,
}: CompanyDirectoryViewProps) {
  const [mainTab, setMainTab] = useState<MainTab>("referral");
  const contractsLive = contracts.status === "live";

  const tabOptions = [
    ["referral", "送客可能企業"],
    ["matrix", "求人マトリックス"],
    ...(contractsLive ? [["contracts", "契約企業"]] : []),
  ] as [MainTab, string][];

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3.5 px-4 pb-4 pt-4 lg:gap-5 lg:px-8 lg:pb-10 lg:pt-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Link href="/" className="text-[12px] font-semibold" style={{ color: "var(--color-gold)" }}>
            ← 今日の経営へ戻る
          </Link>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--color-navy)" }}>
            企業・求人
          </h1>
        </div>
        <span className="source-badge">{statusBadgeLabel(status)}</span>
      </div>

      {status === "live-error" && errorMessage && <ErrorBanner message={errorMessage} />}
      {status === "unconfigured" && <SetupInstructions />}
      {/* 契約企業は送客可能企業リスト・求人マトリックスとは独立した接続状態のため、別枠でエラー表示する。 */}
      {contracts.status === "live-error" && contracts.errorMessage && <ErrorBanner message={contracts.errorMessage} />}

      {status !== "unconfigured" && (
        <>
          {contractsLive && <ContractSummaryCards companies={contracts.companies} />}
          {contracts.status === "unconfigured" && (
            <p className="text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
              契約企業サマリー・契約企業タブは環境変数 CONTRACT_COMPANY_SHEET_ID が未設定のため非表示です。
            </p>
          )}

          <div className="flex overflow-hidden rounded-full border text-[12px]" style={{ borderColor: "var(--color-border)", width: "fit-content" }}>
            {tabOptions.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMainTab(key)}
                className="px-4 py-1.5 font-semibold"
                style={
                  mainTab === key
                    ? { background: "var(--color-navy)", color: "#ffffff" }
                    : { background: "var(--color-card)", color: "var(--color-text-muted)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {mainTab === "referral" && (
            <ReferralCompanyTab groups={referralGroups} contractCompanies={contracts.companies} />
          )}
          {mainTab === "matrix" && <JobMatrixTab entries={jobMatrix} />}
          {mainTab === "contracts" && contractsLive && <ContractCompanyTab companies={contracts.companies} />}
        </>
      )}
    </div>
  );
}
