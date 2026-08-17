/**
 * 「AIに聞く」のデータスナップショット構築 + ルールベース応答(デモレスポンダ)。
 * `ANTHROPIC_API_KEY` が無い/呼び出し失敗時に api/ask/route.ts からフォールバックとして呼ばれる。
 * KPIの実数値は必ず src/lib/metrics.ts 経由で取得し、DataBundle(loadDataBundle の結果)を
 * 引数として受け取る(demo-data.ts / adapters を直接 import しないこと)。
 */
import { CA_MEMBER_ID, EXEC_MEMBER_ID } from "@/lib/demo-data";
import {
  getBlockRate,
  getCaCandidateBreakdown,
  getCaMonthPlacements,
  getCandidateFunnel,
  getCandidatesByCa,
  getCorporateFunnel,
  getForecastRevenue,
  getKpiTotalsByOwner,
  getMarketingSummary,
  getMonthPlacements,
  getMonthlyKpiEntriesByOwner,
  getMonthlyKpiTotal,
  getPrimaryKpis,
  getRecentWeeklyKpiTrend,
  getSortedProjects,
  getStagePipeline,
  getTodayPlacements,
  getWeeklyTrendRows,
  getWithdrawnCount,
} from "@/lib/metrics";
import type { MarketingSummary, ReferralPartnerSummary } from "@/lib/metrics";
import type {
  Candidate,
  CandidateKpiKey,
  CandidateThread,
  CorporateKpiKey,
  DataBundle,
  MarketingData,
  Member,
} from "@/lib/types";

export type AskRole = "exec" | "ca" | undefined;

// ─────────────────────────────────────────────
// データスナップショット(Claude 呼び出し時のコンテキスト、かつルールベースの入力にもなる)
// ─────────────────────────────────────────────

function toManYen(amountYen: number): number {
  return Math.round(amountYen / 10000);
}

function formatMan(amountYen: number): string {
  return `${toManYen(amountYen).toLocaleString("ja-JP")}万円`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
}

/** 円額を「¥123,456」形式で表示する(広告費用など、万円換算しない金額用)。 */
function formatYenPlain(amountYen: number): string {
  return `¥${Math.round(amountYen).toLocaleString("ja-JP")}`;
}

export function buildAskSnapshot(
  bundle: DataBundle,
  candidateThreads: CandidateThread[] = [],
  marketingData: MarketingData | null = null,
) {
  const pipeline = getStagePipeline(bundle.candidates);
  const projectList = getSortedProjects(bundle.projects);
  const primary = getPrimaryKpis(bundle.weeklyKpis);
  const candidateFunnel = getCandidateFunnel(bundle.weeklyKpis);
  const corporateFunnel = getCorporateFunnel(bundle.weeklyKpis);
  const weeklyTrend = getWeeklyTrendRows(bundle.weeklyKpis, 5);
  // CA(及び全メンバー)個別実績: 担当求職者のステージ内訳・月内成約・週次KPI入力担当分をまとめる
  // (「◯◯さんの結果は?」「◯◯さんの実績は?」に、Claude 経由でもルールベースでも答えられるようにする)。
  const caResults = bundle.members.map((m) => {
    const stageBreakdown = getCaCandidateBreakdown(bundle.candidates, m.id).filter((b) => b.count > 0);
    const monthPlacements = getCaMonthPlacements(bundle.placements, m.id);
    const monthlyKpiInput = getMonthlyKpiEntriesByOwner(bundle.weeklyKpis, m.name);
    return {
      name: m.name,
      role: m.role,
      activeCandidateCount: stageBreakdown.reduce((sum, b) => sum + b.count, 0),
      stageBreakdown,
      monthPlacementCount: monthPlacements.count,
      monthPlacementFeeAmountMan: toManYen(monthPlacements.amount),
      monthlyKpiInput,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    today: getTodayPlacements(bundle.placements),
    month: getMonthPlacements(bundle.placements),
    forecastRevenueYen: getForecastRevenue(bundle.candidates, bundle.settings.feeRate),
    primaryKpisThisMonth: {
      interviews: primary.interviews,
      offers: primary.offers,
      candidatePlacements: primary.candidatePlacements,
      contractAmountMan: primary.contractAmountMan,
    },
    candidateFunnelThisMonth: candidateFunnel,
    corporateFunnelThisMonth: corporateFunnel,
    weeklyTrendRecent5Weeks: weeklyTrend,
    // 集客・広告データ(アイドマ=広告運用シート/リズリアライズ=SNS運用シート)の今月サマリ。
    // marketingData が渡されなかった場合(呼び出し元が未取得)は null。
    marketingThisMonth: marketingData
      ? getMarketingSummary(marketingData, bundle.weeklyKpis, bundle.candidates, bundle.settings.referralRates)
      : null,
    // ブロック率(Lステップのブロック数 ÷ LINE登録人数)。「ブロック数」は週次KPIの任意項目のため
    // hasAnyData が false の場合は未入力(ratePercent も null)。
    blockRateThisMonth: getBlockRate(bundle.weeklyKpis),
    // CA(及び全メンバー)個別実績。
    caResults,
    pipeline: pipeline.map((s) => ({ stage: s.stage, count: s.count })),
    withdrawnCount: getWithdrawnCount(bundle.candidates),
    projects: projectList.map((p) => ({
      name: p.name,
      department: p.department,
      owner: p.owner,
      status: p.status,
      progressPercent: p.progressPercent,
      dueDate: p.dueDate.toISOString(),
      latestComment: p.latestComment,
    })),
    members: bundle.members.map((m) => ({
      name: m.name,
      role: m.role,
      specialty: m.specialty,
    })),
    candidates: bundle.candidates.map((c) => ({
      name: c.name,
      caName: bundle.members.find((m) => m.id === c.caId)?.name ?? c.caId,
      stage: c.stage,
      desiredRole: c.desiredRole,
      updatedAt: c.updatedAt.toISOString(),
      latestNote: c.latestNote,
      gender: c.gender,
      age: c.age,
      inflowChannel: c.inflowChannel,
      referredTo: c.referredTo,
      interviewResult: c.interviewResult,
    })),
    // 求職者Slackスレッド(#求職者チャンネル、1人1スレッド運用の進捗データベース)。
    // 上記 candidates(シート台帳)とは別管理で、氏名以外の突合キーは持たない。
    candidateThreads: candidateThreads.map((t) => ({
      name: t.name,
      registeredAt: t.registeredAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      replyCount: t.replyCount,
      latestReplies: t.replies.slice(-2).map((r) => ({
        author: r.author,
        postedAt: r.postedAt.toISOString(),
        text: r.text,
      })),
    })),
  };
}

export type AskSnapshot = ReturnType<typeof buildAskSnapshot>;

/** Claude 用システムプロンプト。 */
export const ASK_SYSTEM_PROMPT = `あなたは株式会社翔び台(人材紹介会社)の経営アシスタントです。
ユーザーの質問に対して、渡されたデータスナップショット(JSON)に基づき、正確な数値と簡潔な一言インサイトで日本語で回答してください。

データスナップショットには、週次入力(毎週月曜に前週分を入力)された求職者集客(LINEファネル)・法人営業のKPIの
今月合計・週次推移(直近5週)・求職者パイプライン・プロジェクト・メンバー一覧が含まれます。
求職者一覧(candidates)には氏名・担当CA・ステージ・希望職種・更新日・最新メモに加え、性別(gender)・年齢(age)・
流入経路(inflowChannel)・送客先(referredTo)・面接結果(interviewResult)が任意項目として含まれる場合があります
(未登録の求職者は空欄のことがあります)。特定の求職者名で質問された場合は、これらの情報も自然に添えて答えてください。

candidateThreads は社内Slack「#求職者」チャンネル(1人の求職者につき1スレッドの運用)から取得した進捗データベースで、
氏名・登録日時(registeredAt)・最終更新日時(updatedAt)・返信数(replyCount)・直近の返信2件(latestReplies、
投稿者・日時・本文)が含まれます。candidates(シート台帳)とは別管理で、両方に同じ氏名が存在する場合は
どちらの情報も自然に言及してください(シート台帳にのみ、またはSlackスレッドにのみ存在する求職者もいます)。

marketingThisMonth には広告運用(アイドマ)シート・SNS運用(リズリアライズ)シートから集計した今月の集客・広告データが
含まれます(null の場合は集客データ未取得)。channels(Google広告・Meta広告、それぞれ費用/表示回数/クリック数/
LINE登録数/面談予約数/面談実施数/CTR/遷移率regRate/予約率reserveRate/面談実行率execRate/登録単価cpa/面談単価
costPerInterview)、sns(SNS運用の月額固定費用cost/再生数plays/プロフィール遷移profileVisits/LP閲覧lpViews/
LINE登録lineRegs/面談interviews/LP遷移率lpRate/登録率regRate/登録単価cpa/面談単価costPerInterview)、
referralPartners(送客パートナー、成果報酬型。KANOA/マホガニー/foresma/2peace(Tさん)の4経路それぞれの
channel/unitCostYen(1人あたり単価)/count(今月の対象人数)/costYen(費用)。**面談実施で課金**のため、
対象人数は流入経路が一致し面談を実施した求職者〈面談以降のステージ、または辞退でも面談日あり。面談前の
辞退は対象外〉で、月の帰属は面談日〈未入力時は登録日→更新日〉基準です)、
referralTotalYen(送客パートナー費用の合計)、totalCost/totalLineRegs/totalReservations/totalInterviews
(広告+SNS+送客パートナー合算。totalCost にのみ送客パートナー費用を含む)、transitionRates(遷移率まとめ)が
含まれます。率・単価の値が null の場合は「分母が0のため算出できません」のように答えてください。
「送客費用は?」「送客パートナーは?」のような全体質問には4経路+合計を、「KANOAの費用/実績は?」
「マホガニーは?」のような経路名を含む質問にはその経路の単価・人数・費用を個別に答えてください。

blockRateThisMonth は Lステップ(LINE公式アカウント)のブロック率(ブロック数 ÷ LINE登録人数)です。
hasAnyData が false の場合は週次KPIに「ブロック数」がまだ入力されていないという意味なので、
「ブロック数が未入力です。週次KPIタブに『ブロック数』を追加すると回答できます」のように案内してください。

caResults は全メンバー(CA: 今井/佐藤/富田 を含む)個別の今月実績で、担当求職者数(activeCandidateCount)・
ステージ内訳(stageBreakdown)・今月の成約件数と手数料合計(monthPlacementCount/monthPlacementFeeAmountMan、
万円単位)・週次KPIの入力担当分(monthlyKpiInput)が含まれます。「◯◯さんの結果は?」「◯◯さんの実績は?」
のような質問には、該当メンバーの caResults を使って具体的に答えてください。

ルール:
- 数値はスナップショットに存在する値のみを使うこと。スナップショットに無い情報は推測せず、「データ上は確認できません」のように正直に答える。
- 回答は3〜5文程度、簡潔に。冒頭で結論(数値)を述べ、最後に一言インサイト(示唆・次のアクション)を添える。
- 金額は万円単位で分かりやすく表示する(例: 1,234万円)。
- 箇条書きが分かりやすい場合(ステージ別・週次推移など)は箇条書きを使ってよい。
- 敬体(です・ます調)で、社内アシスタントらしい丁寧かつ簡潔なトーンで話す。
- Markdownの強調記号(**など)は使わず、プレーンテキストで回答する。`;

// ─────────────────────────────────────────────
// ルールベース応答(デモレスポンダ)
// ─────────────────────────────────────────────

function findMemberBySurnameInText(text: string, members: Member[]): Member | undefined {
  return members.find((m) => {
    const surname = m.name.split(" ")[0];
    return surname.length >= 2 && text.includes(surname);
  });
}

/** 質問文に求職者のフルネーム(スペース除去して比較)が含まれるか探す。 */
function findCandidateByNameInText(text: string, candidates: Candidate[]): Candidate | undefined {
  const normalizedText = text.replace(/\s+/g, "");
  return candidates.find((c) => {
    const fullName = c.name.replace(/\s+/g, "");
    return fullName.length >= 2 && normalizedText.includes(fullName);
  });
}

/** 質問文に求職者Slackスレッドの氏名(スペース除去して比較)が含まれるか探す。 */
function findCandidateThreadByNameInText(text: string, threads: CandidateThread[]): CandidateThread | undefined {
  const normalizedText = text.replace(/\s+/g, "");
  return threads.find((t) => {
    const name = t.name.replace(/\s+/g, "");
    return name.length >= 2 && normalizedText.includes(name);
  });
}

/** 求職者名を含む質問に、性別・年齢・流入経路・送客先・面接結果を含めて答える。 */
function answerCandidateDetail(candidate: Candidate, bundle: DataBundle): string {
  const caName = bundle.members.find((m) => m.id === candidate.caId)?.name ?? candidate.caId;
  const profileParts = [candidate.gender, candidate.age != null ? `${candidate.age}歳` : null].filter(Boolean);
  const profile = profileParts.length > 0 ? `(${profileParts.join("・")})` : "";

  const parts: string[] = [
    `${candidate.name}さん${profile}は現在「${candidate.stage}」ステージです(担当: ${caName}CA、希望職種: ${candidate.desiredRole})。`,
  ];
  if (candidate.inflowChannel) parts.push(`流入経路は${candidate.inflowChannel}です。`);
  if (candidate.referredTo) parts.push(`送客先は${candidate.referredTo}です。`);
  if (candidate.interviewResult) parts.push(`面接結果は「${candidate.interviewResult}」です。`);
  parts.push(`最新メモ: ${candidate.latestNote || "特になし"}`);
  return parts.join(" ");
}

/** 求職者Slackスレッド(#求職者チャンネル)名を含む質問に、最新返信2件・登録日・返信数を含めて答える。 */
function answerCandidateThreadDetail(thread: CandidateThread): string {
  const latestReplies = thread.replies.slice(-2);
  const quoted =
    latestReplies.length > 0
      ? latestReplies.map((r) => `「${r.text}」(${formatDate(r.postedAt)}・${r.author})`).join(" / ")
      : "まだ返信はありません";
  return (
    `Slackスレッド(#求職者)によると、${thread.name}さんは${formatDate(thread.registeredAt)}に登録され、` +
    `これまでに返信${thread.replyCount}件のやり取りがあります。直近の投稿: ${quoted}`
  );
}

function kpiInsight(diff: number, positiveLabel: string, negativeLabel: string): string {
  if (diff > 0) return positiveLabel;
  if (diff < 0) return negativeLabel;
  return "先月と横ばいです。";
}

function answerMemberCandidates(member: Member, role: AskRole, bundle: DataBundle): string {
  const myCandidates = getCandidatesByCa(bundle.candidates, member.id);
  const active = myCandidates.filter((c) => c.stage !== "辞退");
  if (active.length === 0) {
    return `${member.name}さんが現在担当している求職者は見つかりませんでした。`;
  }
  const listed = active.slice(0, 6).map((c) => `${c.name}(${c.stage})`);
  const suffix = active.length > 6 ? ` ほか${active.length - 6}名` : "";
  const you = role === "ca" && member.id === CA_MEMBER_ID ? "あなたが" : `${member.name}さんが`;
  return `${you}担当している求職者は${active.length}名です。内訳: ${listed.join("、")}${suffix}。内定・承諾に近い方から優先フォローすると成約につながりやすいです。`;
}

/** 「◯◯さんの結果は?」「◯◯さんの実績は?」への回答: 担当求職者のステージ内訳・月内成約・週次KPI入力担当分。 */
function answerMemberResults(member: Member, bundle: DataBundle): string {
  const breakdown = getCaCandidateBreakdown(bundle.candidates, member.id).filter((b) => b.count > 0);
  const totalCandidates = breakdown.reduce((sum, b) => sum + b.count, 0);
  const stageText =
    breakdown.length > 0 ? breakdown.map((b) => `${b.stage}${b.count}名`).join("、") : "担当求職者は見つかりませんでした";

  const { count: placementCount, amount: placementAmount } = getCaMonthPlacements(bundle.placements, member.id);

  const kpiEntries = getMonthlyKpiEntriesByOwner(bundle.weeklyKpis, member.name);
  const kpiText =
    kpiEntries.length > 0
      ? kpiEntries.map((e) => `${e.key}${e.total.toLocaleString("ja-JP")}`).join("、")
      : "今月の週次KPI入力実績は見つかりませんでした";

  return (
    `${member.name}さんの今月の実績です。担当求職者は${totalCandidates}名(内訳: ${stageText})。` +
    `今月の成約は${placementCount}件、手数料合計${formatMan(placementAmount)}です。` +
    `週次KPIの入力担当分: ${kpiText}。`
  );
}

function answerToday(bundle: DataBundle): string {
  const { count, amount } = getTodayPlacements(bundle.placements);
  if (count === 0) {
    return `本日時点の成約はまだ0件です。選考が進んでいる求職者のクロージングを後押ししましょう。`;
  }
  return `本日の成約は${count}件、金額にして${formatMan(amount)}です。好調な滑り出しです、この流れで月内累計も積み上げていきましょう。`;
}

function answerForecast(bundle: DataBundle): string {
  const forecast = getForecastRevenue(bundle.candidates, bundle.settings.feeRate);
  return `内定・承諾ベースの売上見込みは${formatMan(forecast)}です。承諾済みの求職者は入社日調整を、内定段階の求職者は早めの意思決定フォローを進めるとよさそうです。`;
}

/** 「広告費は?」「広告金額は?」への回答: 月内媒体別+合計。 */
function answerAdCost(marketingSummary: MarketingSummary | null): string {
  if (!marketingSummary) return "集客・広告データが取得できませんでした。";
  const google = marketingSummary.channels.find((c) => c.channel === "Google広告");
  const meta = marketingSummary.channels.find((c) => c.channel === "Meta広告");
  return (
    `今月の広告費用は合計${formatYenPlain(marketingSummary.totalCost)}です` +
    `(Google広告 ${formatYenPlain(google?.cost ?? 0)}、Meta広告 ${formatYenPlain(meta?.cost ?? 0)}、` +
    `SNS運用(リズリアライズ)月額 ${formatYenPlain(marketingSummary.sns.cost)})。` +
    `LINE登録${marketingSummary.totalLineRegs}人・面談実績${marketingSummary.totalInterviews}件につながっています。`
  );
}

/** 「CPAは?」「登録単価は?」への回答: 媒体別CPA(登録単価)。 */
function answerCpa(marketingSummary: MarketingSummary | null): string {
  if (!marketingSummary) return "集客・広告データが取得できませんでした。";
  const google = marketingSummary.channels.find((c) => c.channel === "Google広告");
  const meta = marketingSummary.channels.find((c) => c.channel === "Meta広告");
  const fmt = (v: number | null | undefined) => (v == null ? "算出できません(LINE登録0件)" : formatYenPlain(v));
  return (
    `今月の登録単価(CPA)は Google広告 ${fmt(google?.cpa)}、Meta広告 ${fmt(meta?.cpa)}、` +
    `SNS運用(リズリアライズ) ${fmt(marketingSummary.sns.cpa)} です。`
  );
}

/** 「送客費用」「送客パートナー」への回答: 4経路の単価・人数・費用+合計。 */
function answerReferralPartnersOverview(marketingSummary: MarketingSummary | null): string {
  if (!marketingSummary) return "集客・広告データが取得できませんでした。";
  const lines = marketingSummary.referralPartners
    .map((r) => `${r.channel}(単価${formatYenPlain(r.unitCostYen)}) 面談${r.count}名・${formatYenPlain(r.costYen)}`)
    .join("、");
  return (
    `今月の送客パートナー費用は合計${formatYenPlain(marketingSummary.referralTotalYen)}です(${lines})。` +
    `面談実施で課金のため、対象人数は流入経路が一致し面談を実施した求職者(面談後の辞退も含む)で、月の判定は面談日(未入力時は登録日→更新日)基準です。`
  );
}

/** 「KANOAの費用/実績は?」「マホガニーは?」など、経路名を含む質問への個別回答。 */
function answerReferralPartnerChannel(r: ReferralPartnerSummary): string {
  return `${r.channel}の今月実績は面談${r.count}名、単価${formatYenPlain(r.unitCostYen)}、費用は${formatYenPlain(r.costYen)}です。`;
}

/** 経路名の「本体」(括弧書き注記を除いた部分)。「2peace(Tさん)」→「2peace」のように、質問文が
 *  括弧部分を省略していてもマッチできるようにするための正規化。 */
function referralChannelCore(channel: string): string {
  return channel.split("(")[0].trim();
}

/** 質問文に送客パートナーの経路名(本体部分、大文字小文字無視)が含まれるか探す。 */
function findReferralPartnerInText(
  text: string,
  marketingSummary: MarketingSummary | null,
): ReferralPartnerSummary | undefined {
  if (!marketingSummary) return undefined;
  const normalizedText = text.toLowerCase();
  return marketingSummary.referralPartners.find((r) =>
    normalizedText.includes(referralChannelCore(r.channel).toLowerCase()),
  );
}

/** 「ブロック率は?」への回答: 週次KPIの任意項目「ブロック数」の月内合計 ÷ 月内LINE登録人数。 */
function answerBlockRateQuestion(bundle: DataBundle): string {
  const block = getBlockRate(bundle.weeklyKpis);
  if (!block.hasAnyData) {
    return "ブロック数が未入力です。週次KPIタブに「ブロック数」を追加すると回答できます。";
  }
  if (block.ratePercent === null) {
    return `今月のLINE登録人数が0のため、ブロック率を算出できません(ブロック数${block.blockCount}件)。`;
  }
  return `今月のブロック率は${block.ratePercent.toFixed(1)}%です(ブロック数${block.blockCount}件 ÷ LINE登録${block.lineRegistrations}人)。`;
}

function answerProjects(bundle: DataBundle): string {
  const projectList = getSortedProjects(bundle.projects);
  const delayed = projectList.filter((p) => p.status === "遅延");
  const caution = projectList.filter((p) => p.status === "注意");
  if (delayed.length === 0 && caution.length === 0) {
    return "現在、遅延・注意のプロジェクトはありません。全プロジェクトが順調に進行しています。";
  }
  const parts: string[] = [];
  if (delayed.length > 0) {
    parts.push(
      `遅延: ${delayed
        .map((p) => `${p.name}(${p.owner}・進捗${p.progressPercent}%・期日${formatDate(p.dueDate)})`)
        .join("、")}`,
    );
  }
  if (caution.length > 0) {
    parts.push(
      `注意: ${caution.map((p) => `${p.name}(${p.owner}・進捗${p.progressPercent}%)`).join("、")}`,
    );
  }
  const focus = delayed[0] ?? caution[0];
  return `${parts.join("。")}。特に「${focus.name}」は「${focus.latestComment}」とのことなので、早めのフォローをおすすめします。`;
}

function answerPipeline(bundle: DataBundle): string {
  const pipeline = getStagePipeline(bundle.candidates);
  const inSelection = pipeline
    .filter((s) => ["企業提案", "面接"].includes(s.stage))
    .reduce((sum, s) => sum + s.count, 0);
  const listed = pipeline.map((s) => `${s.stage}${s.count}名`).join("、");
  const bottleneck = [...pipeline].sort((a, b) => b.count - a.count)[0];
  return (
    `選考が進んでいる求職者(企業提案〜面接)は合計${inSelection}名です。ステージ別内訳: ${listed}。` +
    `最も人数が多いのは「${bottleneck.stage}」(${bottleneck.count}名)で、ここが全体のボトルネックになりやすいので優先的にケアするとよさそうです。`
  );
}

// ─────────────────────────────────────────────
// 週次KPI関連の質問応答
// ─────────────────────────────────────────────

type TimeScope = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "compare";

function resolveTimeScope(text: string): TimeScope {
  if (text.includes("先週")) return "lastWeek";
  if (text.includes("今週")) return "thisWeek";
  if (text.includes("先月")) return "lastMonth";
  if (text.includes("比べ") || text.includes("比較")) return "compare";
  return "thisMonth";
}

interface CandidateKpiMatch {
  key: CandidateKpiKey;
  unit: string;
}

/** 候補求職者系KPIのキーワード判定(より具体的な語を先にチェックする)。 */
function matchCandidateKpiKey(text: string): CandidateKpiMatch | null {
  if (text.includes("面談予約")) return { key: "面談予約数", unit: "件" };
  if (text.includes("最終面接")) return { key: "最終面接数", unit: "件" };
  if (text.includes("1次") || text.includes("前面接")) return { key: "1次〜最終前面接数", unit: "件" };
  if (text.includes("面談")) return { key: "面談数", unit: "件" };
  if (text.includes("内定")) return { key: "内定者数", unit: "名" };
  if (text.includes("採用決定") && !text.includes("法人")) {
    return { key: "採用決定求職者数", unit: "名" };
  }
  if (text.includes("LINE登録")) return { key: "LINE登録人数", unit: "人" };
  if (text.includes("PV")) return { key: "PV数", unit: "" };
  return null;
}

interface CorporateKpiMatch {
  key: CorporateKpiKey;
  unit: string;
}

function matchCorporateKpiKey(text: string): CorporateKpiMatch | null {
  if (text.includes("名刺交換")) return { key: "名刺交換数", unit: "件" };
  if (text.includes("契約金額")) return { key: "契約金額", unit: "万円" };
  if (text.includes("契約")) return { key: "契約数", unit: "件" };
  if (text.includes("採用決定") && text.includes("法人")) return { key: "採用決定法人数", unit: "社" };
  if (text.includes("既存商談")) return { key: "既存商談数(主権)", unit: "件" };
  if (text.includes("商談")) return { key: "商談数(主権)", unit: "件" };
  if (text.includes("アポ")) return { key: "アポイント数(主権)", unit: "件" };
  return null;
}

/** 「面談」「商談」など複数キーに分かれる項目は、集計時に主権/非主権/外部を合算して答える。 */
function aggregateKeysFor(key: CandidateKpiKey | CorporateKpiKey): (CandidateKpiKey | CorporateKpiKey)[] {
  if (key === "商談数(主権)") return ["商談数(主権)", "商談数(非主権)", "商談数(外部)"];
  if (key === "アポイント数(主権)") return ["アポイント数(主権)", "アポイント数(非主権)", "アポイント数(外部)"];
  if (key === "既存商談数(主権)") return ["既存商談数(主権)", "既存商談数(非主権)"];
  return [key];
}

function displayLabel(key: CandidateKpiKey | CorporateKpiKey): string {
  if (key === "商談数(主権)") return "商談数";
  if (key === "アポイント数(主権)") return "アポイント数";
  if (key === "既存商談数(主権)") return "既存商談数";
  return key;
}

function weeklyValueAt(
  records: DataBundle["weeklyKpis"],
  category: "求職者" | "法人",
  keys: (CandidateKpiKey | CorporateKpiKey)[],
  offsetFromLatest: number,
): number {
  return keys.reduce((sum, key) => {
    const trend = getRecentWeeklyKpiTrend(records, category, key, offsetFromLatest + 1);
    const point = trend[trend.length - 1 - offsetFromLatest];
    return sum + (point?.value ?? 0);
  }, 0);
}

function monthlyValue(
  records: DataBundle["weeklyKpis"],
  category: "求職者" | "法人",
  keys: (CandidateKpiKey | CorporateKpiKey)[],
  now: Date,
): number {
  return keys.reduce((sum, key) => sum + getMonthlyKpiTotal(records, category, key, now), 0);
}

/** 求職者/法人系KPIの数値質問に、時間軸(今週/先週/今月/先月/比較)を反映して答える。 */
function answerKpiValue(
  category: "求職者" | "法人",
  key: CandidateKpiKey | CorporateKpiKey,
  unit: string,
  bundle: DataBundle,
  scope: TimeScope,
  ownerName?: string,
): string {
  const keys = aggregateKeysFor(key);
  const label = displayLabel(key);
  const now = new Date();

  if (ownerName) {
    const total = keys.reduce((sum, k) => {
      const totals = getKpiTotalsByOwner(bundle.weeklyKpis, category, k);
      return sum + (totals.find((o) => o.owner === ownerName)?.total ?? 0);
    }, 0);
    return `${ownerName}さんの今月の${label}は${total.toLocaleString("ja-JP")}${unit}です(週次入力の合計)。`;
  }

  switch (scope) {
    case "thisWeek": {
      const value = weeklyValueAt(bundle.weeklyKpis, category, keys, 0);
      return `今週の${label}は${value.toLocaleString("ja-JP")}${unit}です(直近の週次入力ベース)。`;
    }
    case "lastWeek": {
      const value = weeklyValueAt(bundle.weeklyKpis, category, keys, 1);
      return `先週の${label}は${value.toLocaleString("ja-JP")}${unit}でした。`;
    }
    case "lastMonth": {
      const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const value = monthlyValue(bundle.weeklyKpis, category, keys, lastMonthRef);
      return `先月の${label}は${value.toLocaleString("ja-JP")}${unit}でした。`;
    }
    case "compare": {
      const value = monthlyValue(bundle.weeklyKpis, category, keys, now);
      const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousValue = monthlyValue(bundle.weeklyKpis, category, keys, lastMonthRef);
      const diff = value - previousValue;
      return (
        `今月の${label}は${value.toLocaleString("ja-JP")}${unit}、先月は${previousValue.toLocaleString("ja-JP")}${unit}です。` +
        kpiInsight(
          diff,
          `先月比+${diff}${unit}で伸びています。この調子を維持しましょう。`,
          `先月比${diff}${unit}です。テコ入れを検討しましょう。`,
        )
      );
    }
    case "thisMonth":
    default: {
      const value = monthlyValue(bundle.weeklyKpis, category, keys, now);
      return `今月の${label}は${value.toLocaleString("ja-JP")}${unit}です(週次入力の合計)。`;
    }
  }
}

function answerLineRegistrationRate(bundle: DataBundle): string {
  const funnel = getCandidateFunnel(bundle.weeklyKpis);
  return `今月のLINE登録率は${funnel.lineRegistrationRatePercent.toFixed(1)}%です(PV数${funnel.pv.toLocaleString(
    "ja-JP",
  )}件・LINE登録${funnel.lineRegistrations.toLocaleString("ja-JP")}人)。導線改善の効果測定に活用してください。`;
}

function answerInterviewExecutionRate(bundle: DataBundle): string {
  const funnel = getCandidateFunnel(bundle.weeklyKpis);
  return `今月の面談実行率は${funnel.interviewExecutionRatePercent.toFixed(1)}%です(面談予約${funnel.interviewBookings}件のうち面談実施${funnel.interviews}件)。`;
}

function answerInterviewConversionRate(bundle: DataBundle): string {
  const funnel = getCandidateFunnel(bundle.weeklyKpis);
  return `今月の面談移行率は${funnel.interviewConversionRatePercent.toFixed(1)}%です(LINE登録${funnel.lineRegistrations}人のうち面談実施${funnel.interviews}件)。`;
}

function answerMonthlyOverview(bundle: DataBundle): string {
  const primary = getPrimaryKpis(bundle.weeklyKpis);
  return (
    `今月の主要指標は 面談数${primary.interviews.value}件(先月比${primary.interviews.diff >= 0 ? "+" : ""}${primary.interviews.diff}件)、` +
    `内定者数${primary.offers.value}名(先月比${primary.offers.diff >= 0 ? "+" : ""}${primary.offers.diff}名)、` +
    `採用決定(求職者)${primary.candidatePlacements.value}名、新規契約金額${primary.contractAmountMan.value.toLocaleString(
      "ja-JP",
    )}万円(先月比${primary.contractAmountMan.diff >= 0 ? "+" : ""}${primary.contractAmountMan.diff}万円)です。` +
    kpiInsight(
      primary.contractAmountMan.diff,
      "契約金額は先月を上回るペースです。",
      "契約金額が先月を下回っています。法人商談の巻き返しを検討しましょう。",
    )
  );
}

const FALLBACK_ANSWER =
  "恐れ入りますが、その質問には今のデータからうまくお答えできませんでした。「今日の成約は?」「今月の面談数は?」「LINE登録率は?」「今月の契約金額は?」「遅れているプロジェクトは?」「選考中の求職者は?」のような聞き方をお試しください。";

/**
 * キーワードマッチで質問意図を判定し、metrics の実数値から日本語回答を組み立てる。
 * Claude が使えない場合のフォールバック応答。
 */
export function answerWithRules(
  question: string,
  role: AskRole,
  bundle: DataBundle,
  candidateThreads: CandidateThread[] = [],
  marketingData: MarketingData | null = null,
): string {
  const text = question.trim();
  if (!text) return FALLBACK_ANSWER;
  const members = bundle.members;
  const scope = resolveTimeScope(text);
  const marketingSummary = marketingData
    ? getMarketingSummary(marketingData, bundle.weeklyKpis, bundle.candidates, bundle.settings.referralRates)
    : null;

  const mentionedMember = findMemberBySurnameInText(text, members);

  // 0. 特定求職者名(氏名フルネーム一致)→ シート台帳のステージ等詳細 + Slackスレッドの進捗を
  //    両方見つかった場合は両方言及する(片方にしか存在しない求職者もいる)。
  const mentionedCandidate = findCandidateByNameInText(text, bundle.candidates);
  const mentionedThread = findCandidateThreadByNameInText(text, candidateThreads);
  if (mentionedCandidate || mentionedThread) {
    const parts: string[] = [];
    if (mentionedCandidate) parts.push(answerCandidateDetail(mentionedCandidate, bundle));
    if (mentionedThread) parts.push(answerCandidateThreadDetail(mentionedThread));
    return parts.join(" ");
  }

  // 1. 特定メンバー名 + KPIキーワード(例: 「清本さんの商談数は?」)
  if (mentionedMember) {
    const candidateMatch = matchCandidateKpiKey(text);
    if (candidateMatch) {
      return answerKpiValue("求職者", candidateMatch.key, candidateMatch.unit, bundle, scope, mentionedMember.name);
    }
    const corporateMatch = matchCorporateKpiKey(text);
    if (corporateMatch) {
      return answerKpiValue("法人", corporateMatch.key, corporateMatch.unit, bundle, scope, mentionedMember.name);
    }
  }

  // 1.5. 特定メンバー名 + 「結果」「実績」(例: 「今井さんの結果は?」「佐藤さんの実績は?」)
  //      → CA個別実績(担当求職者のステージ内訳・月内成約・週次KPI入力担当分)
  if (mentionedMember && (text.includes("結果") || text.includes("実績"))) {
    return answerMemberResults(mentionedMember, bundle);
  }

  // 2. 「私の/自分の」→ ロールに紐づくメンバー(CA)を優先的に解決
  if ((text.includes("私の") || text.includes("自分の")) && role === "ca") {
    const me = members.find((m) => m.id === CA_MEMBER_ID);
    if (me) return answerMemberCandidates(me, role, bundle);
  }
  if ((text.includes("私の") || text.includes("自分の")) && role === "exec") {
    const me = members.find((m) => m.id === EXEC_MEMBER_ID);
    if (me) return answerMemberCandidates(me, role, bundle);
  }

  // 3. 特定メンバー名を含む質問(「◯◯さんの担当求職者は?」など)
  if (mentionedMember && (text.includes("担当") || text.includes("求職者") || text.includes("さん"))) {
    return answerMemberCandidates(mentionedMember, role, bundle);
  }

  // 4. 自動計算率(LINE登録率・面談実行率・面談移行率)
  if (text.includes("LINE登録率")) return answerLineRegistrationRate(bundle);
  if (text.includes("面談実行率")) return answerInterviewExecutionRate(bundle);
  if (text.includes("面談移行率")) return answerInterviewConversionRate(bundle);

  // 4.5. 集客・広告データ(広告費/CPA/ブロック率)
  if (text.includes("ブロック率")) return answerBlockRateQuestion(bundle);
  if (text.includes("CPA") || text.includes("登録単価")) return answerCpa(marketingSummary);
  if (text.includes("広告費") || text.includes("広告金額")) return answerAdCost(marketingSummary);

  // 4.6. 送客パートナー(成果報酬): 経路名(KANOA/マホガニー/foresma/2peace(Tさん)等)の個別質問を優先し、
  //      経路名を含まない全体質問(「送客費用は?」「送客パートナーは?」)は4経路+合計で答える。
  const referralPartnerMatch = findReferralPartnerInText(text, marketingSummary);
  if (referralPartnerMatch) return answerReferralPartnerChannel(referralPartnerMatch);
  if (
    text.includes("送客費用") ||
    text.includes("送客パートナー") ||
    (text.includes("送客") && (text.includes("費用") || text.includes("実績") || text.includes("コスト")))
  ) {
    return answerReferralPartnersOverview(marketingSummary);
  }

  // 5. 求職者系KPIの数値質問
  const candidateKpiMatch = matchCandidateKpiKey(text);
  if (candidateKpiMatch) {
    return answerKpiValue("求職者", candidateKpiMatch.key, candidateKpiMatch.unit, bundle, scope);
  }

  // 6. 法人系KPIの数値質問
  const corporateKpiMatch = matchCorporateKpiKey(text);
  if (corporateKpiMatch) {
    return answerKpiValue("法人", corporateKpiMatch.key, corporateKpiMatch.unit, bundle, scope);
  }

  // 7. 本日の成約
  if (text.includes("今日") || text.includes("本日")) {
    return answerToday(bundle);
  }

  // 8. 売上見込み
  if (text.includes("見込み") || text.includes("フォーキャスト") || text.includes("予測")) {
    return answerForecast(bundle);
  }

  // 9. プロジェクト・遅延
  if (text.includes("プロジェクト") || text.includes("遅れ") || text.includes("遅延")) {
    return answerProjects(bundle);
  }

  // 10. 選考中・パイプライン・求職者全般
  if (text.includes("選考中") || text.includes("パイプライン") || text.includes("求職者")) {
    return answerPipeline(bundle);
  }

  // 11. 今月/月内/月次/月間、または「先月と比べて」の総合質問
  if (
    text.includes("今月") ||
    text.includes("月内") ||
    text.includes("月次") ||
    text.includes("月間") ||
    scope === "compare"
  ) {
    return answerMonthlyOverview(bundle);
  }

  // 12. メンバー名だけ言及されている(担当/さんが無い場合)
  if (mentionedMember) {
    return answerMemberCandidates(mentionedMember, role, bundle);
  }

  return FALLBACK_ANSWER;
}
