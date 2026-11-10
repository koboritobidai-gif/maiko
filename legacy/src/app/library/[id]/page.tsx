"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExerciseMedia } from "@/components/exercise-media";
import { ChevronLeft, VideoIcon } from "@/components/icons";
import { Card, cx } from "@/components/ui";
import { EQUIPMENT_LABEL, PART_LABEL, getExercise } from "@/lib/exercises";

const DIFFICULTY_LABEL = ["", "やさしい", "ふつう", "きつい"];

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const exercise = getExercise(id);

  if (!exercise) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-bold">種目が見つかりませんでした</p>
        <Link href="/library" className="font-bold text-brand-600">
          種目一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <header className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="戻る"
          className="grid size-9 place-items-center rounded-full bg-white text-ink-soft shadow-[var(--shadow-card)]"
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="text-[13px] font-semibold text-ink-muted">種目の詳細</p>
      </header>

      <div className="px-4">
        <ExerciseMedia exercise={exercise} className="aspect-[4/3] w-full" />

        <h1 className="mt-4 text-[22px] font-bold tracking-tight">{exercise.name}</h1>
        <p className="text-[13px] text-ink-muted">{exercise.nameEn}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {exercise.parts.map((p) => (
            <Chip key={p} tone="brand">
              {PART_LABEL[p]}
            </Chip>
          ))}
          <Chip>{DIFFICULTY_LABEL[exercise.difficulty]}</Chip>
          {exercise.equipment.map((e) => (
            <Chip key={e}>{EQUIPMENT_LABEL[e]}</Chip>
          ))}
          {exercise.unilateral && <Chip>左右交互</Chip>}
        </div>

        <div className="mt-4 flex gap-2">
          <Metric
            label="標準の目安"
            value={exercise.measure === "reps" ? `${exercise.reps}回` : `${exercise.seconds}秒`}
          />
          <Metric label="強度(METs)" value={`${exercise.met}`} />
          <Metric
            label="役割"
            value={
              exercise.phase === "warmup"
                ? "準備運動"
                : exercise.phase === "cooldown"
                  ? "整理運動"
                  : "メイン"
            }
          />
        </div>

        <Section title="フォームのポイント">
          <ul className="space-y-1.5">
            {exercise.cues.map((c) => (
              <li key={c} className="flex gap-2 text-[14px] leading-relaxed">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-600" />
                {c}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="よくあるミス">
          <ul className="space-y-1.5">
            {exercise.mistakes.map((m) => (
              <li key={m} className="flex gap-2 text-[14px] leading-relaxed">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-orange-400" />
                {m}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="呼吸">
          <p className="text-[14px] leading-relaxed">{exercise.breathing}</p>
        </Section>

        {!exercise.video && (
          <Card tone="none" className="mt-4 flex items-start gap-3 border border-brand-100 bg-brand-50/60 p-4 shadow-none">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
              <VideoIcon className="size-4.5" />
            </span>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              この種目のnaruのお手本動画は準備中です。撮影が完了すると、この場所と
              トレーニング中の画面に自動で表示されます。
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[15px] font-bold">{title}</h2>
      <Card className="p-4 shadow-none ring-1 ring-line">{children}</Card>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl bg-white py-3 shadow-[var(--shadow-card)]">
      <span className="tnum text-[16px] font-bold">{value}</span>
      <span className="text-[11px] text-ink-muted">{label}</span>
    </div>
  );
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "brand" }) {
  return (
    <span
      className={cx(
        "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
        tone === "brand" ? "bg-brand-600 text-white" : "bg-white text-ink-soft ring-1 ring-line",
      )}
    >
      {children}
    </span>
  );
}
