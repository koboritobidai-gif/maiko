/**
 * Tobidai Cockpit - ドメイン型定義
 * 設計書 2章(事業ドメイン)/5章(ディレクトリ設計)に対応。
 */

/** 求職者の選考ステージ。辞退はパイプライン外の離脱ステータス。 */
export type Stage =
  | "新規登録"
  | "面談"
  | "企業提案"
  | "面接"
  | "内定"
  | "承諾"
  | "入社"
  | "辞退";

/** パイプライン上の並び順(離脱ステージは含めない)。 */
export const PIPELINE_STAGES: Stage[] = [
  "新規登録",
  "面談",
  "企業提案",
  "面接",
  "内定",
  "承諾",
  "入社",
];

/** 全ステージ(離脱含む)。 */
export const ALL_STAGES: Stage[] = [...PIPELINE_STAGES, "辞退"];

/** 紹介手数料率(理論年収に対する割合)。 */
export const FEE_RATE = 0.35;

/** 役割。管理業務は代表に統合。 */
export type Role = "代表" | "CA" | "RA";

/** 社員(代表/CA/RA)。拠点概念は無く、個人単位で運用する。 */
export interface Member {
  id: string;
  /** 氏名 */
  name: string;
  /** 役割 */
  role: Role;
  /** 得意領域(業界・職種・担当領域など) */
  specialty: string;
}

/** 求職者。 */
export interface Candidate {
  id: string;
  /** 氏名 */
  name: string;
  /** 担当CA(Member.id) */
  caId: string;
  /** 選考ステージ */
  stage: Stage;
  /** 希望職種 */
  desiredRole: string;
  /** 理論年収(円) */
  expectedAnnualIncome: number;
  /** 更新日時 */
  updatedAt: Date;
  /** 登録日(任意。求職者タブN列) */
  registeredAt?: Date;
  /**
   * 面談日(任意。求職者タブO列)。送客パートナー費用は「面談実施で課金」のため、
   * 費用集計の月内判定はこの日付を最優先に使う(無ければ 登録日→更新日 で近似)。
   */
  interviewedAt?: Date;
  /** 最新メモ */
  latestNote: string;
  /** 性別(任意。自由記述: 「男性」「女性」「その他/未回答」など) */
  gender?: string;
  /** 年齢(任意) */
  age?: number;
  /** 流入経路(任意。例: LINE広告/Instagram/紹介/求人媒体) */
  inflowChannel?: string;
  /** 送客先(任意。紹介先企業名) */
  referredTo?: string;
  /** 面接結果(任意。例: 1次通過/最終待ち/内定) */
  interviewResult?: string;
}

/** 成約(内定承諾・入社が確定した紹介実績)。 */
export interface Placement {
  id: string;
  /** 求職者氏名 */
  candidateName: string;
  /** 参考: 求職者ID(パイプライン上に現存する場合のみ) */
  candidateId?: string;
  /** 企業名 */
  companyName: string;
  /** 成約日 */
  placedAt: Date;
  /** 手数料額(円) = 理論年収 × FEE_RATE */
  feeAmount: number;
  /** 集計用: 担当CA(Member.id) */
  caId: string;
}

/** プロジェクトの状態。 */
export type ProjectStatus = "順調" | "注意" | "遅延";

/** 社内プロジェクト。 */
export interface Project {
  id: string;
  /** 名称 */
  name: string;
  /** 担当部門 */
  department: string;
  /** 担当者 */
  owner: string;
  /** 状態 */
  status: ProjectStatus;
  /** 進捗% (0-100) */
  progressPercent: number;
  /** 期日 */
  dueDate: Date;
  /** 最新一言 */
  latestComment: string;
}

/** Slack投稿(デモ)。 */
export interface SlackPost {
  id: string;
  /** チャンネル名(# 付き) */
  channel: string;
  /** 投稿者 */
  author: string;
  /** 投稿時刻 */
  postedAt: Date;
  /** 本文 */
  body: string;
}

/** 求職者Slackスレッド内の1件の返信。 */
export interface CandidateThreadReply {
  /** 投稿者の表示名 */
  author: string;
  /** 投稿日時 */
  postedAt: Date;
  /** 本文(メンション・リンクを表示用に整形済み、改行は保持) */
  text: string;
}

/**
 * 求職者Slackスレッド(社内Slack「#求職者」チャンネル、1人の求職者につき1スレッドの運用)。
 * 親メッセージ=氏名のみ、スレッド返信に基本情報・特徴・面談履歴・進捗が書かれる想定で、
 * 「新着通知」ではなく求職者のデータベース兼進捗管理として扱う。
 * シート台帳(`Candidate`)とは別管理(氏名以外の突合キーを持たない)。
 * 将来的に企業情報とのマッチングへ拡張する余地があるため、進捗テキストは自由記述のまま
 * 保持し、構造化(ステージ・希望条件などのフィールド化)は行っていない(docs/DESIGN.md 7章)。
 */
export interface CandidateThread {
  /** スレッド(親メッセージ)の ts。個別ページ(`/candidates/t/[threadTs]`)のURLにも使用 */
  threadTs: string;
  /** 求職者名(親メッセージ本文の1行目、最大20文字) */
  name: string;
  /** 登録日時(親メッセージの投稿日時) */
  registeredAt: Date;
  /** 最終更新日時(最新返信の投稿日時。返信が無ければ登録日時と同じ) */
  updatedAt: Date;
  /** 返信数 */
  replyCount: number;
  /** 親メッセージ本文 */
  parentText: string;
  /** 最新返信の本文(返信が無ければ空文字) */
  latestText: string;
  /** Slackの当該メッセージへのパーマリンク(取得できなかった場合は省略) */
  permalink?: string;
  /**
   * 返信一覧(古い順)。API呼び出し数抑制のため取得をスキップしたスレッドでは空配列になる
   * (`replyCount` は実際の返信数を保持するため、`replies.length` と一致しないことがある)。
   */
  replies: CandidateThreadReply[];
}

// ─────────────────────────────────────────────
// 週次KPI
// ─────────────────────────────────────────────

/** KPIの区分。求職者集客系 or 法人営業系。 */
export type KpiCategory = "求職者" | "法人";

/** 求職者(LINEファネル)系KPI項目。 */
export type CandidateKpiKey =
  | "PV数"
  | "LINE登録人数"
  | "面談予約数"
  | "面談数"
  | "1次〜最終前面接数"
  | "最終面接数"
  | "内定者数"
  | "採用決定求職者数"
  | "ブロック数";

/** 法人営業系KPI項目。 */
export type CorporateKpiKey =
  | "名刺交換数"
  | "アポイント数(主権)"
  | "アポイント数(非主権)"
  | "アポイント数(外部)"
  | "商談数(主権)"
  | "商談数(非主権)"
  | "商談数(外部)"
  | "既存商談数(主権)"
  | "既存商談数(非主権)"
  | "契約数"
  | "契約金額"
  | "採用決定法人数";

export const CANDIDATE_KPI_KEYS: CandidateKpiKey[] = [
  "PV数",
  "LINE登録人数",
  "面談予約数",
  "面談数",
  "1次〜最終前面接数",
  "最終面接数",
  "内定者数",
  "採用決定求職者数",
  // 任意項目: Lステップ(LINE公式アカウント)のブロック数。週次で記録すると「ブロック率」の
  // AI質問応答(ask-responder.ts)に利用できる。ダッシュボードの求職者ファネルには表示しない。
  "ブロック数",
];

export const CORPORATE_KPI_KEYS: CorporateKpiKey[] = [
  "名刺交換数",
  "アポイント数(主権)",
  "アポイント数(非主権)",
  "アポイント数(外部)",
  "商談数(主権)",
  "商談数(非主権)",
  "商談数(外部)",
  "既存商談数(主権)",
  "既存商談数(非主権)",
  "契約数",
  "契約金額",
  "採用決定法人数",
];

/**
 * 週次KPIレコード。毎週月曜に前週分を入力する運用(週次入力・月次集計)。
 * 「契約金額」のみ単位が万円(その他の求人系KPIは全て件数・人数)。
 */
export interface WeeklyKpiRecord {
  /** 対象週の月曜日(YYYY-MM-DD) */
  weekStart: string;
  /** 区分 */
  category: KpiCategory;
  /** 項目 */
  key: CandidateKpiKey | CorporateKpiKey;
  /** 値(「契約金額」のみ万円、他は件数・人数) */
  value: number;
  /** 入力担当者(氏名) */
  owner: string;
}

/**
 * データ取得元の状態。
 * - live: 実連携(Google Sheets / Slack)から正常に取得できた
 * - demo: DATA_MODE が live ではない(デモデータを意図的に使用)
 * - live-error: DATA_MODE=live だが接続・パースに失敗し、デモデータへフォールバックした
 */
export type SourceStatus = "live" | "demo" | "live-error";

/**
 * 送客パートナー(成果報酬型)の単価マスタ。1人登録(面談)あたりの単価。
 * 連携シートの任意タブ「送客単価」(A列: 経路名 / B列: 1人あたり単価(円))から読み取る。
 * タブが無い・読めない場合は `DEFAULT_REFERRAL_RATES` を使用する(エラーにしない)。
 */
export interface ReferralRate {
  /** 経路名。求職者の流入経路(inflowChannel)との部分一致(trim・大文字小文字無視)で判定する。 */
  channel: string;
  /** 1人あたり単価(円) */
  unitCostYen: number;
}

/** 送客パートナー単価の既定値(経営者からの申告ベース)。 */
export const DEFAULT_REFERRAL_RATES: ReferralRate[] = [
  { channel: "KANOA", unitCostYen: 27_500 },
  { channel: "マホガニー", unitCostYen: 22_000 },
  { channel: "foresma", unitCostYen: 27_500 },
  { channel: "2peace(Tさん)", unitCostYen: 22_000 },
];

/** システム設定(スプレッドシート「設定」タブ相当)。 */
export interface Settings {
  /** 紹介手数料率(理論年収に対する割合)。成約の手数料自動計算に使用。 */
  feeRate: number;
  /** 送客パートナー単価マスタ(任意タブ「送客単価」。無ければ DEFAULT_REFERRAL_RATES)。 */
  referralRates: ReferralRate[];
}

/**
 * 全機能(ダッシュボード・AIに聞く・届ける・面談AI・提案書)が参照する統合データバンドル。
 * `src/lib/data-bundle.ts` の `loadDataBundle()` が SpreadsheetSource / MessengerSource から
 * 構築する。metrics.ts / ai/*.ts はこのバンドル(または内包する配列)を引数に取る純関数として実装し、
 * demo-data.ts を直接 import しないこと。
 */
export interface DataBundle {
  candidates: Candidate[];
  placements: Placement[];
  projects: Project[];
  members: Member[];
  settings: Settings;
  slackPosts: SlackPost[];
  /** 週次KPIレコード(直近数週間分)。 */
  weeklyKpis: WeeklyKpiRecord[];
  /** スプレッドシート(Sheets)の取得ステータス。 */
  sourceStatus: SourceStatus;
  /** Sheets 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  sourceErrorMessage?: string;
  /** Slack の取得ステータス。 */
  slackStatus: SourceStatus;
  /** Slack 接続失敗時のエラー内容(live-error のときのみ。画面での自己診断用)。 */
  slackErrorMessage?: string;
}

// ─────────────────────────────────────────────
// 集客・広告データ(外部スプレッドシート2つ: アイドマ=広告運用 / リズリアライズ=SNS運用)
// ─────────────────────────────────────────────

/** 広告運用シート(アイドマ)の日次実績。媒体ごとに1日1レコード。 */
export interface AdDailyRecord {
  /** 媒体(タブ名) */
  channel: "Google広告" | "Meta広告";
  /** 実績日 */
  date: Date;
  /** 費用(円) */
  cost: number;
  /** 表示回数 */
  impressions: number;
  /** クリック数 */
  clicks: number;
  /** LINE登録数 */
  lineRegs: number;
  /** 面談予約数 */
  reservations: number;
  /** 面談実施数 */
  interviews: number;
}

/** SNS運用シート(リズリアライズ)の週次実績。 */
export interface SnsWeeklyRecord {
  /** 対象週の開始日(シートの「期間」表記から算出) */
  weekStart: Date;
  /** 期間表記(シートの値をそのまま保持。例: 「6/19-6/25」) */
  label: string;
  /** 合計再生数(TikTok/IG) */
  plays: number;
  /** プロフィール遷移数(TikTok/IGの合算) */
  profileVisits: number;
  /** LP閲覧合計 */
  lpViews: number;
  /** LINE登録(実) */
  lineRegs: number;
  /** 面談(実) */
  interviews: number;
}

/** 集客・広告データ(2つの外部スプレッドシートから統合)。 */
export interface MarketingData {
  /** 広告運用(アイドマ)の日次実績(Google広告・Meta広告) */
  adDaily: AdDailyRecord[];
  /** SNS運用(リズリアライズ)の週次実績 */
  snsWeekly: SnsWeeklyRecord[];
  /** SNS運用の月額固定費用(円)。`MARKETING_SNS_MONTHLY_COST` 環境変数(未設定時 495,000円)。 */
  snsMonthlyCostYen: number;
}

// ─────────────────────────────────────────────
// 送客パートナー請求書(Slack「#請求書」チャンネルのPDF読取)
// ─────────────────────────────────────────────

/** Slack「#請求書」から読み取った送客パートナー請求書1件。 */
export interface ReferralInvoice {
  /** 一致した経路名(単価マスタの表記)。特定できなければ undefined */
  partnerChannel?: string;
  /** 請求元の会社名(PDFテキストから「株式会社◯◯」等を自動抽出。翔び台自身は除外)。読み取れなければ undefined */
  vendorName?: string;
  /** 請求金額(円)。読み取れなければ undefined */
  amountYen?: number;
  /** 対象月(YYYY-MM)。 */
  targetMonth: string;
  /** 対象月がPDF記載ではなく投稿日からの推定の場合 true */
  targetMonthIsEstimated: boolean;
  fileName: string;
  /** Slackメッセージの投稿日時 */
  postedAt: Date;
  /** Slackメッセージへのパーマリンク(chat.getPermalink。失敗時は省略) */
  permalink?: string;
  /** テキスト抽出や金額読取に失敗した場合の内容(画面表示用) */
  parseNote?: string;
}

// ─────────────────────────────────────────────
// 送客売上(翔び台が紹介先企業から「貰う」金額。売上シートの月別タブ)
// ─────────────────────────────────────────────

/**
 * 送客売上(翔び台が紹介先企業から貰う金額)の1件。売上シートの月別タブ(タブ名「2026年6月」形式)
 * から読み取る。`ReferralInvoice`(#請求書=送客パートナーへ「払う」費用)とは対になる、逆方向のお金の流れ。
 */
export interface RevenueRecord {
  /**
   * 入金月(YYYY-MM)。タブ「2026年6月」(6月請求分)は7月末入金のため "2026-07" になる
   * (経営者は「7月末に入る187万」のように入金月で把握しているため、入金月ベースで集計する)。
   */
  month: string;
  /** 流入経路(送客パートナー名等) */
  inflowChannel: string;
  /** 紹介先企業名 */
  company: string;
  /** 求職者名(任意。シートに列があれば) */
  candidateName?: string;
  /** 金額(円) */
  amountYen: number;
}
