/**
 * 請求書の見た目そのもの(実物PDFを再現したA4請求書1枚)。
 * DOM構造・CSSは経営者が実物の請求書PDF(スキャン)を基に作った雛形をほぼそのまま移植している
 * (文言・固定情報も雛形通り)。編集できるのは呼び出し元(InvoiceCreatorView)経由の7項目だけで、
 * 登録番号・発行元住所・TEL・メール・担当・振込先・備考文はここに固定で埋め込む。
 *
 * 印刷余白について: globals.css の @media print は @page margin 10mm(A4、他ページと共用のため
 * ここでは変更しない)。そのため印刷時に使える実際の幅は 210mm − 20mm = 190mm。雛形は210mm幅
 * 前提で作られているため、画面表示(紙のプレビュー)では雛形通り210mm・パディング18mm/16mm/14mmを
 * 使いつつ、印刷時だけ .invoice-sheet の幅・パディングを縮小し、188mm(190mmに少し余裕を持たせた値)
 * に収める。中身の固定幅要素(宛先88mm+請求情報72mm等)は変えていないため、見た目はほぼ変わらない。
 */
import { splitTaxIncluded, formatYen } from "@/lib/invoice-calc";

export interface InvoiceSheetProps {
  /** 宛先会社名 */
  companyName: string;
  /** 宛名2行目(既定「ご担当者」) */
  honorificLine: string;
  /** 求職者名(摘要「【◯◯様】人材紹介費用」に使う) */
  candidateName: string;
  /** 金額(税込)。売上シートの金額そのもの。 */
  totalYen: number;
  /** 請求No.(空欄可。空欄ならそのまま空欄で印字する) */
  invoiceNo: string;
  /** 請求日の表示文字列(例: 「2026年9月1日」) */
  issueDateLabel: string;
  /** お支払期限の表示文字列(例: 「2026/9/30」) */
  dueDateLabel: string;
}

/** 品目欄の空行数(雛形通り、記入欄の見た目を保つための余白行)。 */
const EMPTY_ITEM_ROW_COUNT = 8;

export default function InvoiceSheet({
  companyName,
  honorificLine,
  candidateName,
  totalYen,
  invoiceNo,
  issueDateLabel,
  dueDateLabel,
}: InvoiceSheetProps) {
  const tax = splitTaxIncluded(totalYen);

  return (
    <>
      <style>{INVOICE_SHEET_CSS}</style>
      <div className="invoice-sheet">
        <div className="invoice-title">請 求 書</div>

        <div className="invoice-top">
          <div className="invoice-to">
            {/* 宛名2行目が空のときは会社名に「御中」を付け、入力があるときは「御中」を付けずに
                「◯◯ 様」の行(下線なし)を表示する(経営者の指示)。 */}
            <div className="invoice-company-name">
              {companyName}
              {honorificLine.trim() === "" && <span className="invoice-onchu">御中</span>}
            </div>
            {honorificLine.trim() !== "" && (
              <div className="invoice-person">
                <span>{honorificLine}</span>
                <span>様</span>
              </div>
            )}
            <div className="invoice-subject">件名: 人材紹介費用</div>
            <div className="invoice-greeting">下記のとおり、ご請求申し上げます。</div>
          </div>
          <div className="invoice-meta">
            <table>
              <tbody>
                <tr>
                  <td>請求No.</td>
                  <td className="v">{invoiceNo}</td>
                </tr>
                <tr>
                  <td>請求日</td>
                  <td className="v">{issueDateLabel}</td>
                </tr>
                <tr>
                  <td>登録番号</td>
                  <td className="v">T9010001261887</td>
                </tr>
              </tbody>
            </table>
            <div className="invoice-issuer">
              <div className="invoice-issuer-name">株式会社翔び台</div>
              <div>〒107-0052</div>
              {/* 住所は太字にしない(経営者の指示。他の行と同じ太さで表示する)。 */}
              <div>
                東京都港区赤坂4-8-20
                <br />
                JESCO赤坂表町ビル809
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- 雛形通りmm単位で絶対配置する社印。next/imageの余白制御より素のimgの方が単純。 */}
            <img className="invoice-seal" src="/company-seal.png" alt="" />
            <table className="invoice-contact">
              <tbody>
                <tr>
                  <td className="k">TEL:</td>
                  <td>03-6820-9543</td>
                </tr>
                <tr>
                  <td className="k">E-Mail:</td>
                  <td>shinji.kiyomoto@tobidai.com</td>
                </tr>
                <tr>
                  <td className="k">担当:</td>
                  <td>清本 晋士</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="invoice-totalbar">
          <div className="invoice-amount">
            <span className="invoice-label">合計金額</span>
            {formatYen(tax.totalYen)}
            <span className="invoice-tax">(税込)</span>
          </div>
          <div className="invoice-due">
            <span>お支払期限:</span>
            <span>{dueDateLabel}</span>
          </div>
        </div>

        <table className="invoice-items">
          <thead>
            <tr>
              <th className="no">No.</th>
              <th>摘要</th>
              <th className="qty">数量</th>
              <th className="price">単価</th>
              <th className="amt">金額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="no">1</td>
              <td>【{candidateName}様】人材紹介費用</td>
              <td className="qty">1　名</td>
              <td className="price">{formatYen(tax.subtotalYen)}</td>
              <td className="amt">{formatYen(tax.subtotalYen)}</td>
            </tr>
            {Array.from({ length: EMPTY_ITEM_ROW_COUNT }).map((_, i) => (
              <tr key={i}>
                <td className="empty" />
                <td />
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-bottom">
          <div className="invoice-bank">
            <div className="invoice-bank-label">お振込先</div>
            <div className="invoice-bank-body">
              gmoあおぞらネット　法人営業部
              <br />
              普通 2516698
              <br />
              カ)トビダイ
            </div>
          </div>
          <table className="invoice-sums">
            <tbody>
              <tr>
                <td className="k">小計</td>
                <td className="v">{formatYen(tax.subtotalYen)}</td>
              </tr>
              <tr>
                <td className="k">消費税</td>
                <td className="v">{formatYen(tax.taxYen)}</td>
              </tr>
              <tr className="grand">
                <td className="k">合計</td>
                <td className="v">{formatYen(tax.totalYen)}</td>
              </tr>
              <tr className="sub">
                <td className="k">10%対象(税抜)</td>
                <td className="v">{formatYen(tax.subtotalYen)}</td>
              </tr>
              <tr className="sub">
                <td className="k">10%消費税</td>
                <td className="v">{formatYen(tax.taxYen)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="invoice-notes">
          <div className="invoice-notes-k">備考</div>
          <div className="invoice-notes-v">恐れ入りますが、振込手数料はお客様のご負担でお願いいたします。</div>
        </div>
      </div>
    </>
  );
}

/**
 * 雛形CSSの移植(クラス名に invoice- プレフィックスを付けて他画面と衝突しないようにした以外は
 * ほぼ元のスタイルのまま)。印刷時の幅・パディング調整はファイル冒頭のコメント参照。
 */
const INVOICE_SHEET_CSS = `
.invoice-sheet, .invoice-sheet * {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
.invoice-sheet {
  width: 210mm;
  min-height: 297mm;
  padding: 18mm 16mm 14mm;
  margin: 0 auto;
  position: relative;
  background: #ffffff;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: 0 2px 16px rgba(16, 24, 40, 0.12);
}
@media print {
  .invoice-sheet {
    width: 188mm;
    min-height: 0;
    padding: 8mm 10mm 6mm;
    margin: 0;
    border: none;
    box-shadow: none;
  }
  /* 実測で備考が2ページ目にはみ出したため、印刷時のみ縦方向を詰めて確実にA4・1枚へ収める
     (タイトル下の余白・明細の空行高さ・各セクション間を圧縮。画面表示は雛形どおりのまま)。 */
}
.invoice-title { text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 18px; text-indent: 18px; margin-bottom: 14mm; }
.invoice-top { display: flex; justify-content: space-between; }
.invoice-to { width: 88mm; font-size: 12.5px; }
.invoice-company-name { font-size: 14px; border-bottom: 1px solid #333; padding: 0 2mm 1.5mm; }
/* 宛名2行目は下線なし(経営者の指示)。 */
.invoice-person { padding: 3mm 2mm 1.5mm; display: flex; justify-content: space-between; }
.invoice-onchu { margin-left: 4mm; }
.invoice-subject { margin-top: 9mm; font-size: 13px; font-weight: 600; border-bottom: 2px solid #333; padding: 0 2mm 1mm; }
/* 「下記のとおり〜」の下線は経営者の指示で無し。 */
.invoice-greeting { margin-top: 2.5mm; font-size: 12px; padding: 0 6mm 1.5mm; }
.invoice-meta { width: 72mm; font-size: 12px; position: relative; }
.invoice-meta table { width: 100%; border-collapse: collapse; }
.invoice-meta td { padding: 1.2mm 0; vertical-align: top; }
.invoice-meta td.v { text-align: right; }
.invoice-issuer { margin-top: 4mm; line-height: 1.5; }
.invoice-issuer .invoice-issuer-name { font-size: 13px; }
.invoice-seal { position: absolute; right: -2mm; top: 26mm; width: 26mm; height: 26mm; opacity: .92; }
.invoice-contact { margin-top: 3mm; line-height: 1.7; }
.invoice-contact td { padding: 0.4mm 0; }
.invoice-contact td.k { text-align: right; padding-right: 2mm; white-space: nowrap; }
/* 合計金額とお支払期限の下線は1本につなげず、それぞれ別々に引く(経営者の指示)。 */
.invoice-totalbar { margin-top: 8mm; display: flex; justify-content: space-between; align-items: flex-end; }
.invoice-totalbar .invoice-amount { font-size: 15px; font-weight: 700; border-bottom: 2px solid #333; padding-bottom: 1.5mm; }
.invoice-totalbar .invoice-amount .invoice-label { font-size: 13px; margin-right: 8mm; }
.invoice-totalbar .invoice-amount .invoice-tax { font-size: 11px; font-weight: 400; margin-left: 4mm; }
.invoice-totalbar .invoice-due { font-size: 12.5px; width: 66mm; display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 1.5mm; }
.invoice-items { margin-top: 4mm; width: 100%; border-collapse: collapse; font-size: 12px; }
.invoice-items th, .invoice-items td { border: 1.5px solid #333; padding: 1.8mm 2mm; }
.invoice-items th { background: #f2f2f2; font-weight: 600; }
.invoice-items .no { width: 9mm; text-align: right; }
.invoice-items .qty { width: 20mm; text-align: center; }
.invoice-items .price, .invoice-items .amt { width: 30mm; text-align: right; }
.invoice-items td.empty { height: 7.2mm; }
.invoice-bottom { display: flex; justify-content: space-between; margin-top: 0; }
.invoice-bank { font-size: 12px; margin-top: 5mm; }
.invoice-bank .invoice-bank-label { margin-bottom: 1.5mm; }
.invoice-bank .invoice-bank-body { padding-left: 6mm; line-height: 1.8; border-bottom: 1px solid #333; padding-bottom: 1mm; display: inline-block; }
.invoice-sums { width: 78mm; border-collapse: collapse; font-size: 12px; }
.invoice-sums td { border: 1.5px solid #333; padding: 1.6mm 2mm; }
.invoice-sums td.k { width: 30mm; background: #f2f2f2; text-align: center; }
.invoice-sums td.v { text-align: right; }
.invoice-sums tr.grand td { font-weight: 700; }
.invoice-sums tr.sub td { font-size: 10.5px; padding: 1mm 2mm; }
.invoice-notes { margin-top: 6mm; border: 1.5px solid #333; display: flex; font-size: 12px; }
.invoice-notes .invoice-notes-k { width: 18mm; border-right: 1.5px solid #333; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.invoice-notes .invoice-notes-v { padding: 4mm 3mm; min-height: 18mm; flex: 1; }
/* 印刷時の圧縮上書きは、CSSの定義順で基本ルールに負けないようスタイルの最後に置く
   (メディアクエリは詳細度を上げないため、前方に書くと後続の基本ルールで打ち消される)。 */
@media print {
  .invoice-title { margin-bottom: 8mm; }
  .invoice-subject { margin-top: 6mm; }
  .invoice-totalbar { margin-top: 5mm; }
  .invoice-items td.empty { height: 6mm; }
  .invoice-notes { margin-top: 4mm; }
  .invoice-notes .invoice-notes-v { min-height: 12mm; }
}
`;
