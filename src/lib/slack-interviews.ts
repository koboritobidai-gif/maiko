/**
 * Slack「#求職者」スレッドから「面談実施」の報告を自動検出し、シート側の求職者台帳
 * (`Candidate`)の面談日(`interviewedAt`)を補完する。送客パートナー費用は「面談実施で課金」
 * のため、シートのO列「面談日」を手入力しなくても、Slackスレッドへの面談メモの投稿だけで
 * 課金対象・月帰属を集計できるようにするための仕組み。
 *
 * 検出ルール(docs/DESIGN.md 4.1 参照):
 * - スレッドの返信(古い順)のうち、「面談実施」「面談を実施」「面談完了」「面談済み」
 *   「面談しました」等を含む最初の返信を「面談実施の報告」とみなす。
 *   ただし同じ行に「予定/予約/リスケ/キャンセル/延期」がある場合は未実施として除外する
 *   (「来週面談を実施予定です」等の誤検出防止)。
 * - 面談日は、その行に「8/3」「8月3日」形式の日付があればそれを優先し、無ければ返信の
 *   投稿日を使う(面談メモは当日〜直後に書かれる運用の想定)。年は投稿日から推測し、
 *   投稿日より2日以上未来になる場合は前年の日付と解釈する(年またぎ対応)。
 * - シートのO列「面談日」に手入力がある求職者はそちらを優先し、補完しない。
 * - 氏名の照合は、シート「氏名」とスレッド名(親メッセージ1行目)の空白(半角・全角)を
 *   除いた完全一致。
 * - 注意: Slack API 呼び出し数抑制のため、返信本文を取得するのは直近アクティブな30スレッド
 *   まで(messenger.ts 参照)。それより古いスレッドの求職者はシートのO列で補うか、
 *   ステージ(面談以降)+登録日による近似で集計される。
 */
import type { Candidate, CandidateThread, CandidateThreadReply } from "./types";

/** 面談を「実施した」ことを表す表現。「面談日程…しました」のような日程調整文は間が長いため一致しない。 */
const INTERVIEW_DONE_RE = /面談.{0,3}(実施|完了|終了)|面談済み|面談(を|は)?しました/;
/** 同じ行にあると「まだ実施していない」ことを表す語。 */
const NOT_DONE_RE = /予定|予約|リスケ|キャンセル|延期/;
/** 行内の日付表記(8/3・8月3日 など)。 */
const INLINE_DATE_RE = /(\d{1,2})[/月](\d{1,2})日?/;

/** 氏名照合用の正規化(半角・全角の空白を除去)。 */
function normalizeName(name: string): string {
  return name.replace(/[\s　]/g, "");
}

/** 返信本文から面談実施日を求める(面談実施の報告でなければ undefined)。 */
function interviewDateFromReply(reply: CandidateThreadReply): Date | undefined {
  const line = reply.text
    .split("\n")
    .find((l) => INTERVIEW_DONE_RE.test(l) && !NOT_DONE_RE.test(l));
  if (!line) return undefined;

  const match = INLINE_DATE_RE.exec(line);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let date = new Date(reply.postedAt.getFullYear(), month - 1, day, 10, 0, 0, 0);
      if (date.getTime() > reply.postedAt.getTime() + 2 * 86400000) {
        date = new Date(reply.postedAt.getFullYear() - 1, month - 1, day, 10, 0, 0, 0);
      }
      return date;
    }
  }
  const posted = new Date(reply.postedAt);
  posted.setHours(10, 0, 0, 0);
  return posted;
}

/** スレッド一覧から「正規化した氏名 → 面談実施日」の対応表を作る(スレッドごとに最初の報告を採用)。 */
export function getSlackInterviewDatesByName(threads: CandidateThread[]): Map<string, Date> {
  const byName = new Map<string, Date>();
  for (const thread of threads) {
    for (const reply of thread.replies) {
      const date = interviewDateFromReply(reply);
      if (date) {
        byName.set(normalizeName(thread.name), date);
        break;
      }
    }
  }
  return byName;
}

/**
 * シートの求職者台帳に、Slackスレッドから検出した面談日を補完して返す(純関数)。
 * `interviewedAt` が既にある(=シートO列に手入力がある)求職者はそのまま。
 */
export function fillInterviewDatesFromSlack(
  candidates: Candidate[],
  threads: CandidateThread[],
): Candidate[] {
  const byName = getSlackInterviewDatesByName(threads);
  if (byName.size === 0) return candidates;
  return candidates.map((c) => {
    if (c.interviewedAt) return c;
    const fromSlack = byName.get(normalizeName(c.name));
    return fromSlack ? { ...c, interviewedAt: fromSlack } : c;
  });
}
