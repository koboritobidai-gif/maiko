"use client";

import { useMemo, useState } from "react";
import {
  ChartIcon,
  ClockIcon,
  FlameIcon,
  RouteIcon,
  TargetIcon,
  TrophyIcon,
  WaterIcon,
} from "@/components/icons";
import { Button, ButtonLink, Card, EmptyState, SectionTitle, cx } from "@/components/ui";
import { pathToPolyline } from "@/lib/geo";
import {
  WEEKDAY_JA,
  formatDateJa,
  formatDuration,
  toDateKey,
  todayKey,
} from "@/lib/format";
import { resolveWorkout } from "@/lib/workout";
import { useStore } from "@/store/app-store";

type Tab = "daily" | "calendar" | "data";

export default function ProgressPage() {
  const { ready, state, streak, totalKcal, totalSeconds } = useStore();
  const [tab, setTab] = useState<Tab>("daily");

  if (!ready) return <div className="p-6 text-center text-ink-muted">読み込み中…</div>;

  return (
    <div className="pb-6">
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-bold tracking-tight">記録</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">積み上げた分だけ、体は変わります</p>
      </header>

      <div className="border-b border-line px-4">
        <div className="flex gap-6">
          {(
            [
              { id: "daily", label: "毎日" },
              { id: "calendar", label: "カレンダー" },
              { id: "data", label: "データ" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cx(
                "relative -mb-px pb-2.5 text-[16px] font-bold transition-colors",
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

      <div className="space-y-6 px-4 pt-5">
        {tab === "daily" && <DailyTab />}
        {tab === "calendar" && <CalendarTab />}
        {tab === "data" && (
          <DataTab streak={streak} totalKcal={totalKcal} totalSeconds={totalSeconds} />
        )}
      </div>
    </div>
  );
}

/* ─────────────── 毎日 ─────────────── */

function DailyTab() {
  const { state, addWater } = useStore();
  const today = todayKey();
  const cups = state.water[today] ?? 0;
  const goal = state.waterGoal;

  const todayLogs = state.logs.filter((l) => l.date === today);
  const todayCardio = state.cardioLogs.filter((l) => l.date === today);
  const todaySeconds =
    todayLogs.reduce((s, l) => s + l.seconds, 0) +
    todayCardio.reduce((s, l) => s + l.seconds, 0);
  // 30秒だけ動いた日を「0分」と表示して無かったことにしない
  const todayLabel =
    todaySeconds === 0 ? "0分" : todaySeconds < 60 ? "1分未満" : formatDuration(todaySeconds);
  const todayKcal =
    todayLogs.reduce((s, l) => s + l.kcal, 0) + todayCardio.reduce((s, l) => s + l.kcal, 0);

  const week = useMemo(() => {
    const out: { key: string; label: string; seconds: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      const seconds =
        state.logs.filter((l) => l.date === key).reduce((s, l) => s + l.seconds, 0) +
        state.cardioLogs.filter((l) => l.date === key).reduce((s, l) => s + l.seconds, 0);
      out.push({ key, label: WEEKDAY_JA[d.getDay()], seconds });
    }
    return out;
  }, [state.logs, state.cardioLogs]);

  const maxSec = Math.max(1, ...week.map((w) => w.seconds));

  return (
    <>
      <WeightCard />

      {/* 今日の状況 */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-brand-600">
            <ClockIcon className="size-5" />
          </span>
          <span className="tnum text-[20px] font-bold leading-tight">{todayLabel}</span>
          <span className="text-[12px] text-ink-muted">今日の運動時間</span>
        </Card>

        {/* 水分 */}
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-brand-600">
              <WaterIcon className="size-5" />
            </span>
            <span className="tnum text-[12px] text-ink-muted">
              {cups}/{goal} 杯
            </span>
          </div>
          <WaterRing cups={cups} goal={goal} />
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              className="h-8 flex-1 px-0 text-[16px]"
              aria-label="水分を1杯減らす"
              onClick={() => addWater(-1)}
            >
              −
            </Button>
            <Button
              className="h-8 flex-1 px-0 text-[16px]"
              aria-label="水分を1杯増やす"
              onClick={() => addWater(1)}
            >
              ＋
            </Button>
          </div>
        </Card>
      </div>

      {/* 今週のワークアウト */}
      <section>
        <SectionTitle title="今週のワークアウト" />
        <Card className="p-4">
          <div className="flex h-28 items-end gap-2">
            {week.map((w) => (
              <div key={w.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={cx(
                      "w-full rounded-full transition-all",
                      w.seconds > 0 ? "bg-gradient-to-t from-orange-500 to-amber-400" : "bg-canvas",
                    )}
                    style={{
                      height: `${Math.max(w.seconds > 0 ? 14 : 6, (w.seconds / maxSec) * 100)}%`,
                    }}
                    title={`${formatDateJa(w.key)} ${Math.round(w.seconds / 60)}分`}
                  />
                </div>
                <span
                  className={cx(
                    "text-[11px]",
                    w.key === today ? "font-bold text-ink" : "text-ink-muted",
                  )}
                >
                  {w.label}
                </span>
              </div>
            ))}
          </div>
          <p className="tnum mt-3 text-center text-[12px] text-ink-muted">
            今日 {todayLabel} ・ {todayKcal}kcal
          </p>
        </Card>
      </section>

      <ButtonLink href="/cardio" variant="secondary" className="w-full">
        <RouteIcon className="size-4.5" />
        ウォーキング・ランニングを記録する
      </ButtonLink>
    </>
  );
}

function WaterRing({ cups, goal }: { cups: number; goal: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: goal }).map((_, i) => (
        <span
          key={i}
          className={cx(
            "h-6 w-3 rounded-sm border-2 transition-colors",
            i < cups ? "border-brand-600 bg-brand-600" : "border-line bg-white",
          )}
        />
      ))}
    </div>
  );
}

/* ─────────────── 体重 ─────────────── */

function WeightCard() {
  const { state, addWeight, setWeightGoal } = useStore();
  const [input, setInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [editGoal, setEditGoal] = useState(false);

  const weights = state.weights.slice(-30);
  const latest = weights.at(-1);
  const first = weights[0];
  const diff = latest && first ? latest.kg - first.kg : 0;

  const n = Number(input);
  const valid = input !== "" && Number.isFinite(n) && n > 20 && n < 300;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-ink-muted">体重</p>
          <p className="tnum text-[28px] font-bold leading-tight">
            {latest ? latest.kg : "--"}
            <span className="ml-1 text-[15px] font-semibold text-ink-muted">kg</span>
          </p>
        </div>
        {weights.length > 1 && (
          <span
            className={cx(
              "tnum rounded-full px-3 py-1.5 text-[12px] font-bold",
              diff <= 0 ? "bg-brand-50 text-brand-700" : "bg-orange-50 text-orange-600",
            )}
          >
            {weights.length}回の記録で {diff > 0 ? "+" : ""}
            {diff.toFixed(1)} kg
          </span>
        )}
      </div>

      {weights.length > 1 && (
        <WeightChart data={weights} goal={state.weightGoalKg} />
      )}

      <div className="mt-3 flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="今日の体重(kg)"
          aria-label="今日の体重"
          className="h-11 flex-1 rounded-full border border-line px-4 text-[15px] outline-none focus:border-brand-400"
        />
        <Button
          disabled={!valid}
          onClick={() => {
            addWeight(n);
            setInput("");
          }}
        >
          記録
        </Button>
      </div>

      {/* 目標体重 */}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-[13px] text-ink-muted">目標体重</span>
        {editGoal ? (
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="60"
              aria-label="目標体重"
              className="tnum h-9 w-20 rounded-full border border-line px-3 text-right text-[15px] outline-none focus:border-brand-400"
            />
            <Button
              className="h-9 px-4 text-[13px]"
              onClick={() => {
                const g = Number(goalInput);
                setWeightGoal(Number.isFinite(g) && g > 20 && g < 300 ? g : null);
                setEditGoal(false);
              }}
            >
              保存
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setGoalInput(state.weightGoalKg ? String(state.weightGoalKg) : "");
              setEditGoal(true);
            }}
            className="tnum text-[15px] font-bold text-brand-600"
          >
            {state.weightGoalKg ? `${state.weightGoalKg} kg` : "設定する"}
          </button>
        )}
      </div>
    </Card>
  );
}

function WeightChart({
  data,
  goal,
}: {
  data: { date: string; kg: number }[];
  goal: number | null;
}) {
  const values = [...data.map((d) => d.kg), ...(goal ? [goal] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (kg: number) => 100 - ((kg - min) / span) * 76 - 12;

  const points = data
    .map((d, i) => `${(i / (data.length - 1)) * 100},${y(d.kg)}`)
    .join(" ");

  return (
    <div className="relative mt-3">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full">
        {goal !== null && (
          <line
            x1="0"
            x2="100"
            y1={y(goal)}
            y2={y(goal)}
            stroke="var(--color-mint-500)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => (
          <circle
            key={d.date}
            cx={(i / (data.length - 1)) * 100}
            cy={y(d.kg)}
            r="1.6"
            fill="var(--color-brand-600)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {goal !== null && (
        <span
          className="tnum absolute right-0 -translate-y-1/2 rounded-full bg-mint-500 px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ top: `${y(goal)}%` }}
        >
          目標 {goal}
        </span>
      )}
      <p className="tnum mt-1 flex justify-between text-[11px] text-ink-muted">
        <span>{formatDateJa(data[0].date)}</span>
        <span>{formatDateJa(data[data.length - 1].date)}</span>
      </p>
    </div>
  );
}

/* ─────────────── カレンダー ─────────────── */

function CalendarTab() {
  const { state } = useStore();
  const [offset, setOffset] = useState(0);

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const year = base.getFullYear();
  const month = base.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const activity = useMemo(() => {
    const map = new Map<string, { workout: boolean; cardio: boolean; kcal: number }>();
    for (const l of state.logs) {
      const cur = map.get(l.date) ?? { workout: false, cardio: false, kcal: 0 };
      map.set(l.date, { ...cur, workout: true, kcal: cur.kcal + l.kcal });
    }
    for (const l of state.cardioLogs) {
      const cur = map.get(l.date) ?? { workout: false, cardio: false, kcal: 0 };
      map.set(l.date, { ...cur, cardio: true, kcal: cur.kcal + l.kcal });
    }
    return map;
  }, [state.logs, state.cardioLogs]);

  const monthCount = Array.from({ length: daysInMonth }).filter((_, i) =>
    activity.has(toDateKey(new Date(year, month, i + 1))),
  ).length;

  return (
    <>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="前の月"
            className="grid size-8 place-items-center rounded-full bg-canvas text-ink-soft"
          >
            ‹
          </button>
          <p className="tnum font-bold">
            {year}年{month + 1}月
          </p>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            aria-label="次の月"
            className="grid size-8 place-items-center rounded-full bg-canvas text-ink-soft disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_JA.map((w) => (
            <span key={w} className="pb-1 text-[11px] font-bold text-ink-muted">
              {w}
            </span>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = toDateKey(new Date(year, month, day));
            const a = activity.get(key);
            const isToday = key === todayKey();
            return (
              <div
                key={key}
                className={cx(
                  "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[12px]",
                  a ? "bg-brand-600 font-bold text-white" : "bg-canvas text-ink-soft",
                  isToday && !a && "ring-2 ring-brand-400",
                )}
                title={a ? `${a.kcal}kcal` : undefined}
              >
                <span className="tnum">{day}</span>
                {a && (
                  <span className="flex gap-0.5">
                    {a.workout && <span className="size-1 rounded-full bg-white" />}
                    {a.cardio && <span className="size-1 rounded-full bg-mint-300" />}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="tnum mt-3 text-center text-[12px] text-ink-muted">
          この月の実施日 {monthCount}日
        </p>
      </Card>

      <div className="flex justify-center gap-4 text-[11.5px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-600" />
          筋トレ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-mint-500" />
          ウォーキング・ランニング
        </span>
      </div>
    </>
  );
}

/* ─────────────── データ ─────────────── */

function DataTab({
  streak,
  totalKcal,
  totalSeconds,
}: {
  streak: number;
  totalKcal: number;
  totalSeconds: number;
}) {
  const { state } = useStore();

  const last14 = useMemo(() => {
    const days: { key: string; label: string; kcal: number; done: boolean }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      const kcal =
        state.logs.filter((l) => l.date === key).reduce((s, l) => s + l.kcal, 0) +
        state.cardioLogs.filter((l) => l.date === key).reduce((s, l) => s + l.kcal, 0);
      days.push({ key, label: WEEKDAY_JA[d.getDay()], kcal, done: kcal > 0 });
    }
    return days;
  }, [state.logs, state.cardioLogs]);

  const maxKcal = Math.max(1, ...last14.map((d) => d.kcal));
  const history = [
    ...state.logs.map((l) => ({ kind: "workout" as const, date: l.date, at: l.completedAt, log: l })),
    ...state.cardioLogs.map((l) => ({ kind: "cardio" as const, date: l.date, at: l.completedAt, log: l })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <SummaryCard icon={<TrophyIcon className="size-5" />} value={`${streak}日`} label="連続日数" tone="brand" />
        <SummaryCard
          icon={<TargetIcon className="size-5" />}
          value={`${state.logs.length + state.cardioLogs.length}回`}
          label="総トレーニング数"
        />
        <SummaryCard icon={<FlameIcon className="size-5" />} value={`${totalKcal.toLocaleString()}kcal`} label="総消費カロリー" />
        <SummaryCard icon={<ClockIcon className="size-5" />} value={formatDuration(totalSeconds)} label="総トレーニング時間" />
      </div>

      <section>
        <SectionTitle title="この2週間" />
        <Card className="p-4">
          {history.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-muted">
              まだ記録がありません。1回目を終えるとここにグラフが表示されます。
            </p>
          ) : (
            <>
              <div className="flex h-32 items-end gap-1.5">
                {last14.map((d) => (
                  <div key={d.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={cx(
                          "w-full rounded-t-md transition-all",
                          d.done ? "bg-brand-600" : "bg-canvas",
                        )}
                        style={{ height: `${Math.max(d.done ? 12 : 4, (d.kcal / maxKcal) * 100)}%` }}
                        title={`${formatDateJa(d.key)} ${d.kcal}kcal`}
                      />
                    </div>
                    <span
                      className={cx(
                        "text-[10px]",
                        d.key === todayKey() ? "font-bold text-brand-600" : "text-ink-muted",
                      )}
                    >
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="tnum mt-3 text-center text-[12px] text-ink-muted">
                最大 {maxKcal} kcal / 日
              </p>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle title="履歴" />
        {history.length === 0 ? (
          <EmptyState
            icon={<ChartIcon className="size-6" />}
            title="まだ記録がありません"
            description="最初のワークアウトを終えると、ここに履歴が並びます。"
            action={<ButtonLink href="/">今日のトレーニングへ</ButtonLink>}
          />
        ) : (
          <ul className="space-y-2">
            {history.map((h) =>
              h.kind === "workout" ? (
                <li key={`w-${h.at}`}>
                  <Card className="flex items-center gap-3 p-3.5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-[13px] font-bold text-brand-700">
                      {resolveWorkout(h.log.dayId, state)?.index ?? "–"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {resolveWorkout(h.log.dayId, state)?.title.split("｜")[0] ?? "ワークアウト"}
                      </p>
                      <p className="tnum text-[12px] text-ink-muted">
                        {formatDateJa(h.date)} ・ {formatDuration(h.log.seconds)} ・ {h.log.kcal}kcal
                      </p>
                    </div>
                    {h.log.rpe && (
                      <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-bold text-ink-muted">
                        体感 {h.log.rpe}/5
                      </span>
                    )}
                  </Card>
                </li>
              ) : (
                <li key={`c-${h.at}`}>
                  <Card className="flex items-center gap-3 p-3.5">
                    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50">
                      {h.log.path.length > 1 ? (
                        <svg viewBox="0 0 100 100" className="size-9">
                          <polyline
                            points={pathToPolyline(h.log.path)}
                            fill="none"
                            stroke="var(--color-brand-600)"
                            strokeWidth="6"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : (
                        <RouteIcon className="size-5 text-brand-700" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="tnum truncate font-bold">
                        {h.log.mode === "walk" ? "ウォーキング" : "ランニング"}{" "}
                        {(h.log.meters / 1000).toFixed(2)}km
                      </p>
                      <p className="tnum text-[12px] text-ink-muted">
                        {formatDateJa(h.date)} ・ {formatDuration(h.log.seconds)} ・ {h.log.kcal}kcal
                      </p>
                    </div>
                  </Card>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  tone = "default",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: "default" | "brand";
}) {
  return (
    <Card
      tone={tone === "brand" ? "none" : "white"}
      className={cx(
        "flex flex-col gap-1 p-4",
        tone === "brand" && "bg-brand-600 text-white shadow-[var(--shadow-float)]",
      )}
    >
      <span className={tone === "brand" ? "text-mint-300" : "text-brand-600"}>{icon}</span>
      <span className="tnum text-[20px] font-bold leading-tight">{value}</span>
      <span className={cx("text-[12px]", tone === "brand" ? "text-white/75" : "text-ink-muted")}>
        {label}
      </span>
    </Card>
  );
}
