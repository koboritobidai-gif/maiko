import { buildProgramDay, getProgram, parseProgramDayId } from "./programs";
import type { AppState, WorkoutDay } from "./types";

/**
 * ワークアウトIDから内容を解決する。
 * - `w1d3` … 4週間プランの中の1日
 * - `p:six-pack:0` … テーマ別プログラムの1日
 */
export function resolveWorkout(id: string, state: AppState): WorkoutDay | undefined {
  const program = parseProgramDayId(id);
  if (program) {
    const def = getProgram(program.programId);
    if (!def || program.dayIndex < 0 || program.dayIndex >= def.dayCount) return undefined;
    return buildProgramDay(def, program.dayIndex, state.profile);
  }
  let planId = id;
  try {
    planId = decodeURIComponent(id);
  } catch {
    // 不正なエスケープはそのまま扱う
  }
  return state.plan?.days.find((d) => d.id === planId && !d.isRest);
}

/** そのワークアウトが属するプログラム（プランの日なら null） */
export function workoutProgram(id: string) {
  const parsed = parseProgramDayId(id);
  if (!parsed) return null;
  const def = getProgram(parsed.programId);
  return def ? { program: def, dayIndex: parsed.dayIndex } : null;
}
