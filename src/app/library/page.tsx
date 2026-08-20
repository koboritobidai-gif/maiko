"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExerciseMedia } from "@/components/exercise-media";
import { ChevronRight, VideoIcon } from "@/components/icons";
import { Card, EmptyState, cx } from "@/components/ui";
import { EXERCISES, EQUIPMENT_LABEL, PART_LABEL } from "@/lib/exercises";
import type { BodyPart } from "@/lib/types";

const FILTERS: ({ id: "all" } | { id: BodyPart })[] = [
  { id: "all" },
  { id: "abs" },
  { id: "chest" },
  { id: "arms" },
  { id: "back" },
  { id: "shoulders" },
  { id: "legs" },
  { id: "glutes" },
  { id: "cardio" },
];

const DIFFICULTY_LABEL = ["", "やさしい", "ふつう", "きつい"];

export default function LibraryPage() {
  const [filter, setFilter] = useState<"all" | BodyPart>("all");
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      const byPart = filter === "all" || e.parts.includes(filter);
      const byQuery =
        q === "" || e.name.toLowerCase().includes(q) || e.nameEn.toLowerCase().includes(q);
      return byPart && byQuery;
    });
  }, [filter, query]);

  const withVideo = EXERCISES.filter((e) => e.video).length;

  return (
    <div className="pb-6">
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-bold tracking-tight">種目一覧</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          全{EXERCISES.length}種目 ・ お手本動画 {withVideo}/{EXERCISES.length} 本
        </p>
      </header>

      <div className="px-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="種目を検索（例：スクワット）"
          aria-label="種目を検索"
          className="h-11 w-full rounded-full border border-line bg-white px-4 text-[15px] outline-none placeholder:text-ink-muted focus:border-brand-400"
        />
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const label = f.id === "all" ? "すべて" : PART_LABEL[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={cx(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                active ? "bg-brand-600 text-white" : "bg-white text-ink-soft hover:bg-brand-50",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 px-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<VideoIcon className="size-6" />}
            title="該当する種目がありません"
            description="キーワードを変えるか、部位フィルターを「すべて」に戻してみてください。"
          />
        ) : (
          list.map((e) => (
            <Link key={e.id} href={`/library/${e.id}`}>
              <Card className="flex items-center gap-3 p-2.5 transition-colors hover:bg-brand-50">
                <ExerciseMedia exercise={e} compact className="size-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{e.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {e.parts.map((p) => PART_LABEL[p]).join("・")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag>{DIFFICULTY_LABEL[e.difficulty]}</Tag>
                    <Tag>
                      {e.equipment.map((q) => EQUIPMENT_LABEL[q]).join("・")}
                    </Tag>
                    {e.video && <Tag tone="mint">動画あり</Tag>}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-ink-muted" />
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "mint" }) {
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
        tone === "mint" ? "bg-mint-400/20 text-mint-500" : "bg-canvas text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
