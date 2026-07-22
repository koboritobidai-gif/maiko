"use client";

import { useEffect, useState } from "react";
import type { RoleProfile } from "@/store/session";
import { IconChevronDown } from "./icons";

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "お疲れさまです";
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

interface HeaderProps {
  profile: RoleProfile;
  onRequestSwitchRole: () => void;
}

export default function Header({ profile, onRequestSwitchRole }: HeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // サーバー/クライアントの時刻ズレを避けるため、マウント後にのみ現在時刻を反映する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
  }, []);

  return (
    <header
      className="sticky top-0 z-40 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+14px)]"
      style={{ background: "var(--color-navy)", color: "#f2efe6" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold leading-snug">
            {now ? getGreeting(now) : "こんにちは"}、{profile.name}さん
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "#b7bfd6" }}>
            {now ? formatDate(now) : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onRequestSwitchRole}
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
          style={{
            background: "color-mix(in srgb, var(--color-gold) 22%, transparent)",
            color: "var(--color-gold-light)",
            border: "1px solid color-mix(in srgb, var(--color-gold) 45%, transparent)",
          }}
        >
          {profile.name}としてログイン中
          <IconChevronDown width={13} height={13} />
        </button>
      </div>
    </header>
  );
}
