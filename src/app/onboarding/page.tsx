"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BodyFigure } from "@/components/body-figure";
import {
  CheckIcon,
  ChevronLeft,
  DumbbellOffIcon,
  FlameIcon,
  SparkIcon,
  TargetIcon,
  TrophyIcon,
} from "@/components/icons";
import { Button, OptionCard, cx } from "@/components/ui";
import { AREA_TO_PARTS } from "@/lib/exercises";
import { useStore } from "@/store/app-store";
import type {
  AgeBand,
  Equipment,
  Experience,
  Gender,
  Goal,
  Place,
  Profile,
  TargetArea,
} from "@/lib/types";

const STEPS = [
  "gender",
  "age",
  "place",
  "target",
  "goal",
  "experience",
  "intensity",
  "schedule",
  "equipment",
  "body",
] as const;
type Step = (typeof STEPS)[number];

const GENDERS: { id: Gender; label: string; sub: string }[] = [
  { id: "female", label: "女性", sub: "しなやかな体づくり" },
  { id: "male", label: "男性", sub: "力強い体づくり" },
  { id: "other", label: "回答しない", sub: "標準的なメニュー" },
];

const AGES: { id: AgeBand; label: string; sub: string }[] = [
  { id: "u25", label: "25歳未満", sub: "回復が速い時期。強度を上げやすい" },
  { id: "a25_35", label: "25〜35歳", sub: "仕事と両立できる短時間集中型" },
  { id: "a35_45", label: "35〜45歳", sub: "関節にやさしい種目を多めに" },
  { id: "a45p", label: "45歳以上", sub: "ウォームアップを長めに設定" },
];

const TARGETS: { id: TargetArea; label: string; sub: string }[] = [
  { id: "abs", label: "腹筋", sub: "お腹まわりを引き締める" },
  { id: "chest", label: "胸部", sub: "厚みのある胸をつくる" },
  { id: "armsBack", label: "腕と背中", sub: "二の腕・姿勢を整える" },
  { id: "hipsLegs", label: "ヒップと脚", sub: "下半身を強く・美しく" },
  { id: "fullbody", label: "全身", sub: "バランスよく鍛える" },
];

const GOALS: { id: Goal; label: string; sub: string }[] = [
  { id: "lose", label: "体重を減らす", sub: "有酸素を多めに組み込みます" },
  { id: "build", label: "筋肉増強", sub: "部位を分けてしっかり追い込みます" },
  { id: "healthy", label: "健康維持", sub: "無理なく続く全身メニュー" },
];

const EXPERIENCES: { id: Experience; label: string; sub: string }[] = [
  { id: "beginner", label: "初心者", sub: "運動はほとんどしていない" },
  { id: "intermediate", label: "中級者", sub: "たまに運動している" },
  { id: "advanced", label: "上級者", sub: "習慣的に運動している" },
];

const EQUIPMENTS: { id: Equipment; label: string; sub: string }[] = [
  { id: "chair", label: "椅子", sub: "ディップスや傾斜腕立てに使います" },
  { id: "dumbbell", label: "ダンベル", sub: "ペットボトルでも代用できます" },
  { id: "band", label: "トレーニングチューブ", sub: "背中・肩の種目が増えます" },
];

const PLACES: { id: Place; label: string; sub: string }[] = [
  { id: "home", label: "自宅", sub: "器具なし・自重メニュー中心で組みます" },
  { id: "gym", label: "ジム", sub: "マシンやバーベルを使ったメニューを組みます" },
];

interface Draft {
  gender: Gender | null;
  ageBand: AgeBand | null;
  place: Place | null;
  targets: TargetArea[];
  goal: Goal | null;
  experience: Experience | null;
  intensity: number;
  daysPerWeek: number;
  minutesPerSession: number;
  equipment: Equipment[];
  weightKg: string;
  heightCm: string;
}

const INITIAL_DRAFT: Draft = {
  gender: null,
  ageBand: null,
  place: null,
  targets: [],
  goal: null,
  experience: null,
  intensity: 3,
  daysPerWeek: 4,
  minutesPerSession: 20,
  equipment: [],
  weightKg: "",
  heightCm: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const { setProfile } = useStore();
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [building, setBuilding] = useState(false);

  const step: Step = STEPS[stepIdx];
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const canAdvance = useMemo(() => {
    switch (step) {
      case "gender":
        return draft.gender !== null;
      case "age":
        return draft.ageBand !== null;
      case "place":
        return draft.place !== null;
      case "target":
        return draft.targets.length > 0;
      case "goal":
        return draft.goal !== null;
      case "experience":
        return draft.experience !== null;
      default:
        return true;
    }
  }, [step, draft]);

  const back = () => {
    if (stepIdx === 0) router.push("/");
    else setStepIdx((i) => i - 1);
  };

  const next = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
      return;
    }
    finish();
  };

  const finish = () => {
    setBuilding(true);
    const profile: Profile = {
      gender: draft.gender ?? "other",
      ageBand: draft.ageBand ?? "a25_35",
      place: draft.place ?? "home",
      experience: draft.experience ?? "beginner",
      goal: draft.goal ?? "healthy",
      targets: draft.targets.length ? draft.targets : ["fullbody"],
      equipment: draft.equipment,
      intensity: draft.intensity,
      daysPerWeek: draft.daysPerWeek,
      minutesPerSession: draft.minutesPerSession,
      weightKg: draft.weightKg ? Number(draft.weightKg) : null,
      heightCm: draft.heightCm ? Number(draft.heightCm) : null,
      createdAt: new Date().toISOString(),
    };
    setProfile(profile);
    // 「あなた専用に組み立てています」の演出
    window.setTimeout(() => router.replace("/"), 1400);
  };

  const activeParts = draft.targets.flatMap((t) => AREA_TO_PARTS[t]);

  if (building) return <BuildingScreen />;

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 text-white">
      {/* ヘッダー：戻る＋進捗 */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <button
          type="button"
          onClick={back}
          aria-label="前の質問へ戻る"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-mint-400 transition-[width] duration-400"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <span className="tnum w-10 shrink-0 text-right text-[13px] font-semibold text-white/80">
          {stepIdx + 1}/{STEPS.length}
        </span>
      </header>

      <main key={step} className="animate-rise flex-1 px-5 pb-4 pt-3">
        {step === "gender" && (
          <StepShell title="あなたに合わせて" accent="メニューを作ります" caption="まずは性別を教えてください">
            <div className="grid gap-3">
              {GENDERS.map((g) => (
                <OptionCard
                  key={g.id}
                  selected={draft.gender === g.id}
                  onClick={() => {
                    patch({ gender: g.id });
                    window.setTimeout(next, 180);
                  }}
                  className="px-5 py-4"
                >
                  <p className="text-lg font-bold">{g.label}</p>
                  <p className="text-[13px] text-white/70">{g.sub}</p>
                </OptionCard>
              ))}
            </div>
          </StepShell>
        )}

        {step === "age" && (
          <StepShell title="年齢に合わせた" accent="トレーニング" caption="回復力に合わせて強度を調整します">
            <div className="grid gap-3">
              {AGES.map((a) => (
                <OptionCard
                  key={a.id}
                  selected={draft.ageBand === a.id}
                  onClick={() => {
                    patch({ ageBand: a.id });
                    window.setTimeout(next, 180);
                  }}
                  className="px-5 py-4"
                >
                  <p className="text-lg font-bold">{a.label}</p>
                  <p className="text-[13px] text-white/70">{a.sub}</p>
                </OptionCard>
              ))}
            </div>
          </StepShell>
        )}

        {step === "place" && (
          <StepShell
            title="どこで"
            accent="トレーニングしますか？"
            caption="あとから切り替えられます"
          >
            <div className="grid gap-3">
              {PLACES.map((p) => (
                <OptionCard
                  key={p.id}
                  selected={draft.place === p.id}
                  onClick={() => {
                    patch({ place: p.id });
                    window.setTimeout(next, 180);
                  }}
                  className="px-5 py-4"
                >
                  <p className="text-lg font-bold">{p.label}</p>
                  <p className="text-[13px] text-white/70">{p.sub}</p>
                </OptionCard>
              ))}
            </div>
          </StepShell>
        )}

        {step === "target" && (
          <StepShell
            title="ターゲット部位を鍛えて"
            accent="最大限の効果を出しましょう"
            caption="複数選べます"
          >
            <div className="flex gap-4">
              <div className="w-[104px] shrink-0">
                <BodyFigure active={activeParts} className="w-full" />
              </div>
              <div className="grid flex-1 gap-2.5">
                {TARGETS.map((t) => {
                  const selected = draft.targets.includes(t.id);
                  return (
                    <OptionCard
                      key={t.id}
                      selected={selected}
                      onClick={() =>
                        patch({
                          targets:
                            t.id === "fullbody"
                              ? selected
                                ? []
                                : ["fullbody"]
                              : selected
                                ? draft.targets.filter((x) => x !== t.id)
                                : [...draft.targets.filter((x) => x !== "fullbody"), t.id],
                        })
                      }
                      className="px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold">{t.label}</p>
                          <p className="text-[12px] text-white/70">{t.sub}</p>
                        </div>
                        <span
                          className={cx(
                            "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                            selected
                              ? "border-mint-400 bg-mint-400 text-brand-800"
                              : "border-white/40",
                          )}
                        >
                          {selected && <CheckIcon className="size-4" strokeWidth={3} />}
                        </span>
                      </div>
                    </OptionCard>
                  );
                })}
              </div>
            </div>
          </StepShell>
        )}

        {step === "goal" && (
          <StepShell title="あなたの目標は" accent="なんですか？" caption="メニューの組み方が変わります">
            <div className="grid gap-3">
              {GOALS.map((g) => (
                <OptionCard
                  key={g.id}
                  selected={draft.goal === g.id}
                  onClick={() => {
                    patch({ goal: g.id });
                    window.setTimeout(next, 180);
                  }}
                  className="px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 text-mint-300">
                      {g.id === "lose" ? (
                        <FlameIcon className="size-6" />
                      ) : g.id === "build" ? (
                        <TrophyIcon className="size-6" />
                      ) : (
                        <SparkIcon className="size-6" />
                      )}
                    </span>
                    <div>
                      <p className="text-lg font-bold">{g.label}</p>
                      <p className="text-[13px] text-white/70">{g.sub}</p>
                    </div>
                  </div>
                </OptionCard>
              ))}
            </div>
          </StepShell>
        )}

        {step === "experience" && (
          <StepShell title="今の運動レベルを" accent="教えてください" caption="正直に選ぶほど続けやすくなります">
            <div className="grid gap-3">
              {EXPERIENCES.map((e) => (
                <OptionCard
                  key={e.id}
                  selected={draft.experience === e.id}
                  onClick={() => {
                    patch({ experience: e.id });
                    window.setTimeout(next, 180);
                  }}
                  className="px-5 py-4"
                >
                  <p className="text-lg font-bold">{e.label}</p>
                  <p className="text-[13px] text-white/70">{e.sub}</p>
                </OptionCard>
              ))}
            </div>
          </StepShell>
        )}

        {step === "intensity" && (
          <StepShell title="強度を" accent="調整しましょう" caption="あとからいつでも変更できます">
            <div className="rounded-2xl bg-white/12 p-5">
              <div className="mb-6 flex items-baseline justify-between">
                <span className="text-sm text-white/75">レベル</span>
                <span className="text-2xl font-bold">
                  {["とてもやさしい", "やさしい", "ふつう", "きつめ", "かなりきつい"][draft.intensity - 1]}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={draft.intensity}
                onChange={(e) => patch({ intensity: Number(e.target.value) })}
                aria-label="トレーニング強度"
                className="w-full accent-[#34e0c0]"
              />
              <div className="mt-2 flex justify-between text-[11px] text-white/60">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
              <p className="mt-5 rounded-xl bg-white/10 p-3 text-[13px] leading-relaxed text-white/80">
                {
                  [
                    "まずは体を動かす習慣づくりから。休憩を長めにとります。",
                    "軽い負荷で丁寧に。フォームを覚える期間に最適です。",
                    "標準的な強度。週の後半に向けて少しずつ負荷が上がります。",
                    "追い込み多め。休憩は短く、種目の秒数が長くなります。",
                    "高強度。しっかり運動習慣がある方向けの設定です。",
                  ][draft.intensity - 1]
                }
              </p>
            </div>
          </StepShell>
        )}

        {step === "schedule" && (
          <StepShell title="続けられる" accent="ペースを決めよう" caption="習慣化がいちばんの近道です">
            <div className="grid gap-4">
              <div className="rounded-2xl bg-white/12 p-5">
                <p className="mb-3 text-sm text-white/75">週に何日トレーニングしますか？</p>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patch({ daysPerWeek: n })}
                      aria-pressed={draft.daysPerWeek === n}
                      className={cx(
                        "tnum flex-1 rounded-xl py-3 text-lg font-bold transition-colors",
                        draft.daysPerWeek === n
                          ? "bg-mint-400 text-brand-800"
                          : "bg-white/12 text-white hover:bg-white/20",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-white/12 p-5">
                <p className="mb-3 text-sm text-white/75">1回あたりの時間は？</p>
                <div className="flex gap-2">
                  {[10, 15, 20, 30].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patch({ minutesPerSession: n })}
                      aria-pressed={draft.minutesPerSession === n}
                      className={cx(
                        "tnum flex-1 rounded-xl py-3 font-bold transition-colors",
                        draft.minutesPerSession === n
                          ? "bg-mint-400 text-brand-800"
                          : "bg-white/12 text-white hover:bg-white/20",
                      )}
                    >
                      {n}分
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </StepShell>
        )}

        {step === "equipment" && draft.place === "gym" && (
          <StepShell
            title="ジムの器具は"
            accent="そろっています"
            caption="マシン・バーベル・ケーブルを使う前提でメニューを組みます"
          >
            <div className="rounded-2xl bg-white/12 p-5">
              <p className="text-[14px] leading-relaxed text-white/85">
                ジムを選んだ場合は、マシン・バーベル・ダンベル・ケーブル・懸垂バーが
                使える前提でメニューを作ります。使えない器具があるときは、
                トレーニング中に「次の種目」で飛ばしてください。
              </p>
            </div>
          </StepShell>
        )}

        {step === "equipment" && draft.place !== "gym" && (
          <StepShell
            title="持っている器具は"
            accent="ありますか？"
            caption="何もなくても大丈夫。器具なしメニューで組みます"
          >
            <div className="grid gap-2.5">
              <div className="flex items-center gap-3 rounded-2xl border-2 border-mint-400/60 bg-white/12 px-4 py-3">
                <DumbbellOffIcon className="size-6 shrink-0 text-mint-300" />
                <div>
                  <p className="font-bold">器具なし（標準）</p>
                  <p className="text-[12px] text-white/70">
                    自重メニューだけでも4週間のプランが組めます
                  </p>
                </div>
              </div>
              {EQUIPMENTS.map((eq) => {
                const selected = draft.equipment.includes(eq.id);
                return (
                  <OptionCard
                    key={eq.id}
                    selected={selected}
                    onClick={() =>
                      patch({
                        equipment: selected
                          ? draft.equipment.filter((x) => x !== eq.id)
                          : [...draft.equipment, eq.id],
                      })
                    }
                    className="px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold">{eq.label}</p>
                        <p className="text-[12px] text-white/70">{eq.sub}</p>
                      </div>
                      <span
                        className={cx(
                          "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                          selected ? "border-mint-400 bg-mint-400 text-brand-800" : "border-white/40",
                        )}
                      >
                        {selected && <CheckIcon className="size-4" strokeWidth={3} />}
                      </span>
                    </div>
                  </OptionCard>
                );
              })}
            </div>
          </StepShell>
        )}

        {step === "body" && (
          <StepShell
            title="最後に体の情報を"
            accent="教えてください"
            caption="消費カロリーの計算に使います（任意）"
          >
            <div className="grid gap-3">
              <NumberField
                label="体重"
                unit="kg"
                value={draft.weightKg}
                onChange={(v) => patch({ weightKg: v })}
                placeholder="60"
              />
              <NumberField
                label="身長"
                unit="cm"
                value={draft.heightCm}
                onChange={(v) => patch({ heightCm: v })}
                placeholder="165"
              />
              <p className="px-1 text-[12px] leading-relaxed text-white/70">
                入力しなくても始められます。データは端末の中だけに保存され、外部には送信されません。
              </p>
            </div>
          </StepShell>
        )}
      </main>

      <footer className="px-5 pb-8 pt-2" style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}>
        <Button
          size="lg"
          variant="light"
          disabled={!canAdvance}
          onClick={next}
          className="w-full shadow-none"
        >
          {stepIdx === STEPS.length - 1 ? "プランを作成する" : "次へ"}
        </Button>
      </footer>
    </div>
  );
}

function StepShell({
  title,
  accent,
  caption,
  children,
}: {
  title: string;
  accent: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        {title}
        <br />
        <span className="text-mint-300">{accent}</span>
      </h1>
      <p className="mb-5 mt-1.5 text-[13px] text-white/75">{caption}</p>
      {children}
    </>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/12 px-5 py-4">
      <span className="font-bold">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="tnum w-24 border-b-2 border-white/40 bg-transparent pb-1 text-right text-2xl font-bold outline-none placeholder:text-white/35 focus:border-mint-400"
        />
        <span className="text-sm text-white/70">{unit}</span>
      </span>
    </label>
  );
}

function BuildingScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-700 to-brand-500 px-8 text-center text-white">
      <div className="relative grid size-24 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-mint-400/30" />
        <span className="grid size-20 place-items-center rounded-full bg-white/15">
          <TargetIcon className="size-10 text-mint-300" />
        </span>
      </div>
      <div>
        <p className="text-xl font-bold">あなた専用のプランを</p>
        <p className="text-xl font-bold">組み立てています…</p>
      </div>
      <p className="max-w-[28ch] text-[13px] leading-relaxed text-white/75">
        目標・強度・使える器具から、4週間分のメニューを自動で作成します。
      </p>
    </div>
  );
}
