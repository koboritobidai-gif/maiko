/**
 * InvoiceSource アダプタ
 * Slack「#請求書」チャンネルに投稿された送客パートナー請求書PDFを取得し、パートナー名・対象月・
 * 請求金額をヒューリスティックに読み取る。Slack API呼び出しは messenger.ts と同じパターン
 * (fetch + Bearer SLACK_BOT_TOKEN、エラー時はSlack APIのerrorコードを含む日本語メッセージをthrow)
 * を踏襲する。
 * デモ段階は DemoInvoiceSource が demo-data.ts のデモ請求書を返す。
 * 実連携は SlackInvoiceSource が conversations.history でPDF付きメッセージを取得し
 * (スレッドの返信に添付されたPDFも conversations.replies で取得する)、
 * 各PDFを url_private_download からダウンロード → unpdf でテキスト抽出 → 正規表現でパートナー名/
 * 対象月/金額を読み取る。
 */
import { extractText, getDocumentProxy } from "unpdf";
import type { ReferralInvoice } from "../types";
import { DEFAULT_REFERRAL_RATES } from "../types";
import { referralInvoices as demoReferralInvoices } from "../demo-data";

export interface InvoiceFetchResult {
  invoices: ReferralInvoice[];
  /** 直近15件の上限を超えたため点検対象外にしたPDFの件数。 */
  skippedCount: number;
}

export interface InvoiceSource {
  getReferralInvoices(): Promise<InvoiceFetchResult>;
}

/** デモ実装: demo-data.ts のデモ請求書をそのまま返す(投稿日の新しい順)。 */
export class DemoInvoiceSource implements InvoiceSource {
  async getReferralInvoices(): Promise<InvoiceFetchResult> {
    return {
      invoices: [...demoReferralInvoices].sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime()),
      skippedCount: 0,
    };
  }
}

// ─────────────────────────────────────────────
// SlackInvoiceSource: 実連携
// ─────────────────────────────────────────────

const SLACK_API_BASE = "https://slack.com/api";

interface SlackApiResponseBase {
  ok: boolean;
  error?: string;
}

async function slackGet<T extends SlackApiResponseBase>(
  botToken: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const url = `${SLACK_API_BASE}/${method}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
    cache: "no-store",
  });
  const json = (await res.json()) as T;
  if (!res.ok || !json.ok) {
    throw new Error(`Slack API ${method} 呼び出しに失敗しました: ${json.error ?? res.status}`);
  }
  return json;
}

interface SlackPermalinkResponse extends SlackApiResponseBase {
  permalink?: string;
}

interface SlackFile {
  id?: string;
  name?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
}

interface SlackInvoiceMessage {
  ts: string;
  text?: string;
  subtype?: string;
  files?: SlackFile[];
  /** スレッド親メッセージの ts(返信・スレッド親のみ)。 */
  thread_ts?: string;
  /** スレッドの返信数(スレッド親のみ)。返信の中のPDFも読むかどうかの判定に使う。 */
  reply_count?: number;
}

interface SlackHistoryResponse extends SlackApiResponseBase {
  messages?: SlackInvoiceMessage[];
}

/** Slackの ts(unix秒.マイクロ秒)を Date に変換する。 */
function tsToDate(ts: string): Date {
  return new Date(Number(ts.split(".")[0]) * 1000);
}

function isPdfFile(file: SlackFile): boolean {
  if (file.filetype === "pdf") return true;
  return (file.name ?? "").toLowerCase().endsWith(".pdf");
}

// API呼び出し・転送量の抑制のため、投稿日が直近75日以内のものだけを対象にし、
// ダウンロードするPDFは最大15件までとする(経営者が請求書チャンネルに貼る運用頻度なら
// 月4〜5件程度のため、75日・15件あれば直近2〜3ヶ月分は十分カバーできる)。
const RECENT_WINDOW_MS = 75 * 24 * 60 * 60 * 1000;
const MAX_PDF_DOWNLOADS = 15;
/** 返信の中のPDFも読むスレッドの上限(API呼び出し数の抑制。#請求書は月数スレッド程度の運用想定)。 */
const MAX_THREAD_FETCHES = 20;
// PDFダウンロードのサイズ上限。超過分はパース失敗として扱う(転送量抑制・タイムアウト防止)。
const MAX_PDF_BYTES = 8 * 1024 * 1024;

// ─────────────────────────────────────────────
// 読み取りヒューリスティック(パートナー名・対象月・請求金額)
// ─────────────────────────────────────────────

function normalizeChannelText(text: string): string {
  return text.trim().toLowerCase();
}

/** 経路名の「本体」(括弧書き注記を除いた部分)。「2peace(Tさん)」→「2peace」。 */
function referralChannelCore(channel: string): string {
  return channel.split("(")[0].trim();
}

/**
 * パートナー名を、PDFテキスト → ファイル名 → Slackメッセージ本文の順に探す。
 * 単価マスタ(`DEFAULT_REFERRAL_RATES`)の経路名との部分一致(trim・大文字小文字無視)で判定する。
 * 実際の単価(Settings.referralRates、スプレッドシートの任意タブ)はこの時点では取得できないため、
 * 経路の「名称」だけが必要なこのヒューリスティックでは既定の経路名一覧で十分と判断した
 * (単価そのものは照合ロジック側=metrics.ts の getInvoiceChecks が別途 DataBundle から取得する)。
 */
function findPartnerChannel(...texts: string[]): string | undefined {
  for (const rate of DEFAULT_REFERRAL_RATES) {
    const core = normalizeChannelText(referralChannelCore(rate.channel));
    for (const text of texts) {
      if (normalizeChannelText(text).includes(core)) return rate.channel;
    }
  }
  return undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(year: number, month1to12: number): string {
  return `${year}-${pad2(month1to12)}`;
}

const YEAR_MONTH_KANJI_RE = /(\d{4})\s*年\s*(\d{1,2})\s*月/;
const YEAR_MONTH_SLASH_RE = /(\d{4})\s*[/-]\s*(\d{1,2})(?!\d)/;
const MONTH_ONLY_RE = /(\d{1,2})\s*月\s*分/;

/**
 * PDFテキストから対象月を読み取る。「2026年7月」「2026/07」「2026-07」「7月分」の順で探し、
 * 年が無い表記(7月分)は投稿日の年で補完した上で、投稿日より未来の月になる場合は前年と解釈する
 * (請求書は翌月に届く運用のため、投稿月と対象月がズレて年をまたぐケースへの対応)。
 * どの表記も見つからなければ、請求書は翌月に届く運用を踏まえて「投稿月の前月」を推定値として使う。
 */
function detectTargetMonth(text: string, postedAt: Date): { month: string; estimated: boolean } {
  const kanji = YEAR_MONTH_KANJI_RE.exec(text);
  if (kanji) return { month: monthKey(Number(kanji[1]), Number(kanji[2])), estimated: false };

  const slash = YEAR_MONTH_SLASH_RE.exec(text);
  if (slash) return { month: monthKey(Number(slash[1]), Number(slash[2])), estimated: false };

  const monthOnly = MONTH_ONLY_RE.exec(text);
  if (monthOnly) {
    const month = Number(monthOnly[1]);
    let year = postedAt.getFullYear();
    const candidate = new Date(year, month - 1, 1);
    if (candidate.getTime() > postedAt.getTime()) year -= 1;
    return { month: monthKey(year, month), estimated: false };
  }

  const estimated = new Date(postedAt.getFullYear(), postedAt.getMonth() - 1, 1);
  return { month: monthKey(estimated.getFullYear(), estimated.getMonth() + 1), estimated: true };
}

const AMOUNT_KEYWORDS = ["合計", "ご請求金額", "請求金額", "総額"];
// 「¥1,234,567」「1,234,567円」形式の金額。先頭グループは \d{1,3}(桁区切り前の1〜3桁)のみとし、
// カンマを含めると「1,000」の "1,0" のように途中で誤って区切ってしまうため、カンマは
// 区切り文字(","\d{3})の中だけに登場させる。
const AMOUNT_RE = /[¥￥]\s?(\d{1,3}(?:,\d{3})*|\d+)|(\d{1,3}(?:,\d{3})*|\d+)\s?円/g;

/** 1行分のテキストから金額(円)をすべて抜き出す。 */
function extractAmountsFromLine(line: string): number[] {
  const amounts: number[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(line))) {
    const raw = (m[1] ?? m[2] ?? "").replace(/,/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) amounts.push(n);
  }
  return amounts;
}

/**
 * 請求金額を読み取る。「合計」「ご請求金額」「請求金額」「総額」を含む行、またはその直後の行にある
 * 金額を優先し、見つからなければテキスト中の最大金額を採用する(明細より合計欄の方が大きい額に
 * なることが多いため、キーワードが無い場合のフォールバックとしても実用上妥当)。
 */
function findAmountYen(text: string): number | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!AMOUNT_KEYWORDS.some((kw) => lines[i].includes(kw))) continue;
    const sameLine = extractAmountsFromLine(lines[i]);
    if (sameLine.length > 0) return Math.max(...sameLine);
    const nextLine = lines[i + 1] ? extractAmountsFromLine(lines[i + 1]) : [];
    if (nextLine.length > 0) return Math.max(...nextLine);
  }
  const all = lines.flatMap(extractAmountsFromLine);
  return all.length > 0 ? Math.max(...all) : undefined;
}

/** PDFバイナリからテキストを抽出する。抽出できない(スキャン画像PDF等)場合は null。 */
async function extractPdfText(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

interface SlackInvoiceConfig {
  botToken?: string;
  /** #請求書チャンネルのID */
  invoiceChannel?: string;
}

/**
 * 実連携: Slack「#請求書」チャンネルのPDF請求書読取。
 * `SLACK_BOT_TOKEN`(Bot User OAuth Token、Scopes: files:read が追加で必要)と
 * `SLACK_INVOICE_CHANNEL`(#請求書のチャンネルID)を使用する。
 */
export class SlackInvoiceSource implements InvoiceSource {
  constructor(private readonly config: SlackInvoiceConfig = {}) {}

  private requireToken(): string {
    if (!this.config.botToken) {
      throw new Error("環境変数 SLACK_BOT_TOKEN が設定されていません。");
    }
    return this.config.botToken;
  }

  /** 親メッセージへのパーマリンクを取得する。失敗しても処理は継続する(undefined を返す)。 */
  private async fetchPermalink(
    botToken: string,
    channelId: string,
    messageTs: string,
  ): Promise<string | undefined> {
    try {
      const res = await slackGet<SlackPermalinkResponse>(botToken, "chat.getPermalink", {
        channel: channelId,
        message_ts: messageTs,
      });
      return res.permalink;
    } catch {
      return undefined;
    }
  }

  /**
   * PDFをダウンロードする。`url_private_download`(無ければ `url_private`)へ Bot Token 付きで
   * fetch する(Slackのファイルは通常のHTTPアクセスでは取得できず、Bot Tokenでの認証が必要)。
   * サイズ上限(8MB)を超える場合はエラーを投げ、呼び出し元でパース失敗として扱う。
   */
  private async downloadPdf(file: SlackFile, botToken: string): Promise<ArrayBuffer> {
    const url = file.url_private_download ?? file.url_private;
    if (!url) throw new Error("ファイルのダウンロードURLが取得できませんでした。");
    if (file.size && file.size > MAX_PDF_BYTES) {
      throw new Error(`ファイルサイズが上限(8MB)を超えています(${file.size}バイト)。`);
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${botToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ファイルのダウンロードに失敗しました(status ${res.status})。`);
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_PDF_BYTES) {
      throw new Error(`ファイルサイズが上限(8MB)を超えています(${buffer.byteLength}バイト)。`);
    }
    return buffer;
  }

  /** 1件のPDFファイルを ReferralInvoice に変換する。ダウンロード・解析に失敗してもエラーにせず、
   *  parseNote に内容を記録して返す(1件の失敗でページ全体を落とさないため)。 */
  private async buildInvoiceRecord(
    botToken: string,
    channelId: string,
    message: SlackInvoiceMessage,
    file: SlackFile,
  ): Promise<ReferralInvoice> {
    const postedAt = tsToDate(message.ts);
    const fileName = file.name ?? "invoice.pdf";

    let text = "";
    let parseNote: string | undefined;
    try {
      const buffer = await this.downloadPdf(file, botToken);
      const extracted = await extractPdfText(buffer);
      if (extracted) {
        text = extracted;
      } else {
        parseNote = "PDFからテキストを抽出できませんでした(スキャン画像PDFの可能性があります)。";
      }
    } catch (error) {
      parseNote = `PDFの取得・解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
    }

    const partnerChannel = findPartnerChannel(text, fileName, message.text ?? "");
    const { month: targetMonth, estimated: targetMonthIsEstimated } = detectTargetMonth(text, postedAt);
    const amountYen = text ? findAmountYen(text) : undefined;
    if (amountYen === undefined && !parseNote) {
      parseNote = "請求金額を読み取れませんでした。";
    }

    const permalink = await this.fetchPermalink(botToken, channelId, message.ts);

    return { partnerChannel, amountYen, targetMonth, targetMonthIsEstimated, fileName, postedAt, permalink, parseNote };
  }

  async getReferralInvoices(): Promise<InvoiceFetchResult> {
    const botToken = this.requireToken();
    const channelId = this.config.invoiceChannel;
    if (!channelId) {
      throw new Error("環境変数 SLACK_INVOICE_CHANNEL(#請求書のチャンネルID)を設定してください。");
    }

    const history = await slackGet<SlackHistoryResponse>(botToken, "conversations.history", {
      channel: channelId,
      limit: "100",
    });

    const cutoff = Date.now() - RECENT_WINDOW_MS;
    const pdfEntries: { message: SlackInvoiceMessage; file: SlackFile }[] = [];
    const collectPdfFiles = (message: SlackInvoiceMessage) => {
      if (!message.files || message.files.length === 0) return;
      if (tsToDate(message.ts).getTime() < cutoff) return;
      for (const file of message.files) {
        if (isPdfFile(file)) pdfEntries.push({ message, file });
      }
    };
    for (const message of history.messages ?? []) {
      collectPdfFiles(message);
    }

    // スレッドの返信の中に添付されたPDFも読む(#請求書は「1メッセージ+返信に請求書添付」の運用が
    // あるため。conversations.history はチャンネル直下しか返さないので、返信のあるスレッドを
    // conversations.replies で個別に取得する。API呼び出し数抑制のため直近 MAX_THREAD_FETCHES 件まで)。
    const threadParents = (history.messages ?? [])
      .filter((m) => (m.reply_count ?? 0) > 0 && tsToDate(m.ts).getTime() >= cutoff)
      .slice(0, MAX_THREAD_FETCHES);
    for (const parent of threadParents) {
      try {
        const replies = await slackGet<SlackHistoryResponse>(botToken, "conversations.replies", {
          channel: channelId,
          ts: parent.thread_ts ?? parent.ts,
          limit: "100",
        });
        for (const message of replies.messages ?? []) {
          if (message.ts === parent.ts) continue; // 親は上で走査済み
          collectPdfFiles(message);
        }
      } catch (error) {
        // 1スレッドの取得失敗で全体を落とさない(親メッセージ直下のPDFだけでも表示する)。
        console.warn("[invoices] スレッド返信の取得に失敗しました(スキップ):", error);
      }
    }

    // API・転送量の抑制のため、直近15件までダウンロードし、超過分は件数のみ数える。
    const accepted = pdfEntries.slice(0, MAX_PDF_DOWNLOADS);
    const skippedCount = pdfEntries.length - accepted.length;

    const invoices = await Promise.all(
      accepted.map(({ message, file }) => this.buildInvoiceRecord(botToken, channelId, message, file)),
    );

    return {
      invoices: invoices.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime()),
      skippedCount,
    };
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getInvoiceSource(): InvoiceSource {
  if (process.env.DATA_MODE === "live") {
    return new SlackInvoiceSource({
      botToken: process.env.SLACK_BOT_TOKEN,
      invoiceChannel: process.env.SLACK_INVOICE_CHANNEL,
    });
  }
  return new DemoInvoiceSource();
}
