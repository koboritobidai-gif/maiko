"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, DumbbellIcon, HomeIcon, LibraryIcon, UserIcon } from "./icons";
import { cx } from "./ui";

const TABS = [
  { href: "/", label: "ホーム", Icon: HomeIcon },
  { href: "/workouts", label: "ワークアウト", Icon: DumbbellIcon },
  { href: "/library", label: "種目", Icon: LibraryIcon },
  { href: "/progress", label: "記録", Icon: ChartIcon },
  { href: "/settings", label: "マイページ", Icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[30rem] -translate-x-1/2 border-t border-line bg-white/92 backdrop-blur-md"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="flex h-[var(--nav-h)]">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
                  active ? "text-brand-600" : "text-ink-muted hover:text-ink-soft",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.1 : 1.7} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
