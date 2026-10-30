/**
 * 入社決定者の年収を、Slack「#求職者」スレッドの労働条件通知書(PDF)から読み取るアダプタ。
 *
 * Slack APIの呼び出しは、入社確定者1人につき「スレッド返信(ファイルメタ含む)の取得1回」+
 * 「通知書PDFのダウンロード(30日キャッシュ。同じファイルは再ダウンロードしない)」に限定する
 * (全スレッドのPDFを読まない)。スレッドの特定は、既に読み込み済みの求職者スレッド一覧
 * (candidate-threads.ts の5分キャッシュ)の親本文に氏名を含むものから行う。
 */
import type { CandidateThread } from "../types";
import { extractAnnualIncome, findThreadForName } from "../placement-calc";
import type { ExtractedIncome } from "../placement-calc";
import { getCachedSlackPdfText, isPdfFile } from "./invoices";
import type { SlackFile } from "./invoices";
import { slackGet } from "./messenger";
import type { SlackApiResponseBase } from "./messenger";

/** 年収の根拠にする書類のファイル名・投稿文の表記。 */
const OFFER_DOC_RE = /労働条件通知書|雇入(?:れ)?通知書|内定通知書|オファー/;
/** 1人あたり、年収が取れるまで順に試すPDFの最大数(新しい順)。 */
const MAX_PDFS_PER_PERSON = 3;

interface SlackThreadMessage {
  ts: string;
  text?: string;
  files?: SlackFile[];
}

interface SlackThreadRepliesResponse extends SlackApiResponseBase {
  messages?: SlackThreadMessage[];
}

export interface IncomeLookupResult {
  income?: ExtractedIncome;
  /** 年収を取得できなかったときの理由(画面の「要確認」表示に使う)。 */
  missingReason?: string;
  threadUrl?: string;
}

/**
 * スレッドの親+返信から、労働条件通知書等のPDFを新しい順に列挙する。
 * ファイル名(またはタイトル)・投稿文のどちらかに書類名を含むPDFが対象。
 */
function listOfferPdfs(messages: SlackThreadMessage[]): SlackFile[] {
  const sorted = [...messages].sort((a, b) => Number(b.ts) - Number(a.ts));
  const result: SlackFile[] = [];
  for (const message of sorted) {
    for (const file of message.files ?? []) {
      if (!isPdfFile(file)) continue;
      const label = `${file.name ?? ""} ${file.title ?? ""} ${message.text ?? ""}`;
      if (OFFER_DOC_RE.test(label)) result.push(file);
    }
  }
  return result;
}

/** 入社確定者1人の年収を求職者スレッドの労働条件通知書から読み取る。失敗しても例外は投げず理由を返す。 */
export async function lookupAnnualIncomeFromSlack(
  botToken: string,
  channelId: string,
  threads: CandidateThread[],
  name: string,
): Promise<IncomeLookupResult> {
  const thread = findThreadForName(name, threads);
  if (!thread) return { missingReason: "Slack「#求職者」に該当スレッドが見つかりません" };

  try {
    // 返信数+最終更新を鮮度キーにして30日キャッシュ(スレッドに投稿が増えるとキーが変わり取り直す。messenger.ts と同じ方式)。
    const freshnessKey = `${thread.replyCount}:${thread.updatedAt.getTime()}`;
    const res = await slackGet<SlackThreadRepliesResponse>(
      botToken,
      "conversations.replies",
      { channel: channelId, ts: thread.threadTs, limit: "200", _v: freshnessKey },
      30 * 24 * 60 * 60,
    );
    const pdfs = listOfferPdfs(res.messages ?? []);
    if (pdfs.length === 0) {
      return { missingReason: "スレッドに労働条件通知書のPDFが見つかりません", threadUrl: thread.permalink };
    }

    let lastError: string | undefined;
    let unreadable = 0;
    for (const file of pdfs.slice(0, MAX_PDFS_PER_PERSON)) {
      const url = file.url_private_download ?? file.url_private;
      if (!url) continue;
      try {
        const text = await getCachedSlackPdfText(file, url, botToken);
        if (!text) {
          unreadable += 1;
          continue;
        }
        const income = extractAnnualIncome(text);
        if (income) return { income, threadUrl: thread.permalink };
      } catch (error) {
        lastError = (error instanceof Error ? error.message : String(error)).slice(0, 120);
      }
    }
    const reason = lastError
      ? `労働条件通知書PDFの取得に失敗しました(${lastError})`
      : unreadable > 0
        ? "労働条件通知書PDFからテキストを抽出できません(スキャン画像の可能性)"
        : "労働条件通知書から年収・月給を読み取れません";
    return { missingReason: reason, threadUrl: thread.permalink };
  } catch (error) {
    console.warn("[placement-income] Slackスレッドの取得に失敗しました:", error);
    return {
      missingReason: `Slackスレッドの取得に失敗しました(${(error instanceof Error ? error.message : String(error)).slice(0, 120)})`,
      threadUrl: thread.permalink,
    };
  }
}
