"use client";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 初回タップ時に呼んで、iOS の自動再生制限を解除する */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

export function beep(kind: "tick" | "go" | "rest" | "finish", enabled: boolean) {
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const notes: Record<typeof kind, [number, number][]> = {
    tick: [[660, 0.09]],
    go: [[880, 0.14]],
    rest: [[520, 0.12]],
    finish: [
      [660, 0.12],
      [880, 0.12],
      [1170, 0.24],
    ],
  } as const;

  let t = c.currentTime;
  for (const [freq, dur] of notes[kind]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur;
  }
}

export function vibrate(pattern: number | number[], enabled: boolean) {
  if (!enabled) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 非対応端末では無視
  }
}
