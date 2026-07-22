"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChat,
  IconDashboard,
  IconDeliver,
  IconDocument,
  IconMic,
} from "./icons";

const TABS = [
  { href: "/", label: "今日の経営", icon: IconDashboard },
  { href: "/ask", label: "AIに聞く", icon: IconChat },
  { href: "/deliver", label: "届ける", icon: IconDeliver },
  { href: "/meeting", label: "面談AI", icon: IconMic },
  { href: "/proposal", label: "提案書", icon: IconDocument },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 left-0 right-0 z-40 border-t"
      style={{
        background: "var(--color-navy)",
        borderColor: "var(--color-navy-light)",
      }}
      aria-label="メインナビゲーション"
    >
      <ul className="flex items-stretch justify-between px-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors"
                style={{
                  color: active ? "var(--color-gold-light)" : "#9aa3bd",
                }}
              >
                <Icon
                  width={21}
                  height={21}
                  style={{ opacity: active ? 1 : 0.85 }}
                />
                <span className={active ? "font-semibold" : undefined}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
