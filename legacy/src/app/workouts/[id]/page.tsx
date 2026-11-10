"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BodyFigure } from "@/components/body-figure";
import { ExerciseMedia } from "@/components/exercise-media";
import {
  CheckIcon,
  ChevronLeft,
  ClockIcon,
  FlameIcon,
  PlayIcon,
  TargetIcon,
  VideoIcon,
} from "@/components/icons";
import { ButtonLink, Card, StatChip, cx } from "@/components/ui";
import { EQUIPMENT_LABEL, PART_LABEL, getExercise } from "@/lib/exercises";
import { formatDuration } from "@/lib/format";
import { uniqueMainCount } from "@/lib/plan";
import { PROGRAM_TONE_CLASS, buildProgramDays, getProgram } from "@/lib/programs";
import { useStore } from "@/store/app-store";

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, state, completedIds } = useStore();
  const [dayIndex, setDayIndex] = useState(0);

  const program = getProgram(id);
  const days = useMemo(
    () => (program ? buildProgramDays(program, state.profile) : []),
    [program, state.profile],
  );

  if (!ready) return <div className="p-6 text-center text-ink-muted">読み込み中…</div>;

  if (!program) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-bold">プログラムが見つかりませんでした</p>
        <Link href="/workouts" className="font-bold text-brand-600">
          ワークアウト一覧へ戻る
        </Link>
      </div>
    );
  }

  const day = days[dayIndex];
  const doneCount = days.filter((d) => completedIds.has(d.id)).length;
  const equipment = Array.from(
    new Set(
      day.items.flatMap((i) => getExercise(i.exerciseId)?.equipment ?? []).filter((e) => e !== "none"),
    ),
  );

  return (
    <div className="pb-28">
      {/* ヒーロー */}
      <div
        className={cx(
          "relative overflow-hidden bg-gradient-to-br px-4 pb-6 pt-5 text-white",
          PROGRAM_TONE_CLASS[program.tone],
        )}
      >
        <div className="pointer-events-none absolute -right-4 top-6 h-44 w-28 opacity-40">
          <BodyFigure active={program.rotation} className="h-full w-full" glow={false} />
        </div>

        <button
          type="button"
          onClick={() => router.back()}
          aria-label="戻る"
          className="grid size-9 place-items-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
        >
          <ChevronLeft className="size-5" />
        </button>

        <p className="relative mt-4 text-[12px] font-bold tracking-wide text-white/80">
          {program.place === "home" ? "自宅" : "ジム"} ・ {program.dayCount}ワークアウト
        </p>
        <h1 className="relative mt-1 max-w-[15ch] text-[24px] font-bold leading-snug tracking-tight">
          {program.title}
        </h1>
        <p className="relative mt-1 max-w-[28ch] text-[13px] text-white/80">{program.subtitle}</p>

        {/* naruの解説動画枠 */}
        <div className="relative mt-4">
          {program.video ? (
            <div className="overflow-hidden rounded-2xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={program.video.src}
                poster={program.video.poster}
                controls
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-2xl bg-black/20 px-4 py-3">
              <VideoIcon className="size-5 shrink-0 text-white/80" />
              <p className="text-[12px] leading-relaxed text-white/80">
                naruによるプログラム解説動画は準備中です
              </p>
            </div>
          )}
        </div>

        <div className="relative mt-3 flex items-center justify-between text-[12px] text-white/85">
          <span>
            進捗 <span className="tnum font-bold">{doneCount}</span> / {program.dayCount}
          </span>
          <span className="tnum">1回 約{program.minutesPerDay}分</span>
        </div>
        <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-500"
            style={{ width: `${(doneCount / program.dayCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Day 選択 */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        {days.map((d, i) => {
          const done = completedIds.has(d.id);
          const active = i === dayIndex;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDayIndex(i)}
              aria-pressed={active}
              className={cx(
                "flex w-[74px] shrink-0 flex-col items-center gap-1 rounded-2xl py-2.5 text-[12px] font-bold transition-colors",
                active
                  ? "bg-brand-600 text-white shadow-[var(--shadow-float)]"
                  : done
                    ? "bg-brand-50 text-brand-700"
                    : "bg-white text-ink-soft shadow-[var(--shadow-card)]",
              )}
            >
              {done ? (
                <CheckIcon className="size-4" strokeWidth={3} />
              ) : (
                <span className="size-2 rounded-full bg-current opacity-50" />
              )}
              Day {i + 1}
            </button>
          );
        })}
      </div>

      {/* 選んだ日の内容 */}
      <div className="px-4">
        <div className="mb-3 flex gap-2">
          <StatChip
            icon={<ClockIcon className="size-4" />}
            label="所要時間"
            value={formatDuration(day.totalSec)}
            tone="dark"
          />
          <StatChip
            icon={<FlameIcon className="size-4" />}
            label="消費目安"
            value={`${day.kcal}kcal`}
            tone="dark"
          />
          <StatChip
            icon={<TargetIcon className="size-4" />}
            label={day.rounds > 1 ? `${day.rounds}セット` : "種目数"}
            value={`${uniqueMainCount(day)}種目`}
            tone="dark"
          />
        </div>

        {equipment.length > 0 && (
          <p className="mb-2 text-[12px] text-ink-muted">
            使うもの：{equipment.map((e) => EQUIPMENT_LABEL[e]).join("・")}
          </p>
        )}

        <ul className="space-y-2">
          {day.items.map((item, i) => {
            const ex = getExercise(item.exerciseId);
            if (!ex) return null;
            const prevItem = i > 0 ? day.items[i - 1] : undefined;
            const prevEx = prevItem ? getExercise(prevItem.exerciseId) : undefined;
            const showHeading =
              !prevEx || prevEx.phase !== ex.phase || prevItem?.round !== item.round;
            const heading =
              ex.phase === "warmup"
                ? "ウォームアップ"
                : ex.phase === "cooldown"
                  ? "クールダウン"
                  : item.round && day.rounds > 1
                    ? `${item.round}セット目`
                    : "メインセット";

            return (
              <li key={`${item.exerciseId}-${i}`}>
                {showHeading && (
                  <p className="mb-2 mt-4 text-[12px] font-bold tracking-wide text-ink-muted first:mt-0">
                    {heading}
                  </p>
                )}
                <Link href={`/library/${ex.id}`}>
                  <Card className="flex items-center gap-3 p-2.5 transition-colors hover:bg-brand-50">
                    <ExerciseMedia exercise={ex} compact className="size-16 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{ex.name}</p>
                      <p className="tnum text-[12px] text-ink-muted">
                        {item.reps ? `${item.reps}回` : `${item.seconds}秒`}
                        {ex.unilateral && "（左右）"} ・ 休憩{item.restSec}秒
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                      {PART_LABEL[ex.parts[0]]}
                    </span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 固定スタート */}
      <div
        className="fixed left-1/2 z-20 w-full max-w-[30rem] -translate-x-1/2 border-t border-line bg-white/92 px-4 py-3 backdrop-blur-md"
        style={{ bottom: "calc(var(--nav-h) + var(--safe-bottom))" }}
      >
        <ButtonLink href={`/workout/${day.id}`} size="lg" className="w-full">
          <PlayIcon className="size-5" />
          Day {dayIndex + 1} をスタート
        </ButtonLink>
      </div>
    </div>
  );
}
