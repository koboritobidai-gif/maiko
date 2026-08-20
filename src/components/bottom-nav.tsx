"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, HomeIcon, LibraryIcon, UserIcon } from "./icons";
import { cx } from "./ui";

const TABS = [
  { href: "/", label: "ホーム", Icon: HomeIcon },
  { href: "/library", label: "種目", Icon: LibraryIcon },
  { href: "/progress", label: "記録", Icon: ChartIcon },
  { href: "/settings", label: "マイページ", Icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="sticky bottom-0 z-30 border-t border-line bg-white/92 backdrop-blur-md"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex max-w-[30rem]">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
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
