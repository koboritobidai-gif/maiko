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
  CorporateKpiKey,
  Member,
  Placement,
  Project,
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
}

const CA_ROTATION = ["m2", "m3", "m4"];

const candidateSeeds: CandidateSeed[] = [
  // 新規登録 5名(送客先・面接結果はまだ発生しないため空欄)
  { name: "田中 悠斗", stage: "新規登録", desiredRole: "Webエンジニア", incomeYen: 5_200_000, note: "自社開発企業を中心に希望。ポートフォリオ確認中。", updatedHoursAgo: 4, gender: "男性", age: 26, inflowChannel: "LINE広告" },
  { name: "石井 美月", stage: "新規登録", desiredRole: "広報", incomeYen: 4_500_000, note: "登録直後。ヒアリングシート送付済み。", updatedHoursAgo: 2, gender: "女性", age: 29, inflowChannel: "Instagram" },
  { name: "西村 遥", stage: "新規登録", desiredRole: "店舗マネージャー", incomeYen: 4_600_000, note: "登録完了。希望条件のヒアリング予定。", updatedHoursAgo: 3, gender: "女性", age: 33, inflowChannel: "求人媒体" },
  { name: "松井 優斗", stage: "新規登録", desiredRole: "自動車設計エンジニア", incomeYen: 6_300_000, note: "登録完了。経歴を確認中。", updatedHoursAgo: 5, gender: "男性", age: 31, inflowChannel: "紹介" },
  { name: "長谷川 舞", stage: "新規登録", desiredRole: "看護師(訪問看護)", incomeYen: 4_900_000, note: "登録完了。希望条件をヒアリング予定。", updatedHoursAgo: 6, gender: "女性", age: 38, inflowChannel: "LINE広告" },
  // 面談 5名(まだ企業へは提案していないため送客先・面接結果は空欄)
  { name: "鈴木 美穂", stage: "面談", desiredRole: "人事(採用担当)", incomeYen: 4_800_000, note: "来週初回面談を実施予定。", updatedHoursAgo: 9, gender: "女性", age: 34, inflowChannel: "Instagram" },
  { name: "小川 直人", stage: "面談", desiredRole: "生産管理", incomeYen: 5_800_000, note: "来週面談予定。実務年数を確認。", updatedHoursAgo: 11, gender: "男性", age: 41, inflowChannel: "求人媒体" },
  { name: "前田 翔", stage: "面談", desiredRole: "EC運営担当", incomeYen: 5_000_000, note: "来週面談。転職理由をヒアリング予定。", updatedHoursAgo: 14, gender: "男性", age: 27, inflowChannel: "LINE広告" },
  { name: "橋本 恵", stage: "面談", desiredRole: "品質保証", incomeYen: 5_600_000, note: "来週面談予定。", updatedHoursAgo: 13, gender: "女性", age: 30, inflowChannel: "紹介" },
  { name: "福田 拓也", stage: "面談", desiredRole: "介護施設 施設長候補", incomeYen: 5_500_000, note: "来週面談予定。", updatedHoursAgo: 12, gender: "男性", age: 45, inflowChannel: "求人媒体" },
  // 企業提案 4名(送客先が確定。面接前のため面接結果は空欄)
  { name: "加藤 拓海", stage: "企業提案", desiredRole: "プロダクトマネージャー", incomeYen: 7_500_000, note: "IT企業2社へ提案準備中。", updatedHoursAgo: 15, gender: "男性", age: 35, inflowChannel: "紹介", referredTo: "株式会社トライアングルシステムズ" },
  { name: "森田 千尋", stage: "企業提案", desiredRole: "品質管理", incomeYen: 5_200_000, note: "食品メーカー2社へ提案準備中。", updatedHoursAgo: 18, gender: "女性", age: 32, inflowChannel: "求人媒体", referredTo: "北陸フーズ株式会社" },
  { name: "藤原 麻衣", stage: "企業提案", desiredRole: "バイヤー", incomeYen: 5_300_000, note: "小売2社へ提案中、反応良好。", updatedHoursAgo: 19, gender: "女性", age: 28, inflowChannel: "Instagram", referredTo: "株式会社サンライズリテール" },
  { name: "竹内 亮太", stage: "企業提案", desiredRole: "生産技術", incomeYen: 6_100_000, note: "自動車部品メーカーへ提案準備中。", updatedHoursAgo: 21, gender: "男性", age: 39, inflowChannel: "LINE広告", referredTo: "中央オートパーツ株式会社" },
  // 面接 5名
  { name: "渡部 蓮", stage: "面接", desiredRole: "法人営業(SaaS)", incomeYen: 6_000_000, note: "来週最終面接。給与交渉のポイントを整理中。", updatedHoursAgo: 26, gender: "男性", age: 29, inflowChannel: "紹介", referredTo: "株式会社クラウドゲート", interviewResult: "最終待ち" },
  { name: "村上 由紀", stage: "面接", desiredRole: "生産技術", incomeYen: 5_700_000, note: "来週最終面接。逆質問リストを準備中。", updatedHoursAgo: 8, gender: "女性", age: 36, inflowChannel: "求人媒体", referredTo: "中央オートパーツ株式会社", interviewResult: "最終待ち" },
  { name: "岩崎 健太郎", stage: "面接", desiredRole: "エリアマネージャー", incomeYen: 6_800_000, note: "来週最終面接。対策を実施中。", updatedHoursAgo: 10, gender: "男性", age: 40, inflowChannel: "LINE広告", referredTo: "株式会社サンライズリテール", interviewResult: "1次通過" },
  { name: "川口 直樹", stage: "面接", desiredRole: "工程管理", incomeYen: 6_700_000, note: "来週最終面接。", updatedHoursAgo: 17, gender: "男性", age: 44, inflowChannel: "紹介", referredTo: "北陸フーズ株式会社", interviewResult: "1次通過" },
  { name: "秋山 健", stage: "面接", desiredRole: "薬剤師", incomeYen: 6_500_000, note: "一次面接を通過。最終面接の日程調整中。", updatedHoursAgo: 20, gender: "男性", age: 31, inflowChannel: "求人媒体", referredTo: "みらい調剤薬局グループ", interviewResult: "1次通過・最終日程調整中" },
  // 内定 3名
  { name: "山田 花子", stage: "内定", desiredRole: "マーケティング担当", incomeYen: 6_500_000, note: "内定連絡受領。返答期限は今週末。", updatedHoursAgo: 5, gender: "女性", age: 27, inflowChannel: "Instagram", referredTo: "株式会社グロースフィールド", interviewResult: "内定" },
  { name: "三浦 大和", stage: "内定", desiredRole: "工場長候補", incomeYen: 8_200_000, note: "内定獲得。年収交渉が最終段階。", updatedHoursAgo: 6, gender: "男性", age: 48, inflowChannel: "紹介", referredTo: "中央オートパーツ株式会社", interviewResult: "内定" },
  { name: "平野 沙織", stage: "内定", desiredRole: "購買", incomeYen: 5_200_000, note: "内定連絡受領。承諾検討中。", updatedHoursAgo: 27, gender: "女性", age: 34, inflowChannel: "求人媒体", referredTo: "北陸フーズ株式会社", interviewResult: "内定" },
  // 承諾 3名
  { name: "高橋 大輝", stage: "承諾", desiredRole: "バックエンドエンジニア", incomeYen: 7_000_000, note: "内定承諾済み。入社日を調整中。", updatedHoursAgo: 12, gender: "男性", age: 28, inflowChannel: "LINE広告", referredTo: "株式会社トライアングルシステムズ", interviewResult: "内定承諾" },
  { name: "木下 彩", stage: "承諾", desiredRole: "販売促進", incomeYen: 5_400_000, note: "内定承諾済み。前職の引き継ぎ調整中。", updatedHoursAgo: 16, gender: "女性", age: 30, inflowChannel: "Instagram", referredTo: "株式会社サンライズリテール", interviewResult: "内定承諾" },
  { name: "原田 由美", stage: "承諾", desiredRole: "理学療法士", incomeYen: 5_000_000, note: "内定承諾済み。入社書類を準備中。", updatedHoursAgo: 20, gender: "女性", age: 26, inflowChannel: "紹介", referredTo: "みらいリハビリクリニック", interviewResult: "内定承諾" },
  // 入社 2名
  { name: "中島 陽菜", stage: "入社", desiredRole: "カスタマーサクセス", incomeYen: 5_500_000, note: "入社1週目。オンボーディング順調との報告あり。", updatedHoursAgo: 30, gender: "女性", age: 25, inflowChannel: "Instagram", referredTo: "株式会社クラウドゲート", interviewResult: "入社" },
  { name: "大野 悠", stage: "入社", desiredRole: "店舗開発", incomeYen: 6_000_000, note: "入社2週目。実績資料の引き継ぎも完了。", updatedHoursAgo: 24, gender: "男性", age: 33, inflowChannel: "求人媒体", referredTo: "株式会社サンライズリテール", interviewResult: "入社" },
  // 辞退 3名
  { name: "岡田 健一", stage: "辞退", desiredRole: "経営企画", incomeYen: 8_000_000, note: "選考中に他社内定を承諾されクローズ。", updatedHoursAgo: 40, gender: "男性", age: 37, inflowChannel: "紹介", referredTo: "株式会社グロースフィールド", interviewResult: "選考辞退(他社内定承諾)" },
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

    const candidateValues: Record<CandidateKpiKey, number> = {
      "PV数": pv,
      "LINE登録人数": lineRegistrations,
      "面談予約数": interviewBookings,
      "面談数": interviews,
      "1次〜最終前面接数": earlyInterviews,
      "最終面接数": finalInterviews,
      "内定者数": offers,
      "採用決定求職者数": placementsCount,
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
