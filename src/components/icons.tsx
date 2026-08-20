import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export const HomeIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
  </svg>
);

export const CalendarIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const ChartIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const LibraryIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M13 4h3.5A1.5 1.5 0 0 1 18 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" />
    <path d="M20.5 6.5 22 18" />
  </svg>
);

export const UserIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);

export const FlameIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3c.6 2.6-.9 3.8-2 5-1.4 1.5-2.5 2.9-2.5 5a6.5 6.5 0 0 0 13 0c0-2.7-1.6-4.6-3-6-.4 1-1 1.6-1.8 1.9C16 7 14.4 4.6 12 3Z" />
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const PlayIcon = (p: P) => (
  <svg {...base} {...p} fill="currentColor" stroke="none">
    <path d="M8 5.2c0-.8.9-1.3 1.6-.9l9 6.8c.6.4.6 1.4 0 1.8l-9 6.8c-.7.5-1.6 0-1.6-.9z" />
  </svg>
);

export const PauseIcon = (p: P) => (
  <svg {...base} {...p} fill="currentColor" stroke="none">
    <rect x="7" y="5" width="3.6" height="14" rx="1.4" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1.4" />
  </svg>
);

export const PrevIcon = (p: P) => (
  <svg {...base} {...p} fill="currentColor" stroke="none">
    <path d="M18 6.2c0-.8-.9-1.3-1.5-.8l-7.3 5.8c-.5.4-.5 1.2 0 1.6l7.3 5.8c.6.5 1.5 0 1.5-.8z" />
    <rect x="5" y="5" width="2.4" height="14" rx="1.2" />
  </svg>
);

export const NextIcon = (p: P) => (
  <svg {...base} {...p} fill="currentColor" stroke="none">
    <path d="M6 6.2c0-.8.9-1.3 1.5-.8l7.3 5.8c.5.4.5 1.2 0 1.6l-7.3 5.8c-.6.5-1.5 0-1.5-.8z" />
    <rect x="16.6" y="5" width="2.4" height="14" rx="1.2" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const ChevronRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const ChevronLeft = (p: P) => (
  <svg {...base} {...p}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const SlidersIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 21v-7M5 10V3M12 21v-11M12 6V3M19 21v-4M19 13V3" />
    <path d="M2.5 14h5M9.5 10h5M16.5 17h5" />
  </svg>
);

export const TrophyIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 10M17 5.5h2.5A2.5 2.5 0 0 1 17 10" />
    <path d="M12 14v3M9 20h6" />
  </svg>
);

export const DumbbellOffIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
    <path d="M3 3l18 18" />
  </svg>
);

export const DumbbellIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9" />
  </svg>
);

export const WaterIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.5c3.4 3.6 5.5 6.2 5.5 8.9A5.5 5.5 0 0 1 6.5 12.4c0-2.7 2.1-5.3 5.5-8.9Z" />
  </svg>
);

export const RouteIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M8.5 18h5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7H15" />
  </svg>
);

export const VideoIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="m15.5 10.5 6-3.2v9.4l-6-3.2z" />
  </svg>
);

export const SparkIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </svg>
);

export const TargetIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const RestartIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </svg>
);
