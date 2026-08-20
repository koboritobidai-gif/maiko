"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generatePlan } from "@/lib/plan";
import { calcStreak, todayKey } from "@/lib/format";
import type { AppState, CardioLog, Plan, Profile, WorkoutLog } from "@/lib/types";

const STORAGE_KEY = "naru-tore:v2";

const INITIAL: AppState = {
  profile: null,
  plan: null,
  logs: [],
  weights: [],
  weightGoalKg: null,
  water: {},
  waterGoal: 8,
  cardioLogs: [],
  settings: { sound: true, vibration: true, countdownSec: 3 },
};

interface Store {
  /** localStorage の読み込みが済むまで false */
  ready: boolean;
  state: AppState;
  setProfile: (p: Profile) => Plan;
  updateProfile: (patch: Partial<Profile>) => void;
  addLog: (log: WorkoutLog) => void;
  addWeight: (kg: number) => void;
  setWeightGoal: (kg: number | null) => void;
  addWater: (delta: number) => void;
  setWaterGoal: (cups: number) => void;
  addCardioLog: (log: CardioLog) => void;
  setSettings: (patch: Partial<AppState["settings"]>) => void;
  resetAll: () => void;
  /** 派生値 */
  streak: number;
  completedIds: Set<string>;
  totalKcal: number;
  totalSeconds: number;
}

const StoreContext = createContext<Store | null>(null);

function load(): AppState {
  if (typeof window === "undefined") return INITIAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...INITIAL,
      ...parsed,
      settings: { ...INITIAL.settings, ...(parsed.settings ?? {}) },
      logs: parsed.logs ?? [],
      weights: parsed.weights ?? [],
      water: parsed.water ?? {},
      waterGoal: parsed.waterGoal ?? INITIAL.waterGoal,
      cardioLogs: parsed.cardioLogs ?? [],
      weightGoalKg: parsed.weightGoalKg ?? null,
    };
  } catch {
    return INITIAL;
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ストレージが使えない環境（プライベートモード等）では黙って続行
    }
  }, [state, ready]);

  const setProfile = useCallback((profile: Profile) => {
    const plan = generatePlan(profile);
    setState((s) => ({ ...s, profile, plan }));
    return plan;
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setState((s) => {
      if (!s.profile) return s;
      const profile = { ...s.profile, ...patch };
      return { ...s, profile, plan: generatePlan(profile) };
    });
  }, []);

  const addLog = useCallback((log: WorkoutLog) => {
    setState((s) => {
      const rest = s.logs.filter((l) => !(l.dayId === log.dayId && l.date === log.date));
      return { ...s, logs: [...rest, log].sort((a, b) => a.date.localeCompare(b.date)) };
    });
  }, []);

  const addWeight = useCallback((kg: number) => {
    const date = todayKey();
    setState((s) => {
      const rest = s.weights.filter((w) => w.date !== date);
      const weights = [...rest, { date, kg }].sort((a, b) => a.date.localeCompare(b.date));
      const profile = s.profile ? { ...s.profile, weightKg: kg } : s.profile;
      return { ...s, weights, profile };
    });
  }, []);

  const setWeightGoal = useCallback((kg: number | null) => {
    setState((s) => ({ ...s, weightGoalKg: kg }));
  }, []);

  const addWater = useCallback((delta: number) => {
    const date = todayKey();
    setState((s) => {
      const next = Math.max(0, Math.min(20, (s.water[date] ?? 0) + delta));
      return { ...s, water: { ...s.water, [date]: next } };
    });
  }, []);

  const setWaterGoal = useCallback((cups: number) => {
    setState((s) => ({ ...s, waterGoal: Math.max(1, Math.min(20, cups)) }));
  }, []);

  const addCardioLog = useCallback((log: CardioLog) => {
    setState((s) => ({ ...s, cardioLogs: [...s.cardioLogs, log] }));
  }, []);

  const setSettings = useCallback((patch: Partial<AppState["settings"]>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const resetAll = useCallback(() => {
    setState(INITIAL);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // noop
    }
  }, []);

  const value = useMemo<Store>(() => {
    const completedIds = new Set(state.logs.map((l) => l.dayId));
    const activeDates = [
      ...state.logs.map((l) => l.date),
      ...state.cardioLogs.map((l) => l.date),
    ];
    return {
      ready,
      state,
      setProfile,
      updateProfile,
      addLog,
      addWeight,
      setWeightGoal,
      addWater,
      setWaterGoal,
      addCardioLog,
      setSettings,
      resetAll,
      streak: calcStreak(activeDates),
      completedIds,
      totalKcal:
        state.logs.reduce((s, l) => s + l.kcal, 0) +
        state.cardioLogs.reduce((s, l) => s + l.kcal, 0),
      totalSeconds:
        state.logs.reduce((s, l) => s + l.seconds, 0) +
        state.cardioLogs.reduce((s, l) => s + l.seconds, 0),
    };
  }, [
    ready,
    state,
    setProfile,
    updateProfile,
    addLog,
    addWeight,
    setWeightGoal,
    addWater,
    setWaterGoal,
    addCardioLog,
    setSettings,
    resetAll,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore は AppStoreProvider の中で使ってください");
  return ctx;
}
