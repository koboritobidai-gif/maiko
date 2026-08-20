"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, ClockIcon, FlameIcon, TargetIcon, TrophyIcon } from "@/components/icons";
import { Button, ButtonLink, Card, StatChip, cx } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { useStore } from "@/store/app-store";

const RPE_OPTIONS = [
  { value: 1, label: "余裕だった", hint: "強度を上げましょう" },
  { value: 2, label: "少し楽だった", hint: "少し上げてもOK" },
  { value: 3, label: "ちょうどよかった", hint: "この強度をキープ" },
  { value: 4, label: "きつかった", hint: "この強度で慣らしましょう" },
  { value: 5, label: "かなりきつかった", hint: "強度を下げましょう" },
];

export default function WorkoutCompletePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, state, addLog, updateProfile, streak } = useStore();
  const [rpe, setRpe] = useState<number | null>(null);
  const [adjusted, setAdjusted] = useState(false);

  if (!ready) return <div className="grid min-h-dvh place-items-center text-ink-muted">読み込み中…</div>;

  const log = [...state.logs].reverse().find((l) => l.dayId === id);
  const day = state.plan?.days.find((d) => d.id === id);

  if (!log || !day) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-bold">記録が見つかりませんでした</p>
        <ButtonLink href="/">ホームへ戻る</ButtonLink>
      </div>
    );
  }

  const selectRpe = (value: number) => {
    setRpe(value);
    addLog({ ...log, rpe: value });
  };

  const applyAdjustment = () => {
    if (!rpe || !state.profile) return;
    const delta = rpe <= 2 ? 1 : rpe >= 5 ? -1 : 0;
    if (delta !== 0) {
      const next = Math.min(5, Math.max(1, state.profile.intensity + delta));
      updateProfile({ intensity: next });
    }
    setAdjusted(true);
  };

  const suggestion = rpe ? RPE_OPTIONS.find((o) => o.value === rpe) : null;
  const canAdjust = rpe !== null && (rpe <= 2 || rpe >= 5);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 px-5 pt-10 text-white">
      <div className="flex flex-col items-center text-center">
        <span className="animate-pop grid size-20 place-items-center rounded-full bg-mint-400 text-brand-800">
          <CheckIcon className="size-10" strokeWidth={3} />
        </span>
        <h1 className="mt-5 text-[28px] font-bold tracking-tight">おつかれさまでした！</h1>
        <p className="mt-1 text-[14px] text-white/80">{day.title.split("｜")[0]} を完了しました</p>
      </div>

      <div className="mt-7 flex gap-2">
        <StatChip icon={<ClockIcon className="size-4" />} label="トレーニング時間" value={formatDuration(log.seconds)} />
        <StatChip icon={<FlameIcon className="size-4" />} label="消費カロリー" value={`${log.kcal}kcal`} />
        <StatChip icon={<TargetIcon className="size-4" />} label="完了した種目" value={`${log.done}/${log.total}`} />
      </div>

      {streak > 0 && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white/12 py-3">
          <TrophyIcon className="size-5 text-mint-300" />
          <p className="text-[14px] font-bold">
            <span className="tnum">{streak}</span>日連続で継続中！
          </p>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2.5 text-[14px] font-bold">今日の強度はどうでしたか？</p>
        <div className="space-y-2">
          {RPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => selectRpe(o.value)}
              aria-pressed={rpe === o.value}
              className={cx(
                "flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                rpe === o.value
                  ? "border-mint-400 bg-white/18"
                  : "border-white/20 bg-white/8 hover:bg-white/14",
              )}
            >
              <span className="font-semibold">{o.label}</span>
              {rpe === o.value && <CheckIcon className="size-5 text-mint-300" strokeWidth={3} />}
            </button>
          ))}
        </div>

        {suggestion && (
          <Card tone="none" className="animate-rise mt-3 bg-white/12 p-4 shadow-none">
            <p className="text-[13.5px] leading-relaxed text-white/85">
              naruからのアドバイス：{suggestion.hint}
            </p>
            {canAdjust && !adjusted && (
              <Button onClick={applyAdjustment} variant="light" className="mt-3 w-full shadow-none">
                次回から強度を{rpe && rpe <= 2 ? "上げる" : "下げる"}
              </Button>
            )}
            {adjusted && (
              <p className="mt-2 text-[13px] font-bold text-mint-300">
                強度を調整しました。プランを作り直しました。
              </p>
            )}
          </Card>
        )}
      </div>

      <div className="mt-auto grid gap-2 py-8" style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}>
        <Button size="lg" variant="light" onClick={() => router.push("/")} className="w-full shadow-none">
          ホームに戻る
        </Button>
        <ButtonLink href="/progress" size="lg" variant="translucent" className="w-full">
          記録を見る
        </ButtonLink>
      </div>
    </div>
  );
}
