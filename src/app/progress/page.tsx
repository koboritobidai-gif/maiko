"use client";

import { useMemo, useState } from "react";
import {
  ChartIcon,
  ClockIcon,
  FlameIcon,
  TargetIcon,
  TrophyIcon,
} from "@/components/icons";
import { Button, ButtonLink, Card, EmptyState, SectionTitle, cx } from "@/components/ui";
import { WEEKDAY_JA, formatDateJa, formatDuration, toDateKey, todayKey } from "@/lib/format";
import { useStore } from "@/store/app-store";

export default function ProgressPage() {
  const { ready, state, streak, totalKcal, totalSeconds } = useStore();
  const [weightInput, setWeightInput] = useState("");

  const last14 = useMemo(() => {
    const days: { key: string; label: string; kcal: number; done: boolean }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      const logs = state.logs.filter((l) => l.date === key);
      days.push({
        key,
        label: WEEKDAY_JA[d.getDay()],
        kcal: logs.reduce((s, l) => s + l.kcal, 0),
        done: logs.length > 0,
      });
    }
    return days;
  }, [state.logs]);

  const maxKcal = Math.max(1, ...last14.map((d) => d.kcal));
  const recent = [...state.logs].reverse().slice(0, 12);
  const weights = state.weights.slice(-12);

  if (!ready) return <div className="p-6 text-center text-ink-muted">読み込み中…</div>;

  return (
    <div className="space-y-6 px-4 pb-6 pt-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight">記録</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">積み上げた分だけ、体は変わります</p>
      </header>

      {/* サマリー */}
      <div className="grid grid-cols-2 gap-2.5">
        <SummaryCard
          icon={<TrophyIcon className="size-5" />}
          value={`${streak}日`}
          label="連続日数"
          tone="brand"
        />
        <SummaryCard
          icon={<TargetIcon className="size-5" />}
          value={`${state.logs.length}回`}
          label="総トレーニング数"
        />
        <SummaryCard
          icon={<FlameIcon className="size-5" />}
          value={`${totalKcal.toLocaleString()}kcal`}
          label="総消費カロリー"
        />
        <SummaryCard
          icon={<ClockIcon className="size-5" />}
          value={formatDuration(totalSeconds)}
          label="総トレーニング時間"
        />
      </div>

      {/* 2週間の推移 */}
      <section>
        <SectionTitle title="この2週間" />
        <Card className="p-4">
          {state.logs.length === 0 ? (
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

      {/* 体重記録 */}
      <section>
        <SectionTitle title="体重の記録" />
        <Card className="p-4">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="今日の体重(kg)"
              aria-label="今日の体重"
              className="h-11 flex-1 rounded-full border border-line px-4 text-[15px] outline-none focus:border-brand-400"
            />
            <WeightSaveButton value={weightInput} onSaved={() => setWeightInput("")} />
          </div>

          {weights.length > 0 && (
            <>
              <WeightChart data={weights} />
              <p className="tnum mt-2 text-center text-[12px] text-ink-muted">
                {formatDateJa(weights[0].date)} → {formatDateJa(weights[weights.length - 1].date)}
                {weights.length > 1 && (
                  <>
                    {" ・ "}
                    {(weights[weights.length - 1].kg - weights[0].kg).toFixed(1)} kg
                  </>
                )}
              </p>
            </>
          )}
        </Card>
      </section>

      {/* 履歴 */}
      <section>
        <SectionTitle title="履歴" />
        {recent.length === 0 ? (
          <EmptyState
            icon={<ChartIcon className="size-6" />}
            title="まだ記録がありません"
            description="最初のワークアウトを終えると、ここに履歴が並びます。"
            action={<ButtonLink href="/">今日のトレーニングへ</ButtonLink>}
          />
        ) : (
          <ul className="space-y-2">
            {recent.map((l) => {
              const day = state.plan?.days.find((d) => d.id === l.dayId);
              return (
                <li key={`${l.dayId}-${l.completedAt}`}>
                  <Card className="flex items-center gap-3 p-3.5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-[13px] font-bold text-brand-700">
                      {day?.index ?? "–"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {day?.title.split("｜")[0] ?? "ワークアウト"}
                      </p>
                      <p className="tnum text-[12px] text-ink-muted">
                        {formatDateJa(l.date)} ・ {formatDuration(l.seconds)} ・ {l.kcal}kcal
                      </p>
                    </div>
                    {l.rpe && (
                      <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-bold text-ink-muted">
                        体感 {l.rpe}/5
                      </span>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function WeightSaveButton({ value, onSaved }: { value: string; onSaved: () => void }) {
  const { addWeight } = useStore();
  const n = Number(value);
  const valid = value !== "" && Number.isFinite(n) && n > 20 && n < 300;
  return (
    <Button
      disabled={!valid}
      onClick={() => {
        addWeight(n);
        onSaved();
      }}
    >
      記録
    </Button>
  );
}

function WeightChart({ data }: { data: { date: string; kg: number }[] }) {
  if (data.length < 2) {
    return (
      <p className="tnum mt-4 text-center text-[15px] font-bold">
        {data[0].kg} kg
        <span className="ml-2 text-[12px] font-normal text-ink-muted">
          （2回以上記録するとグラフが表示されます）
        </span>
      </p>
    );
  }

  const min = Math.min(...data.map((d) => d.kg));
  const max = Math.max(...data.map((d) => d.kg));
  const span = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.kg - min) / span) * 80 - 10;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-4 h-24 w-full">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((d.kg - min) / span) * 80 - 10;
        return <circle key={d.date} cx={x} cy={y} r="1.6" fill="var(--color-brand-600)" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
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
