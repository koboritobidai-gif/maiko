"use client";

/**
 * 「請求書作成」ページ(/invoice)。送客売上シートの行から請求書のプレビューを作り、
 * ブラウザの印刷機能でA4 1枚のPDFとして保存できるようにする(経営者が手作業でWordの雛形を
 * 書き換えていた作業の代替)。書き込みは一切行わない(売上シートは読み取り専用で使う)。
 *
 * 編集できるのは宛先会社名/宛名2行目/明細行(求職者名・金額(税込)・内訳の組を1行以上)/請求No./請求日/
 * お支払期限のみ。同じ会社への複数件は行一覧の「まとめて作成」で明細複数行の1枚にできる。
 * 登録番号・発行元住所・TEL・メール・担当・振込先・備考文はテンプレート固定のため
 * InvoiceSheet 側にハードコードしてあり、ここでは触らない。
 *
 * 印刷時は月選択・行一覧・フォーム等(このファイルの `print:hidden` 範囲)を紙面から除外し、
 * InvoiceSheet(請求書そのもの)だけが印刷される。
 */
import { type ReactNode, useMemo, useRef, useState } from "react";
import InvoiceSheet from "@/components/InvoiceSheet";
import PrintButton from "@/components/PrintButton";
import {
  currentMonthKey,
  formatDueDateLabel,
  formatInflowMonthLabel,
  formatIssueDateLabel,
  formatYen,
  getDefaultDueDate,
  getDefaultIssueDate,
  parseDateInputValue,
  toDateInputValue,
} from "@/lib/invoice-calc";
import type { RevenueRecord } from "@/lib/types";

/** 明細1行(求職者1名ぶん)のフォーム値。 */
interface InvoiceItemForm {
  /** React の key 用(行の追加・削除で入力欄の状態がずれないようにする。請求書には出ない) */
  id: string;
  candidateName: string;
  /** 摘要の内訳(任意・自由記載)。「月収28万×12ヶ月×成功報酬35%」等を摘要の2行目に印字する。 */
  breakdownNote: string;
  /** 金額(税込)。<input type="number"> の生値をそのまま保持する(空欄も許容するため文字列で持つ)。 */
  amountYen: string;
}

interface InvoiceFormState {
  companyName: string;
  /** 宛名2行目(既定「ご担当者」) */
  honorificLine: string;
  /** 明細行(常に1行以上) */
  items: InvoiceItemForm[];
  /** 請求No.(既定は空欄) */
  invoiceNo: string;
  /** <input type="date"> 用の YYYY-MM-DD */
  issueDate: string;
  dueDate: string;
}

// 宛名2行目は経営者の指示で既定は空欄(空欄なら請求書に行ごと表示されない)。請求No.の既定は「1」。
const DEFAULT_HONORIFIC = "";
const DEFAULT_INVOICE_NO = "1";

const BLANK_ITEM: InvoiceItemForm = { id: "item-0", candidateName: "", breakdownNote: "", amountYen: "" };

const BLANK_FORM: InvoiceFormState = {
  companyName: "",
  honorificLine: DEFAULT_HONORIFIC,
  items: [BLANK_ITEM],
  invoiceNo: DEFAULT_INVOICE_NO,
  issueDate: "",
  dueDate: "",
};

const navy = { color: "var(--color-navy)" };
const muted = { color: "var(--color-text-muted)" };
const borderColor = { borderColor: "var(--color-border)" };

/** 売上シートの行を一意に識別するキー(RevenueRecord自体にIDが無いため、月+配列内indexで代用)。 */
function rowKey(row: RevenueRecord, index: number): string {
  return `${row.month}-${index}-${row.company}`;
}

/** 売上シートの行 → 明細1行。シートの備考列(分割払いの内訳等)は摘要の内訳へ自動転記(経営者の要望。手直し可)。 */
function itemFromRow(row: RevenueRecord, id: string): InvoiceItemForm {
  return {
    id,
    candidateName: row.candidateName ?? "",
    breakdownNote: row.note ?? "",
    amountYen: String(row.amountYen),
  };
}

/** 会社名の一致判定用キー(前後の空白のみ無視。空の会社名はまとめ対象外)。 */
function companyKey(row: RevenueRecord): string {
  return row.company.trim();
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[12.5px] font-bold" style={navy}>
      {children}
    </h2>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date";
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px]" style={muted}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
    </label>
  );
}

export default function InvoiceCreatorView({ records }: { records: RevenueRecord[] }) {
  // 入金月の一覧(新しい順)。records は複数月にまたがるため月ごとにまとめ直す。
  const months = useMemo(() => {
    const set = new Set(records.map((r) => r.month));
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [records]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(months[0] ?? null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  // 「この会社の◯件を1枚にまとめて作成」で取り込み中の会社名(trim済み)。手入力で外れる。
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [form, setForm] = useState<InvoiceFormState>(BLANK_FORM);
  const nextItemId = useRef(1);
  const newItemId = () => `item-${nextItemId.current++}`;

  const rowsForMonth = useMemo(
    () => records.filter((r) => r.month === selectedMonth),
    [records, selectedMonth],
  );

  // 同じ会社名(trim一致)の行が2件以上ある会社 → 件数と、一覧での最初の行の位置。
  // 1枚にまとめて作成するボタンは、その会社の最初の行の横に出す。
  const duplicateCompanies = useMemo(() => {
    const groups = new Map<string, { count: number; firstIndex: number }>();
    rowsForMonth.forEach((r, i) => {
      const key = companyKey(r);
      if (key === "") return;
      const g = groups.get(key);
      if (g) g.count += 1;
      else groups.set(key, { count: 1, firstIndex: i });
    });
    for (const [key, g] of Array.from(groups)) {
      if (g.count < 2) groups.delete(key);
    }
    return groups;
  }, [rowsForMonth]);

  /** 手入力で内容を変えたら「この行で作成」「まとめて作成」のハイライトは外す(選択行と内容が一致しなくなるため)。 */
  function clearSelection() {
    setSelectedRowKey(null);
    setSelectedGroup(null);
  }

  function update(key: "companyName" | "honorificLine" | "invoiceNo" | "issueDate" | "dueDate", value: string) {
    clearSelection();
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateItem(id: string, key: "candidateName" | "breakdownNote" | "amountYen", value: string) {
    clearSelection();
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, [key]: value } : it)) }));
  }

  function addItem() {
    clearSelection();
    setForm((f) => ({ ...f, items: [...f.items, { ...BLANK_ITEM, id: newItemId() }] }));
  }

  function removeItem(id: string) {
    clearSelection();
    // 明細は常に1行以上(1行のときは削除不可)。
    setForm((f) => (f.items.length <= 1 ? f : { ...f, items: f.items.filter((it) => it.id !== id) }));
  }

  function selectRow(row: RevenueRecord, key: string) {
    clearSelection();
    setSelectedRowKey(key);
    setForm({
      companyName: row.company,
      honorificLine: DEFAULT_HONORIFIC,
      items: [itemFromRow(row, newItemId())],
      invoiceNo: DEFAULT_INVOICE_NO,
      issueDate: toDateInputValue(getDefaultIssueDate(row.month)),
      dueDate: toDateInputValue(getDefaultDueDate(row.month)),
    });
  }

  /** 同じ会社の全行を明細行として取り込み、1枚の請求書にまとめる(請求日・支払期限は1行選択時と同じ既定ロジック)。 */
  function selectCompanyGroup(company: string) {
    const groupRows = rowsForMonth.filter((r) => companyKey(r) === company);
    if (groupRows.length === 0) return;
    clearSelection();
    setSelectedGroup(company);
    setForm({
      companyName: company,
      honorificLine: DEFAULT_HONORIFIC,
      items: groupRows.map((r) => itemFromRow(r, newItemId())),
      invoiceNo: DEFAULT_INVOICE_NO,
      issueDate: toDateInputValue(getDefaultIssueDate(groupRows[0].month)),
      dueDate: toDateInputValue(getDefaultDueDate(groupRows[0].month)),
    });
  }

  function selectBlank() {
    clearSelection();
    // 月が選択されていればその月、無ければ今月を基準に請求日・支払期限を仮置きする
    // (どちらも「3. 内容を確認・編集」で自由に変更できる)。
    const monthKey = selectedMonth ?? currentMonthKey();
    setForm({
      ...BLANK_FORM,
      issueDate: toDateInputValue(getDefaultIssueDate(monthKey)),
      dueDate: toDateInputValue(getDefaultDueDate(monthKey)),
    });
  }

  const sheetItems = form.items.map((it) => ({
    candidateName: it.candidateName,
    breakdownNote: it.breakdownNote,
    totalYen: Number(it.amountYen) || 0,
  }));
  const issueDate = parseDateInputValue(form.issueDate);
  const dueDate = parseDateInputValue(form.dueDate);

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 pb-10 pt-4 lg:gap-6 lg:px-8 lg:pt-6 print:max-w-none print:gap-0 print:p-0">
      {/* 印刷時は非表示(紙面はInvoiceSheetのみ)。 */}
      <div className="flex flex-col gap-5 print:hidden lg:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-bold" style={navy}>
              請求書作成
            </h1>
            <p className="mt-1 text-[12px]" style={muted}>
              売上シートの行を選ぶと、実物の請求書と同じ体裁でプレビューできます。
            </p>
          </div>
          <PrintButton />
        </div>

        <section className="flex flex-col gap-2">
          <SectionLabel>1. 入金月を選ぶ</SectionLabel>
          {months.length === 0 ? (
            <p className="text-[12px]" style={muted}>
              売上データがありません。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m)}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
                  style={
                    selectedMonth === m
                      ? { background: "var(--color-navy)", color: "#ffffff" }
                      : { background: "var(--color-card)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }
                  }
                >
                  {formatInflowMonthLabel(m)}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2.5">
              <SectionLabel>2. 行を選ぶ</SectionLabel>
              {/* 選択中の入金月の合計(税込)。トップの「入金予定」と同じ数字を請求書作成でも
                  確認したいという経営者の要望。 */}
              {rowsForMonth.length > 0 && (
                <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: "var(--color-gold)" }}>
                  合計 {formatYen(rowsForMonth.reduce((sum, r) => sum + r.amountYen, 0))}
                  <span className="ml-1 font-medium" style={muted}>({rowsForMonth.length}件)</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={selectBlank}
              className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
            >
              空白から作成
            </button>
          </div>
          <div className="card overflow-x-auto">
            {rowsForMonth.length === 0 ? (
              <p className="px-3.5 py-4 text-center text-[12px]" style={muted}>
                {selectedMonth ? "この月の行はありません。" : "上で入金月を選んでください。"}
              </p>
            ) : (
              // 携帯で会社名・求職者名・見出しが折り返して読みにくいという経営者の指摘のため、
              // 全セル折り返し禁止(whitespace-nowrap)+携帯では文字をひと回り小さく。
              // 長い会社名は表ごと横スクロール(外側の overflow-x-auto)に逃がす。
              <table className="w-full min-w-[480px] text-left text-[11px] sm:text-[12px]">
                <thead>
                  <tr style={muted}>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">会社名</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">求職者名</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">金額(税込)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rowsForMonth.map((row, i) => {
                    const key = rowKey(row, i);
                    const active = selectedRowKey === key;
                    const group = duplicateCompanies.get(companyKey(row));
                    const groupActive = group !== undefined && selectedGroup === companyKey(row);
                    return (
                      <tr key={key} className="border-t" style={borderColor}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>
                          {row.company}
                          {group && (
                            <span className="ml-1.5 text-[10px] font-medium" style={{ color: "var(--color-gold)" }}>
                              同社{group.count}件
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{row.candidateName || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatYen(row.amountYen)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            {/* 同じ会社の行が2件以上あるとき、その会社の最初の行にだけ「まとめて作成」を出す。
                                全行を明細行として取り込み、1枚の請求書にする(経営者の要望)。 */}
                            {group && group.firstIndex === i && (
                              <button
                                type="button"
                                onClick={() => selectCompanyGroup(companyKey(row))}
                                className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold"
                                style={
                                  groupActive
                                    ? { background: "var(--color-gold)", color: "#ffffff" }
                                    : { border: "1px solid var(--color-gold)", color: "var(--color-gold)" }
                                }
                              >
                                {groupActive ? `${group.count}件を1枚にまとめ中` : `この会社の${group.count}件を1枚にまとめて作成`}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => selectRow(row, key)}
                              className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold"
                              style={
                                active
                                  ? { background: "var(--color-navy)", color: "#ffffff" }
                                  : { background: "var(--color-cream)", color: "var(--color-navy)" }
                              }
                            >
                              {active ? "選択中" : "この行で作成"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>3. 内容を確認・編集</SectionLabel>
          <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <FormField label="宛先会社名" value={form.companyName} onChange={(v) => update("companyName", v)} />
            <FormField label="宛名2行目" value={form.honorificLine} onChange={(v) => update("honorificLine", v)} />
            {/* 明細行(1行以上)。1行のときは従来と同じ見た目(枠・見出し・削除ボタンなし)。
                2行以上のときは行ごとに枠と見出し・削除ボタンを出す。スマホでは縦に積む。 */}
            <div className="flex flex-col gap-3 sm:col-span-2">
              {form.items.map((item, idx) => {
                const multi = form.items.length > 1;
                return (
                  <div
                    key={item.id}
                    className={multi ? "grid grid-cols-1 gap-3 rounded-lg p-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}
                    style={multi ? { border: "1px solid var(--color-border)" } : undefined}
                  >
                    {multi && (
                      <div className="flex items-center justify-between sm:col-span-2">
                        <span className="text-[11.5px] font-bold" style={navy}>
                          明細{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold"
                          style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                        >
                          この明細を削除
                        </button>
                      </div>
                    )}
                    <FormField label="求職者名" value={item.candidateName} onChange={(v) => updateItem(item.id, "candidateName", v)} />
                    <FormField label="金額(税込)" type="number" value={item.amountYen} onChange={(v) => updateItem(item.id, "amountYen", v)} />
                    {/* 摘要の内訳(任意): 摘要の2行目に印字される自由記載。改行も可のため textarea。 */}
                    <label className="flex flex-col gap-1 text-[11px] sm:col-span-2" style={muted}>
                      摘要の内訳(任意・摘要の2行目に印字されます)
                      <textarea
                        value={item.breakdownNote}
                        onChange={(e) => updateItem(item.id, "breakdownNote", e.target.value)}
                        placeholder="例: 月収28万×12ヶ月×成功報酬35%"
                        rows={2}
                        className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                      />
                    </label>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addItem}
                className="self-start rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-navy)" }}
              >
                ＋明細行を追加
              </button>
            </div>
            <FormField label="請求No." value={form.invoiceNo} onChange={(v) => update("invoiceNo", v)} placeholder="未記入可" />
            <FormField label="請求日" type="date" value={form.issueDate} onChange={(v) => update("issueDate", v)} />
            <FormField label="お支払期限" type="date" value={form.dueDate} onChange={(v) => update("dueDate", v)} />
          </div>
        </section>
      </div>

      {/* 請求書プレビュー(印刷対象はここだけ)。横幅が狭い画面でも紙面全体が見えるよう横スクロールを許可する。 */}
      <div className="flex justify-center overflow-x-auto py-2 print:block print:overflow-visible print:py-0">
        <InvoiceSheet
          companyName={form.companyName}
          honorificLine={form.honorificLine}
          items={sheetItems}
          invoiceNo={form.invoiceNo}
          issueDateLabel={issueDate ? formatIssueDateLabel(issueDate) : ""}
          dueDateLabel={dueDate ? formatDueDateLabel(dueDate) : ""}
        />
      </div>
    </div>
  );
}
