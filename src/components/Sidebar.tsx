"use client";

/**
 * PC(lg以上)向けの左固定サイドバーナビ。
 * モバイルの下部タブバー(TabBar)とは独立したナビ。求職者一覧は経営者の指示で廃止
 * (求職者の確認はSlack本体を見る運用のため)。
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChat,
  IconCompany,
  IconDashboard,
  IconDeliver,
  IconDocument,
  IconMic,
} from "./icons";

const NAV_ITEMS = [
  { href: "/", label: "今日の経営", icon: IconDashboard },
  { href: "/companies", label: "企業・求人", icon: IconCompany },
  { href: "/ask", label: "AIに聞く", icon: IconChat },
  { href: "/deliver", label: "届ける", icon: IconDeliver },
  { href: "/meeting", label: "面談AI", icon: IconMic },
  { href: "/proposal", label: "提案書", icon: IconDocument },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden shrink-0 flex-col lg:flex lg:w-64 lg:border-r"
      style={{ background: "#ffffff", borderColor: "var(--color-border)" }}
    >
      <div className="flex flex-col gap-0.5 px-5 pb-5 pt-6">
        <span className="text-[15px] font-bold leading-tight" style={{ color: "var(--color-navy)" }}>
          Tobidai Cockpit
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          株式会社翔び台
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="メインナビゲーション">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors"
              style={
                active
                  ? { background: "var(--color-navy)", color: "#ffffff" }
                  : { color: "var(--color-text)" }
              }
            >
              <Icon
                width={19}
                height={19}
                style={{ color: active ? "var(--color-gold-light)" : "var(--color-text-muted)" }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 pb-6 pt-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        人材紹介 社内コックピット
      </div>
    </aside>
  );
}
