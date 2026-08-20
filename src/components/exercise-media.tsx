"use client";

import { BodyFigure } from "./body-figure";
import { VideoIcon } from "./icons";
import { cx } from "./ui";
import type { Exercise } from "@/lib/types";

/**
 * 種目のビジュアル。
 * naruのお手本動画（exercise.video）があればそれを再生し、
 * まだ無い種目は部位をハイライトしたシルエットを表示します。
 */
export function ExerciseMedia({
  exercise,
  className,
  compact = false,
}: {
  exercise: Exercise;
  className?: string;
  compact?: boolean;
}) {
  if (exercise.video) {
    return (
      <div className={cx("relative overflow-hidden rounded-2xl bg-black", className)}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          key={exercise.video.src}
          src={exercise.video.src}
          poster={exercise.video.poster}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        {exercise.video.caption && !compact && (
          <p className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
            {exercise.video.caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cx(
        "relative grid place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500",
        className,
      )}
    >
      <BodyFigure active={exercise.parts} className="h-[86%] w-auto" />
      {!compact && (
        <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
          <VideoIcon className="size-3.5" />
          naruの動画は準備中
        </span>
      )}
    </div>
  );
}
