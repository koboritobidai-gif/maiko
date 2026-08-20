import { AREA_TO_PARTS, EXERCISES, GYM_EQUIPMENT, getExercise, isAvailableAt } from "./exercises";
import type {
  BodyPart,
  Exercise,
  Experience,
  Place,
  PlanItem,
  Plan,
  Profile,
  WorkoutDay,
} from "./types";

export const PLAN_WEEKS = 4;

/** 難易度の許容範囲（経験 × 強度） */
export function allowedDifficulty(exp: Experience, intensity: number): (1 | 2 | 3)[] {
  if (exp === "beginner") return intensity <= 2 ? [1] : [1, 2];
  if (exp === "intermediate") return intensity <= 2 ? [1, 2] : [1, 2, 3];
  return intensity <= 2 ? [1, 2] : [2, 3];
}

/** 強度から 1 種目あたりの秒数倍率 */
export function durationScale(intensity: number): number {
  // 1 → 0.75倍, 3 → 1.0倍, 5 → 1.3倍
  return 0.6 + intensity * 0.14;
}

/** 目標ごとのメインセット周回数 */
function roundsFor(goal: Profile["goal"], experience: Experience): number {
  if (goal === "build") return experience === "beginner" ? 2 : 3;
  if (goal === "lose") return 3;
  return 2;
}

/** 強度から休憩秒数 */
export function restSeconds(intensity: number, exp: Experience): number {
  const base = exp === "beginner" ? 25 : exp === "intermediate" ? 20 : 15;
  return Math.max(8, Math.round(base - (intensity - 1) * 3));
}

/** 目標に応じた部位ローテーション */
function focusRotation(goal: Profile["goal"], targets: BodyPart[]): BodyPart[] {
  const unique = Array.from(new Set(targets));
  const pool = unique.length > 0 ? unique : (["fullbody"] as BodyPart[]);

  if (goal === "lose") {
    // 有酸素を高頻度で挟む
    const out: BodyPart[] = [];
    pool.forEach((p, i) => {
      out.push(p);
      if (i % 2 === 1) out.push("cardio");
    });
    out.push("cardio");
    return out;
  }
  if (goal === "build") {
    // 部位を分割して回す。有酸素は控えめ
    return [...pool, ...pool, "cardio"];
  }
  // healthy: 全身をまんべんなく
  return [...pool, "fullbody", "cardio"];
}

/**
 * 曜日配分：休養日がまとまりすぎないように、頻度ごとの推奨パターンを使う。
 * （数値は週の何日目か。1 = 1日目）
 */
const WEEK_PATTERN: Record<number, number[]> = {
  1: [2],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 6],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

export function trainingDaysOfWeek(daysPerWeek: number): number[] {
  const n = Math.min(7, Math.max(1, Math.round(daysPerWeek)));
  return WEEK_PATTERN[n];
}

export interface PickOptions {
  focus: BodyPart;
  difficulties: (1 | 2 | 3)[];
  equipment: Set<string>;
  place: Place;
  count: number;
  /** 直近で使った種目 ID（連続で同じ種目が出ないように） */
  recent: string[];
  /** ばらつき用の決定的シード */
  seed: number;
}

function scoreExercise(e: Exercise, o: PickOptions): number {
  let score = 0;
  if (e.parts.includes(o.focus)) score += 100;
  // 主働筋がその部位の種目を優先する
  // （脚の日に「有酸素だけど脚も使う」種目ばかりが並ぶのを防ぐ）
  if (e.parts[0] === o.focus) score += 25;
  if (o.focus === "fullbody" && (e.parts.includes("cardio") || e.parts.length > 1)) score += 40;
  // ジムではマシン・バーベル種目を自重種目より優先する
  if (o.place === "gym" && e.place === "gym") score += 20;
  // 難易度が合わない種目は下げるが、部位が合うなら候補には残す
  if (!o.difficulties.includes(e.difficulty)) score -= 45;
  // 補助的に他部位も混ぜる
  if (e.parts.includes("abs")) score += 6;
  if (e.parts.includes("cardio")) score += 3;
  const idx = o.recent.indexOf(e.id);
  if (idx >= 0) score -= 80 - idx * 10;
  // 決定的な擬似ランダムで並びに変化をつける
  score += pseudoRandom(`${e.id}:${o.seed}`) * 12;
  return score;
}

/** 文字列から 0〜1 の決定的な値を返す（毎回同じ結果＝プランが安定する） */
export function pseudoRandom(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function pickExercises(o: PickOptions): Exercise[] {
  const equipOk = EXERCISES.filter(
    (e) =>
      e.phase === "main" &&
      isAvailableAt(e, o.place) &&
      e.equipment.every((eq) => o.equipment.has(eq)),
  );

  const rank = (list: Exercise[]) =>
    list
      .map((e) => ({ e, s: scoreExercise(e, o) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e);

  // 狙った部位の種目を最優先。難易度が外れていてもここでは残す
  // （＝「腹筋の日なのに腹筋種目がほとんど入らない」を防ぐ）
  const focused = rank(equipOk.filter((e) => e.parts.includes(o.focus)));

  const out: Exercise[] = [];
  for (const e of focused) {
    if (out.length >= o.count) break;
    out.push(e);
  }

  // その部位の種目だけでは 1 セットが短くなりすぎる場合のみ、他部位で補う。
  // 補充枠は日ごとに入れ替えて、毎回同じ種目が並ばないようにする
  const minPerRound = Math.min(o.count, 5);
  if (out.length < minPerRound) {
    const filler = equipOk
      .filter((e) => !out.some((x) => x.id === e.id))
      .map((e) => ({
        e,
        s:
          pseudoRandom(`${e.id}:fill:${o.seed}`) * 100 -
          (o.difficulties.includes(e.difficulty) ? 0 : 30),
      }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e);

    for (const e of filler) {
      if (out.length >= minPerRound) break;
      out.push(e);
    }
  }

  return out;
}

export function pickPhase(
  phase: "warmup" | "cooldown",
  equipment: Set<string>,
  count: number,
  seed: number,
  place: Place = "home",
): Exercise[] {
  const pool = EXERCISES.filter(
    (e) =>
      e.phase === phase &&
      isAvailableAt(e, place) &&
      e.equipment.every((eq) => equipment.has(eq)),
  );
  return pool
    .map((e) => ({ e, s: pseudoRandom(`${e.id}:${seed}`) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, count)
    .map((x) => x.e);
}

/**
 * 指定した時間にいちばん近づくセット数を選ぶ。
 * 単純な四捨五入だと 30分指定で 34分になることがあるので、
 * 切り上げ／切り捨ての両方を試して誤差の小さい方を採用する。
 */
export function chooseRounds(
  targetSec: number,
  warmCoolSec: number,
  roundSec: number,
  min = 2,
  max = 6,
): number {
  const budget = Math.max(0, targetSec - warmCoolSec);
  const raw = budget / Math.max(1, roundSec);
  const lo = Math.max(min, Math.min(max, Math.floor(raw)));
  const hi = Math.max(min, Math.min(max, Math.ceil(raw)));
  const err = (n: number) => Math.abs(warmCoolSec + n * roundSec - targetSec);
  return err(lo) <= err(hi) ? lo : hi;
}

/** MET から消費カロリーを算出 */
export function estimateKcal(met: number, seconds: number, weightKg: number): number {
  return (met * 3.5 * weightKg) / 200 / 60 * seconds;
}

export function dayKcal(items: PlanItem[], weightKg: number): number {
  return Math.round(
    items.reduce((sum, item) => {
      const ex = getExercise(item.exerciseId);
      if (!ex) return sum;
      return sum + estimateKcal(ex.met, item.seconds, weightKg);
    }, 0),
  );
}

export function dayTotalSeconds(items: PlanItem[]): number {
  return items.reduce((s, i) => s + i.seconds + i.restSec, 0);
}

function titleFor(focus: BodyPart, week: number): string {
  const labels: Record<BodyPart, string> = {
    abs: "腹筋ワークアウト",
    chest: "胸トレーニング",
    arms: "腕トレーニング",
    back: "背中トレーニング",
    shoulders: "肩トレーニング",
    legs: "脚トレーニング",
    glutes: "ヒップアップ",
    cardio: "カーディオトレーニング",
    fullbody: "全身サーキット",
  };
  return `${labels[focus]}｜${week}週目`;
}

/** プロフィールから 4 週間のプランを生成する */
export function generatePlan(profile: Profile): Plan {
  const weightKg = profile.weightKg ?? (profile.gender === "female" ? 55 : 68);
  const place = profile.place ?? "home";
  // ジムを選んだ人は常設の器具が全部使える前提にする
  const equipment = new Set<string>(
    place === "gym"
      ? ["none", ...GYM_EQUIPMENT, ...profile.equipment]
      : ["none", ...profile.equipment],
  );
  const difficulties = allowedDifficulty(profile.experience, profile.intensity);
  const scale = durationScale(profile.intensity);
  const rest = restSeconds(profile.intensity, profile.experience);

  const targetParts = profile.targets.flatMap((t) => AREA_TO_PARTS[t]);
  const rotation = focusRotation(profile.goal, targetParts);
  const trainingDays = trainingDaysOfWeek(profile.daysPerWeek);

  const days: WorkoutDay[] = [];
  const recent: string[] = [];
  let index = 0;
  let rotIdx = 0;

  for (let week = 1; week <= PLAN_WEEKS; week++) {
    // 週が進むごとに少しずつ負荷を上げる（漸進性過負荷）
    const weekScale = scale * (1 + (week - 1) * 0.08);

    for (let day = 1; day <= 7; day++) {
      const isTraining = trainingDays.includes(day);
      if (!isTraining) {
        days.push({
          id: `w${week}d${day}`,
          week,
          day,
          index: 0,
          title: "リカバリーデー",
          focus: "fullbody",
          items: [],
          rounds: 0,
          totalSec: 0,
          kcal: 0,
          isRest: true,
        });
        continue;
      }

      index += 1;
      const focus = rotation[rotIdx % rotation.length];
      rotIdx += 1;

      // 1回あたりの分数から種目数を決める
      const targetSec = profile.minutesPerSession * 60;
      // 1セットの種目数はしぼり、足りない分はセット数で埋める
      // （＝狙った部位に効かせつつ、指定した時間に収める）
      const avgItemSec = Math.round(38 * weekScale) + rest;
      const roughTotal = Math.max(4, Math.min(30, Math.round((targetSec - 150) / avgItemSec)));
      const baseRounds = roundsFor(profile.goal, profile.experience);
      const perRound = Math.max(3, Math.min(6, Math.round(roughTotal / baseRounds)));

      const warm = pickPhase("warmup", equipment, 2, index, place);
      const cool = pickPhase("cooldown", equipment, 2, index + 7, place);
      const main = pickExercises({
        focus,
        difficulties,
        equipment,
        place,
        count: perRound,
        recent,
        seed: index * 31 + week,
      });

      const warmCoolItems: PlanItem[] = [...warm, ...cool].map((e) => ({
        exerciseId: e.id,
        seconds: e.seconds ?? 30,
        restSec: 5,
      }));

      // 1セット分の中身（秒数・回数）を先に決める
      const roundTemplate = main.map((e, i) => {
        const base = e.seconds ?? 40;
        const seconds = Math.max(15, Math.round((base * weekScale) / 5) * 5);
        return {
          exerciseId: e.id,
          seconds,
          reps:
            e.measure === "reps" && e.reps
              ? Math.max(5, Math.round(e.reps * weekScale))
              : undefined,
          lastOfRound: i === main.length - 1,
        };
      });

      // 実際の秒数からセット数を逆算して、指定時間に近づける
      const warmCoolSec = dayTotalSeconds(warmCoolItems);
      const roundSec = roundTemplate.reduce((s, x) => s + x.seconds + rest, 0);
      const rounds = chooseRounds(targetSec, warmCoolSec, roundSec);

      main.forEach((e) => {
        recent.unshift(e.id);
      });
      recent.splice(12);

      const items: PlanItem[] = [
        ...warm.map<PlanItem>((e) => ({
          exerciseId: e.id,
          seconds: e.seconds ?? 30,
          restSec: 5,
        })),
        ...Array.from({ length: rounds }).flatMap((_, r) =>
          roundTemplate.map<PlanItem>((x) => ({
            exerciseId: x.exerciseId,
            seconds: x.seconds,
            reps: x.reps,
            // セットの最後だけ休憩を長めにとる
            restSec: x.lastOfRound && r < rounds - 1 ? rest + 20 : rest,
            round: r + 1,
          })),
        ),
        ...cool.map<PlanItem>((e) => ({
          exerciseId: e.id,
          seconds: e.seconds ?? 30,
          restSec: 5,
        })),
      ];

      days.push({
        id: `w${week}d${day}`,
        week,
        day,
        index,
        title: titleFor(focus, week),
        focus,
        items,
        rounds,
        totalSec: dayTotalSeconds(items),
        kcal: dayKcal(items, weightKg),
        isRest: false,
      });
    }
  }

  return {
    id: `plan-${profile.createdAt}`,
    createdAt: new Date().toISOString(),
    weeks: PLAN_WEEKS,
    days,
    profile,
  };
}

/** 週ごとの合計消費カロリー */
export function weekKcal(plan: Plan, week: number): number {
  return plan.days
    .filter((d) => d.week === week && !d.isRest)
    .reduce((s, d) => s + d.kcal, 0);
}

export function workoutDays(plan: Plan): WorkoutDay[] {
  return plan.days.filter((d) => !d.isRest);
}

/** メインセットの項目（ウォームアップ・クールダウンを除く） */
export function mainItems(day: WorkoutDay): PlanItem[] {
  return day.items.filter((i) => i.round !== undefined);
}

/** メインセットの種目数（セットの繰り返しは 1 と数える） */
export function uniqueMainCount(day: WorkoutDay): number {
  return new Set(mainItems(day).map((i) => i.exerciseId)).size;
}

/** 「6種目 × 3セット」のような表記 */
export function menuSummary(day: WorkoutDay): string {
  const unique = uniqueMainCount(day);
  return day.rounds > 1 ? `${unique}種目 × ${day.rounds}セット` : `${unique}種目`;
}
