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
  getInvoiceMonthlyTotals,
  getKpiTotalsByOwner,
  getMarketingSummary,
  getMonthPlacements,
  getMonthlyKpiEntriesByOwner,
  getMonthlyKpiTotal,
  getPrimaryKpis,
  getRecentWeeklyKpiTrend,
  getReferralProfit,
  getSortedProjects,
  getStagePipeline,
  getTodayPlacements,
  getWeeklyTrendRows,
  getWithdrawnCount,
} from "@/lib/metrics";
import type {
  InvoiceCheckRow,
  MarketingSummary,
  ReferralPartnerSummary,
  RevenueMonthSummary,
} from "@/lib/metrics";
import { SALES_NAMES } from "@/lib/sales-stats";
import type { SalesMonthlyStats } from "@/lib/sales-stats";
import { CA_NAMES } from "@/lib/slack-ca-stats";
import type { CaMonthlyStats } from "@/lib/slack-ca-stats";
import { buildReferralCandidatesFromSlack } from "@/lib/slack-interviews";
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

/**
 * 送客売上(翔び台が紹介先企業から「貰う」金額)の今月・先月まとめ+送客パートナー経由の利益。
 * `#請求書`(送客パートナーへ「払う」費用)と対になるデータで、route.ts 側で
 * `getRevenueSummary` / `getReferralProfit`(いずれも今月・先月の2回分)を使って組み立て、
 * buildAskSnapshot / answerWithRules の両方にそのまま渡す(marketingSummary の先月分が
 * route.ts でしか計算されていないため、ここでは計算済みの値を受け取るだけに留める)。
 */
export interface AskRevenueContext {
  thisMonth: RevenueMonthSummary;
  lastMonth: RevenueMonthSummary;
  profitThisMonth: ReturnType<typeof getReferralProfit>;
  profitLastMonth: ReturnType<typeof getReferralProfit>;
}

export function buildAskSnapshot(
  bundle: DataBundle,
  candidateThreads: CandidateThread[] = [],
  marketingData: MarketingData | null = null,
  invoiceChecks: InvoiceCheckRow[] = [],
  revenueContext: AskRevenueContext | null = null,
  caStats: CaMonthlyStats[] = [],
  salesStats: SalesMonthlyStats[] = [],
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
    // 求職者の面談日・流入経路は Slack スレッドの記載(「面談実施」「◯◯様流入」)からも補完する
    // (送客パートナー費用の集計用。シートに無いスレッドだけの求職者も課金対象に含める)。
    marketingThisMonth: marketingData
      ? getMarketingSummary(
          marketingData,
          bundle.weeklyKpis,
          buildReferralCandidatesFromSlack(bundle.candidates, candidateThreads, bundle.settings.referralRates),
          bundle.settings.referralRates,
        )
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
    // 送客パートナー請求書(Slack「#請求書」)の自動照合結果。経路/対象月/請求額/アプリ計算/判定。
    referralInvoiceChecks: invoiceChecks.map((row) => ({
      partnerChannel: row.invoice.partnerChannel ?? null,
      vendorName: row.invoice.vendorName ?? null,
      fileName: row.invoice.fileName,
      targetMonth: row.invoice.targetMonth,
      targetMonthIsEstimated: row.invoice.targetMonthIsEstimated,
      invoiceAmountYen: row.invoice.amountYen ?? null,
      computedAmountYen: row.computedYen ?? null,
      diffYen: row.diffYen ?? null,
      status: row.status,
    })),
    // 送客売上(翔び台が紹介先企業から「貰う」金額)。referralInvoiceChecks(#請求書=払う金額)とは
    // 対になる逆方向のお金の流れ。revenueContext が渡されなかった場合(未取得・未導入)は null。
    referralRevenue: revenueContext
      ? {
          thisMonth: {
            month: revenueContext.thisMonth.month,
            totalYen: revenueContext.thisMonth.totalYen,
            byChannel: revenueContext.thisMonth.byChannel,
            companies: revenueContext.thisMonth.records.map((r) => ({
              company: r.company,
              candidateName: r.candidateName ?? null,
              inflowChannel: r.inflowChannel,
              amountYen: r.amountYen,
            })),
          },
          lastMonth: {
            month: revenueContext.lastMonth.month,
            totalYen: revenueContext.lastMonth.totalYen,
            byChannel: revenueContext.lastMonth.byChannel,
            companies: revenueContext.lastMonth.records.map((r) => ({
              company: r.company,
              candidateName: r.candidateName ?? null,
              inflowChannel: r.inflowChannel,
              amountYen: r.amountYen,
            })),
          },
          // 送客パートナー経由の利益(売上−費用)。rows は単価マスタ(referralPartners)順。
          referralPartnerProfitThisMonth: revenueContext.profitThisMonth,
          referralPartnerProfitLastMonth: revenueContext.profitLastMonth,
        }
      : null,
    // CA別の月次実績(Slack「#求職者」スレッドから自動集計。直近6ヶ月、今月が先頭)。
    // caResults(シート台帳ベースの今月実績)とは別物で、こちらは月ごとの面談・面接・内定・離脱の
    // 推移を見るためのもの。
    caMonthlyStatsFromSlack: caStats,
    // 営業実績(法人営業〈清本・望月〉の月次実績。Slack「#21_ra」「#22_アポイント報告」から自動集計。
    // 直近6ヶ月、今月が先頭)。
    salesMonthlyStatsFromSlack: salesStats,
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
referralPartners(送客パートナー、成果報酬型。KANOA/マホガニー/foresma/2peace(Tさん)/人事パートナーズ/與儀の6経路それぞれの
channel/unitCostYen(1人あたり単価)/count(今月の対象人数)/costYen(費用)。**面談実施で課金**のため、
対象人数は流入経路が一致し面談を実施した求職者〈面談以降のステージ、または辞退でも面談日あり。面談前の
辞退は対象外〉で、月の帰属は面談日基準です〈面談日はシートO列の手入力を優先し、無ければSlack「#求職者」
スレッドの「面談実施」報告から自動検出、それも無ければ登録日→更新日で近似〉)、
referralTotalYen(送客パートナー費用の今月合計)、referralPartnersLastMonth/referralLastMonthTotalYen
(同じ課金ルールでの先月の経路別サマリと先月費用合計。「先月の送客費用は?」にはこちらで答える)、
totalCost/totalLineRegs/totalReservations/totalInterviews
(広告+SNS+送客パートナー合算。totalCost にのみ送客パートナー費用を含む)、transitionRates(遷移率まとめ)が
含まれます。率・単価の値が null の場合は「分母が0のため算出できません」のように答えてください。
「送客費用は?」「送客パートナーは?」のような全体質問には経路別+合計を、「KANOAの費用/実績は?」
「マホガニーは?」のような経路名を含む質問にはその経路の単価・人数・費用を個別に答えてください。

blockRateThisMonth は Lステップ(LINE公式アカウント)のブロック率(ブロック数 ÷ LINE登録人数)です。
hasAnyData が false の場合は週次KPIに「ブロック数」がまだ入力されていないという意味なので、
「ブロック数が未入力です。週次KPIタブに『ブロック数』を追加すると回答できます」のように案内してください。

caResults は全メンバー(CA: 今井/佐藤/富田 を含む)個別の今月実績で、担当求職者数(activeCandidateCount)・
ステージ内訳(stageBreakdown)・今月の成約件数と手数料合計(monthPlacementCount/monthPlacementFeeAmountMan、
万円単位)・週次KPIの入力担当分(monthlyKpiInput)が含まれます。「◯◯さんの結果は?」「◯◯さんの実績は?」
のような質問には、該当メンバーの caResults を使って具体的に答えてください。

caMonthlyStatsFromSlack は、Slack「#求職者」チャンネルの各スレッド(1求職者1スレッド)から、CAごと×月ごとに
自動集計した実績です(caResults とは別物で、シート台帳ではなくSlackの記載を根拠にした月次の推移データです)。
対象CAは実在のCA名簿(佐藤/竹林/別府/寺本/松永。caResults のメンバータブ〈今井/佐藤/富田〉とは異なる、
経営者申告の固定リスト)です。配列の要素は月(直近6ヶ月、今月が先頭)ごとの monthKey(YYYY-MM)と
rows(CA別の行、面談0のCAは含まない)で、各行に ca(CA名。どのCAにも紐付かない場合「その他」)・
interviews(面談実施人数)・advancedToInterview(面接へ進んだ人数)・interviewEventCount(面接実施の延べ件数)・
advanceRatePercent(面接への移行率%)・offers/offerRatePercent(内定人数・率)・withdrawn/withdrawnRatePercent
(離脱人数・率、いずれも率は分母0だと null)が含まれます。担当CAはスレッドで最初に面談・面接の実施結果を
報告した投稿者(無ければ返信数最多の人)から判定しています。「佐藤さんの7月の面談実績は?」「竹林さんの
面接移行率は?」のような、CA名+月+実績系の質問には、この caMonthlyStatsFromSlack の該当月・該当CAの行を
使って具体的に答えてください。

salesMonthlyStatsFromSlack は、Slack「#21_ra」(架電数報告・業務報告)「#22_アポイント報告」から、法人営業
(清本・望月)ごと×月ごとに自動集計した実績です。配列の要素は月(直近6ヶ月、今月が先頭)ごとの
monthKey(YYYY-MM)と rows(全項目0の行は含まない)で、各行に member(清本/望月。どちらにも紐付かない
場合「その他」)・calls(架電数)・appointments(アポ獲得数、#22_アポイント報告の1投稿=1件)・
appointmentRoutes(獲得経路の内訳、route/count、件数降順)・meetings(商談数)・contracts(契約数)が
含まれます。「清本さんの架電数は?」「望月さんの◯月のアポ獲得は?」のような、清本・望月+月+実績系の
質問には、この salesMonthlyStatsFromSlack の該当月・該当行を使って具体的に答えてください。

referralInvoiceChecks は Slack「#請求書」チャンネルの請求書PDF(送客パートナー以外の支払いも含む)を
読み取った結果で、vendorName(請求元の会社名)・fileName も含まれます。「請求書の内訳は?」「◯月の支出は?」
のような質問には、支払月(targetMonth。「7月支払い」スレッドの月)ごとに合計と「会社名 金額」の内訳を答えてください。
送客パートナー請求書PDFを自動照合した結果でもあり、
経路(partnerChannel、特定できなければ null)・対象月(targetMonth、YYYY-MM形式)・請求額
(invoiceAmountYen)・アプリの計算値(computedAmountYen)・差額(diffYen)・判定(status: match=一致/
mismatch=差異あり/unreadable=金額読取不可/unknown-partner=経路不明/out-of-range=対象月が範囲外)が
含まれます。「請求書は合っている?」「請求書の差異は?」のような質問には、mismatch のものを経路名・
差額とともに具体的に答え、全件 match ならその旨を伝えてください。これは翔び台が送客パートナーへ
「払う」費用の照合です。

referralRevenue は、referralInvoiceChecks(払う金額)とは逆方向の、翔び台が紹介先企業から「貰う」
送客売上です(経営者が別途運用する売上シートの月別タブから取得。null の場合は未取得・未導入)。
thisMonth/lastMonth それぞれに、対象月(month)・合計金額(totalYen)・経路別内訳(byChannel、
channel/amountYen/count)・企業別明細(companies、company/candidateName〈求職者名、無ければnull〉/
inflowChannel/amountYen)が含まれます。referralPartnerProfitThisMonth/LastMonth には、送客パートナー
(単価マスタの経路、KANOA/マホガニー/foresma/2peace(Tさん)等)ごとの売上(revenueYen)・費用
(costYen)・利益(profitYen)の rows と、月全体の売上合計(totalRevenueYen)・送客費用合計
(totalCostYen)・利益合計(totalProfitYen=売上−費用)が含まれます(rows は単価マスタに無い経路
〈求人媒体・紹介など〉の売上は含みませんが、totalRevenueYen には含まれます)。「送客売上は?」
「入金は?」「送客の利益は?」「収支は?」のような質問には、今月・先月の売上合計+経路別内訳+
利益をまとめて答えてください。

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

/** 「送客費用」「送客パートナー」への回答: 経路別の単価・人数・費用+合計(今月・先月)。 */
function answerReferralPartnersOverview(marketingSummary: MarketingSummary | null): string {
  if (!marketingSummary) return "集客・広告データが取得できませんでした。";
  const lines = marketingSummary.referralPartners
    .map((r) => `${r.channel}(単価${formatYenPlain(r.unitCostYen)}) 面談${r.count}名・${formatYenPlain(r.costYen)}`)
    .join("、");
  const lastLines = marketingSummary.referralPartnersLastMonth
    .map((r) => `${r.channel} 面談${r.count}名・${formatYenPlain(r.costYen)}`)
    .join("、");
  return (
    `今月の送客パートナー費用は合計${formatYenPlain(marketingSummary.referralTotalYen)}です(${lines})。` +
    `先月は合計${formatYenPlain(marketingSummary.referralLastMonthTotalYen)}でした(${lastLines})。` +
    `面談実施で課金のため、対象人数は流入経路が一致し面談を実施した求職者(面談後の辞退も含む)で、月の判定は面談日(未入力時は登録日→更新日)基準です。`
  );
}

/** 「KANOAの費用/実績は?」「マホガニーは?」など、経路名を含む質問への個別回答(今月+先月)。 */
function answerReferralPartnerChannel(r: ReferralPartnerSummary, marketingSummary: MarketingSummary | null): string {
  const last = marketingSummary?.referralPartnersLastMonth.find((l) => l.channel === r.channel);
  const lastPart = last ? `先月は面談${last.count}名・${formatYenPlain(last.costYen)}でした。` : "";
  return (
    `${r.channel}の今月実績は面談${r.count}名、単価${formatYenPlain(r.unitCostYen)}、費用は${formatYenPlain(r.costYen)}です。` +
    lastPart
  );
}

/** 月キー(YYYY-MM)を「YYYY年M月」表示に変換する。 */
function formatMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 質問文にCA姓(CA_NAMES。slack-ca-stats.ts の固定リスト)が含まれるか探す。 */
function findCaNameInText(text: string): string | undefined {
  return CA_NAMES.find((name) => text.includes(name));
}

/** 質問文の「◯月」表記に対応する CaMonthlyStats を選ぶ(該当月が無ければ直近月=先頭)。 */
function resolveCaStatsMonth(text: string, caStats: CaMonthlyStats[]): CaMonthlyStats | undefined {
  const match = /(\d{1,2})月/.exec(text);
  if (match) {
    const monthNum = Number(match[1]);
    const found = caStats.find((s) => Number(s.monthKey.split("-")[1]) === monthNum);
    if (found) return found;
  }
  return caStats[0];
}

/** 率(%)を表示する。null(分母0で算出不可)は「—」。 */
function formatCaRatePercent(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

/** 質問文に法人営業名(SALES_NAMES。sales-stats.ts の固定リスト)が含まれるか探す。 */
function findSalesNameInText(text: string): string | undefined {
  return SALES_NAMES.find((name) => text.includes(name));
}

/** 質問文の「◯月」表記に対応する SalesMonthlyStats を選ぶ(該当月が無ければ直近月=先頭)。 */
function resolveSalesStatsMonth(text: string, salesStats: SalesMonthlyStats[]): SalesMonthlyStats | undefined {
  const match = /(\d{1,2})月/.exec(text);
  if (match) {
    const monthNum = Number(match[1]);
    const found = salesStats.find((s) => Number(s.monthKey.split("-")[1]) === monthNum);
    if (found) return found;
  }
  return salesStats[0];
}

/**
 * 「清本さんの◯月の実績は?」等への回答: Slack「#21_ra」「#22_アポイント報告」ベースの
 * 法人営業別月次実績(salesMonthlyStatsFromSlack)。
 */
function answerSalesMonthlyStat(name: string, text: string, salesStats: SalesMonthlyStats[]): string {
  const target = resolveSalesStatsMonth(text, salesStats);
  if (!target) {
    return `${name}さんのSlack「#21_ra」「#22_アポイント報告」ベースの月次実績データがまだありません。`;
  }
  const monthLabel = formatMonthKey(target.monthKey);
  const row = target.rows.find((r) => r.member === name);
  if (!row) {
    return `${monthLabel}は${name}さんの#21_ra・#22_アポイント報告からの記録が見つかりませんでした。`;
  }
  const routeText =
    row.appointmentRoutes.length > 0
      ? `(内訳: ${row.appointmentRoutes.map((r) => `${r.route}${r.count}件`).join("、")})`
      : "";
  return (
    `${monthLabel}の${name}さんの実績です(Slack「#21_ra」「#22_アポイント報告」ベース)。` +
    `架電${row.calls}件、アポ獲得${row.appointments}件${routeText}、商談${row.meetings}件、契約${row.contracts}件です。`
  );
}

/**
 * 「◯◯さんの◯月の面談実績は?」等への回答: Slack「#求職者」ベースのCA別月次実績
 * (caMonthlyStatsFromSlack。シート台帳ベースの caResults / answerMemberResults とは別物)。
 */
function answerCaMonthlyStat(caName: string, text: string, caStats: CaMonthlyStats[]): string {
  const target = resolveCaStatsMonth(text, caStats);
  if (!target) {
    return `${caName}さんのSlack「#求職者」ベースの月次実績データがまだありません。`;
  }
  const monthLabel = formatMonthKey(target.monthKey);
  const row = target.rows.find((r) => r.ca === caName);
  if (!row) {
    return `${monthLabel}は${caName}さんが担当した面談実施の記録がSlack「#求職者」から見つかりませんでした。`;
  }
  return (
    `${monthLabel}の${caName}さんの実績です(Slack「#求職者」ベース)。面談${row.interviews}件のうち面接へ進んだのは` +
    `${row.advancedToInterview}名(面接移行率${formatCaRatePercent(row.advanceRatePercent)}、面接実施${row.interviewEventCount}件)。` +
    `内定${row.offers}名(${formatCaRatePercent(row.offerRatePercent)})、離脱${row.withdrawn}名(${formatCaRatePercent(row.withdrawnRatePercent)})です。`
  );
}

/**
 * 「請求書の内訳は?」への回答: 月ごとの支出合計と、1件ずつの内訳(請求月・会社・金額)。
 * トップ画面は月次合計だけのシンプル表示のため、明細はこの回答で提供する。
 */
function answerInvoiceBreakdown(invoiceChecks: InvoiceCheckRow[]): string {
  if (invoiceChecks.length === 0) {
    return "Slack「#請求書」から読み取れた請求書がまだありません。";
  }
  const invoices = invoiceChecks.map((r) => r.invoice);
  const months = getInvoiceMonthlyTotals(invoices);
  const lines = months.map((m) => {
    const detail = invoices
      .filter((inv) => inv.targetMonth === m.month && inv.amountYen !== undefined)
      .sort((a, b) => (b.amountYen ?? 0) - (a.amountYen ?? 0))
      .map((inv) => `${inv.vendorName ?? inv.partnerChannel ?? inv.fileName} ${formatYenPlain(inv.amountYen ?? 0)}`)
      .join("、");
    const unreadableNote = m.unreadableCount > 0 ? `。ほか金額読取不可${m.unreadableCount}件` : "";
    return `【${formatMonthKey(m.month)}支払い分】合計${formatYenPlain(m.totalYen)}(${m.count}件): ${detail}${unreadableNote}`;
  });
  return `Slack「#請求書」の月別支出まとめです。\n${lines.join("\n")}`;
}

/** 「請求書」を含む質問への回答: 送客パートナー請求書の自動照合結果のまとめ。 */
function answerInvoiceChecks(invoiceChecks: InvoiceCheckRow[]): string {
  if (invoiceChecks.length === 0) {
    return "Slack「#請求書」から読み取れた請求書がまだありません。";
  }
  const mismatches = invoiceChecks.filter((r) => r.status === "mismatch");
  const unreadable = invoiceChecks.filter((r) => r.status === "unreadable");
  const unknown = invoiceChecks.filter((r) => r.status === "unknown-partner");
  if (mismatches.length === 0 && unreadable.length === 0 && unknown.length === 0) {
    return `直近の送客パートナー請求書${invoiceChecks.length}件は、すべてアプリの計算値と一致しています。`;
  }
  const parts: string[] = [];
  if (mismatches.length > 0) {
    const detail = mismatches
      .map((r) => {
        const diff = r.diffYen ?? 0;
        const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
        return `${r.invoice.partnerChannel}(${sign}${formatYenPlain(Math.abs(diff))})`;
      })
      .join("、");
    parts.push(`差異あり: ${detail}`);
  }
  if (unreadable.length > 0) parts.push(`金額読取不可: ${unreadable.length}件`);
  if (unknown.length > 0) parts.push(`経路不明: ${unknown.length}件`);
  return `送客パートナー請求書のチェック結果です。${parts.join("。")}。内容をご確認のうえ、必要であれば先方にお問い合わせください。`;
}

/** 経路別内訳(RevenueMonthSummary.byChannel)を「経路 金額(件数件)」の一覧文字列にする。 */
function formatRevenueChannelList(byChannel: RevenueMonthSummary["byChannel"]): string {
  if (byChannel.length === 0) return "内訳なし";
  return byChannel.map((c) => `${c.channel} ${formatYenPlain(c.amountYen)}(${c.count}件)`).join("、");
}

/**
 * 「送客売上」「入金」「貰う/もらう」「利益」「収支」を含む質問への回答: 今月・先月の送客売上合計・
 * 経路別内訳・送客パートナー経由の利益(売上−送客費用)。#請求書(払う金額)とは逆方向のお金の流れ。
 */
function answerReferralRevenue(ctx: AskRevenueContext | null): string {
  if (!ctx) {
    return "送客売上データが取得できませんでした(REVENUE_SHEET_ID が未設定の可能性があります)。";
  }
  const { thisMonth, lastMonth, profitThisMonth } = ctx;
  const profitLabel =
    profitThisMonth.totalProfitYen >= 0
      ? `黒字${formatYenPlain(profitThisMonth.totalProfitYen)}`
      : `赤字${formatYenPlain(Math.abs(profitThisMonth.totalProfitYen))}`;
  return (
    `今月の送客売上(翔び台が貰う金額)は合計${formatYenPlain(thisMonth.totalYen)}です` +
    `(${formatRevenueChannelList(thisMonth.byChannel)})。先月は合計${formatYenPlain(lastMonth.totalYen)}でした。` +
    `送客パートナー経由の収支は、売上${formatYenPlain(profitThisMonth.totalRevenueYen)} − ` +
    `送客費用${formatYenPlain(profitThisMonth.totalCostYen)} = ${profitLabel}です。`
  );
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
  invoiceChecks: InvoiceCheckRow[] = [],
  revenueContext: AskRevenueContext | null = null,
  caStats: CaMonthlyStats[] = [],
  salesStats: SalesMonthlyStats[] = [],
): string {
  const text = question.trim();
  if (!text) return FALLBACK_ANSWER;
  const members = bundle.members;
  const scope = resolveTimeScope(text);
  // 面談日・流入経路は Slack スレッドの記載(「面談実施」「◯◯様流入」)からも補完する
  // (シートの手入力があれば優先。シートに無いスレッドだけの求職者も課金対象に含める)。
  const marketingSummary = marketingData
    ? getMarketingSummary(
        marketingData,
        bundle.weeklyKpis,
        buildReferralCandidatesFromSlack(bundle.candidates, candidateThreads, bundle.settings.referralRates),
        bundle.settings.referralRates,
      )
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

  // 0.4. 法人営業別月次実績(Slack「#21_ra」「#22_アポイント報告」ベース)。清本・望月+「架電/アポ/
  //      商談/契約/実績」を含む質問は、CA別実績の判定(0.5)より前に判定する(清本・望月は
  //      CA_NAMESに含まれないため実質衝突しないが、順序を明確にしておく)。
  const mentionedSalesName = findSalesNameInText(text);
  if (
    mentionedSalesName &&
    (text.includes("架電") ||
      text.includes("アポ") ||
      text.includes("商談") ||
      text.includes("契約") ||
      text.includes("実績"))
  ) {
    return answerSalesMonthlyStat(mentionedSalesName, text, salesStats);
  }

  // 0.5. CA別月次実績(Slack「#求職者」ベース)。CA姓(CA_NAMES固定リスト)+「面談/面接/実績/移行/
  //      離脱/内定」を含む質問は、既存の「◯◯さんの結果は?」(シート台帳ベース、
  //      findMemberBySurnameInText 使用箇所)より先に判定する(経営者の運用ルール:
  //      面談結果・面接結果を投稿している人が担当)。
  const mentionedCaName = findCaNameInText(text);
  if (
    mentionedCaName &&
    (text.includes("面談") ||
      text.includes("面接") ||
      text.includes("実績") ||
      text.includes("移行") ||
      text.includes("離脱") ||
      text.includes("内定"))
  ) {
    return answerCaMonthlyStat(mentionedCaName, text, caStats);
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

  // 4.55. 請求書(Slack「#請求書」)。「内訳」「いくら」「支出/支払」を含む質問は月別内訳、
  //       それ以外(「合ってる?」等)は送客パートナー請求書の照合結果を返す。
  if (text.includes("請求書")) {
    if (text.includes("内訳") || text.includes("いくら") || text.includes("支出") || text.includes("支払")) {
      return answerInvoiceBreakdown(invoiceChecks);
    }
    return answerInvoiceChecks(invoiceChecks);
  }

  // 4.56. 送客売上(翔び台が貰う金額)。「8. 売上見込み」など既存の「売上」判定より先に判定する
  //       (「送客売上」「入金」「貰う/もらう」「利益」「収支」を含む質問はこちらを優先)。
  if (
    text.includes("送客売上") ||
    text.includes("入金") ||
    text.includes("貰う") ||
    text.includes("もらう") ||
    text.includes("利益") ||
    text.includes("収支")
  ) {
    return answerReferralRevenue(revenueContext);
  }

  // 4.6. 送客パートナー(成果報酬): 経路名(KANOA/マホガニー/foresma/2peace(Tさん)等)の個別質問を優先し、
  //      経路名を含まない全体質問(「送客費用は?」「送客パートナーは?」)は経路別+合計で答える。
  const referralPartnerMatch = findReferralPartnerInText(text, marketingSummary);
  if (referralPartnerMatch) return answerReferralPartnerChannel(referralPartnerMatch, marketingSummary);
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
