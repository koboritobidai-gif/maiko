"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStore } from "@/store/app-store";
import { BottomNav } from "./bottom-nav";

/** ボトムナビを隠す（全画面表示にする）ルート */
const FULLSCREEN = ["/onboarding", "/workout"];

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, state } = useStore();

  // 実行中・オンボーディング中、そしてプラン作成前はナビを出さない
  const fullscreen = FULLSCREEN.some((p) => pathname.startsWith(p));
  const showNav = ready && state.profile !== null && !fullscreen;

  return (
    <div className="app-shell flex flex-col">
      <div className="flex-1">{children}</div>
      {showNav && <BottomNav />}
    </div>
  );
}
