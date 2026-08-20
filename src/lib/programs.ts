import { EXERCISES, GYM_EQUIPMENT, isAvailableAt } from "./exercises";
import {
  allowedDifficulty,
  chooseRounds,
  dayKcal,
  dayTotalSeconds,
  durationScale,
  pickExercises,
  pickPhase,
  pseudoRandom,
  restSeconds,
} from "./plan";
import type {
  BodyPart,
  Equipment,
  Exercise,
  Experience,
  Place,
  PlanItem,
  Profile,
  VideoAsset,
  WorkoutDay,
} from "./types";

/**
 * テーマ別ワークアウト（プログラム）。
 * 1つのプログラムが「◯ワークアウト」＝ dayCount 日分のメニューを持ちます。
 * 中身はプラン生成と同じロジックで組むので、種目を足せば自動で反映されます。
 */
export interface Program {
  id: string;
  title: string;
  /** カードに出る短い説明 */
  subtitle: string;
  place: Place;
  /** 日ごとに狙う部位のローテーション */
  rotation: BodyPart[];
  /** 何ワークアウト入っているか */
  dayCount: number;
  minutesPerDay: number;
  level: Experience;
  intensity: number;
  /** ストレッチのみのプログラム */
  stretchOnly?: boolean;
  /** 追加で必要な器具（自宅プログラム用） */
  requires?: Equipment[];
  /** カードの配色 */
  tone: ProgramTone;
  /** naruによるプログラム紹介動画 */
  video: VideoAsset | null;
}

export type ProgramTone = "blue" | "mint" | "sunset" | "violet" | "slate" | "sand" | "forest";

export const PROGRAM_TONE_CLASS: Record<ProgramTone, string> = {
  blue: "from-brand-700 to-brand-500",
  mint: "from-teal-600 to-mint-400",
  sunset: "from-orange-500 to-rose-400",
  violet: "from-violet-600 to-indigo-400",
  slate: "from-slate-700 to-slate-500",
  sand: "from-amber-700 to-amber-400",
  forest: "from-emerald-700 to-emerald-400",
};

export const PROGRAMS: Program[] = [
  // ───────────── 自宅 ─────────────
  {
    id: "six-pack",
    title: "シックスパック",
    subtitle: "お腹を割るための腹筋集中プログラム",
    place: "home",
    rotation: ["abs"],
    dayCount: 7,
    minutesPerDay: 15,
    level: "intermediate",
    intensity: 4,
    tone: "slate",
    video: null,
  },
  {
    id: "fat-burn-hiit",
    title: "脂肪燃焼HIIT",
    subtitle: "短時間で追い込む高強度インターバル",
    place: "home",
    rotation: ["cardio"],
    dayCount: 12,
    minutesPerDay: 15,
    level: "intermediate",
    intensity: 5,
    tone: "sunset",
    video: null,
  },
  {
    id: "upper-body",
    title: "バキバキの上半身づくり",
    subtitle: "胸・背中・腕・肩をローテーションで",
    place: "home",
    rotation: ["chest", "back", "arms", "shoulders"],
    dayCount: 8,
    minutesPerDay: 20,
    level: "intermediate",
    intensity: 4,
    tone: "blue",
    video: null,
  },
  {
    id: "thigh-slim",
    title: "太もも引き締めルーチン",
    subtitle: "下半身をすっきりさせる5日間",
    place: "home",
    rotation: ["legs"],
    dayCount: 5,
    minutesPerDay: 15,
    level: "beginner",
    intensity: 3,
    tone: "mint",
    video: null,
  },
  {
    id: "hip-up",
    title: "ヒップアップ",
    subtitle: "お尻に集中して効かせる9日間",
    place: "home",
    rotation: ["glutes"],
    dayCount: 9,
    minutesPerDay: 15,
    level: "beginner",
    intensity: 3,
    tone: "violet",
    video: null,
  },
  {
    id: "full-body-reset",
    title: "全身リセット",
    subtitle: "運動を再開する人のための全身メニュー",
    place: "home",
    rotation: ["fullbody"],
    dayCount: 6,
    minutesPerDay: 15,
    level: "beginner",
    intensity: 2,
    tone: "forest",
    video: null,
  },
  {
    id: "recovery-stretch",
    title: "筋肉回復ストレッチ",
    subtitle: "トレーニング後・寝る前の10分",
    place: "home",
    rotation: ["fullbody"],
    dayCount: 9,
    minutesPerDay: 10,
    level: "beginner",
    intensity: 1,
    stretchOnly: true,
    tone: "sand",
    video: null,
  },
  {
    id: "dumbbell-home",
    title: "ダンベルワークアウト",
    subtitle: "ダンベル1組でできる全身プログラム",
    place: "home",
    rotation: ["arms", "shoulders", "back", "legs"],
    dayCount: 7,
    minutesPerDay: 20,
    level: "intermediate",
    intensity: 3,
    requires: ["dumbbell"],
    tone: "slate",
    video: null,
  },
  {
    id: "posture-fix",
    title: "姿勢改善プログラム",
    subtitle: "背中と肩を整えてデスクワークの猫背に",
    place: "home",
    rotation: ["back", "shoulders"],
    dayCount: 6,
    minutesPerDay: 15,
    level: "beginner",
    intensity: 2,
    tone: "mint",
    video: null,
  },

  // ───────────── ジム ─────────────
  {
    id: "gym-starter",
    title: "ジム初心者3日ルーティン",
    subtitle: "まずはこの3日。マシン中心で覚える",
    place: "gym",
    rotation: ["legs", "chest", "back"],
    dayCount: 3,
    minutesPerDay: 30,
    level: "beginner",
    intensity: 3,
    tone: "blue",
    video: null,
  },
  {
    id: "gym-chest",
    title: "胸を厚くする",
    subtitle: "ベンチプレスを軸にした胸の日",
    place: "gym",
    rotation: ["chest"],
    dayCount: 8,
    minutesPerDay: 30,
    level: "intermediate",
    intensity: 4,
    tone: "slate",
    video: null,
  },
  {
    id: "gym-back",
    title: "背中の広がりをつくる",
    subtitle: "引く種目で逆三角形を目指す",
    place: "gym",
    rotation: ["back"],
    dayCount: 8,
    minutesPerDay: 30,
    level: "intermediate",
    intensity: 4,
    tone: "forest",
    video: null,
  },
  {
    id: "gym-legs",
    title: "下半身強化",
    subtitle: "スクワットとレッグプレスで土台をつくる",
    place: "gym",
    rotation: ["legs", "glutes"],
    dayCount: 8,
    minutesPerDay: 30,
    level: "advanced",
    intensity: 4,
    tone: "sunset",
    video: null,
  },
  {
    id: "gym-shoulders",
    title: "肩を丸くする",
    subtitle: "三角筋を全方向から狙う",
    place: "gym",
    rotation: ["shoulders"],
    dayCount: 6,
    minutesPerDay: 20,
    level: "intermediate",
    intensity: 3,
    tone: "violet",
    video: null,
  },
  {
    id: "gym-arms",
    title: "腕を太くする",
    subtitle: "上腕二頭筋と三頭筋の集中日",
    place: "gym",
    rotation: ["arms"],
    dayCount: 6,
    minutesPerDay: 20,
    level: "intermediate",
    intensity: 3,
    tone: "sand",
    video: null,
  },
];

export const PROGRAM_MAP: Record<string, Program> = Object.fromEntries(
  PROGRAMS.map((p) => [p.id, p]),
);

export function getProgram(id: string): Program | undefined {
  return PROGRAM_MAP[id];
}

/**
 * プログラム内の 1 日分の ID。
 * URL のパスにそのまま入るので、パーセントエンコードされない文字（~）で区切る。
 */
export function programDayId(programId: string, dayIndex: number): string {
  return `p~${programId}~${dayIndex}`;
}

export function parseProgramDayId(rawId: string): { programId: string; dayIndex: number } | null {
  // useParams はエンコード済みの文字列を返すことがあるのでデコードしてから判定する
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // 不正なエスケープはそのまま扱う
  }
  if (!id.startsWith("p~")) return null;
  const [, programId, index] = id.split("~");
  const dayIndex = Number(index);
  if (!programId || !Number.isInteger(dayIndex)) return null;
  return { programId, dayIndex };
}

/** プログラムで使える器具 */
function equipmentFor(program: Program, profile: Profile | null): Set<string> {
  if (program.place === "gym") {
    return new Set<string>(["none", ...GYM_EQUIPMENT]);
  }
  return new Set<string>([
    "none",
    ...(program.requires ?? []),
    ...(profile?.equipment ?? []),
  ]);
}

/** ストレッチだけのメニューを組む */
function buildStretchDay(program: Program, dayIndex: number, weightKg: number): WorkoutDay {
  const pool = EXERCISES.filter(
    (e) => e.phase === "cooldown" && isAvailableAt(e, program.place),
  );
  const ordered = pool
    .map((e) => ({ e, s: pseudoRandom(`${e.id}:${program.id}:${dayIndex}`) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);

  const targetSec = program.minutesPerDay * 60;
  const items: PlanItem[] = [];
  let i = 0;
  while (dayTotalSeconds(items) < targetSec && i < 40) {
    const e = ordered[i % ordered.length];
    items.push({ exerciseId: e.id, seconds: e.seconds ?? 40, restSec: 10, round: 1 });
    i += 1;
  }

  return {
    id: programDayId(program.id, dayIndex),
    week: 1,
    day: dayIndex + 1,
    index: dayIndex + 1,
    title: `${program.title}｜Day ${dayIndex + 1}`,
    focus: "fullbody",
    items,
    rounds: 1,
    totalSec: dayTotalSeconds(items),
    kcal: dayKcal(items, weightKg),
    isRest: false,
  };
}

/**
 * プログラムの 1 日分を組み立てる。
 * プロフィールがあれば体重だけ反映し、メニュー自体はプログラムの設定に従う
 * （＝誰が見ても同じ内容になるので、共有・説明がしやすい）。
 */
export function buildProgramDay(
  program: Program,
  dayIndex: number,
  profile: Profile | null,
): WorkoutDay {
  const weightKg = profile?.weightKg ?? (profile?.gender === "female" ? 55 : 68);
  if (program.stretchOnly) return buildStretchDay(program, dayIndex, weightKg);

  const equipment = equipmentFor(program, profile);
  const difficulties = allowedDifficulty(program.level, program.intensity);
  const scale = durationScale(program.intensity);
  const rest = restSeconds(program.intensity, program.level);
  const focus = program.rotation[dayIndex % program.rotation.length];
  const seed = dayIndex * 17 + program.title.length;

  const targetSec = program.minutesPerDay * 60;
  const avgItemSec = Math.round(38 * scale) + rest;
  const roughTotal = Math.max(4, Math.min(30, Math.round((targetSec - 150) / avgItemSec)));
  const perRound = Math.max(3, Math.min(6, Math.round(roughTotal / 3)));

  const warm = pickPhase("warmup", equipment, 2, seed, program.place);
  const cool = pickPhase("cooldown", equipment, 2, seed + 7, program.place);
  const main: Exercise[] = pickExercises({
    focus,
    difficulties,
    equipment,
    place: program.place,
    count: perRound,
    recent: [],
    seed,
  });

  const warmCool: PlanItem[] = [...warm, ...cool].map((e) => ({
    exerciseId: e.id,
    seconds: e.seconds ?? 30,
    restSec: 5,
  }));

  const template = main.map((e, i) => ({
    exerciseId: e.id,
    seconds: Math.max(15, Math.round(((e.seconds ?? 40) * scale) / 5) * 5),
    reps: e.measure === "reps" && e.reps ? Math.max(5, Math.round(e.reps * scale)) : undefined,
    lastOfRound: i === main.length - 1,
  }));

  const roundSec = template.reduce((s, x) => s + x.seconds + rest, 0);
  const rounds = chooseRounds(targetSec, dayTotalSeconds(warmCool), roundSec);

  const items: PlanItem[] = [
    ...warm.map<PlanItem>((e) => ({ exerciseId: e.id, seconds: e.seconds ?? 30, restSec: 5 })),
    ...Array.from({ length: rounds }).flatMap((_, r) =>
      template.map<PlanItem>((x) => ({
        exerciseId: x.exerciseId,
        seconds: x.seconds,
        reps: x.reps,
        restSec: x.lastOfRound && r < rounds - 1 ? rest + 20 : rest,
        round: r + 1,
      })),
    ),
    ...cool.map<PlanItem>((e) => ({ exerciseId: e.id, seconds: e.seconds ?? 30, restSec: 5 })),
  ];

  return {
    id: programDayId(program.id, dayIndex),
    week: 1,
    day: dayIndex + 1,
    index: dayIndex + 1,
    title: `${program.title}｜Day ${dayIndex + 1}`,
    focus,
    items,
    rounds,
    totalSec: dayTotalSeconds(items),
    kcal: dayKcal(items, weightKg),
    isRest: false,
  };
}

export function buildProgramDays(program: Program, profile: Profile | null): WorkoutDay[] {
  return Array.from({ length: program.dayCount }, (_, i) =>
    buildProgramDay(program, i, profile),
  );
}

/** 収録されているワークアウトの総数 */
export function totalWorkoutCount(): number {
  return PROGRAMS.reduce((s, p) => s + p.dayCount, 0);
}

export function programsAt(place: Place): Program[] {
  return PROGRAMS.filter((p) => p.place === place);
}
