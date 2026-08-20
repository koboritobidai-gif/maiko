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
 * - 注意: Slack API 呼び出し数抑制のため、履歴の遡りは約120日・返信本文の取得は250スレッド
 *   まで(messenger.ts 参照)。それより古いスレッドの求職者はシートのO列で補うか、
 *   ステージ(面談以降)+登録日による近似で集計される。
 */
import type { Candidate, CandidateThread, CandidateThreadReply, ReferralRate } from "./types";

/**
 * 面談を「実施した」ことを表す表現。「面談日程…しました」のような日程調整文は間が長いため一致しない。
 * 現場では「面談結果)8/10」のようなタイトルで結果を投稿する運用のため、「面談結果」も実施の報告とみなす。
 */
const INTERVIEW_DONE_RE = /面談.{0,3}(実施|完了|終了)|面談済み|面談(を|は)?しました|面談結果/;
/** 同じ行にあると「まだ実施していない」ことを表す語。 */
const NOT_DONE_RE = /予定|予約|リスケ|キャンセル|延期/;
/** 行内の日付表記(8/3・8月3日 など)。 */
const INLINE_DATE_RE = /(\d{1,2})[/月](\d{1,2})日?/;

/** 氏名照合用の正規化(半角・全角の空白を除去)。 */
function normalizeName(name: string): string {
  return name.replace(/[\s　]/g, "");
}

/**
 * 面談メモ形式の投稿(キーワードなし)を検出するための目印。現場では
 * 「8/10(月)13:00〜 / 2peace様流入 / ◇プロフィール / …」のように、日付+流入元+プロフィールの
 * 構成で面談内容を投稿する運用があるため、「プロフィール」を含む返信も面談実施の報告とみなす。
 */
const PROFILE_RE = /◇?\s*プロフィール/;

/**
 * 行内の日付表記から面談日を求める(行に日付が無ければ投稿日を10時起点で使う)。
 * slack-ca-stats.ts の発生月判定(面接・内定・離脱をイベントが実際に起きた月に帰属させる処理)でも使う。
 */
export function dateFromLine(line: string, postedAt: Date): Date {
  const match = INLINE_DATE_RE.exec(line);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let date = new Date(postedAt.getFullYear(), month - 1, day, 10, 0, 0, 0);
      if (date.getTime() > postedAt.getTime() + 2 * 86400000) {
        date = new Date(postedAt.getFullYear() - 1, month - 1, day, 10, 0, 0, 0);
      }
      return date;
    }
  }
  const posted = new Date(postedAt);
  posted.setHours(10, 0, 0, 0);
  return posted;
}

/** 返信本文から面談実施日を求める(面談実施の報告でなければ undefined)。 */
function interviewDateFromReply(reply: CandidateThreadReply): Date | undefined {
  const lines = reply.text.split("\n");

  // 1. キーワード(面談実施/面談結果 等)を含む行があればその行の日付を使う。
  const keywordLine = lines.find((l) => INTERVIEW_DONE_RE.test(l) && !NOT_DONE_RE.test(l));
  if (keywordLine) return dateFromLine(keywordLine, reply.postedAt);

  // 2. キーワードが無くても「プロフィール」を含む面談メモ形式なら面談実施とみなし、
  //    冒頭に近い日付行(「8/10(月)13:00〜」等。予定・キャンセル等の行は除く)を面談日として使う。
  if (PROFILE_RE.test(reply.text)) {
    const dateLine = lines.find((l) => INLINE_DATE_RE.test(l) && !NOT_DONE_RE.test(l));
    return dateFromLine(dateLine ?? "", reply.postedAt);
  }

  return undefined;
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
 * Slackスレッドから検出した面談実施の「月別件数」(YYYY-MM → 人数)を返す(純関数)。
 * 主要指標の面談数は週次KPIシートの手入力を待たずにSlackの面談メモから反映したいという
 * 経営者の要望のため、CA別実績とまったく同じ数え方(スレッドごとに1件。日付は
 * getSlackInterviewDatesByName の氏名対応表を引く)にする。
 * 注意: 氏名対応表の「値」を直接数えると同名スレッドが1件に潰れ、CA別実績の合計と
 * ズレる(実際に13件 vs 12件の不一致が起きた)。必ずスレッド単位でループすること。
 */
export function getSlackInterviewMonthlyCounts(threads: CandidateThread[]): Map<string, number> {
  const byName = getSlackInterviewDatesByName(threads);
  const counts = new Map<string, number>();
  for (const thread of threads) {
    const date = byName.get(normalizeName(thread.name));
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
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

/** 経路名の「本体」(括弧書き注記を除いた部分)。「2peace(Tさん)」→「2peace」。 */
function referralChannelCore(channel: string): string {
  return channel.split("(")[0].trim();
}

/**
 * スレッド本文(親+返信)から流入経路を検出する。現場の運用ではスレッドに
 * 「2peace様流入」「マホガニー経由」のように書かれるため、「流入」「経由」を含む行の中に
 * 単価マスタの経路名(括弧前の本体、大文字小文字無視の部分一致)があればその経路とみなす。
 */
export function getSlackInflowChannelsByName(
  threads: CandidateThread[],
  referralRates: ReferralRate[],
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const thread of threads) {
    const lines = [thread.parentText, ...thread.replies.map((r) => r.text)]
      .flatMap((t) => t.split("\n"))
      .filter((l) => l.includes("流入") || l.includes("経由"));
    for (const line of lines) {
      const lower = line.toLowerCase();
      const hit = referralRates.find((rate) => lower.includes(referralChannelCore(rate.channel).toLowerCase()));
      if (hit) {
        byName.set(normalizeName(thread.name), hit.channel);
        break;
      }
    }
  }
  return byName;
}

/**
 * 送客パートナー費用集計用の求職者一覧を、シート台帳+Slackスレッドから組み立てる(純関数)。
 * 実運用の求職者データベースはSlack「#求職者」のため、シートに載っていない求職者も
 * スレッドの記載だけで課金対象に数えられるようにする:
 * 1. シートの求職者は、面談日(O列優先)と流入経路(K列優先)をSlackの記載で補完する
 * 2. シートに同名が無いスレッドは、「◯◯様流入」等の経路 と「面談実施」報告 の両方が
 *    検出できた場合のみ、擬似的な求職者(ステージ=面談)として追加する(面談実施で課金のため、
 *    面談報告が無いスレッドは追加しない)
 * 注意: この結果は費用集計(getMarketingSummary)専用。パイプラインやCA別担当数には使わないこと
 * (Slackだけの擬似求職者が混ざり、画面の求職者数が実態とズレるため)。
 */
export function buildReferralCandidatesFromSlack(
  candidates: Candidate[],
  threads: CandidateThread[],
  referralRates: ReferralRate[],
): Candidate[] {
  const interviewDates = getSlackInterviewDatesByName(threads);
  const inflowByName = getSlackInflowChannelsByName(threads, referralRates);
  const sheetNames = new Set(candidates.map((c) => normalizeName(c.name)));

  const enriched = candidates.map((c) => {
    const key = normalizeName(c.name);
    const interviewedAt = c.interviewedAt ?? interviewDates.get(key);
    const inflowChannel = c.inflowChannel ?? inflowByName.get(key);
    if (interviewedAt === c.interviewedAt && inflowChannel === c.inflowChannel) return c;
    return { ...c, interviewedAt, inflowChannel };
  });

  const synthetic: Candidate[] = [];
  for (const thread of threads) {
    const key = normalizeName(thread.name);
    if (sheetNames.has(key)) continue;
    const inflowChannel = inflowByName.get(key);
    const interviewedAt = interviewDates.get(key);
    if (!inflowChannel || !interviewedAt) continue;
    synthetic.push({
      id: `slack-${thread.threadTs}`,
      name: thread.name,
      caId: "",
      stage: "面談",
      desiredRole: "",
      expectedAnnualIncome: 0,
      updatedAt: thread.updatedAt,
      registeredAt: thread.registeredAt,
      interviewedAt,
      latestNote: thread.latestText,
      inflowChannel,
    });
  }
  return synthetic.length > 0 ? [...enriched, ...synthetic] : enriched;
}
