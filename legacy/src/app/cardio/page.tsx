"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronLeft,
  CloseIcon,
  PauseIcon,
  PlayIcon,
} from "@/components/icons";
import { Button, Card, cx } from "@/components/ui";
import { formatPace, haversine, metForSpeed, pathToPolyline } from "@/lib/geo";
import { formatClock, todayKey } from "@/lib/format";
import { beep, unlockAudio, vibrate } from "@/lib/feedback";
import { useStore } from "@/store/app-store";
import type { CardioLog } from "@/lib/types";

type Status = "idle" | "running" | "paused" | "done";
type GpsState = "unknown" | "ok" | "denied" | "unavailable";

interface Point {
  lat: number;
  lng: number;
}

export default function CardioPage() {
  const router = useRouter();
  const { state, addCardioLog } = useStore();

  const [mode, setMode] = useState<"walk" | "run">("walk");
  const [status, setStatus] = useState<Status>("idle");
  const [gps, setGps] = useState<GpsState>("unknown");
  const [seconds, setSeconds] = useState(0);
  const [meters, setMeters] = useState(0);
  const [path, setPath] = useState<Point[]>([]);
  const [manualKm, setManualKm] = useState("");
  const [saved, setSaved] = useState(false);

  const watchId = useRef<number | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const lastAt = useRef<number>(0);
  const statusRef = useRef<Status>("idle");
  statusRef.current = status;

  const weightKg = state.profile?.weightKg ?? 62;
  const speed = seconds > 0 ? meters / seconds : 0;
  const kcal = Math.round((metForSpeed(speed) * 3.5 * weightKg) / 200 / 60 * seconds);

  /* ── 経過時間 ── */
  useEffect(() => {
    if (status !== "running") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  /* ── 位置情報の追跡 ── */
  const startWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps("unavailable");
      return;
    }
    if (watchId.current !== null) return;

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps("ok");
        if (statusRef.current !== "running") return;
        // 精度が悪い点は捨てる（歩いていないのに距離が伸びるのを防ぐ）
        if (pos.coords.accuracy > 35) return;
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const now = pos.timestamp || Date.now();
        const prev = lastPoint.current;

        if (prev) {
          const d = haversine(prev, point);
          const dt = Math.max(1, (now - lastAt.current) / 1000);
          // 人が出せない速度（8m/s＝時速29km超）で動いた点は GPS の飛びとみなす
          const jumped = d / dt > 8;
          if (jumped) {
            lastPoint.current = point;
            lastAt.current = now;
            return;
          }
          // 立ち止まっているときの細かな揺らぎは足さない
          if (d > 1.5) setMeters((m) => m + d);
        }

        lastPoint.current = point;
        lastAt.current = now;
        setPath((p) => [...p, point]);
      },
      (err) => {
        setGps(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, []);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  useEffect(() => stopWatch, [stopWatch]);

  const start = () => {
    unlockAudio();
    beep("go", state.settings.sound);
    vibrate(40, state.settings.vibration);
    setStatus("running");
    startWatch();
  };

  const finish = () => {
    stopWatch();
    setStatus("done");
    beep("finish", state.settings.sound);
    vibrate([60, 60, 120], state.settings.vibration);
  };

  const save = () => {
    const manual = Number(manualKm);
    const finalMeters =
      meters < 20 && Number.isFinite(manual) && manual > 0 ? manual * 1000 : meters;
    const finalSpeed = seconds > 0 ? finalMeters / seconds : 0;
    const log: CardioLog = {
      id: `c-${new Date().toISOString()}`,
      date: todayKey(),
      completedAt: new Date().toISOString(),
      mode,
      seconds,
      meters: Math.round(finalMeters),
      kcal: Math.round((metForSpeed(finalSpeed) * 3.5 * weightKg) / 200 / 60 * seconds),
      path,
    };
    addCardioLog(log);
    setSaved(true);
    window.setTimeout(() => router.replace("/progress"), 700);
  };

  const km = (meters / 1000).toFixed(2);
  const polyline = pathToPolyline(path);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-800 to-brand-600 text-white">
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          type="button"
          onClick={() => {
            stopWatch();
            router.back();
          }}
          aria-label="戻る"
          className="grid size-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          {status === "idle" ? <ChevronLeft className="size-5" /> : <CloseIcon className="size-5" />}
        </button>
        <GpsBadge gps={gps} />
        <span className="size-9" />
      </header>

      {/* モード切り替え */}
      {status === "idle" && (
        <div className="mx-auto mt-5 flex gap-1 rounded-full bg-white/12 p-1">
          {(["walk", "run"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cx(
                "rounded-full px-6 py-2 text-[14px] font-bold transition-colors",
                mode === m ? "bg-white text-brand-700" : "text-white/80 hover:text-white",
              )}
            >
              {m === "walk" ? "ウォーキング" : "ランニング"}
            </button>
          ))}
        </div>
      )}

      {/* 計測 */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-[13px] font-semibold text-mint-300">
          {mode === "walk" ? "ウォーキング" : "ランニング"}
        </p>
        <p className="tnum mt-1 text-[64px] font-bold leading-none">{formatClock(seconds)}</p>

        <div className="mt-6 flex w-full max-w-[22rem] items-stretch">
          <Metric value={km} label="km" />
          <Divider />
          <Metric value={formatPace(meters, seconds)} label="ペース(分/km)" />
          <Divider />
          <Metric value={`${kcal}`} label="kcal" />
        </div>

        {/* ルートの形（地図タイルを使わずに軌跡だけを描く） */}
        <div className="mt-6 w-full max-w-[22rem]">
          <Card tone="none" className="bg-white/10 p-3 shadow-none">
            {polyline ? (
              <svg viewBox="0 0 100 100" className="h-40 w-full">
                <polyline
                  points={polyline}
                  fill="none"
                  stroke="#34e0c0"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <div className="grid h-40 place-items-center px-6 text-[12px] leading-relaxed text-white/70">
                {gps === "denied"
                  ? "位置情報が許可されていません。距離は記録できませんが、時間と消費カロリーは計測できます。"
                  : gps === "unavailable"
                    ? "この端末では位置情報を取得できませんでした。時間だけ計測します。"
                    : status === "idle"
                      ? "スタートすると、歩いた・走ったルートの形がここに描かれます"
                      : "位置情報を取得しています…"}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 操作 */}
      <div
        className="px-6 pb-8 pt-4"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
      >
        {status === "idle" && (
          <Button size="lg" variant="light" onClick={start} className="w-full shadow-none">
            <PlayIcon className="size-5" />
            スタート
          </Button>
        )}

        {(status === "running" || status === "paused") && (
          <div className="flex gap-2">
            <Button
              size="lg"
              variant="translucent"
              onClick={() => setStatus(status === "running" ? "paused" : "running")}
              className="flex-1"
            >
              {status === "running" ? (
                <>
                  <PauseIcon className="size-5" />
                  一時停止
                </>
              ) : (
                <>
                  <PlayIcon className="size-5" />
                  再開
                </>
              )}
            </Button>
            <Button size="lg" variant="light" onClick={finish} className="flex-1 shadow-none">
              終了
            </Button>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-3">
            {meters < 20 && (
              <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/12 px-4 py-3">
                <span className="text-[13px]">距離を手入力（任意）</span>
                <span className="flex items-baseline gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={manualKm}
                    onChange={(e) => setManualKm(e.target.value)}
                    placeholder="2.5"
                    className="tnum w-20 border-b-2 border-white/40 bg-transparent pb-1 text-right text-xl font-bold outline-none placeholder:text-white/35 focus:border-mint-400"
                  />
                  <span className="text-sm text-white/70">km</span>
                </span>
              </label>
            )}
            <Button
              size="lg"
              variant="light"
              onClick={save}
              disabled={saved}
              className="w-full shadow-none"
            >
              {saved ? (
                <>
                  <CheckIcon className="size-5" strokeWidth={3} />
                  記録しました
                </>
              ) : (
                "記録して終了"
              )}
            </Button>
            <Button
              size="lg"
              variant="translucent"
              onClick={() => router.replace("/workouts")}
              className="w-full"
            >
              記録せずに戻る
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1">
      <p className="tnum text-[26px] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-white/70">{label}</p>
    </div>
  );
}

function Divider() {
  return <span className="w-px shrink-0 bg-white/25" />;
}

function GpsBadge({ gps }: { gps: GpsState }) {
  const label =
    gps === "ok" ? "GPS 受信中" : gps === "denied" ? "位置情報オフ" : gps === "unavailable" ? "GPS 利用不可" : "GPS 待機中";
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold",
        gps === "ok" ? "bg-mint-400/25 text-mint-300" : "bg-white/12 text-white/75",
      )}
    >
      <span
        className={cx(
          "size-2 rounded-full",
          gps === "ok" ? "bg-mint-400" : "bg-white/60",
        )}
      />
      {label}
    </span>
  );
}
