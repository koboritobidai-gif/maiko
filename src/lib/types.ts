/** ドメインモデル定義 */

export type Gender = "male" | "female" | "other";

export type AgeBand = "u25" | "a25_35" | "a35_45" | "a45p";

/** トレーニング経験 */
export type Experience = "beginner" | "intermediate" | "advanced";

/** 目標 */
export type Goal = "lose" | "build" | "healthy";

/** 部位 */
export type BodyPart =
  | "abs"
  | "chest"
  | "arms"
  | "back"
  | "shoulders"
  | "legs"
  | "glutes"
  | "cardio"
  | "fullbody";

/** ターゲットグループ（オンボーディングで選ぶ大まかな部位） */
export type TargetArea = "abs" | "chest" | "armsBack" | "hipsLegs" | "fullbody";

/** 器具 */
export type Equipment =
  | "none"
  | "chair"
  | "mat"
  | "dumbbell"
  | "band"
  // ここから下はジム想定
  | "barbell"
  | "machine"
  | "cable"
  | "bench"
  | "pullupBar";

/** トレーニング場所 */
export type Place = "home" | "gym";

/** エクササイズの計測方法 */
export type MeasureType = "time" | "reps";

export interface Exercise {
  id: string;
  /** 日本語名（アプリ表示用） */
  name: string;
  /** 英語名（動画ファイル名・検索用） */
  nameEn: string;
  parts: BodyPart[];
  equipment: Equipment[];
  /** どこでできる種目か。"both" は自宅でもジムでも */
  place: Place | "both";
  /** 1=やさしい 2=ふつう 3=きつい */
  difficulty: 1 | 2 | 3;
  measure: MeasureType;
  /** ワークアウト内での役割 */
  phase: "warmup" | "main" | "cooldown";
  /** 標準の秒数（measure === "time"） */
  seconds?: number;
  /** 標準の回数（measure === "reps"） */
  reps?: number;
  /** METs：消費カロリー計算に使用 */
  met: number;
  /** 左右交互に行う種目か */
  unilateral?: boolean;
  /** フォームのポイント */
  cues: string[];
  /** よくあるミス */
  mistakes: string[];
  /** 呼吸 */
  breathing: string;
  /**
   * naru本人のお手本動画。未撮影の間は null。
   * 撮影でき次第 /videos/{id}.mp4 を置いてここを埋めるだけで
   * 実行画面・種目詳細の両方に反映されます。
   */
  video: VideoAsset | null;
}

export interface VideoAsset {
  /** mp4 などの動画ソース */
  src: string;
  /** 動画読み込み前に表示する静止画 */
  poster?: string;
  /** 撮影者・補足（例: "naru / 正面アングル"） */
  caption?: string;
}

export interface Profile {
  gender: Gender;
  ageBand: AgeBand;
  experience: Experience;
  goal: Goal;
  targets: TargetArea[];
  equipment: Equipment[];
  /** 1〜5。プランの強度 */
  intensity: number;
  /** 週あたりのトレーニング日数 */
  daysPerWeek: number;
  /** 1回あたりの目安（分） */
  minutesPerSession: number;
  /** ふだんトレーニングする場所 */
  place: Place;
  /** 体重(kg)。消費カロリー計算に使用。未入力なら null */
  weightKg: number | null;
  /** 身長(cm)。未入力なら null */
  heightCm: number | null;
  createdAt: string;
}

/** プラン内の 1 種目 */
export interface PlanItem {
  exerciseId: string;
  /** 実施秒数（measure が reps の場合も目安時間として使う） */
  seconds: number;
  reps?: number;
  /** 種目後の休憩秒数 */
  restSec: number;
  /** 何セット目か（メインセットのみ。1始まり） */
  round?: number;
}

/** 1 日分のワークアウト */
export interface WorkoutDay {
  /** 例: "w1d3" */
  id: string;
  week: number;
  /** 1〜7 */
  day: number;
  /** 通し番号（1週目1日目 = 1） */
  index: number;
  title: string;
  focus: BodyPart;
  items: PlanItem[];
  /** メインセットの周回数 */
  rounds: number;
  /** 合計秒数（休憩込み） */
  totalSec: number;
  /** 推定消費カロリー */
  kcal: number;
  isRest: boolean;
}

export interface Plan {
  id: string;
  createdAt: string;
  weeks: number;
  days: WorkoutDay[];
  profile: Profile;
}

/** 完了記録 */
export interface WorkoutLog {
  dayId: string;
  /** ISO 日付（YYYY-MM-DD） */
  date: string;
  completedAt: string;
  seconds: number;
  kcal: number;
  /** 完了した種目数 / 全種目数 */
  done: number;
  total: number;
  /** 体感のきつさ 1〜5 */
  rpe?: number;
}

/** ウォーキング／ランニングの記録 */
export interface CardioLog {
  id: string;
  /** ISO 日付（YYYY-MM-DD） */
  date: string;
  completedAt: string;
  mode: "walk" | "run";
  seconds: number;
  meters: number;
  kcal: number;
  /** 通過した座標（ルートの形の描画用） */
  path: { lat: number; lng: number }[];
}

export interface AppState {
  profile: Profile | null;
  plan: Plan | null;
  logs: WorkoutLog[];
  /** 体重記録 */
  weights: { date: string; kg: number }[];
  /** 目標体重(kg)。未設定なら null */
  weightGoalKg: number | null;
  /** 水分記録（日付 → 杯数） */
  water: Record<string, number>;
  /** 1日の水分目標（杯） */
  waterGoal: number;
  /** ウォーキング・ランニングの記録 */
  cardioLogs: CardioLog[];
  /** 設定 */
  settings: {
    sound: boolean;
    vibration: boolean;
    countdownSec: number;
  };
}
