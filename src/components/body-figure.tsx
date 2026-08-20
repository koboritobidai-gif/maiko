import type { BodyPart } from "@/lib/types";

/**
 * 部位ハイライト用の人体シルエット。
 * 写真素材に依存しないので、どの端末でも同じ見た目で表示できます。
 */
export function BodyFigure({
  active,
  className,
  glow = true,
}: {
  active: BodyPart[];
  className?: string;
  glow?: boolean;
}) {
  const on = (part: BodyPart) =>
    active.includes(part) || active.includes("fullbody");

  const fill = (part: BodyPart) => (on(part) ? "url(#bf-active)" : "var(--bf-idle)");
  const filter = (part: BodyPart) =>
    on(part) && glow ? "url(#bf-glow)" : undefined;

  return (
    <svg
      viewBox="0 0 140 300"
      className={className}
      role="img"
      aria-label="トレーニング部位"
      style={{ ["--bf-idle" as string]: "rgba(255,255,255,0.22)" }}
    >
      <defs>
        <linearGradient id="bf-active" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7df3dd" />
          <stop offset="100%" stopColor="#14c7a8" />
        </linearGradient>
        <filter id="bf-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 頭・首 */}
      <ellipse cx="70" cy="30" rx="17" ry="20" fill="var(--bf-idle)" />
      <rect x="62" y="46" width="16" height="12" rx="6" fill="var(--bf-idle)" />

      {/* 肩 */}
      <ellipse cx="42" cy="72" rx="15" ry="11" fill={fill("shoulders")} filter={filter("shoulders")} />
      <ellipse cx="98" cy="72" rx="15" ry="11" fill={fill("shoulders")} filter={filter("shoulders")} />

      {/* 胸 */}
      <path
        d="M50 74h17a5 5 0 0 1 5 5v9a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6v-8a6 6 0 0 1 4-6Z"
        fill={fill("chest")}
        filter={filter("chest")}
      />
      <path
        d="M90 74H73a5 5 0 0 0-5 5v9a6 6 0 0 0 6 6h14a6 6 0 0 0 6-6v-8a6 6 0 0 0-4-6Z"
        fill={fill("chest")}
        filter={filter("chest")}
      />

      {/* 腹筋 */}
      <rect x="52" y="98" width="36" height="48" rx="12" fill={fill("abs")} filter={filter("abs")} />

      {/* 背中（後面の広がりを腹筋の背後に表現） */}
      <rect
        x="44"
        y="76"
        width="52"
        height="66"
        rx="16"
        fill={on("back") ? "url(#bf-active)" : "transparent"}
        opacity={on("back") ? 0.35 : 0}
        filter={filter("back")}
      />

      {/* 腕（上腕・前腕） */}
      <rect x="24" y="76" width="15" height="46" rx="7.5" fill={fill("arms")} filter={filter("arms")} />
      <rect x="101" y="76" width="15" height="46" rx="7.5" fill={fill("arms")} filter={filter("arms")} />
      <rect x="22" y="124" width="13" height="42" rx="6.5" fill={fill("arms")} filter={filter("arms")} />
      <rect x="105" y="124" width="13" height="42" rx="6.5" fill={fill("arms")} filter={filter("arms")} />

      {/* ヒップ */}
      <rect x="48" y="148" width="44" height="30" rx="14" fill={fill("glutes")} filter={filter("glutes")} />

      {/* 脚（大腿・下腿） */}
      <rect x="50" y="180" width="18" height="56" rx="9" fill={fill("legs")} filter={filter("legs")} />
      <rect x="72" y="180" width="18" height="56" rx="9" fill={fill("legs")} filter={filter("legs")} />
      <rect x="52" y="238" width="15" height="48" rx="7.5" fill={fill("legs")} filter={filter("legs")} />
      <rect x="73" y="238" width="15" height="48" rx="7.5" fill={fill("legs")} filter={filter("legs")} />
    </svg>
  );
}
