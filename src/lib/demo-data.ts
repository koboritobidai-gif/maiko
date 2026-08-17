/**
 * Tobidai Cockpit - デモデータ
 * 実行日(new Date())を基準に相対生成する。「本日」「月内」に常にデータが存在するよう、
 * 月をまたがないよう日付をクランプしている。
 * 実データ連携時は src/lib/adapters/* を Demo実装から実連携実装に差し替えるだけで良い。
 *
 * 実態: 拠点概念は無く、担当者個人単位で運用。KPIは週次入力(毎週月曜に前週分を入力)・月次集計。
 */
import type {
  Candidate,
  CandidateKpiKey,
  CandidateThread,
  CandidateThreadReply,
  CorporateKpiKey,
  Member,
  Placement,
  Project,
  ReferralInvoice,
  RevenueRecord,
  SlackPost,
  Stage,
  WeeklyKpiRecord,
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

/**
 * 前月の指定日(1〜28に収める)。送客パートナー費用デモの「先月分」求職者登録日を作るために使う
 * (Date コンストラクタは month=-1 を自動的に前年12月として正規化する)。
 */
function lastMonthDay(day: number, hour = 10, minute = 0): Date {
  const clamped = Math.min(28, Math.max(1, day));
  return new Date(year, month - 1, clamped, hour, minute);
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
// メンバー(代表1名・CA3名・RA2名 計6名)
// ─────────────────────────────────────────────
export const members: Member[] = [
  { id: "m1", name: "小堀", role: "代表", specialty: "経営・マーケティング(集客導線・LINEファネル全般)" },
  { id: "m2", name: "今井", role: "CA", specialty: "求職者面談・カウンセリング" },
  { id: "m3", name: "佐藤", role: "CA", specialty: "選考対応・内定フォロー" },
  { id: "m4", name: "富田", role: "CA", specialty: "求職者面談・面接対策" },
  { id: "m5", name: "清本", role: "RA", specialty: "法人新規開拓・商談" },
  { id: "m6", name: "江崎", role: "RA", specialty: "法人新規開拓・商談" },
];

// ログイン用デモ人格(設計書 4.0)
export const EXEC_MEMBER_ID = "m1"; // 小堀社長
export const CA_MEMBER_ID = "m3"; // 佐藤CA

// ─────────────────────────────────────────────
// 求職者 30名(新7段階+辞退へ分布。担当CAは今井/佐藤/富田で振り分け)
// ─────────────────────────────────────────────
interface CandidateSeed {
  name: string;
  stage: Stage;
  desiredRole: string;
  incomeYen: number;
  note: string;
  updatedHoursAgo: number;
  /** 性別(任意。新規登録直後などは未回答のこともある想定) */
  gender?: string;
  /** 年齢(任意) */
  age?: number;
  /** 流入経路(任意。例: LINE広告/Instagram/紹介/求人媒体) */
  inflowChannel?: string;
  /** 送客先(任意。企業提案以降で確定する紹介先企業名) */
  referredTo?: string;
  /** 面接結果(任意。面接以降で入る) */
  interviewResult?: string;
  /** 登録日(任意。求職者タブN列相当)。 */
  registeredAt?: Date;
  /**
   * 面談日(任意。求職者タブO列相当)。送客パートナーは「面談実施で課金」のため、
   * 費用集計の月帰属はこの日付を最優先に使う(無ければ 登録日→更新日 で近似)。
   * 「先月登録・今月面談 → 今月課金」「面談後の辞退 → 課金対象」を再現するデータを含める。
   */
  interviewedAt?: Date;
}

const CA_ROTATION = ["m2", "m3", "m4"];

const candidateSeeds: CandidateSeed[] = [
  // 新規登録 5名(送客先・面接結果はまだ発生しないため空欄)
  { name: "田中 悠斗", stage: "新規登録", desiredRole: "Webエンジニア", incomeYen: 5_200_000, note: "自社開発企業を中心に希望。ポートフォリオ確認中。", updatedHoursAgo: 4, gender: "男性", age: 26, inflowChannel: "KANOA紹介", registeredAt: daysAgoInMonth(3, 9, 0) },
  { name: "石井 美月", stage: "新規登録", desiredRole: "広報", incomeYen: 4_500_000, note: "登録直後。ヒアリングシート送付済み。", updatedHoursAgo: 2, gender: "女性", age: 29, inflowChannel: "Instagram" },
  { name: "西村 遥", stage: "新規登録", desiredRole: "店舗マネージャー", incomeYen: 4_600_000, note: "登録完了。希望条件のヒアリング予定。", updatedHoursAgo: 3, gender: "女性", age: 33, inflowChannel: "求人媒体" },
  { name: "松井 優斗", stage: "新規登録", desiredRole: "自動車設計エンジニア", incomeYen: 6_300_000, note: "登録完了。経歴を確認中。", updatedHoursAgo: 5, gender: "男性", age: 31, inflowChannel: "紹介" },
  { name: "長谷川 舞", stage: "新規登録", desiredRole: "看護師(訪問看護)", incomeYen: 4_900_000, note: "登録完了。希望条件をヒアリング予定。", updatedHoursAgo: 6, gender: "女性", age: 38, inflowChannel: "LINE広告" },
  // 面談 5名(まだ企業へは提案していないため送客先・面接結果は空欄)
  { name: "鈴木 美穂", stage: "面談", desiredRole: "人事(採用担当)", incomeYen: 4_800_000, note: "来週初回面談を実施予定。", updatedHoursAgo: 9, gender: "女性", age: 34, inflowChannel: "マホガニー", registeredAt: daysAgoInMonth(9, 9, 30) },
  { name: "小川 直人", stage: "面談", desiredRole: "生産管理", incomeYen: 5_800_000, note: "来週面談予定。実務年数を確認。", updatedHoursAgo: 11, gender: "男性", age: 41, inflowChannel: "求人媒体" },
  { name: "前田 翔", stage: "面談", desiredRole: "EC運営担当", incomeYen: 5_000_000, note: "来週面談。転職理由をヒアリング予定。", updatedHoursAgo: 14, gender: "男性", age: 27, inflowChannel: "foresma", registeredAt: lastMonthDay(20, 9, 0), interviewedAt: daysAgoInMonth(2, 19, 0) },
  { name: "橋本 恵", stage: "面談", desiredRole: "品質保証", incomeYen: 5_600_000, note: "来週面談予定。", updatedHoursAgo: 13, gender: "女性", age: 30, inflowChannel: "紹介" },
  { name: "福田 拓也", stage: "面談", desiredRole: "介護施設 施設長候補", incomeYen: 5_500_000, note: "来週面談予定。", updatedHoursAgo: 12, gender: "男性", age: 45, inflowChannel: "求人媒体" },
  // 企業提案 4名(送客先が確定。面接前のため面接結果は空欄)
  { name: "加藤 拓海", stage: "企業提案", desiredRole: "プロダクトマネージャー", incomeYen: 7_500_000, note: "IT企業2社へ提案準備中。", updatedHoursAgo: 15, gender: "男性", age: 35, inflowChannel: "KANOA", referredTo: "株式会社トライアングルシステムズ", registeredAt: daysAgoInMonth(15, 9, 0) },
  { name: "森田 千尋", stage: "企業提案", desiredRole: "品質管理", incomeYen: 5_200_000, note: "食品メーカー2社へ提案準備中。", updatedHoursAgo: 18, gender: "女性", age: 32, inflowChannel: "求人媒体", referredTo: "北陸フーズ株式会社" },
  { name: "藤原 麻衣", stage: "企業提案", desiredRole: "バイヤー", incomeYen: 5_300_000, note: "小売2社へ提案中、反応良好。", updatedHoursAgo: 19, gender: "女性", age: 28, inflowChannel: "Instagram", referredTo: "株式会社サンライズリテール" },
  { name: "竹内 亮太", stage: "企業提案", desiredRole: "生産技術", incomeYen: 6_100_000, note: "自動車部品メーカーへ提案準備中。", updatedHoursAgo: 21, gender: "男性", age: 39, inflowChannel: "LINE広告", referredTo: "中央オートパーツ株式会社" },
  // 面接 5名
  { name: "渡部 蓮", stage: "面接", desiredRole: "法人営業(SaaS)", incomeYen: 6_000_000, note: "来週最終面接。給与交渉のポイントを整理中。", updatedHoursAgo: 26, gender: "男性", age: 29, inflowChannel: "2peace(Tさん)", referredTo: "株式会社クラウドゲート", interviewResult: "最終待ち", registeredAt: daysAgoInMonth(20, 9, 0) },
  { name: "村上 由紀", stage: "面接", desiredRole: "生産技術", incomeYen: 5_700_000, note: "来週最終面接。逆質問リストを準備中。", updatedHoursAgo: 8, gender: "女性", age: 36, inflowChannel: "求人媒体", referredTo: "中央オートパーツ株式会社", interviewResult: "最終待ち" },
  { name: "岩崎 健太郎", stage: "面接", desiredRole: "エリアマネージャー", incomeYen: 6_800_000, note: "来週最終面接。対策を実施中。", updatedHoursAgo: 10, gender: "男性", age: 40, inflowChannel: "マホガニー", referredTo: "株式会社サンライズリテール", interviewResult: "1次通過", registeredAt: lastMonthDay(25, 9, 0), interviewedAt: daysAgoInMonth(12, 18, 0) },
  { name: "川口 直樹", stage: "面接", desiredRole: "工程管理", incomeYen: 6_700_000, note: "来週最終面接。", updatedHoursAgo: 17, gender: "男性", age: 44, inflowChannel: "紹介", referredTo: "北陸フーズ株式会社", interviewResult: "1次通過" },
  { name: "秋山 健", stage: "面接", desiredRole: "薬剤師", incomeYen: 6_500_000, note: "一次面接を通過。最終面接の日程調整中。", updatedHoursAgo: 20, gender: "男性", age: 31, inflowChannel: "求人媒体", referredTo: "みらい調剤薬局グループ", interviewResult: "1次通過・最終日程調整中" },
  // 内定 3名
  { name: "山田 花子", stage: "内定", desiredRole: "マーケティング担当", incomeYen: 6_500_000, note: "内定連絡受領。返答期限は今週末。", updatedHoursAgo: 5, gender: "女性", age: 27, inflowChannel: "foresma", referredTo: "株式会社グロースフィールド", interviewResult: "内定", registeredAt: daysAgoInMonth(5, 9, 0) },
  { name: "三浦 大和", stage: "内定", desiredRole: "工場長候補", incomeYen: 8_200_000, note: "内定獲得。年収交渉が最終段階。", updatedHoursAgo: 6, gender: "男性", age: 48, inflowChannel: "紹介", referredTo: "中央オートパーツ株式会社", interviewResult: "内定" },
  { name: "平野 沙織", stage: "内定", desiredRole: "購買", incomeYen: 5_200_000, note: "内定連絡受領。承諾検討中。", updatedHoursAgo: 27, gender: "女性", age: 34, inflowChannel: "求人媒体", referredTo: "北陸フーズ株式会社", interviewResult: "内定" },
  // 承諾 3名
  { name: "高橋 大輝", stage: "承諾", desiredRole: "バックエンドエンジニア", incomeYen: 7_000_000, note: "内定承諾済み。入社日を調整中。", updatedHoursAgo: 12, gender: "男性", age: 28, inflowChannel: "KANOA紹介", referredTo: "株式会社トライアングルシステムズ", interviewResult: "内定承諾", registeredAt: daysAgoInMonth(10, 9, 0) },
  { name: "木下 彩", stage: "承諾", desiredRole: "販売促進", incomeYen: 5_400_000, note: "内定承諾済み。前職の引き継ぎ調整中。", updatedHoursAgo: 16, gender: "女性", age: 30, inflowChannel: "Instagram", referredTo: "株式会社サンライズリテール", interviewResult: "内定承諾" },
  { name: "原田 由美", stage: "承諾", desiredRole: "理学療法士", incomeYen: 5_000_000, note: "内定承諾済み。入社書類を準備中。", updatedHoursAgo: 20, gender: "女性", age: 26, inflowChannel: "紹介", referredTo: "みらいリハビリクリニック", interviewResult: "内定承諾" },
  // 入社 2名
  { name: "中島 陽菜", stage: "入社", desiredRole: "カスタマーサクセス", incomeYen: 5_500_000, note: "入社1週目。オンボーディング順調との報告あり。", updatedHoursAgo: 30, gender: "女性", age: 25, inflowChannel: "2peace(Tさん)", referredTo: "株式会社クラウドゲート", interviewResult: "入社", registeredAt: lastMonthDay(15, 9, 0) },
  { name: "大野 悠", stage: "入社", desiredRole: "店舗開発", incomeYen: 6_000_000, note: "入社2週目。実績資料の引き継ぎも完了。", updatedHoursAgo: 24, gender: "男性", age: 33, inflowChannel: "求人媒体", referredTo: "株式会社サンライズリテール", interviewResult: "入社" },
  // 辞退 3名
  { name: "岡田 健一", stage: "辞退", desiredRole: "経営企画", incomeYen: 8_000_000, note: "選考中に他社内定を承諾されクローズ。", updatedHoursAgo: 40, gender: "男性", age: 37, inflowChannel: "マホガニー", referredTo: "株式会社グロースフィールド", interviewResult: "選考辞退(他社内定承諾)", registeredAt: daysAgoInMonth(25, 9, 0), interviewedAt: daysAgoInMonth(18, 19, 0) },
  { name: "佐野 涼", stage: "辞退", desiredRole: "機械設計エンジニア", incomeYen: 6_200_000, note: "条件面で折り合わずクローズ。", updatedHoursAgo: 22, gender: "男性", age: 42, inflowChannel: "求人媒体", referredTo: "中央オートパーツ株式会社", interviewResult: "選考辞退(条件不一致)" },
  { name: "伊藤 さくら", stage: "辞退", desiredRole: "経理(会計事務所)", incomeYen: 5_000_000, note: "転職活動自体を一時中断されクローズ。", updatedHoursAgo: 25, gender: "女性", age: 29, inflowChannel: "LINE広告" },
];

export const candidates: Candidate[] = candidateSeeds.map((seed, i) => ({
  id: `c${i + 1}`,
  name: seed.name,
  caId: CA_ROTATION[i % CA_ROTATION.length],
  stage: seed.stage,
  desiredRole: seed.desiredRole,
  expectedAnnualIncome: seed.incomeYen,
  updatedAt: hoursAgo(seed.updatedHoursAgo),
  registeredAt: seed.registeredAt,
  interviewedAt: seed.interviewedAt,
  latestNote: seed.note,
  gender: seed.gender,
  age: seed.age,
  inflowChannel: seed.inflowChannel,
  referredTo: seed.referredTo,
  interviewResult: seed.interviewResult,
}));

// ─────────────────────────────────────────────
// 成約(今月8件・本日1件)
// ─────────────────────────────────────────────
interface PlacementSeed {
  candidateName: string;
  companyName: string;
  feeAmount: number;
  caId: string;
  daysAgoInMonth: number | "today";
  hour: number;
}

const placementSeeds: PlacementSeed[] = [
  { candidateName: "田村 健一郎", companyName: "株式会社ネクストシステムズ", feeAmount: 2_800_000, caId: "m2", daysAgoInMonth: "today", hour: 11 },
  { candidateName: "石田 大輔", companyName: "合同会社ブライトワークス", feeAmount: 2_100_000, caId: "m3", daysAgoInMonth: 3, hour: 15 },
  { candidateName: "遠藤 智也", companyName: "株式会社フィンテックラボ", feeAmount: 2_450_000, caId: "m4", daysAgoInMonth: 5, hour: 10 },
  { candidateName: "小池 美紀", companyName: "株式会社グロースパートナーズ", feeAmount: 1_750_000, caId: "m2", daysAgoInMonth: 8, hour: 14 },
  { candidateName: "荒木 悠", companyName: "株式会社メディカルリンク", feeAmount: 2_100_000, caId: "m3", daysAgoInMonth: 11, hour: 16 },
  { candidateName: "桜井 直子", companyName: "株式会社ロジテックパートナーズ", feeAmount: 1_900_000, caId: "m4", daysAgoInMonth: 14, hour: 13 },
  { candidateName: "今村 綾", companyName: "株式会社リテールブリッジ", feeAmount: 1_800_000, caId: "m2", daysAgoInMonth: 17, hour: 17 },
  { candidateName: "河合 優斗", companyName: "株式会社中部オートパーツ", feeAmount: 2_450_000, caId: "m3", daysAgoInMonth: 20, hour: 11 },
];

export const placements: Placement[] = placementSeeds.map((seed, i) => ({
  id: `p${i + 1}`,
  candidateName: seed.candidateName,
  companyName: seed.companyName,
  feeAmount: seed.feeAmount,
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
    owner: "小堀",
    status: "順調",
    progressPercent: 68,
    dueDate: daysFromNow(45),
    latestComment: "合同説明会の反響好調。エントリー数は目標の110%に到達。",
  },
  {
    id: "proj2",
    name: "求職者ポータル刷新",
    department: "開発(外部委託)",
    owner: "今井",
    status: "順調",
    progressPercent: 80,
    dueDate: daysFromNow(14),
    latestComment: "β版を主要CAへ先行公開。フィードバックを収集中。",
  },
  {
    id: "proj3",
    name: "LINE登録導線改善",
    department: "マーケティング",
    owner: "小堀",
    status: "順調",
    progressPercent: 90,
    dueDate: daysFromNow(20),
    latestComment: "LP改修完了。LINE登録率が改修前比+3ptに改善。",
  },
  {
    id: "proj4",
    name: "法人新規開拓(飲食業界)プロジェクト",
    department: "法人営業(RA)",
    owner: "清本",
    status: "注意",
    progressPercent: 55,
    dueDate: daysFromNow(10),
    latestComment: "新規開拓候補企業3社と初回商談を実施。契約化はこれから。",
  },
  {
    id: "proj5",
    name: "CA新人研修プログラム刷新",
    department: "管理部門",
    owner: "佐藤",
    status: "注意",
    progressPercent: 45,
    dueDate: daysFromNow(7),
    latestComment: "教材作成が遅れ気味。来週までにカリキュラムを確定へ。",
  },
  {
    id: "proj6",
    name: "週次KPIシート運用定着化",
    department: "管理部門",
    owner: "富田",
    status: "遅延",
    progressPercent: 30,
    dueDate: daysFromNow(-3),
    latestComment: "月曜入力の徹底に課題。来週の定例MTGでルールを再周知予定。",
  },
];

// ─────────────────────────────────────────────
// Slack投稿 8件
// ─────────────────────────────────────────────
export const slackPosts: SlackPost[] = [
  {
    id: "s1",
    channel: "#成約報告",
    author: "今井",
    postedAt: todayAt(11, 40),
    body: "本日、IT企業様にてWebエンジニア職の内定承諾をいただきました🎉 理論年収800万、しっかり決めます!",
  },
  {
    id: "s2",
    channel: "#成約報告",
    author: "佐藤",
    postedAt: todayAt(14, 20),
    body: "小売企業様、店舗マネージャー職で内定承諾をいただきました。今月これで3件目です。",
  },
  {
    id: "s3",
    channel: "#法人営業",
    author: "清本",
    postedAt: daysAgo(1, 17, 10),
    body: "新規名刺交換12件、商談2件を実施しました。IT企業からの引き合いが増えている感触です。",
  },
  {
    id: "s4",
    channel: "#全社",
    author: "小堀",
    postedAt: daysAgo(2, 9, 30),
    body: "今週のLINE登録率、先週比+2ptで改善しています。このペースで月末まで維持していきましょう!",
  },
  {
    id: "s5",
    channel: "#法人営業",
    author: "江崎",
    postedAt: daysAgo(3, 16, 45),
    body: "既存クライアント2社と追加採用のご相談。来週改めて条件をすり合わせます。",
  },
  {
    id: "s6",
    channel: "#お知らせ",
    author: "富田",
    postedAt: daysAgo(4, 10, 0),
    body: "今週の面談予約が埋まってきています。急ぎの調整があれば早めに共有お願いします。",
  },
  {
    id: "s7",
    channel: "#全社",
    author: "小堀",
    postedAt: daysAgo(5, 13, 15),
    body: "木曜12:00〜週次KPI定例です。前週分の入力を月曜中に済ませておいてください。",
  },
  {
    id: "s8",
    channel: "#お知らせ",
    author: "佐藤",
    postedAt: daysAgo(7, 9, 0),
    body: "CA新人研修プログラムの教材ドラフトができました。来週レビューお願いします。",
  },
];

// ─────────────────────────────────────────────
// 求職者Slackスレッド(#求職者チャンネル、1人1スレッド運用のデモ)8名分
// 親メッセージ=氏名のみ。返信で 基本情報 → 面談メモ → 企業提案 → 面接結果 → 内定 …と
// 進捗が読み取れるように、求職者ごとに異なる段階まで進んだ状態を用意している。
// ─────────────────────────────────────────────
interface CandidateThreadReplySeed {
  author: string;
  /** 登録日からの経過日数(0=登録当日) */
  daysAfterRegistration: number;
  hour: number;
  minute: number;
  text: string;
}

interface CandidateThreadSeed {
  name: string;
  /** 「今日」から何日前に登録(親メッセージ投稿)されたか */
  registeredDaysAgo: number;
  registeredHour: number;
  registeredMinute: number;
  replies: CandidateThreadReplySeed[];
}

const candidateThreadSeeds: CandidateThreadSeed[] = [
  // 1. 内定承諾まで進んだフルファネル(8返信)
  {
    name: "宮田裕真",
    registeredDaysAgo: 24,
    registeredHour: 10,
    registeredMinute: 5,
    replies: [
      { author: "今井", daysAfterRegistration: 0, hour: 10, minute: 20, text: "【基本情報】男性・28歳。現職はSES企業でPHPをメイン開発、フロントエンド(React)にも挑戦したく転職検討中とのこと。LINE広告経由で登録。希望年収500〜550万円。" },
      { author: "今井", daysAfterRegistration: 2, hour: 15, minute: 0, text: "【面談メモ】8/3面談実施。物腰柔らかくコミュニケーション力高い印象。自社開発企業を希望、転職理由は現職の裁量権の少なさ。React学習にも意欲的。" },
      { author: "今井", daysAfterRegistration: 4, hour: 11, minute: 30, text: "【企業提案】株式会社トライアングルシステムズへ提案しました。本人の反応も良く、応募意思確認済みです。" },
      { author: "今井", daysAfterRegistration: 7, hour: 9, minute: 45, text: "書類選考通過のご連絡いただきました。一次面接、8/12(火)15:00で確定しています。" },
      { author: "今井", daysAfterRegistration: 9, hour: 17, minute: 10, text: "【面接結果】一次面接通過とのご連絡。技術力を高く評価いただいたそうです。最終面接は来週調整します。" },
      { author: "今井", daysAfterRegistration: 15, hour: 18, minute: 20, text: "最終面接、本日実施しました(社長・CTO同席)。ご本人からも手応え良好とのコメントあり。結果は今週中とのことです。" },
      { author: "今井", daysAfterRegistration: 17, hour: 13, minute: 0, text: "【内定】内定のご連絡をいただきました!年収530万円での提示です。ご本人にも速報済み、来週頭に返答予定。" },
      { author: "今井", daysAfterRegistration: 20, hour: 10, minute: 40, text: "【承諾】内定承諾いただきました。入社日は10/1で企業側と調整中です。引き続き入社までフォローします。" },
    ],
  },
  // 2. 面接落選まで進んだクローズ寄りケース(5返信)
  {
    name: "大西彩乃",
    registeredDaysAgo: 19,
    registeredHour: 13,
    registeredMinute: 15,
    replies: [
      { author: "佐藤", daysAfterRegistration: 0, hour: 13, minute: 40, text: "【基本情報】女性・25歳。前職はアパレル販売、人事は未経験だが独学中とのこと。Instagram経由で登録。希望年収380〜420万円。" },
      { author: "佐藤", daysAfterRegistration: 3, hour: 16, minute: 0, text: "【面談メモ】面談実施。人物重視の採用に強い意欲あり。土日休みの企業を希望。ポテンシャル採用に前向きな企業を中心に探索予定。" },
      { author: "佐藤", daysAfterRegistration: 6, hour: 12, minute: 20, text: "【企業提案】北陸フーズ株式会社の人事アシスタント職へ提案しました。" },
      { author: "佐藤", daysAfterRegistration: 10, hour: 11, minute: 0, text: "一次面接、実施しました。結果は今週中に連絡いただける予定です。" },
      { author: "佐藤", daysAfterRegistration: 12, hour: 15, minute: 50, text: "【面接結果】残念ながら一次面接で不採用のご連絡でした。理由は業界経験不足とのこと。他社を並行して探す方向で本人とすり合わせ中です。" },
    ],
  },
  // 3. 企業提案〜選考序盤(6返信)
  {
    name: "桑原健太",
    registeredDaysAgo: 15,
    registeredHour: 9,
    registeredMinute: 50,
    replies: [
      { author: "富田", daysAfterRegistration: 0, hour: 10, minute: 10, text: "【基本情報】男性・33歳。前職は自動車部品メーカーで生産管理を5年経験。紹介経由で登録。希望年収550〜600万円。" },
      { author: "富田", daysAfterRegistration: 2, hour: 14, minute: 30, text: "【面談メモ】面談実施。現場マネジメント経験が豊富で、次はマネージャー職を希望とのこと。転職理由は評価制度への不満。" },
      { author: "富田", daysAfterRegistration: 5, hour: 11, minute: 0, text: "【企業提案】中央オートパーツ株式会社へ提案準備中です。職務経歴書のブラッシュアップを本人と実施しました。" },
      { author: "富田", daysAfterRegistration: 8, hour: 17, minute: 15, text: "書類選考、通過のご連絡いただきました。" },
      { author: "富田", daysAfterRegistration: 10, hour: 10, minute: 30, text: "一次面接の日程、来週水曜14:00で確定しました。" },
      { author: "富田", daysAfterRegistration: 13, hour: 19, minute: 0, text: "面接に向けて職務経歴の深掘りと逆質問リストの準備を本人と実施しました。手応えありそうです。" },
    ],
  },
  // 4. 面談段階(4返信)
  {
    name: "藤井美咲",
    registeredDaysAgo: 9,
    registeredHour: 11,
    registeredMinute: 0,
    replies: [
      { author: "今井", daysAfterRegistration: 0, hour: 11, minute: 20, text: "【基本情報】女性・30歳。訪問看護の実務経験3年。求人媒体経由で登録。希望年収450〜480万円。" },
      { author: "今井", daysAfterRegistration: 3, hour: 15, minute: 40, text: "【面談メモ】面談実施。ワークライフバランス重視、夜勤なしを希望とのこと。土日休みも優先条件。" },
      { author: "今井", daysAfterRegistration: 5, hour: 10, minute: 0, text: "希望条件に合う求人をピックアップ中です。訪問看護ステーション3社ほど候補が挙がっています。" },
      { author: "今井", daysAfterRegistration: 7, hour: 16, minute: 30, text: "来週、候補企業への提案を進める予定です。本人にも候補一覧を共有済み。" },
    ],
  },
  // 5. 面接進行中(7返信)
  {
    name: "望月隼人",
    registeredDaysAgo: 21,
    registeredHour: 14,
    registeredMinute: 0,
    replies: [
      { author: "佐藤", daysAfterRegistration: 0, hour: 14, minute: 25, text: "【基本情報】男性・27歳。現職はIT商社で法人営業3年。LINE広告経由で登録。希望年収480〜520万円。" },
      { author: "佐藤", daysAfterRegistration: 2, hour: 17, minute: 0, text: "【面談メモ】面談実施。数字への意識が高く、SaaS業界への転向を希望。転職理由はキャリアの伸びしろ。" },
      { author: "佐藤", daysAfterRegistration: 4, hour: 10, minute: 30, text: "【企業提案】株式会社クラウドゲートへ提案しました。" },
      { author: "佐藤", daysAfterRegistration: 7, hour: 13, minute: 0, text: "書類選考通過、一次面接をセットしました。" },
      { author: "佐藤", daysAfterRegistration: 9, hour: 18, minute: 45, text: "【面接結果】一次面接通過とのご連絡です!人柄を評価いただいたとのこと。" },
      { author: "佐藤", daysAfterRegistration: 13, hour: 11, minute: 15, text: "最終面接、来週火曜10:00で確定しました。" },
      { author: "佐藤", daysAfterRegistration: 18, hour: 16, minute: 0, text: "最終面接に向けて、給与交渉のポイントを事前にすり合わせ済みです。ご本人も準備万端とのこと。" },
    ],
  },
  // 6. 新規登録直後(3返信)
  {
    name: "平田さくら",
    registeredDaysAgo: 3,
    registeredHour: 16,
    registeredMinute: 30,
    replies: [
      { author: "今井", daysAfterRegistration: 0, hour: 16, minute: 50, text: "【基本情報】女性・24歳。前職は広告代理店で企画職。紹介経由で登録。希望年収400万円前後。" },
      { author: "今井", daysAfterRegistration: 1, hour: 10, minute: 0, text: "ヒアリングシート回収済みです。来週、面談を実施予定です。" },
      { author: "今井", daysAfterRegistration: 2, hour: 14, minute: 20, text: "面談日程、8/18(火)19:00で確定しました。" },
    ],
  },
  // 7. 内定(条件調整中、5返信)
  {
    name: "黒田拓真",
    registeredDaysAgo: 27,
    registeredHour: 9,
    registeredMinute: 30,
    replies: [
      { author: "富田", daysAfterRegistration: 0, hour: 9, minute: 50, text: "【基本情報】男性・38歳。介護施設で主任として5年勤務。求人媒体経由で登録。希望年収550〜600万円。" },
      { author: "富田", daysAfterRegistration: 3, hour: 13, minute: 10, text: "【面談メモ】面談実施。マネジメント経験が豊富で、施設長候補としての適性が高い印象。" },
      { author: "富田", daysAfterRegistration: 6, hour: 15, minute: 0, text: "【企業提案】みらいリハビリクリニックへ提案しました。" },
      { author: "富田", daysAfterRegistration: 11, hour: 17, minute: 30, text: "面接実施、高評価をいただきました。決裁者との最終調整に入るとのことです。" },
      { author: "富田", daysAfterRegistration: 16, hour: 12, minute: 0, text: "【内定】内定のご連絡をいただきました。条件面(年収・入社時期)のすり合わせを進めています。" },
    ],
  },
  // 8. 家庭都合でクローズ(4返信)
  {
    name: "小林優輝",
    registeredDaysAgo: 12,
    registeredHour: 10,
    registeredMinute: 45,
    replies: [
      { author: "佐藤", daysAfterRegistration: 0, hour: 11, minute: 0, text: "【基本情報】男性・31歳。自動車部品メーカーで設計を5年経験。Instagram経由で登録。希望年収500〜550万円。" },
      { author: "佐藤", daysAfterRegistration: 2, hour: 14, minute: 30, text: "【面談メモ】面談実施。転職意欲は高いが、家庭都合で勤務地に制約ありとのこと。通勤圏が限定的。" },
      { author: "佐藤", daysAfterRegistration: 6, hour: 16, minute: 15, text: "勤務地条件に合う求人が少なく、選定に時間がかかっています。エリアを広げられないか本人に再確認中。" },
      { author: "佐藤", daysAfterRegistration: 9, hour: 10, minute: 20, text: "本人都合により転職活動を一時中断したいとのご連絡がありました。またご縁があれば連絡いただく形で、一旦クローズとします。" },
    ],
  },
];

/** Slack の ts(unix秒.マイクロ秒)風の文字列を組み立てる(デモ用の疑似ID)。 */
function pseudoTs(date: Date, seq: number): string {
  return `${Math.floor(date.getTime() / 1000)}.${String(seq).padStart(6, "0")}`;
}

/** 実際には投稿されていないデモスレッドへの、Slackパーマリンク風のURL(見た目確認用)。 */
function demoPermalink(threadTs: string): string {
  const channel = "C071ZU15QBX";
  return `https://tobidai-hr.slack.com/archives/${channel}/p${threadTs.replace(".", "")}`;
}

export const candidateThreads: CandidateThread[] = candidateThreadSeeds.map((seed, seedIndex) => {
  const registeredAt = daysAgo(seed.registeredDaysAgo, seed.registeredHour, seed.registeredMinute);
  const threadTs = pseudoTs(registeredAt, seedIndex * 1000);

  const replies: CandidateThreadReply[] = seed.replies.map((r) => {
    const postedAt = new Date(registeredAt);
    postedAt.setDate(postedAt.getDate() + r.daysAfterRegistration);
    postedAt.setHours(r.hour, r.minute, 0, 0);
    return {
      author: r.author,
      postedAt,
      text: r.text,
    };
  });

  const latest = replies[replies.length - 1];

  return {
    threadTs,
    name: seed.name,
    registeredAt,
    updatedAt: latest ? latest.postedAt : registeredAt,
    replyCount: replies.length,
    parentText: seed.name,
    latestText: latest ? latest.text : "",
    permalink: demoPermalink(threadTs),
    replies,
  };
});

// ─────────────────────────────────────────────
// 週次KPI(直近8週分。毎週月曜に前週分を入力する運用)
// ─────────────────────────────────────────────

/** 週の月曜日を返す(引数の日付が属する週)。 */
function mondayOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=日, 1=月, ...
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatWeekStart(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 直近8週分(今週含む)の月曜日リスト。古い順。 */
const RECENT_WEEK_STARTS: string[] = Array.from({ length: 8 }, (_, i) => {
  const monday = mondayOf(now);
  monday.setDate(monday.getDate() - (7 - i) * 7);
  return formatWeekStart(monday);
});

/** シード付き簡易乱数生成器(実行のたびに値がブレすぎないようにするため)。 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const CANDIDATE_KPI_OWNER_ROTATION = ["小堀", "今井", "佐藤"];
const CORPORATE_KPI_OWNER = "清本";

const CORPORATE_KPI_RANGES: Record<CorporateKpiKey, [number, number]> = {
  "名刺交換数": [30, 60],
  "アポイント数(主権)": [2, 5],
  "アポイント数(非主権)": [2, 4],
  "アポイント数(外部)": [1, 3],
  "商談数(主権)": [2, 5],
  "商談数(非主権)": [2, 5],
  "商談数(外部)": [2, 5],
  "既存商談数(主権)": [0, 3],
  "既存商談数(非主権)": [0, 2],
  "契約数": [0, 1],
  "契約金額": [0, 400],
  "採用決定法人数": [0, 1],
};

function generateWeeklyKpis(): WeeklyKpiRecord[] {
  const records: WeeklyKpiRecord[] = [];

  RECENT_WEEK_STARTS.forEach((weekStart, weekIndex) => {
    const rng = mulberry32(20260722 + weekIndex * 97);

    // 求職者(LINEファネル)系: ファネルが不自然に逆転しないよう、順番に生成しつつ前段の値でクランプする。
    const pv = randInt(rng, 1800, 2600);
    const lineRegistrations = Math.min(randInt(rng, 80, 130), pv);
    const interviewBookings = Math.min(randInt(rng, 30, 50), lineRegistrations);
    const interviews = Math.min(randInt(rng, 20, 35), interviewBookings);
    const earlyInterviews = Math.min(randInt(rng, 15, 20), interviews);
    const finalInterviews = Math.min(randInt(rng, 3, 6), earlyInterviews);
    const offers = Math.min(randInt(rng, 1, 3), Math.max(finalInterviews, 1));
    const placementsCount = Math.min(randInt(rng, 0, 2), offers);
    // 任意項目: LステップのLINE公式アカウント ブロック数(週5〜15件程度。LINE登録者数を超えない)。
    const blockCount = Math.min(randInt(rng, 5, 15), lineRegistrations);

    const candidateValues: Record<CandidateKpiKey, number> = {
      "PV数": pv,
      "LINE登録人数": lineRegistrations,
      "面談予約数": interviewBookings,
      "面談数": interviews,
      "1次〜最終前面接数": earlyInterviews,
      "最終面接数": finalInterviews,
      "内定者数": offers,
      "採用決定求職者数": placementsCount,
      "ブロック数": blockCount,
    };

    (Object.keys(candidateValues) as CandidateKpiKey[]).forEach((key, keyIndex) => {
      const owner =
        CANDIDATE_KPI_OWNER_ROTATION[(weekIndex + keyIndex) % CANDIDATE_KPI_OWNER_ROTATION.length];
      records.push({ weekStart, category: "求職者", key, value: candidateValues[key], owner });
    });

    // 法人営業系
    (Object.keys(CORPORATE_KPI_RANGES) as CorporateKpiKey[]).forEach((key) => {
      const [min, max] = CORPORATE_KPI_RANGES[key];
      records.push({
        weekStart,
        category: "法人",
        key,
        value: randInt(rng, min, max),
        owner: CORPORATE_KPI_OWNER,
      });
    });
  });

  return records;
}

export const weeklyKpis: WeeklyKpiRecord[] = generateWeeklyKpis();

// ─────────────────────────────────────────────
// 送客パートナー請求書(Slack「#請求書」チャンネルのデモ)4件
// 対象月は「先月」固定(請求書は翌月に届く運用のため)。金額は getReferralPartnerSummary を
// 上記の求職者デモデータに先月基準(基準日=先月15日)で適用した実際の計算値と、意図的に
// 一致/差異/読取不可の3パターンを見せるように組み合わせている。
// 実際の先月計算値(上記求職者データより): KANOA 0名/¥0、マホガニー 0名/¥0、foresma 0名/¥0、
// 2peace(Tさん) 1名/¥22,000(中島陽菜さんが唯一、先月登録・面談日未入力=登録日基準で先月扱い)。
// ─────────────────────────────────────────────
const lastMonthRef = new Date(year, month - 1, 1);
const REFERRAL_INVOICE_TARGET_MONTH = `${lastMonthRef.getFullYear()}-${String(lastMonthRef.getMonth() + 1).padStart(2, "0")}`;
const REFERRAL_INVOICE_TARGET_MONTH_LABEL = `${lastMonthRef.getFullYear()}年${lastMonthRef.getMonth() + 1}月分`;

/** 実際には投稿されていないデモ請求書への、Slackパーマリンク風のURL(見た目確認用)。 */
function demoInvoicePermalink(seq: number): string {
  const channel = "C0INVOICE01";
  const ts = pseudoTs(daysAgo(10 - seq), seq);
  return `https://tobidai-hr.slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}

export const referralInvoices: ReferralInvoice[] = [
  {
    // 差異あり: 請求は1名分(¥27,500)だが、アプリの先月計算は0名(¥0)。
    // KANOA経由の登録・面談実施の計上漏れ、または先方の集計対象月ズレの可能性を示すデモ。
    partnerChannel: "KANOA",
    vendorName: "株式会社KANOA",
    amountYen: 27_500,
    targetMonth: REFERRAL_INVOICE_TARGET_MONTH,
    targetMonthIsEstimated: false,
    fileName: `KANOA_請求書_${REFERRAL_INVOICE_TARGET_MONTH_LABEL}.pdf`,
    postedAt: daysAgo(9, 10, 15),
    permalink: demoInvoicePermalink(1),
  },
  {
    // 読取不可: スキャン画像PDFを想定し、テキスト抽出に失敗したケース。
    partnerChannel: "マホガニー",
    vendorName: "株式会社マホガニー",
    amountYen: undefined,
    targetMonth: REFERRAL_INVOICE_TARGET_MONTH,
    targetMonthIsEstimated: true,
    fileName: "マホガニー請求書(スキャン).pdf",
    postedAt: daysAgo(7, 14, 40),
    permalink: demoInvoicePermalink(2),
    parseNote: "PDFからテキストを抽出できませんでした(スキャン画像PDFの可能性があります)。",
  },
  {
    // 一致: 先月の対象者なしのため、先方も¥0で確認請求(件数0件の確認書として送付)。
    partnerChannel: "foresma",
    vendorName: "foresma株式会社",
    amountYen: 0,
    targetMonth: REFERRAL_INVOICE_TARGET_MONTH,
    targetMonthIsEstimated: true,
    fileName: "foresma_月次請求確認書.pdf",
    postedAt: daysAgo(5, 11, 0),
    permalink: demoInvoicePermalink(3),
  },
  {
    // 一致: 先月1名(中島陽菜さん)分の¥22,000で、アプリの計算値と完全一致。
    partnerChannel: "2peace(Tさん)",
    vendorName: "株式会社2peace",
    amountYen: 22_000,
    targetMonth: REFERRAL_INVOICE_TARGET_MONTH,
    targetMonthIsEstimated: false,
    fileName: `2peace_請求書_${REFERRAL_INVOICE_TARGET_MONTH_LABEL}.pdf`,
    postedAt: daysAgo(3, 9, 50),
    permalink: demoInvoicePermalink(4),
  },
  {
    // 送客パートナー以外の請求書(経路不明扱い)。「出ていくお金(全体)」の「その他の支払い」に
    // 合算されるケースを見せるデモ(getOtherInvoiceCosts 参照)。
    partnerChannel: undefined,
    vendorName: "スマートワークス株式会社",
    amountYen: 33_000,
    targetMonth: REFERRAL_INVOICE_TARGET_MONTH,
    targetMonthIsEstimated: false,
    fileName: `クラウド勤怠システム利用料_${REFERRAL_INVOICE_TARGET_MONTH_LABEL}.pdf`,
    postedAt: daysAgo(2, 16, 20),
    permalink: demoInvoicePermalink(5),
  },
];

// ─────────────────────────────────────────────
// 送客売上(翔び台が紹介先企業から「貰う」金額)デモ2ヶ月分
// 実物の売上シート(月別タブ、列: 会社名/求職者/流入経路/金額)を模した内容。
// 経路は送客パートナー4経路(KANOA/マホガニー/foresma/2peace(Tさん))に加え、それ以外の経路
// (サンシャイン/インフルエンサー/12月転職博/マジパス/求人媒体/紹介)も混ぜる
// (getReferralProfit の rows は送客パートナー4経路のみ対象、合計は全経路の売上を使うため)。
// ─────────────────────────────────────────────
const REVENUE_THIS_MONTH_KEY = `${year}-${String(month + 1).padStart(2, "0")}`;
const REVENUE_LAST_MONTH_KEY = REFERRAL_INVOICE_TARGET_MONTH; // 先月(既存の lastMonthRef 基準と揃える)

export const revenueRecords: RevenueRecord[] = [
  // 今月分(4件)
  {
    month: REVENUE_THIS_MONTH_KEY,
    inflowChannel: "KANOA",
    company: "株式会社トライアングルシステムズ",
    candidateName: "加藤 拓海",
    amountYen: 450_000,
  },
  {
    month: REVENUE_THIS_MONTH_KEY,
    inflowChannel: "サンシャイン",
    company: "北陸フーズ株式会社",
    candidateName: "森田 千尋",
    amountYen: 380_000,
  },
  {
    month: REVENUE_THIS_MONTH_KEY,
    inflowChannel: "インフルエンサー",
    company: "株式会社サンライズリテール",
    candidateName: "藤原 麻衣",
    amountYen: 620_000,
  },
  {
    month: REVENUE_THIS_MONTH_KEY,
    inflowChannel: "求人媒体",
    company: "中央オートパーツ株式会社",
    candidateName: "竹内 亮太",
    amountYen: 550_000,
  },
  // 先月分(5件)
  {
    month: REVENUE_LAST_MONTH_KEY,
    inflowChannel: "2peace(Tさん)",
    company: "株式会社クラウドゲート",
    candidateName: "中島 陽菜",
    amountYen: 320_000,
  },
  {
    month: REVENUE_LAST_MONTH_KEY,
    inflowChannel: "マホガニー",
    company: "株式会社サンライズリテール",
    candidateName: "岩崎 健太郎",
    amountYen: 410_000,
  },
  {
    month: REVENUE_LAST_MONTH_KEY,
    inflowChannel: "紹介",
    company: "みらいリハビリクリニック",
    candidateName: "原田 由美",
    amountYen: 300_000,
  },
  {
    month: REVENUE_LAST_MONTH_KEY,
    inflowChannel: "12月転職博",
    company: "株式会社グロースフィールド",
    candidateName: "山田 花子",
    amountYen: 700_000,
  },
  {
    month: REVENUE_LAST_MONTH_KEY,
    inflowChannel: "マジパス",
    company: "中央オートパーツ株式会社",
    candidateName: "三浦 大和",
    amountYen: 900_000,
  },
];
