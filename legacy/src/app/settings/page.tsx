"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RestartIcon, SparkIcon } from "@/components/icons";
import { Button, ButtonLink, Card, SectionTitle, ToggleRow, cx } from "@/components/ui";
import { AREA_LABEL, EQUIPMENT_LABEL } from "@/lib/exercises";
import { useStore } from "@/store/app-store";
import type { Equipment, Goal, Place, TargetArea } from "@/lib/types";

const GOALS: { id: Goal; label: string }[] = [
  { id: "lose", label: "体重を減らす" },
  { id: "build", label: "筋肉増強" },
  { id: "healthy", label: "健康維持" },
];

const TARGETS: TargetArea[] = ["abs", "chest", "armsBack", "hipsLegs", "fullbody"];
const EQUIPMENTS: Equipment[] = ["chair", "dumbbell", "band"];
const INTENSITY_LABEL = ["とてもやさしい", "やさしい", "ふつう", "きつめ", "かなりきつい"];

export default function SettingsPage() {
  const router = useRouter();
  const { ready, state, updateProfile, setSettings, resetAll } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);

  if (!ready) return <div className="p-6 text-center text-ink-muted">読み込み中…</div>;

  const profile = state.profile;
  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-bold">まだプランがありません</p>
        <ButtonLink href="/onboarding">プランを作成する</ButtonLink>
      </div>
    );
  }

  const toggleTarget = (t: TargetArea) => {
    const has = profile.targets.includes(t);
    const next =
      t === "fullbody"
        ? has
          ? profile.targets.filter((x) => x !== t)
          : ["fullbody" as TargetArea]
        : has
          ? profile.targets.filter((x) => x !== t)
          : [...profile.targets.filter((x) => x !== "fullbody"), t];
    updateProfile({ targets: next.length ? next : ["fullbody"] });
  };

  const toggleEquipment = (e: Equipment) => {
    const has = profile.equipment.includes(e);
    updateProfile({
      equipment: has ? profile.equipment.filter((x) => x !== e) : [...profile.equipment, e],
    });
  };

  return (
    <div className="space-y-6 px-4 pb-8 pt-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight">マイページ</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          変更するとプランがその場で作り直されます
        </p>
      </header>

      {/* トレーニング場所 */}
      <section>
        <SectionTitle title="トレーニング場所" />
        <div className="grid grid-cols-2 gap-2">
          {(["home", "gym"] as Place[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => updateProfile({ place: p })}
              aria-pressed={profile.place === p}
              className={cx(
                "rounded-2xl px-2 py-4 text-[14px] font-bold transition-colors",
                profile.place === p
                  ? "bg-brand-600 text-white shadow-[var(--shadow-float)]"
                  : "bg-white text-ink-soft shadow-[var(--shadow-card)] hover:bg-brand-50",
              )}
            >
              {p === "home" ? "自宅" : "ジム"}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-muted">
          {profile.place === "gym"
            ? "マシン・バーベル・ケーブルを使うメニューで組みます。"
            : "器具なしの自重メニューを中心に組みます。"}
        </p>
      </section>

      {/* 目標 */}
      <section>
        <SectionTitle title="あなたの目標" />
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => updateProfile({ goal: g.id })}
              aria-pressed={profile.goal === g.id}
              className={cx(
                "rounded-2xl px-2 py-4 text-[13px] font-bold leading-snug transition-colors",
                profile.goal === g.id
                  ? "bg-brand-600 text-white shadow-[var(--shadow-float)]"
                  : "bg-white text-ink-soft shadow-[var(--shadow-card)] hover:bg-brand-50",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      {/* 強度 */}
      <section>
        <SectionTitle title="強度" />
        <Card className="p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-[13px] text-ink-muted">レベル</span>
            <span className="text-[17px] font-bold text-brand-700">
              {INTENSITY_LABEL[profile.intensity - 1]}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={profile.intensity}
            onChange={(e) => updateProfile({ intensity: Number(e.target.value) })}
            aria-label="トレーニング強度"
            className="w-full accent-[#2563eb]"
          />
          <div className="tnum mt-1 flex justify-between text-[11px] text-ink-muted">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </Card>
      </section>

      {/* 頻度・時間 */}
      <section>
        <SectionTitle title="ペース" />
        <Card className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">週あたりの日数</p>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateProfile({ daysPerWeek: n })}
                  aria-pressed={profile.daysPerWeek === n}
                  className={cx(
                    "tnum flex-1 rounded-xl py-2.5 font-bold transition-colors",
                    profile.daysPerWeek === n
                      ? "bg-brand-600 text-white"
                      : "bg-canvas text-ink-soft hover:bg-brand-50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">1回あたりの時間</p>
            <div className="flex gap-2">
              {[10, 15, 20, 30].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateProfile({ minutesPerSession: n })}
                  aria-pressed={profile.minutesPerSession === n}
                  className={cx(
                    "tnum flex-1 rounded-xl py-2.5 font-bold transition-colors",
                    profile.minutesPerSession === n
                      ? "bg-brand-600 text-white"
                      : "bg-canvas text-ink-soft hover:bg-brand-50",
                  )}
                >
                  {n}分
                </button>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* ターゲット部位 */}
      <section>
        <SectionTitle title="ターゲット部位" />
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTarget(t)}
              aria-pressed={profile.targets.includes(t)}
              className={cx(
                "rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors",
                profile.targets.includes(t)
                  ? "bg-brand-600 text-white"
                  : "bg-white text-ink-soft shadow-[var(--shadow-card)] hover:bg-brand-50",
              )}
            >
              {AREA_LABEL[t]}
            </button>
          ))}
        </div>
      </section>

      {/* 器具（自宅のときだけ） */}
      <section className={profile.place === "gym" ? "hidden" : undefined}>
        <SectionTitle title="使える器具" />
        <div className="flex flex-wrap gap-2">
          {EQUIPMENTS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => toggleEquipment(e)}
              aria-pressed={profile.equipment.includes(e)}
              className={cx(
                "rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors",
                profile.equipment.includes(e)
                  ? "bg-brand-600 text-white"
                  : "bg-white text-ink-soft shadow-[var(--shadow-card)] hover:bg-brand-50",
              )}
            >
              {EQUIPMENT_LABEL[e]}
            </button>
          ))}
        </div>
      </section>

      {/* 通知・サウンド */}
      <section>
        <SectionTitle title="サウンドと振動" />
        <Card className="px-5 py-2">
          <ToggleRow
            label="カウント音"
            checked={state.settings.sound}
            onChange={(v) => setSettings({ sound: v })}
          />
          <ToggleRow
            label="バイブレーション"
            checked={state.settings.vibration}
            onChange={(v) => setSettings({ vibration: v })}
          />
        </Card>
      </section>

      {/* プラン再作成 */}
      <section>
        <SectionTitle title="プラン" />
        <Card className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
              <SparkIcon className="size-5" />
            </span>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              質問に答え直して、4週間のプランを最初から作り直せます。
              これまでの記録は残ります。
            </p>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => router.push("/onboarding")}>
            <RestartIcon className="size-4.5" />
            プランを作り直す
          </Button>
        </Card>
      </section>

      {/* データ削除 */}
      <section>
        <Card className="space-y-3 p-5">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            すべてのデータ（プロフィール・プラン・記録）を端末から削除します。この操作は取り消せません。
          </p>
          {confirmReset ? (
            <div className="grid gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  resetAll();
                  router.push("/");
                }}
              >
                本当に削除する
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                キャンセル
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => setConfirmReset(true)}>
              データをすべて削除
            </Button>
          )}
        </Card>
      </section>
    </div>
  );
}
