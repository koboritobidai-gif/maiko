/**
 * 提案書(推薦状)のA4風プレビュー。
 * 白背景・書類風スタイリングで、企業へそのまま渡せるトーンにする。
 */
import type { ProposalResult } from "@/lib/ai/proposal-gen";

export function buildProposalText(result: ProposalResult): string {
  const lines: string[] = [];
  lines.push("候補者ご推薦のご案内");
  lines.push(`${result.headerDateLabel}　株式会社翔び台`);
  lines.push("");
  lines.push(`■ 候補者: ${result.candidateLabel}`);
  lines.push(result.candidateSummary);
  lines.push("");
  lines.push("■ 推薦理由");
  result.reasons.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push("");
  lines.push("■ スキル・経験ハイライト");
  result.highlights.forEach((h) => lines.push(`・${h}`));
  lines.push("");
  lines.push("■ 希望条件");
  result.conditionsTable.forEach((row) => lines.push(`${row.label}: ${row.value}`));
  lines.push("");
  lines.push("■ 想定紹介手数料");
  lines.push(
    `希望年収 ${result.feeCalc.incomeMan.toLocaleString("ja-JP")}万円 × 手数料率 ${result.feeCalc.feeRateLabel} = ${result.feeCalc.feeMan.toLocaleString("ja-JP")}万円(想定)`,
  );
  lines.push("");
  lines.push("■ 担当CA");
  lines.push(`${result.caContact.name}(${result.caContact.roleLabel})`);
  lines.push(`${result.caContact.email} / ${result.caContact.phone}`);
  return lines.join("\n");
}

export default function ProposalDocument({ result }: { result: ProposalResult }) {
  return (
    <div
      id="proposal-document"
      className="mx-auto flex w-full max-w-[520px] flex-col gap-5 rounded-md p-5 shadow-sm"
      style={{
        background: "#ffffff",
        color: "#232323",
        border: "1px solid #d8d2c4",
      }}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between border-b pb-3" style={{ borderColor: "#d8d2c4" }}>
        <div>
          <p className="text-[15px] font-bold tracking-wide" style={{ color: "#1d3c8f" }}>
            株式会社翔び台
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "#6b6459" }}>
            人材紹介事業部
          </p>
        </div>
        <p className="text-[11px]" style={{ color: "#6b6459" }}>
          {result.headerDateLabel}
        </p>
      </div>

      <h1 className="text-center text-[16px] font-bold tracking-wide" style={{ color: "#1d3c8f" }}>
        候補者ご推薦のご案内
      </h1>

      {/* 候補者サマリ */}
      <section className="flex flex-col gap-1.5">
        <h2
          className="text-[12px] font-bold"
          style={{ color: "#2b5cd9", borderBottom: "1px solid #dbe5f7", paddingBottom: 4 }}
        >
          候補者: {result.candidateLabel}
        </h2>
        <p className="text-[13px] leading-relaxed">{result.candidateSummary}</p>
      </section>

      {/* 推薦理由 */}
      <section className="flex flex-col gap-1.5">
        <h2
          className="text-[12px] font-bold"
          style={{ color: "#2b5cd9", borderBottom: "1px solid #dbe5f7", paddingBottom: 4 }}
        >
          推薦理由
        </h2>
        <ol className="flex flex-col gap-1.5 pl-4 text-[13px] leading-relaxed" style={{ listStyleType: "decimal" }}>
          {result.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      </section>

      {/* スキル・経験ハイライト */}
      <section className="flex flex-col gap-1.5">
        <h2
          className="text-[12px] font-bold"
          style={{ color: "#2b5cd9", borderBottom: "1px solid #dbe5f7", paddingBottom: 4 }}
        >
          スキル・経験ハイライト
        </h2>
        <ul className="flex flex-col gap-1 text-[13px] leading-relaxed">
          {result.highlights.map((h, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden style={{ color: "#2b5cd9" }}>
                ・
              </span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 希望条件表 */}
      <section className="flex flex-col gap-1.5">
        <h2
          className="text-[12px] font-bold"
          style={{ color: "#2b5cd9", borderBottom: "1px solid #dbe5f7", paddingBottom: 4 }}
        >
          希望条件
        </h2>
        <table className="w-full text-[12.5px]">
          <tbody>
            {result.conditionsTable.map((row) => (
              <tr key={row.label} className="border-b" style={{ borderColor: "#f1ece0" }}>
                <td className="w-[92px] py-1.5 pr-2 align-top font-medium" style={{ color: "#6b6459" }}>
                  {row.label}
                </td>
                <td className="py-1.5">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 想定紹介手数料 */}
      <section className="flex flex-col gap-1.5">
        <h2
          className="text-[12px] font-bold"
          style={{ color: "#2b5cd9", borderBottom: "1px solid #dbe5f7", paddingBottom: 4 }}
        >
          想定紹介手数料
        </h2>
        <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-[12.5px]" style={{ background: "#faf8f4" }}>
          <span>
            {result.feeCalc.incomeMan.toLocaleString("ja-JP")}万円 × {result.feeCalc.feeRateLabel}
          </span>
          <span className="text-[15px] font-bold" style={{ color: "#1d3c8f" }}>
            {result.feeCalc.feeMan.toLocaleString("ja-JP")}万円(想定)
          </span>
        </div>
      </section>

      {/* 担当CA連絡先 */}
      <section className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: "#d8d2c4" }}>
        <p className="text-[12px] font-semibold" style={{ color: "#1d3c8f" }}>
          担当CA: {result.caContact.name}({result.caContact.roleLabel})
        </p>
        <p className="text-[11px]" style={{ color: "#6b6459" }}>
          {result.caContact.email} ／ {result.caContact.phone}
        </p>
        <p className="mt-1 text-[10px]" style={{ color: "#a29c8d" }}>
          ※本資料はデモ環境で生成された連絡先を含みます。
        </p>
      </section>
    </div>
  );
}
