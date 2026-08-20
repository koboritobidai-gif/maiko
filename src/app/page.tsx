"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BodyFigure } from "@/components/body-figure";
import {
  CheckIcon,
  ChevronRight,
  ClockIcon,
  FlameIcon,
  PlayIcon,
  SlidersIcon,
  SparkIcon,
  TargetIcon,
  TrophyIcon,
  VideoIcon,
} from "@/components/icons";
import {
  Button,
  ButtonLink,
  Card,
  ProgressRing,
  SectionTitle,
  StatChip,
  cx,
} from "@/components/ui";
import { AREA_TO_PARTS, PART_LABEL } from "@/lib/exercises";
import { formatDuration } from "@/lib/format";
import { PLAN_WEEKS, menuSummary, uniqueMainCount, weekKcal } from "@/lib/plan";
import { useStore } from "@/store/app-store";
import type { WorkoutDay } from "@/lib/types";

export default function HomePage() {
  const { ready, state, completedIds, streak } = useStore();

  if (!ready) return <LoadingScreen />;
  if (!state.plan || !state.profile) return <WelcomeScreen />;

  const plan = state.plan;
  const nextDay =
    plan.days.find((d) => !d.isRest && !completedIds.has(d.id)) ??
    plan.days.filter((d) => !d.isRest).at(-1)!;

  return (
    <div className="pb-6">
      <Header streak={streak} />
      <div className="space-y-6 px-4">
        <TodayCard day={nextDay} allDone={completedIds.has(nextDay.id)} />
        <WeekStrip plan={plan} currentWeek={nextDay.week} completedIds={completedIds} />
        <PlanSection plan={plan} completedIds={completedIds} currentWeek={nextDay.week} />
        <CoachNote />
      </div>
    </div>
  );
}

/* ─────────────── ヘッダー ─────────────── */

function Header({ streak }: { streak: number }) {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";

  return (
    <header className="flex items-center justify-between px-4 pb-4 pt-6">
      <div>
        <p className="text-[13px] text-ink-muted">{greeting}</p>
        <h1 className="text-xl font-bold tracking-tight">今日も動かしていきましょう</h1>
      </div>
      <div className="flex items-center gap-2">
        {streak > 0 && (
          <span className="tnum flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5 text-[13px] font-bold text-orange-600">
            <FlameIcon className="size-4" />
            {streak}日
          </span>
        )}
        <Link
          href="/settings"
          aria-label="プラン設定"
          className="grid size-10 place-items-center rounded-full bg-white text-ink-soft shadow-[var(--shadow-card)] transition-colors hover:text-brand-600"
        >
          <SlidersIcon className="size-5" />
        </Link>
      </div>
    </header>
  );
}

/* ─────────────── 今日のトレーニング ─────────────── */

function TodayCard({ day, allDone }: { day: WorkoutDay; allDone: boolean }) {
  const mainCount = uniqueMainCount(day);

  return (
    <Card tone="none" className="overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white shadow-[var(--shadow-float)]">
      <div className="relative px-5 pb-5 pt-5">
        <div className="pointer-events-none absolute right-3 top-4 h-32 w-20 opacity-80">
          <BodyFigure active={[day.focus]} className="h-full w-full" />
        </div>

        <p className="text-[13px] font-semibold text-mint-300">
          {allDone ? "次のトレーニング" : "今日のトレーニング"}
        </p>
        <h2 className="mt-1 max-w-[16ch] text-[22px] font-bold leading-snug tracking-tight">
          {day.title.split("｜")[0]}
        </h2>
        <p className="mt-1 text-[13px] text-white/75">
          {day.week}週目 {day.day}日目 ・ {PART_LABEL[day.focus]}中心
        </p>

        <div className="mt-4 flex gap-2">
          <StatChip icon={<ClockIcon className="size-4" />} label="所要時間" value={formatDuration(day.totalSec)} />
          <StatChip icon={<FlameIcon className="size-4" />} label="消費目安" value={`${day.kcal}kcal`} />
          <StatChip
            icon={<TargetIcon className="size-4" />}
            label={day.rounds > 1 ? `${day.rounds}セット` : "種目数"}
            value={`${mainCount}種目`}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <ButtonLink
            href={`/workout/${day.id}`}
            size="lg"
            variant="light"
            className="flex-1 shadow-none"
          >
            <PlayIcon className="size-5" />
            スタート
          </ButtonLink>
          <ButtonLink
            href={`/workout/${day.id}/preview`}
            size="icon"
            variant="translucent"
            aria-label="メニューを確認する"
            className="shrink-0"
          >
            <ChevronRight className="size-5" />
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────── 週の進捗ストリップ ─────────────── */

function WeekStrip({
  plan,
  currentWeek,
  completedIds,
}: {
  plan: NonNullable<ReturnType<typeof useStore>["state"]["plan"]>;
  currentWeek: number;
  completedIds: Set<string>;
}) {
  const days = plan.days.filter((d) => d.week === currentWeek);
  const target = days.filter((d) => !d.isRest).length;
  const done = days.filter((d) => completedIds.has(d.id)).length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-bold">{currentWeek}週目</p>
          <p className="tnum text-[12px] text-ink-muted">
            {done} / {target} 回 完了
          </p>
        </div>
        <ProgressRing
          value={target ? done / target : 0}
          size={44}
          stroke={5}
          trackClass="text-brand-100"
          barClass="text-brand-600"
        >
          <span className="tnum text-[11px] font-bold text-brand-700">
            {Math.round((target ? done / target : 0) * 100)}%
          </span>
        </ProgressRing>
      </div>
      <ol className="flex gap-1.5">
        {days.map((d) => {
          const isDone = completedIds.has(d.id);
          return (
            <li key={d.id} className="flex-1">
              <div
                className={cx(
                  "flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold",
                  isDone
                    ? "bg-brand-600 text-white"
                    : d.isRest
                      ? "bg-canvas text-ink-muted"
                      : "bg-brand-50 text-brand-700",
                )}
              >
                <span className="tnum text-[10px] opacity-70">{d.day}</span>
                {isDone ? (
                  <CheckIcon className="size-4" strokeWidth={3} />
                ) : d.isRest ? (
                  <span className="text-[11px]">休</span>
                ) : (
                  <span className="size-2 rounded-full bg-current opacity-60" />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ─────────────── 4週間プラン ─────────────── */

function PlanSection({
  plan,
  completedIds,
  currentWeek,
}: {
  plan: NonNullable<ReturnType<typeof useStore>["state"]["plan"]>;
  completedIds: Set<string>;
  currentWeek: number;
}) {
  const [openWeek, setOpenWeek] = useState(currentWeek);
  const weeks = useMemo(() => Array.from({ length: PLAN_WEEKS }, (_, i) => i + 1), []);

  return (
    <section>
      <SectionTitle
        title="4週間のプラン"
        action={
          <Link href="/settings" className="text-[13px] font-semibold text-brand-600">
            調整する
          </Link>
        }
      />
      <div className="space-y-3">
        {weeks.map((w) => {
          const days = plan.days.filter((d) => d.week === w && !d.isRest);
          const done = days.filter((d) => completedIds.has(d.id)).length;
          const open = openWeek === w;
          return (
            <Card key={w} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenWeek(open ? 0 : w)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[17px] font-bold">{w}週目</span>
                  <span className="tnum flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[12px] font-bold text-orange-600">
                    <FlameIcon className="size-3.5" />
                    {weekKcal(plan, w)} kcal
                  </span>
                </div>
                <span className="flex items-center gap-2">
                  <span className="tnum text-[12px] font-semibold text-ink-muted">
                    {done}/{days.length}
                  </span>
                  <ChevronRight
                    className={cx("size-4 text-ink-muted transition-transform", open && "rotate-90")}
                  />
                </span>
              </button>

              {open && (
                <ul className="animate-rise space-y-2 border-t border-line px-3 py-3">
                  {days.map((d) => (
                    <li key={d.id}>
                      <WorkoutRow day={d} done={completedIds.has(d.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function WorkoutRow({ day, done }: { day: WorkoutDay; done: boolean }) {
  return (
    <Link
      href={`/workout/${day.id}/preview`}
      className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-brand-50"
    >
      <span
        className={cx(
          "grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold",
          done ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700",
        )}
      >
        {done ? <CheckIcon className="size-5" strokeWidth={3} /> : day.index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{day.title.split("｜")[0]}</p>
        <p className="tnum text-[12px] text-ink-muted">
          {formatDuration(day.totalSec)} ・ {day.kcal} kcal ・ {menuSummary(day)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-muted" />
    </Link>
  );
}

/* ─────────────── naruからのひとこと ─────────────── */

function CoachNote() {
  return (
    <Card tone="none" className="flex items-start gap-3 border border-brand-100 bg-brand-50/60 p-4 shadow-none">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
        <VideoIcon className="size-5" />
      </span>
      <div>
        <p className="text-[14px] font-bold text-brand-800">naruのお手本動画は準備中です</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
          各種目のフォームのポイント・よくあるミスは今すぐ確認できます。動画が揃い次第、
          この画面と実行中の画面にそのまま表示されます。
        </p>
        <Link href="/library" className="mt-2 inline-block text-[13px] font-bold text-brand-600">
          種目一覧を見る →
        </Link>
      </div>
    </Card>
  );
}

/* ─────────────── 初回・ローディング ─────────────── */

function LoadingScreen() {
  return (
    <div className="space-y-4 px-4 pt-6">
      <div className="h-6 w-40 animate-pulse rounded-full bg-black/5" />
      <div className="h-56 animate-pulse rounded-[var(--radius-card)] bg-black/5" />
      <div className="h-28 animate-pulse rounded-[var(--radius-card)] bg-black/5" />
    </div>
  );
}

function WelcomeScreen() {
  const points = [
    { icon: <TargetIcon className="size-5" />, title: "部位を選ぶだけ", body: "鍛えたい場所に合わせて種目を自動で選びます" },
    { icon: <SparkIcon className="size-5" />, title: "強度は5段階", body: "初心者から上級者まで、続けられる負荷に調整" },
    { icon: <TrophyIcon className="size-5" />, title: "4週間で習慣に", body: "週ごとに少しずつ負荷が上がるプログラム" },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 text-white">
      <div className="flex flex-1 flex-col justify-center px-6 pt-10">
        <p className="text-[13px] font-bold tracking-widest text-mint-300">NARU TRAINING</p>
        <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-tight">
          家がそのまま
          <br />
          <span className="text-mint-300">ジムになる。</span>
        </h1>
        <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-white/80">
          パーソナルトレーナーnaruが監修。器具がなくても、あなたのレベルに合ったメニューで運動習慣をつくります。
        </p>

        <ul className="mt-8 space-y-3">
          {points.map((p) => (
            <li key={p.title} className="flex items-start gap-3 rounded-2xl bg-white/12 px-4 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-mint-300">
                {p.icon}
              </span>
              <div>
                <p className="font-bold">{p.title}</p>
                <p className="text-[12.5px] leading-relaxed text-white/75">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-6 pb-10 pt-8" style={{ paddingBottom: "calc(2.5rem + var(--safe-bottom))" }}>
        <ButtonLink href="/onboarding" size="lg" variant="light" className="w-full shadow-none">
          はじめる（約1分）
        </ButtonLink>
        <p className="mt-3 text-center text-[12px] text-white/65">
          登録不要・データは端末内にのみ保存されます
        </p>
      </div>
    </div>
  );
}
