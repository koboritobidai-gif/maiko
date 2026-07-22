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
  /** 最新メモ */
  latestNote: string;
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
  | "採用決定求職者数";

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

/** システム設定(スプレッドシート「設定」タブ相当)。 */
export interface Settings {
  /** 紹介手数料率(理論年収に対する割合)。成約の手数料自動計算に使用。 */
  feeRate: number;
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
  /** Slack の取得ステータス。 */
  slackStatus: SourceStatus;
}
