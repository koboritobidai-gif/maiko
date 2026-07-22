/**
 * Tobidai Cockpit - デモデータ
 * 実行日(new Date())を基準に相対生成する。「本日」「月内」に常にデータが存在するよう、
 * 月をまたがないよう日付をクランプしている。
 * 実データ連携時は src/lib/adapters/* を Demo実装から実連携実装に差し替えるだけで良い。
 */
import type {
  Branch,
  Candidate,
  Member,
  Placement,
  Project,
  SlackPost,
  Stage,
} from "./types";

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const today = now.getDate();

/** 「今日から n 日前」だが、当月の1日を超えて遡らないようクランプする(常に月内データにするため)。 */
function daysAgoInMonth(n: number, hour = 10, minute = 0): Date {
  const day = Math.max(1, today - n);
  return new Date(year, month, day, hour, minute);
}

/** 本日の日付(時刻指定)。 */
function todayAt(hour: number, minute: number): Date {
  return new Date(year, month, today, hour, minute);
}

/** 今日から n 日後(プロジェクト期日用。月をまたいでよい)。 */
function daysFromNow(n: number, hour = 18, minute = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** 今日から n 日前(月をまたいでよい。更新日時など「最近」を表すのに使う)。 */
function daysAgo(n: number, hour = 9, minute = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(now.getTime() - n * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────
// 拠点
// ─────────────────────────────────────────────
export const branches: Branch[] = [
  { id: "tokyo", name: "東京本社", monthlyTargetAmount: 20_000_000 },
  { id: "yokohama", name: "横浜", monthlyTargetAmount: 8_000_000 },
  { id: "osaka", name: "大阪", monthlyTargetAmount: 10_000_000 },
  { id: "nagoya", name: "名古屋", monthlyTargetAmount: 6_000_000 },
  { id: "fukuoka", name: "福岡", monthlyTargetAmount: 6_000_000 },
];

/** 全社月次目標(拠点目標の合計)。 */
export const COMPANY_MONTHLY_TARGET = branches.reduce(
  (sum, b) => sum + b.monthlyTargetAmount,
  0,
);

// ─────────────────────────────────────────────
// メンバー(CA/RA/管理 12名)
// ─────────────────────────────────────────────
export const members: Member[] = [
  { id: "m1", name: "小堀 大輔", role: "管理", branchId: "tokyo", specialty: "経営企画・全社統括" },
  { id: "m2", name: "高梨 玲奈", role: "CA", branchId: "tokyo", specialty: "IT・Web系エンジニア" },
  { id: "m3", name: "佐々木 亮", role: "CA", branchId: "tokyo", specialty: "管理部門・経理財務" },
  { id: "m4", name: "中村 美咲", role: "RA", branchId: "tokyo", specialty: "IT・Web系法人営業" },
  { id: "m5", name: "藤田 健太", role: "CA", branchId: "yokohama", specialty: "製造業・生産技術" },
  { id: "m6", name: "小林 彩香", role: "RA", branchId: "yokohama", specialty: "製造業法人営業" },
  { id: "m7", name: "松本 直樹", role: "CA", branchId: "osaka", specialty: "小売・販売・店舗運営" },
  { id: "m8", name: "井上 陽子", role: "RA", branchId: "osaka", specialty: "小売・サービス法人営業" },
  { id: "m9", name: "木村 拓也", role: "CA", branchId: "nagoya", specialty: "自動車・製造エンジニア" },
  { id: "m10", name: "山口 真由", role: "RA", branchId: "nagoya", specialty: "自動車業界法人営業" },
  { id: "m11", name: "渡辺 翔太", role: "CA", branchId: "fukuoka", specialty: "医療・介護・福祉" },
  { id: "m12", name: "清水 智子", role: "管理", branchId: "fukuoka", specialty: "バックオフィス・労務" },
];

// ログイン用デモ人格(設計書 4.0)
export const EXEC_MEMBER_ID = "m1"; // 小堀社長
export const CA_MEMBER_ID = "m2"; // 高梨CA

// ─────────────────────────────────────────────
// 求職者 30名(全ステージへ分布)
// ─────────────────────────────────────────────
interface CandidateSeed {
  name: string;
  branchId: string;
  caId: string;
  stage: Stage;
  desiredRole: string;
  incomeYen: number;
  note: string;
  updatedHoursAgo: number;
}

const candidateSeeds: CandidateSeed[] = [
  // 東京本社(高梨/佐々木)10名
  { name: "田中 悠斗", branchId: "tokyo", caId: "m2", stage: "新規登録", desiredRole: "Webエンジニア", incomeYen: 5_200_000, note: "自社開発企業を中心に希望。ポートフォリオ確認中。", updatedHoursAgo: 4 },
  { name: "鈴木 美穂", branchId: "tokyo", caId: "m3", stage: "面談", desiredRole: "人事(採用担当)", incomeYen: 4_800_000, note: "来週初回面談を実施予定。", updatedHoursAgo: 9 },
  { name: "加藤 拓海", branchId: "tokyo", caId: "m2", stage: "企業提案", desiredRole: "プロダクトマネージャー", incomeYen: 7_500_000, note: "IT企業2社へ提案準備中。", updatedHoursAgo: 15 },
  { name: "伊藤 さくら", branchId: "tokyo", caId: "m3", stage: "書類選考", desiredRole: "経理(会計事務所)", incomeYen: 5_000_000, note: "会計事務所2社に書類提出済み。結果待ち。", updatedHoursAgo: 20 },
  { name: "渡部 蓮", branchId: "tokyo", caId: "m2", stage: "面接", desiredRole: "法人営業(SaaS)", incomeYen: 6_000_000, note: "来週最終面接。給与交渉のポイントを整理中。", updatedHoursAgo: 26 },
  { name: "山田 花子", branchId: "tokyo", caId: "m3", stage: "内定", desiredRole: "マーケティング担当", incomeYen: 6_500_000, note: "内定連絡受領。返答期限は今週末。", updatedHoursAgo: 5 },
  { name: "高橋 大輝", branchId: "tokyo", caId: "m2", stage: "承諾", desiredRole: "バックエンドエンジニア", incomeYen: 7_000_000, note: "内定承諾済み。入社日を調整中。", updatedHoursAgo: 12 },
  { name: "中島 陽菜", branchId: "tokyo", caId: "m3", stage: "入社", desiredRole: "カスタマーサクセス", incomeYen: 5_500_000, note: "入社1週目。オンボーディング順調との報告あり。", updatedHoursAgo: 30 },
  { name: "岡田 健一", branchId: "tokyo", caId: "m2", stage: "辞退", desiredRole: "経営企画", incomeYen: 8_000_000, note: "選考中に他社内定を承諾されクローズ。", updatedHoursAgo: 40 },
  { name: "石井 美月", branchId: "tokyo", caId: "m3", stage: "新規登録", desiredRole: "広報", incomeYen: 4_500_000, note: "登録直後。ヒアリングシート送付済み。", updatedHoursAgo: 2 },
  // 横浜(藤田)5名
  { name: "小川 直人", branchId: "yokohama", caId: "m5", stage: "面談", desiredRole: "生産管理", incomeYen: 5_800_000, note: "来週面談予定。製造業界での実務年数を確認。", updatedHoursAgo: 11 },
  { name: "森田 千尋", branchId: "yokohama", caId: "m5", stage: "企業提案", desiredRole: "品質管理", incomeYen: 5_200_000, note: "食品メーカー2社へ提案準備中。", updatedHoursAgo: 18 },
  { name: "佐野 涼", branchId: "yokohama", caId: "m5", stage: "書類選考", desiredRole: "機械設計エンジニア", incomeYen: 6_200_000, note: "書類選考中。図面ポートフォリオ提出済み。", updatedHoursAgo: 22 },
  { name: "村上 由紀", branchId: "yokohama", caId: "m5", stage: "面接", desiredRole: "生産技術", incomeYen: 5_700_000, note: "来週最終面接。逆質問リストを準備中。", updatedHoursAgo: 8 },
  { name: "三浦 大和", branchId: "yokohama", caId: "m5", stage: "内定", desiredRole: "工場長候補", incomeYen: 8_200_000, note: "内定獲得。年収交渉が最終段階。", updatedHoursAgo: 6 },
  // 大阪(松本)6名
  { name: "西村 遥", branchId: "osaka", caId: "m7", stage: "新規登録", desiredRole: "店舗マネージャー", incomeYen: 4_600_000, note: "登録完了。希望条件のヒアリング予定。", updatedHoursAgo: 3 },
  { name: "前田 翔", branchId: "osaka", caId: "m7", stage: "面談", desiredRole: "EC運営担当", incomeYen: 5_000_000, note: "来週面談。転職理由をヒアリング予定。", updatedHoursAgo: 14 },
  { name: "藤原 麻衣", branchId: "osaka", caId: "m7", stage: "企業提案", desiredRole: "バイヤー", incomeYen: 5_300_000, note: "小売2社へ提案中、反応良好。", updatedHoursAgo: 19 },
  { name: "大野 悠", branchId: "osaka", caId: "m7", stage: "書類選考", desiredRole: "店舗開発", incomeYen: 6_000_000, note: "書類選考中。実績資料を追加提出。", updatedHoursAgo: 24 },
  { name: "岩崎 健太郎", branchId: "osaka", caId: "m7", stage: "面接", desiredRole: "エリアマネージャー", incomeYen: 6_800_000, note: "来週最終面接。対策を実施中。", updatedHoursAgo: 10 },
  { name: "木下 彩", branchId: "osaka", caId: "m7", stage: "承諾", desiredRole: "販売促進", incomeYen: 5_400_000, note: "内定承諾済み。前職の引き継ぎ調整中。", updatedHoursAgo: 16 },
  // 名古屋(木村)5名
  { name: "松井 優斗", branchId: "nagoya", caId: "m9", stage: "新規登録", desiredRole: "自動車設計エンジニア", incomeYen: 6_300_000, note: "登録完了。経歴を確認中。", updatedHoursAgo: 5 },
  { name: "橋本 恵", branchId: "nagoya", caId: "m9", stage: "面談", desiredRole: "品質保証", incomeYen: 5_600_000, note: "来週面談予定。", updatedHoursAgo: 13 },
  { name: "竹内 亮太", branchId: "nagoya", caId: "m9", stage: "企業提案", desiredRole: "生産技術", incomeYen: 6_100_000, note: "自動車部品メーカーへ提案準備中。", updatedHoursAgo: 21 },
  { name: "平野 沙織", branchId: "nagoya", caId: "m9", stage: "書類選考", desiredRole: "購買", incomeYen: 5_200_000, note: "書類選考結果待ち。", updatedHoursAgo: 27 },
  { name: "川口 直樹", branchId: "nagoya", caId: "m9", stage: "面接", desiredRole: "工程管理", incomeYen: 6_700_000, note: "来週最終面接。", updatedHoursAgo: 17 },
  // 福岡(渡辺)4名
  { name: "長谷川 舞", branchId: "fukuoka", caId: "m11", stage: "新規登録", desiredRole: "看護師(訪問看護)", incomeYen: 4_900_000, note: "登録完了。希望条件をヒアリング予定。", updatedHoursAgo: 6 },
  { name: "福田 拓也", branchId: "fukuoka", caId: "m11", stage: "面談", desiredRole: "介護施設 施設長候補", incomeYen: 5_500_000, note: "来週面談予定。", updatedHoursAgo: 12 },
  { name: "原田 由美", branchId: "fukuoka", caId: "m11", stage: "企業提案", desiredRole: "理学療法士", incomeYen: 5_000_000, note: "医療法人へ提案準備中。", updatedHoursAgo: 20 },
  { name: "秋山 健", branchId: "fukuoka", caId: "m11", stage: "書類選考", desiredRole: "薬剤師", incomeYen: 6_500_000, note: "調剤薬局チェーンへ書類提出済み。", updatedHoursAgo: 28 },
];

export const candidates: Candidate[] = candidateSeeds.map((seed, i) => ({
  id: `c${i + 1}`,
  name: seed.name,
  caId: seed.caId,
  branchId: seed.branchId,
  stage: seed.stage,
  desiredRole: seed.desiredRole,
  expectedAnnualIncome: seed.incomeYen,
  updatedAt: hoursAgo(seed.updatedHoursAgo),
  latestNote: seed.note,
}));

// ─────────────────────────────────────────────
// 成約(今月18件・本日2件・合計 約38百万円)
// ─────────────────────────────────────────────
interface PlacementSeed {
  candidateName: string;
  companyName: string;
  feeAmount: number;
  branchId: string;
  caId: string;
  daysAgoInMonth: number | "today";
  hour: number;
}

const placementSeeds: PlacementSeed[] = [
  // 東京本社 7件(本日1件) 合計1500万円
  { candidateName: "田村 健一郎", companyName: "株式会社ネクストシステムズ", feeAmount: 2_800_000, branchId: "tokyo", caId: "m2", daysAgoInMonth: "today", hour: 11 },
  { candidateName: "石田 大輔", companyName: "合同会社ブライトワークス", feeAmount: 2_100_000, branchId: "tokyo", caId: "m3", daysAgoInMonth: 3, hour: 15 },
  { candidateName: "遠藤 智也", companyName: "株式会社フィンテックラボ", feeAmount: 2_450_000, branchId: "tokyo", caId: "m2", daysAgoInMonth: 5, hour: 10 },
  { candidateName: "小池 美紀", companyName: "株式会社グロースパートナーズ", feeAmount: 1_750_000, branchId: "tokyo", caId: "m3", daysAgoInMonth: 8, hour: 14 },
  { candidateName: "荒木 悠", companyName: "株式会社メディカルリンク東京", feeAmount: 2_100_000, branchId: "tokyo", caId: "m2", daysAgoInMonth: 11, hour: 16 },
  { candidateName: "桜井 直子", companyName: "株式会社ロジテック東京", feeAmount: 1_900_000, branchId: "tokyo", caId: "m3", daysAgoInMonth: 14, hour: 13 },
  { candidateName: "今井 優", companyName: "株式会社アドバンスコンサルティング", feeAmount: 1_900_000, branchId: "tokyo", caId: "m2", daysAgoInMonth: 17, hour: 17 },
  // 横浜 3件 合計624万円
  { candidateName: "中野 拓", companyName: "株式会社横浜マニュファクチャリング", feeAmount: 2_240_000, branchId: "yokohama", caId: "m5", daysAgoInMonth: 6, hour: 10 },
  { candidateName: "関口 沙也加", companyName: "株式会社ベイエリアフーズ", feeAmount: 2_000_000, branchId: "yokohama", caId: "m5", daysAgoInMonth: 9, hour: 11 },
  { candidateName: "杉本 和也", companyName: "株式会社湘南モーターズ", feeAmount: 2_000_000, branchId: "yokohama", caId: "m5", daysAgoInMonth: 13, hour: 15 },
  // 大阪 4件(本日1件) 合計720万円
  { candidateName: "今村 綾", companyName: "株式会社関西リテールパートナーズ", feeAmount: 1_800_000, branchId: "osaka", caId: "m7", daysAgoInMonth: "today", hour: 14 },
  { candidateName: "森下 拓海", companyName: "株式会社なにわフーズ", feeAmount: 1_800_000, branchId: "osaka", caId: "m7", daysAgoInMonth: 4, hour: 10 },
  { candidateName: "北村 恵美", companyName: "株式会社大阪コスメティクス", feeAmount: 1_900_000, branchId: "osaka", caId: "m7", daysAgoInMonth: 9, hour: 13 },
  { candidateName: "堀内 優", companyName: "株式会社関西エンタープライズ", feeAmount: 1_700_000, branchId: "osaka", caId: "m7", daysAgoInMonth: 15, hour: 16 },
  // 名古屋 2件 合計480万円
  { candidateName: "河合 優斗", companyName: "株式会社中部オートパーツ", feeAmount: 2_450_000, branchId: "nagoya", caId: "m9", daysAgoInMonth: 7, hour: 11 },
  { candidateName: "安藤 麻里", companyName: "株式会社名古屋プレシジョン", feeAmount: 2_350_000, branchId: "nagoya", caId: "m9", daysAgoInMonth: 12, hour: 14 },
  // 福岡 2件 合計462万円
  { candidateName: "江口 拓", companyName: "医療法人 博多ヘルスケア", feeAmount: 2_310_000, branchId: "fukuoka", caId: "m11", daysAgoInMonth: 6, hour: 10 },
  { candidateName: "宮本 沙織", companyName: "社会福祉法人 九州ケアネット", feeAmount: 2_310_000, branchId: "fukuoka", caId: "m11", daysAgoInMonth: 10, hour: 15 },
];

export const placements: Placement[] = placementSeeds.map((seed, i) => ({
  id: `p${i + 1}`,
  candidateName: seed.candidateName,
  companyName: seed.companyName,
  feeAmount: seed.feeAmount,
  branchId: seed.branchId,
  caId: seed.caId,
  placedAt:
    seed.daysAgoInMonth === "today"
      ? todayAt(seed.hour, 30)
      : daysAgoInMonth(seed.daysAgoInMonth, seed.hour, 30),
}));

// ─────────────────────────────────────────────
// プロジェクト 6件(順調3・注意2・遅延1)
// ─────────────────────────────────────────────
export const projects: Project[] = [
  {
    id: "proj1",
    name: "2027新卒採用",
    department: "管理部門",
    owner: "小堀 大輔",
    status: "順調",
    progressPercent: 68,
    dueDate: daysFromNow(45),
    latestComment: "合同説明会の反響好調。エントリー数は目標の110%に到達。",
  },
  {
    id: "proj2",
    name: "求職者ポータル刷新",
    department: "開発(外部委託)",
    owner: "中村 美咲",
    status: "順調",
    progressPercent: 80,
    dueDate: daysFromNow(14),
    latestComment: "β版を主要CAへ先行公開。フィードバックを収集中。",
  },
  {
    id: "proj3",
    name: "大阪拠点オフィス移転",
    department: "管理部門",
    owner: "井上 陽子",
    status: "順調",
    progressPercent: 90,
    dueDate: daysFromNow(20),
    latestComment: "内装工事完了。8月上旬に移転予定。",
  },
  {
    id: "proj4",
    name: "福岡エリア新規開拓",
    department: "法人営業(RA)",
    owner: "渡辺 翔太",
    status: "注意",
    progressPercent: 55,
    dueDate: daysFromNow(10),
    latestComment: "新規開拓候補企業3社と初回商談を実施。契約化はこれから。",
  },
  {
    id: "proj5",
    name: "CA新人研修プログラム刷新",
    department: "管理部門",
    owner: "佐々木 亮",
    status: "注意",
    progressPercent: 45,
    dueDate: daysFromNow(7),
    latestComment: "教材作成が遅れ気味。来週までにカリキュラムを確定へ。",
  },
  {
    id: "proj6",
    name: "社内スプレッドシート移行",
    department: "管理部門",
    owner: "清水 智子",
    status: "遅延",
    progressPercent: 30,
    dueDate: daysFromNow(-3),
    latestComment: "Google Sheets連携の権限周りで足踏み中。来週ベンダーと打合せ予定。",
  },
];

// ─────────────────────────────────────────────
// Slack投稿 8件
// ─────────────────────────────────────────────
export const slackPosts: SlackPost[] = [
  {
    id: "s1",
    channel: "#成約報告",
    author: "高梨 玲奈",
    postedAt: todayAt(11, 40),
    body: "本日、IT企業様にてWebエンジニア職の内定承諾をいただきました🎉 理論年収800万、しっかり決めます!",
  },
  {
    id: "s2",
    channel: "#成約報告",
    author: "松本 直樹",
    postedAt: todayAt(14, 20),
    body: "大阪の小売企業様、店舗マネージャー職で成約しました。今月の大阪拠点2件目です。",
  },
  {
    id: "s3",
    channel: "#営業-東京",
    author: "中村 美咲",
    postedAt: daysAgo(1, 17, 10),
    body: "新規求人票、IT企業3社分をアップしました。書類選考のご協力よろしくお願いします。",
  },
  {
    id: "s4",
    channel: "#全社",
    author: "小堀 大輔",
    postedAt: daysAgo(2, 9, 30),
    body: "7月度、全社目標達成率75%まで来ました。ラストスパートよろしくお願いします!",
  },
  {
    id: "s5",
    channel: "#営業-大阪",
    author: "井上 陽子",
    postedAt: daysAgo(3, 16, 45),
    body: "大阪拠点オフィス移転、8月上旬に決定しました。詳細は追って共有します。",
  },
  {
    id: "s6",
    channel: "#お知らせ",
    author: "清水 智子",
    postedAt: daysAgo(4, 10, 0),
    body: "スプレッドシート移行の件、来週ベンダーと打合せします。進捗はまた共有します。",
  },
  {
    id: "s7",
    channel: "#営業-福岡",
    author: "渡辺 翔太",
    postedAt: daysAgo(5, 13, 15),
    body: "福岡エリアの新規開拓、3社と初回商談ができました。医療系中心に攻めていきます。",
  },
  {
    id: "s8",
    channel: "#全社",
    author: "小堀 大輔",
    postedAt: daysAgo(7, 9, 0),
    body: "2027新卒採用、エントリー数が目標の110%に到達しました。ナイスファイト!",
  },
];
