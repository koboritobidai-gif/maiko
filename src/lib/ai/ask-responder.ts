/**
 * 「AIに聞く」のデータスナップショット構築 + ルールベース応答(デモレスポンダ)。
 * `ANTHROPIC_API_KEY` が無い/呼び出し失敗時に api/ask/route.ts からフォールバックとして呼ばれる。
 * KPIの実数値は必ず src/lib/metrics.ts 経由で取得し、DataBundle(loadDataBundle の結果)を
 * 引数として受け取る(demo-data.ts / adapters を直接 import しないこと)。
 */
import { CA_MEMBER_ID, EXEC_MEMBER_ID } from "@/lib/demo-data";
import {
  getBranchById,
  getBranchPerformance,
  getCandidatesByBranch,
  getCandidatesByCa,
  getForecastRevenue,
  getMonthPlacements,
  getMonthlyAchievement,
  getPlacementsByBranch,
  getSortedProjects,
  getStagePipeline,
  getTodayPlacements,
  getWithdrawnCount,
} from "@/lib/metrics";
import type { DataBundle, Member } from "@/lib/types";

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

export function buildAskSnapshot(bundle: DataBundle) {
  const branchPerformance = getBranchPerformance(bundle.branches, bundle.placements);
  const pipeline = getStagePipeline(bundle.candidates);
  const projectList = getSortedProjects(bundle.projects);

  return {
    generatedAt: new Date().toISOString(),
    today: getTodayPlacements(bundle.placements),
    month: getMonthPlacements(bundle.placements),
    achievement: getMonthlyAchievement(bundle.branches, bundle.placements),
    forecastRevenueYen: getForecastRevenue(bundle.candidates, bundle.settings.feeRate),
    branches: branchPerformance.map((bp) => ({
      name: bp.branch.name,
      targetAmountYen: bp.targetAmount,
      actualAmountYen: bp.actualAmount,
      ratePercent: bp.rate,
    })),
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
      branchName: getBranchById(bundle.branches, m.branchId)?.name ?? m.branchId,
      specialty: m.specialty,
    })),
    candidates: bundle.candidates.map((c) => ({
      name: c.name,
      caName: bundle.members.find((m) => m.id === c.caId)?.name ?? c.caId,
      branchName: getBranchById(bundle.branches, c.branchId)?.name ?? c.branchId,
      stage: c.stage,
      desiredRole: c.desiredRole,
      updatedAt: c.updatedAt.toISOString(),
      latestNote: c.latestNote,
    })),
  };
}

export type AskSnapshot = ReturnType<typeof buildAskSnapshot>;

/** Claude 用システムプロンプト。 */
export const ASK_SYSTEM_PROMPT = `あなたは株式会社翔び台(人材紹介会社)の経営アシスタントです。
ユーザーの質問に対して、渡されたデータスナップショット(JSON)に基づき、正確な数値と簡潔な一言インサイトで日本語で回答してください。

ルール:
- 数値はスナップショットに存在する値のみを使うこと。スナップショットに無い情報は推測せず、「データ上は確認できません」のように正直に答える。
- 回答は3〜5文程度、簡潔に。冒頭で結論(数値)を述べ、最後に一言インサイト(示唆・次のアクション)を添える。
- 金額は万円単位で分かりやすく表示する(例: 1,234万円)。
- 箇条書きが分かりやすい場合(拠点別・ステージ別など)は箇条書きを使ってよい。
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

const BRANCH_KEYWORDS: { keyword: string; branchId: string }[] = [
  { keyword: "東京", branchId: "tokyo" },
  { keyword: "本社", branchId: "tokyo" },
  { keyword: "横浜", branchId: "yokohama" },
  { keyword: "大阪", branchId: "osaka" },
  { keyword: "名古屋", branchId: "nagoya" },
  { keyword: "福岡", branchId: "fukuoka" },
];

function achievementInsight(rate: number): string {
  if (rate >= 90) return "目標達成が目前です。この勢いを維持しましょう。";
  if (rate >= 60) return "着実に積み上がっていますが、後半の追い上げが鍵になりそうです。";
  return "目標との差が大きいため、企業提案〜面接段階の求職者を優先してフォローすることをおすすめします。";
}

function answerMemberCandidates(member: Member, role: AskRole, bundle: DataBundle): string {
  const myCandidates = getCandidatesByCa(bundle.candidates, member.id);
  const active = myCandidates.filter((c) => c.stage !== "辞退");
  if (active.length === 0) {
    return `${member.name}さんが現在担当している求職者は見つかりませんでした。`;
  }
  const listed = active.slice(0, 6).map((c) => `${c.name}(${c.stage})`);
  const suffix = active.length > 6 ? ` ほか${active.length - 6}名` : "";
  const branch = getBranchById(bundle.branches, member.branchId);
  const you = role === "ca" && member.id === CA_MEMBER_ID ? "あなたが" : `${member.name}さんが`;
  return `${you}担当している求職者は${active.length}名です(${branch?.name ?? ""}拠点)。内訳: ${listed.join("、")}${suffix}。内定・承諾に近い方から優先フォローすると成約につながりやすいです。`;
}

function answerBranch(branchId: string, bundle: DataBundle): string {
  const branch = getBranchById(bundle.branches, branchId);
  if (!branch) return "拠点情報が見つかりませんでした。";
  const performance = getBranchPerformance(bundle.branches, bundle.placements).find(
    (bp) => bp.branch.id === branchId,
  );
  const monthPlacements = getPlacementsByBranch(bundle.placements, branchId);
  const activeCandidates = getCandidatesByBranch(bundle.candidates, branchId).filter(
    (c) => c.stage !== "辞退",
  );
  if (!performance) return `${branch.name}拠点の実績データが見つかりませんでした。`;
  return (
    `${branch.name}拠点は月内実績${formatMan(performance.actualAmount)}(目標${formatMan(performance.targetAmount)})、` +
    `達成率${performance.rate.toFixed(1)}%、成約${monthPlacements.length}件です。対応中の求職者は${activeCandidates.length}名います。` +
    achievementInsight(performance.rate)
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
  const { targetAmount, actualAmount } = getMonthlyAchievement(bundle.branches, bundle.placements);
  const gap = targetAmount - actualAmount;
  const covered = forecast >= gap && gap > 0;
  return (
    `内定・承諾ベースの売上見込みは${formatMan(forecast)}です。` +
    (gap > 0
      ? covered
        ? `目標までの残り${formatMan(gap)}を、見込みでほぼカバーできる水準です。`
        : `目標までの残り${formatMan(gap)}に対しては、まだ${formatMan(gap - forecast)}分の上積みが必要です。`
      : `月次目標は既に達成済みです。見込み分はさらなる上乗せになります。`)
  );
}

function answerMonth(bundle: DataBundle): string {
  const { count, amount } = getMonthPlacements(bundle.placements);
  const { rate, targetAmount } = getMonthlyAchievement(bundle.branches, bundle.placements);
  return (
    `月内累計成約は${count}件、${formatMan(amount)}です(目標${formatMan(targetAmount)}に対し達成率${rate.toFixed(1)}%)。` +
    achievementInsight(rate)
  );
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
    .filter((s) => ["企業提案", "書類選考", "面接"].includes(s.stage))
    .reduce((sum, s) => sum + s.count, 0);
  const listed = pipeline.map((s) => `${s.stage}${s.count}名`).join("、");
  const bottleneck = [...pipeline].sort((a, b) => b.count - a.count)[0];
  return (
    `選考が進んでいる求職者(企業提案〜面接)は合計${inSelection}名です。ステージ別内訳: ${listed}。` +
    `最も人数が多いのは「${bottleneck.stage}」(${bottleneck.count}名)で、ここが全体のボトルネックになりやすいので優先的にケアするとよさそうです。`
  );
}

const FALLBACK_ANSWER =
  "恐れ入りますが、その質問には今のデータからうまくお答えできませんでした。「今日の成約は?」「月内の売上見込みは?」「遅れているプロジェクトは?」「大阪拠点の状況は?」「選考中の求職者は?」「高梨さんの担当求職者は?」のような聞き方をお試しください。";

/**
 * キーワードマッチで質問意図を判定し、metrics の実数値から日本語回答を組み立てる。
 * Claude が使えない場合のフォールバック応答。
 */
export function answerWithRules(question: string, role: AskRole, bundle: DataBundle): string {
  const text = question.trim();
  if (!text) return FALLBACK_ANSWER;
  const members = bundle.members;

  // 1. 「私の/自分の」→ ロールに紐づくメンバー(CA)を優先的に解決
  if ((text.includes("私の") || text.includes("自分の")) && role === "ca") {
    const me = members.find((m) => m.id === CA_MEMBER_ID);
    if (me) return answerMemberCandidates(me, role, bundle);
  }
  if ((text.includes("私の") || text.includes("自分の")) && role === "exec") {
    const me = members.find((m) => m.id === EXEC_MEMBER_ID);
    if (me) return answerMemberCandidates(me, role, bundle);
  }

  // 2. 特定メンバー名を含む質問(「◯◯さんの担当求職者は?」など)
  const mentionedMember = findMemberBySurnameInText(text, members);
  if (mentionedMember && (text.includes("担当") || text.includes("求職者") || text.includes("さん"))) {
    return answerMemberCandidates(mentionedMember, role, bundle);
  }

  // 3. 拠点名を含む質問
  const branchMatch = BRANCH_KEYWORDS.find((b) => text.includes(b.keyword));
  if (branchMatch) {
    return answerBranch(branchMatch.branchId, bundle);
  }

  // 4. 本日の成約
  if (text.includes("今日") || text.includes("本日")) {
    return answerToday(bundle);
  }

  // 5. 売上見込み
  if (text.includes("見込み") || text.includes("フォーキャスト") || text.includes("予測")) {
    return answerForecast(bundle);
  }

  // 6. 月内/今月の数字・達成率
  if (
    text.includes("今月") ||
    text.includes("月内") ||
    text.includes("月次") ||
    text.includes("月間") ||
    text.includes("達成率")
  ) {
    return answerMonth(bundle);
  }

  // 7. プロジェクト・遅延
  if (text.includes("プロジェクト") || text.includes("遅れ") || text.includes("遅延")) {
    return answerProjects(bundle);
  }

  // 8. 選考中・パイプライン・求職者全般
  if (text.includes("選考中") || text.includes("パイプライン") || text.includes("求職者")) {
    return answerPipeline(bundle);
  }

  // 9. メンバー名だけ言及されている(担当/さんが無い場合)
  if (mentionedMember) {
    return answerMemberCandidates(mentionedMember, role, bundle);
  }

  return FALLBACK_ANSWER;
}
