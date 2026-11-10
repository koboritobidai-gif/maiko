"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BodyFigure } from "@/components/body-figure";
import { ClockIcon, DumbbellOffIcon, FlameIcon, PlayIcon, VideoIcon } from "@/components/icons";
import { ButtonLink, Card, EmptyState, cx } from "@/components/ui";
import { PART_LABEL, countByPlace } from "@/lib/exercises";
import { formatDuration } from "@/lib/format";
import {
  PROGRAM_TONE_CLASS,
  PROGRAMS,
  programsAt,
  totalWorkoutCount,
} from "@/lib/programs";
import { useStore } from "@/store/app-store";
import type { Program } from "@/lib/programs";
import type { BodyPart, Place } from "@/lib/types";

const PART_FILTERS: BodyPart[] = [
  "abs",
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "glutes",
  "cardio",
];

type Tab = Place | "cardio";

export default function WorkoutsPage() {
  const { ready, state } = useStore();
  const [tab, setTab] = useState<Tab>(state.profile?.place ?? "home");
  const [part, setPart] = useState<BodyPart | null>(null);

  const list = useMemo(() => {
    if (tab === "cardio") return [];
    const base = programsAt(tab);
    if (!part) return base;
    return base.filter((p) => p.rotation.includes(part) || p.rotation.includes("fullbody"));
  }, [tab, part]);

  if (!ready) return <div className="p-6 text-center text-ink-muted">読み込み中…</div>;

  return (
    <div className="pb-6">
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-bold tracking-tight">ワークアウト</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {totalWorkoutCount()}ワークアウト・{PROGRAMS.length}プログラム収録
        </p>
      </header>

      {/* 自宅 / ジム / ウォーキングとランニング */}
      <div className="no-scrollbar overflow-x-auto border-b border-line px-4">
        <div className="flex gap-5">
          {(
            [
              { id: "home", label: "自宅" },
              { id: "gym", label: "ジム" },
              { id: "cardio", label: "ウォーキングとランニング" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cx(
                "relative -mb-px shrink-0 pb-2.5 text-[16px] font-bold transition-colors",
                tab === t.id ? "text-ink" : "text-ink-muted hover:text-ink-soft",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-brand-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "cardio" ? (
        <CardioTab />
      ) : (
        <>
          <p className="px-4 pt-3 text-[12px] text-ink-muted">
            {tab === "home"
              ? `自宅でできる種目 ${countByPlace("home")}種目から組んでいます`
              : `ジムの種目 ${countByPlace("gym")}種目から組んでいます`}
          </p>

          {/* 部位クイックフィルタ */}
          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
            <PartCircle
              label="すべて"
              active={part === null}
              onClick={() => setPart(null)}
              parts={[]}
            />
            {PART_FILTERS.map((p) => (
              <PartCircle
                key={p}
                label={PART_LABEL[p]}
                parts={[p]}
                active={part === p}
                onClick={() => setPart(part === p ? null : p)}
              />
            ))}
          </div>

          {/* プログラム一覧 */}
          <div className="mt-4 px-4">
            {list.length === 0 ? (
              <EmptyState
                icon={<DumbbellOffIcon className="size-6" />}
                title="この部位のプログラムはまだありません"
                description="フィルターを「すべて」に戻すか、他のタブを見てみてください。"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {list.map((p) => (
                  <ProgramCard key={p.id} program={p} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────── ウォーキングとランニング ─────────────── */

function CardioTab() {
  const { state } = useStore();
  const logs = [...state.cardioLogs].reverse().slice(0, 10);
  const totalMeters = state.cardioLogs.reduce((s, l) => s + l.meters, 0);

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card
        tone="none"
        className="overflow-hidden bg-gradient-to-br from-brand-700 to-brand-500 p-5 text-white shadow-[var(--shadow-float)]"
      >
        <p className="text-[13px] font-semibold text-mint-300">屋外で動く日に</p>
        <h2 className="mt-1 text-[20px] font-bold leading-snug">ウォーキングとランニング</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/80">
          時間・距離・ペース・消費カロリーを記録します。歩いたルートの形も残ります。
        </p>
        <ButtonLink href="/cardio" size="lg" variant="light" className="mt-4 w-full shadow-none">
          <PlayIcon className="size-5" />
          スタート
        </ButtonLink>
        {state.cardioLogs.length > 0 && (
          <p className="tnum mt-3 text-[12px] text-white/80">
            これまでの合計 {(totalMeters / 1000).toFixed(1)} km ・ {state.cardioLogs.length}回
          </p>
        )}
      </Card>

      {logs.length === 0 ? (
        <EmptyState
          icon={<PlayIcon className="size-6" />}
          title="まだ記録がありません"
          description="スタートすると時間・距離・ペースを自動で記録します。位置情報を許可しない場合も、時間と消費カロリーは記録できます。"
        />
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id}>
              <Card className="flex items-center gap-3 p-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-[13px] font-bold text-brand-700">
                  {l.mode === "walk" ? "歩" : "走"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="tnum truncate font-bold">{(l.meters / 1000).toFixed(2)} km</p>
                  <p className="tnum text-[12px] text-ink-muted">
                    {l.date} ・ {formatDuration(l.seconds)} ・ {l.kcal}kcal
                  </p>
                </div>
                <FlameIcon className="size-4 shrink-0 text-orange-400" />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PartCircle({
  label,
  parts,
  active,
  onClick,
}: {
  label: string;
  parts: BodyPart[];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex shrink-0 flex-col items-center gap-1.5"
    >
      <span
        className={cx(
          "grid size-16 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand-600 to-brand-500 transition-all",
          active ? "ring-3 ring-brand-600 ring-offset-2" : "opacity-90",
        )}
      >
        {parts.length === 0 ? (
          <span className="text-[13px] font-bold text-white">ALL</span>
        ) : (
          <BodyFigure active={parts} className="h-[88%] w-auto" />
        )}
      </span>
      <span
        className={cx(
          "text-[11.5px] font-bold",
          active ? "text-brand-600" : "text-ink-soft",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function ProgramCard({ program }: { program: Program }) {
  return (
    <Link href={`/workouts/${program.id}`}>
      <Card
        tone="none"
        className={cx(
          "relative flex h-40 flex-col justify-between overflow-hidden bg-gradient-to-br p-3.5 text-white",
          PROGRAM_TONE_CLASS[program.tone],
        )}
      >
        <div className="pointer-events-none absolute -bottom-4 -right-3 h-32 w-20 opacity-45">
          <BodyFigure active={program.rotation} className="h-full w-full" glow={false} />
        </div>
        <div className="relative">
          <p className="text-[15px] font-bold leading-snug">{program.title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/80">
            {program.subtitle}
          </p>
        </div>
        <div className="relative flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
          <span className="rounded-full bg-black/20 px-2 py-0.5">
            {program.dayCount}ワークアウト
          </span>
          <span className="flex items-center gap-0.5">
            <ClockIcon className="size-3" />
            {program.minutesPerDay}分
          </span>
          {program.video && <VideoIcon className="size-3.5" />}
        </div>
      </Card>
    </Link>
  );
}
