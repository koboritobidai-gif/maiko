/**
 * タブバー等で使う inline SVG アイコン集。
 * 外部アイコンライブラリは使わず、シンプルな線画アイコンを自前で用意する。
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 13.5 12 4l9 9.5" />
      <path d="M5.5 11.5V20a1 1 0 0 0 1 1H10a1 1 0 0 0 1-1v-4h2v4a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1v-8.5" />
    </svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4.5V16H6.5A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M8 8.5h8M8 11.5h5" />
    </svg>
  );
}

export function IconDeliver(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" />
      <path d="M12.8 13.2 21 3" />
    </svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5A6.5 6.5 0 0 0 12 18a6.5 6.5 0 0 0 6.5-6.5" />
      <path d="M12 18v3M9 21h6" />
    </svg>
  );
}

export function IconDocument(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12.5h6M9 15.5h6M9 9.5h2" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
