"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  count?: number;
}

/** サイドバーのナビゲーション。現在地の判定にパスが要るのでクライアント側で描画する。 */
export function Nav({ groups }: { groups: { label?: string; items: NavItem[] }[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="nav">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? <div className="nav-label">{group.label}</div> : null}
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${isActive(item.href) ? " active" : ""}`}
            >
              <span className="ico" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.count ? <span className="count">{item.count}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
