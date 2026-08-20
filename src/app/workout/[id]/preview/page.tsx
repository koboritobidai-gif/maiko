"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExerciseMedia } from "@/components/exercise-media";
import {
  ChevronLeft,
  ClockIcon,
  FlameIcon,
  PlayIcon,
  TargetIcon,
} from "@/components/icons";
import { ButtonLink, Card, StatChip, cx } from "@/components/ui";
import { EQUIPMENT_LABEL, PART_LABEL, getExercise } from "@/lib/exercises";
import { formatDuration } from "@/lib/format";
import { uniqueMainCount } from "@/lib/plan";
import { useStore } from "@/store/app-store";

export default function WorkoutPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, state, completedIds } = useStore();

  if (!ready) return <div className="p-6 text-center text-ink-muted">読み込み中…</div>;

  const day = state.plan?.days.find((d) => d.id === id);
  if (!day || day.isRest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-bold">このワークアウトは見つかりませんでした</p>
        <Link href="/" className="font-bold text-brand-600">
          ホームへ戻る
        </Link>
      </div>
    );
  }

  const done = completedIds.has(day.id);
  const mainCount = uniqueMainCount(day);
  const equipment = Array.from(
    new Set(
      day.items.flatMap((i) => getExercise(i.exerciseId)?.equipment ?? []).filter((e) => e !== "none"),
    ),
  );

  return (
    <div className="pb-28">
      {/* ヒーロー */}
      <div className="relative bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-4 pb-6 pt-5 text-white">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="戻る"
          className="grid size-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          <ChevronLeft className="size-5" />
        </button>

        <p className="mt-4 text-[13px] font-semibold text-mint-300">
          {day.week}週目 {day.day}日目
        </p>
        <h1 className="mt-1 text-[24px] font-bold leading-snug tracking-tight">
          {day.title.split("｜")[0]}
        </h1>
        <p className="mt-1 text-[13px] text-white/75">{PART_LABEL[day.focus]}を中心に鍛えます</p>

        <div className="mt-4 flex gap-2">
          <StatChip icon={<ClockIcon className="size-4" />} label="所要時間" value={formatDuration(day.totalSec)} />
          <StatChip icon={<FlameIcon className="size-4" />} label="消費目安" value={`${day.kcal}kcal`} />
          <StatChip
            icon={<TargetIcon className="size-4" />}
            label={day.rounds > 1 ? `${day.rounds}セット` : "種目数"}
            value={`${mainCount}種目`}
          />
        </div>

        {equipment.length > 0 && (
          <p className="mt-3 text-[12px] text-white/75">
            使うもの：{equipment.map((e) => EQUIPMENT_LABEL[e]).join("・")}
          </p>
        )}
      </div>

      {/* 種目リスト */}
      <div className="space-y-2 px-4 pt-4">
        {day.items.map((item, i) => {
          const ex = getExercise(item.exerciseId);
          if (!ex) return null;
          const isWarm = ex.phase === "warmup";
          const isCool = ex.phase === "cooldown";
          const prevItem = i > 0 ? day.items[i - 1] : undefined;
          const prevEx = prevItem ? getExercise(prevItem.exerciseId) : undefined;
          const showHeading =
            !prevEx || prevEx.phase !== ex.phase || prevItem?.round !== item.round;
          const heading = isWarm
            ? "ウォームアップ"
            : isCool
              ? "クールダウン"
              : item.round && day.rounds > 1
                ? `${item.round}セット目`
                : "メインセット";

          return (
            <div key={`${item.exerciseId}-${i}`}>
              {showHeading && (
                <p className="mb-2 mt-4 px-1 text-[12px] font-bold tracking-wide text-ink-muted first:mt-0">
                  {heading}
                </p>
              )}
              <Link href={`/library/${ex.id}`}>
                <Card
                  tone={isWarm || isCool ? "none" : "white"}
                  className={cx(
                    "flex items-center gap-3 p-2.5 transition-colors hover:bg-brand-50",
                    (isWarm || isCool) && "bg-white/70 shadow-none",
                  )}
                >
                  <ExerciseMedia exercise={ex} compact className="size-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{ex.name}</p>
                    <p className="tnum text-[12px] text-ink-muted">
                      {item.reps ? `${item.reps}回` : `${item.seconds}秒`}
                      {ex.unilateral && "（左右）"} ・ 休憩{item.restSec}秒
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                    {ex.parts.slice(0, 1).map((p) => PART_LABEL[p])}
                  </span>
                </Card>
              </Link>
            </div>
          );
        })}
      </div>

      {/* 固定スタートボタン */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[30rem] border-t border-line bg-white/92 px-4 py-3 backdrop-blur-md"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <ButtonLink href={`/workout/${day.id}`} size="lg" className="w-full">
          <PlayIcon className="size-5" />
          {done ? "もう一度やる" : "スタート"}
        </ButtonLink>
      </div>
    </div>
  );
}
