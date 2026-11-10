"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExerciseMedia } from "@/components/exercise-media";
import {
  CheckIcon,
  ClockIcon,
  CloseIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  SlidersIcon,
} from "@/components/icons";
import { Button, Card, ProgressRing, ToggleRow, cx } from "@/components/ui";
import { getExercise } from "@/lib/exercises";
import { beep, unlockAudio, vibrate } from "@/lib/feedback";
import { formatClock, todayKey } from "@/lib/format";
import { estimateKcal } from "@/lib/plan";
import { resolveWorkout } from "@/lib/workout";
import { useStore } from "@/store/app-store";
import type { Exercise, PlanItem } from "@/lib/types";

type Phase = "countdown" | "exercise" | "rest" | "paused";

export default function WorkoutPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, state, addLog } = useStore();

  const day = useMemo(() => resolveWorkout(id, state), [id, state]);
  const items = useMemo(() => day?.items ?? [], [day]);
  const sound = state.settings.sound;
  const haptics = state.settings.vibration;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [remaining, setRemaining] = useState(state.settings.countdownSec);
  const [elapsed, setElapsed] = useState(0);
  const [showQuit, setShowQuit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const prevPhase = useRef<Phase>("countdown");
  const finished = useRef(false);

  const item: PlanItem | undefined = items[index];
  const exercise: Exercise | undefined = item ? getExercise(item.exerciseId) : undefined;
  const isRepsBased = exercise?.measure === "reps";

  /* ── 経過時間カウンタ ── */
  useEffect(() => {
    if (phase === "paused") return;
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  /* ── フェーズごとのカウントダウン ── */
  useEffect(() => {
    if (phase === "paused") return;
    if (phase === "exercise" && isRepsBased) return; // 回数種目は自動で進めない

    const t = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) return 0;
        if (r <= 4 && r > 1) beep("tick", sound);
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, isRepsBased, sound, index]);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex >= items.length) return;
      const nextItem = items[nextIndex];
      setIndex(nextIndex);
      setPhase("exercise");
      setRemaining(nextItem.seconds);
      beep("go", sound);
      vibrate(40, haptics);
    },
    [items, sound, haptics],
  );

  const complete = useCallback(() => {
    if (finished.current || !day) return;
    finished.current = true;
    const kcal = Math.round(
      items.reduce((sum, it, i) => {
        if (i > index) return sum;
        const ex = getExercise(it.exerciseId);
        return ex ? sum + estimateKcal(ex.met, it.seconds, state.profile?.weightKg ?? 62) : sum;
      }, 0),
    );
    addLog({
      dayId: day.id,
      date: todayKey(),
      completedAt: new Date().toISOString(),
      seconds: elapsed,
      kcal,
      done: index + 1,
      total: items.length,
    });
    beep("finish", sound);
    vibrate([60, 60, 120], haptics);
    router.replace(`/workout/${day.id}/complete`);
  }, [day, items, index, elapsed, addLog, router, sound, haptics, state.profile]);

  /* ── 残り 0 になったときの遷移 ── */
  useEffect(() => {
    if (remaining > 0 || phase === "paused") return;

    if (phase === "countdown") {
      goTo(0);
      return;
    }
    if (phase === "exercise") {
      const last = index >= items.length - 1;
      if (last) {
        complete();
        return;
      }
      if (item && item.restSec > 0) {
        setPhase("rest");
        setRemaining(item.restSec);
        beep("rest", sound);
        vibrate(30, haptics);
      } else {
        goTo(index + 1);
      }
      return;
    }
    if (phase === "rest") {
      goTo(index + 1);
    }
  }, [remaining, phase, index, items.length, item, goTo, complete, sound, haptics]);

  /* ── 種目を手動で完了（回数種目・スキップ） ── */
  const advance = () => {
    if (index >= items.length - 1) {
      complete();
      return;
    }
    if (item && item.restSec > 0) {
      setPhase("rest");
      setRemaining(item.restSec);
      beep("rest", sound);
    } else {
      goTo(index + 1);
    }
  };

  const goPrev = () => {
    if (index === 0) {
      setRemaining(items[0].seconds);
      setPhase("exercise");
      return;
    }
    goTo(index - 1);
  };

  const togglePause = () => {
    if (phase === "paused") {
      setPhase(prevPhase.current);
    } else {
      prevPhase.current = phase;
      setPhase("paused");
    }
  };

  if (!ready) return <div className="grid min-h-dvh place-items-center text-ink-muted">読み込み中…</div>;

  if (!day || day.isRest || items.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-bold">このワークアウトは見つかりませんでした</p>
        <Link href="/" className="font-bold text-brand-600">
          ホームへ戻る
        </Link>
      </div>
    );
  }

  /* ── カウントダウン画面 ── */
  if (phase === "countdown") {
    return (
      <div
        className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-700 to-brand-500 text-white"
        onPointerDown={unlockAudio}
      >
        <div className="text-center">
          <p className="text-[15px] font-semibold text-mint-300">まもなくスタート</p>
          <p className="tnum mt-2 text-[96px] font-bold leading-none animate-pop" key={remaining}>
            {remaining}
          </p>
          <p className="mt-4 text-[15px] text-white/80">
            最初の種目：{getExercise(items[0].exerciseId)?.name}
          </p>
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              goTo(0);
            }}
            className="mt-8 rounded-full bg-white/15 px-6 py-2.5 text-sm font-bold transition-colors hover:bg-white/25"
          >
            すぐ始める
          </button>
        </div>
      </div>
    );
  }

  const total = items.length;
  const activePhase = phase === "paused" ? prevPhase.current : phase;
  const isResting = activePhase === "rest";
  const nextExercise = items[index + 1] ? getExercise(items[index + 1].exerciseId) : undefined;

  /* ── 休憩画面 ── */
  if (isResting && exercise) {
    return (
      <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-800 to-brand-600 text-white">
        <PlayerHeader
          index={index}
          total={total}
          elapsed={elapsed}
          onQuit={() => setShowQuit(true)}
          onSettings={() => setShowSettings(true)}
          light
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-[15px] font-semibold text-mint-300">休憩</p>
          <ProgressRing
            value={item ? remaining / item.restSec : 0}
            size={200}
            stroke={10}
            trackClass="text-white/15"
            barClass="text-mint-400"
          >
            <span className="tnum text-[56px] font-bold leading-none">{remaining}</span>
          </ProgressRing>

          {nextExercise && (
            <div className="w-full">
              <p className="mb-2 text-[13px] text-white/70">次の種目</p>
              <Card tone="none" className="flex items-center gap-3 bg-white/12 p-3 text-left shadow-none">
                <ExerciseMedia exercise={nextExercise} compact className="size-14 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-bold text-white">{nextExercise.name}</p>
                  <p className="tnum text-[12px] text-white/70">
                    {items[index + 1].reps
                      ? `${items[index + 1].reps}回`
                      : `${items[index + 1].seconds}秒`}
                  </p>
                </div>
              </Card>
            </div>
          )}

          <div className="flex w-full gap-2">
            <Button
              variant="translucent"
              size="lg"
              onClick={() => setRemaining((r) => r + 20)}
              className="flex-1"
            >
              +20秒
            </Button>
            <Button size="lg" variant="light" onClick={() => goTo(index + 1)} className="flex-1 shadow-none">
              スキップ
            </Button>
          </div>
        </div>
        {showQuit && <QuitDialog onCancel={() => setShowQuit(false)} onQuit={() => router.push("/")} onSave={complete} />}
        {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  if (!exercise || !item) return null;

  /* ── 種目実行画面 ── */
  const progress = isRepsBased ? 1 : item.seconds ? remaining / item.seconds : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PlayerHeader
        index={index}
        total={total}
        elapsed={elapsed}
        onQuit={() => setShowQuit(true)}
        onSettings={() => setShowSettings(true)}
      />

      <div className="flex flex-1 flex-col justify-center">
        <ExerciseMedia
          exercise={exercise}
          className="mx-4 aspect-[4/3] w-[calc(100%-2rem)] shrink-0"
        />

        <div className="px-5 pb-2 pt-5 text-center">
          <p className="text-[13px] font-semibold text-brand-600">
            {exercise.phase === "warmup"
              ? "ウォームアップ"
              : exercise.phase === "cooldown"
                ? "クールダウン"
                : item.round && day.rounds > 1
                  ? `${item.round}セット目 / ${day.rounds}`
                  : "メインセット"}
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight">
            {exercise.name}
            {exercise.unilateral && <span className="ml-1 text-[13px] text-ink-muted">（左右）</span>}
          </h1>

          {isRepsBased ? (
            <p className="tnum mt-2 text-[52px] font-bold leading-none text-brand-600">
              {item.reps}
              <span className="ml-1 text-[22px]">回</span>
            </p>
          ) : (
            <p
              className={cx(
                "tnum mt-2 text-[52px] font-bold leading-none tabular-nums transition-colors",
                remaining <= 3 ? "text-orange-500" : "text-brand-600",
              )}
            >
              {formatClock(remaining)}
            </p>
          )}

          {!isRepsBased && (
            <div className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* フォームのポイント */}
        <div className="mt-2 px-4">
          <Card className="space-y-1.5 p-4 shadow-none ring-1 ring-line">
            <p className="text-[12px] font-bold text-ink-muted">フォームのポイント</p>
            {exercise.cues.slice(0, 2).map((c) => (
              <p key={c} className="flex gap-1.5 text-[13.5px] leading-relaxed">
                <span className="text-brand-600">・</span>
                {c}
              </p>
            ))}
            <p className="pt-1 text-[12.5px] text-ink-muted">呼吸：{exercise.breathing}</p>
          </Card>
        </div>
      </div>

      {/* 操作バー */}
      <div
        className="sticky bottom-0 border-t border-line bg-white px-6 py-3"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={goPrev}
            aria-label="前の種目"
            className="grid size-12 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:bg-canvas"
          >
            <PrevIcon className="size-5" />
          </button>

          <button
            type="button"
            onClick={isRepsBased ? advance : togglePause}
            aria-label={isRepsBased ? "この種目を完了" : phase === "paused" ? "再開" : "一時停止"}
            className="grid h-14 w-32 place-items-center rounded-full bg-brand-600 text-white shadow-[var(--shadow-float)] transition-colors hover:bg-brand-700 active:bg-brand-800"
          >
            {isRepsBased ? (
              <CheckIcon className="size-7" strokeWidth={2.6} />
            ) : phase === "paused" ? (
              <PlayIcon className="size-6" />
            ) : (
              <PauseIcon className="size-6" />
            )}
          </button>

          <button
            type="button"
            onClick={advance}
            aria-label="次の種目"
            className="grid size-12 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:bg-canvas"
          >
            <NextIcon className="size-5" />
          </button>
        </div>
        {!isRepsBased && (
          <p className="mt-2 text-center text-[12px] text-ink-muted">
            {phase === "paused" ? "一時停止中 — タップで再開" : "タップで一時停止"}
          </p>
        )}
      </div>

      {showQuit && (
        <QuitDialog onCancel={() => setShowQuit(false)} onQuit={() => router.push("/")} onSave={complete} />
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/* ─────────────── ヘッダー ─────────────── */

function PlayerHeader({
  index,
  total,
  elapsed,
  onQuit,
  onSettings,
  light = false,
}: {
  index: number;
  total: number;
  elapsed: number;
  onQuit: () => void;
  onSettings: () => void;
  light?: boolean;
}) {
  return (
    <header className={cx("px-4 pt-4", light && "text-white")}>
      <div
        className={cx(
          "h-1.5 w-full overflow-hidden rounded-full",
          light ? "bg-white/20" : "bg-brand-100",
        )}
      >
        <div
          className={cx(
            "h-full rounded-full transition-[width] duration-500",
            light ? "bg-mint-400" : "bg-brand-600",
          )}
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onQuit}
          aria-label="ワークアウトを終了"
          className={cx(
            "grid size-9 place-items-center rounded-full transition-colors",
            light ? "bg-white/15 hover:bg-white/25" : "bg-canvas text-ink-soft hover:bg-brand-50",
          )}
        >
          <CloseIcon className="size-5" />
        </button>
        <div className="text-center">
          <p className="tnum text-[14px] font-bold">
            エクササイズ {index + 1} / {total}
          </p>
          <p
            className={cx(
              "tnum flex items-center justify-center gap-1 text-[12px]",
              light ? "text-white/70" : "text-ink-muted",
            )}
          >
            <ClockIcon className="size-3.5" />
            {formatClock(elapsed)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSettings}
          aria-label="サウンド設定"
          className={cx(
            "grid size-9 place-items-center rounded-full transition-colors",
            light ? "bg-white/15 hover:bg-white/25" : "bg-canvas text-ink-soft hover:bg-brand-50",
          )}
        >
          <SlidersIcon className="size-5" />
        </button>
      </div>
    </header>
  );
}

/* ─────────────── 終了確認 ─────────────── */

function QuitDialog({
  onCancel,
  onQuit,
  onSave,
}: {
  onCancel: () => void;
  onQuit: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-4 sm:place-items-center">
      <Card className="animate-rise w-full max-w-[26rem] p-5">
        <p className="text-[17px] font-bold">ワークアウトを終了しますか？</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          ここまでの記録を残して終わることもできます。
        </p>
        <div className="mt-4 grid gap-2">
          <Button onClick={onSave}>ここまでを記録して終了</Button>
          <Button variant="secondary" onClick={onQuit}>
            記録せずに終了
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            続ける
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ─────────────── サウンド設定 ─────────────── */

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { state, setSettings } = useStore();
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-4 sm:place-items-center" onClick={onClose}>
      <Card
        className="animate-rise w-full max-w-[26rem] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[17px] font-bold">サウンドと振動</p>
        <div className="mt-4 space-y-1">
          <ToggleRow
            label="カウント音"
            checked={state.settings.sound}
            onChange={(v) => setSettings({ sound: v })}
          />
          <ToggleRow
            label="バイブレーション"
            checked={state.settings.vibration}
            onChange={(v) => setSettings({ vibration: v })}
          />
        </div>
        <Button className="mt-5 w-full" onClick={onClose}>
          閉じる
        </Button>
      </Card>
    </div>
  );
}
