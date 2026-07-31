"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SourceBadge from "@/components/SourceBadge";
import { StageBadge } from "@/components/StatusBadge";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { Candidate, Member, SourceStatus, Stage } from "@/lib/types";
import { ALL_STAGES } from "@/lib/types";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** 検索対象文字列に部分一致するか(氏名・流入経路・送客先)。 */
function matchesQuery(candidate: Candidate, query: string): boolean {
  if (!query) return true;
  const haystack = [candidate.name, candidate.inflowChannel, candidate.referredTo]
    .filter(Boolean)
    .join(" ");
  return haystack.includes(query);
}

const FILTER_CHIPS: { label: string; stage: Stage | "全て" }[] = [
  { label: "全て", stage: "全て" },
  ...ALL_STAGES.map((stage) => ({ label: stage, stage })),
];

interface CandidateListViewProps {
  candidates: Candidate[];
  members: Member[];
  sourceStatus: SourceStatus;
}

function CandidateCard({ candidate, caName }: { candidate: Candidate; caName: string }) {
  const genderAge = [candidate.gender, candidate.age != null ? `${candidate.age}歳` : null]
    .filter(Boolean)
    .join("・");

  const detailRows: { label: string; value: string }[] = [
    { label: "希望職種", value: candidate.desiredRole },
    ...(candidate.inflowChannel ? [{ label: "流入経路", value: candidate.inflowChannel }] : []),
    ...(candidate.referredTo ? [{ label: "送客先", value: candidate.referredTo }] : []),
    ...(candidate.interviewResult ? [{ label: "面接結果", value: candidate.interviewResult }] : []),
  ];

  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-bold" style={{ color: "var(--color-navy)" }}>
          {candidate.name}
        </span>
        <StageBadge stage={candidate.stage} />
      </div>

      {genderAge && (
        <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          {genderAge}
        </p>
      )}

      {detailRows.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {detailRows.map((row) => (
            <p key={row.label} className="text-[12px] leading-relaxed">
              <span style={{ color: "var(--color-text-muted)" }}>{row.label}: </span>
              <span style={{ color: "var(--color-text)" }}>{row.value}</span>
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        担当 {caName} ・ 更新 {formatDate(candidate.updatedAt)}
      </p>

      {candidate.latestNote && (
        <p
          className="line-clamp-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed"
          style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
        >
          {candidate.latestNote}
        </p>
      )}
    </div>
  );
}

export default function CandidateListView({ candidates, members, sourceStatus }: CandidateListViewProps) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "全て">("全て");

  const caNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.name);
    return map;
  }, [members]);

  const stageCounts = useMemo(() => {
    const counts = new Map<Stage, number>();
    for (const c of candidates) counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1);
    return counts;
  }, [candidates]);

  const filtered = useMemo(() => {
    return candidates
      .filter((c) => stageFilter === "全て" || c.stage === stageFilter)
      .filter((c) => matchesQuery(c, query.trim()))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [candidates, stageFilter, query]);

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-4 pb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Link href="/" className="text-[12px] font-semibold" style={{ color: "var(--color-gold)" }}>
            ← 今日の経営へ戻る
          </Link>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--color-navy)" }}>
            求職者一覧
          </h1>
        </div>
        <SourceBadge label={sourceBadgeLabel("sheets", sourceStatus)} />
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="氏名・流入経路・送客先で検索"
        className="rounded-full px-4 py-2.5 text-[13px] outline-none"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        }}
      />

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {FILTER_CHIPS.map(({ label, stage }) => {
          const count = stage === "全て" ? candidates.length : stageCounts.get(stage) ?? 0;
          const active = stageFilter === stage;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStageFilter(stage)}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background: active ? "var(--color-navy)" : "var(--color-card)",
                color: active ? "#f2efe6" : "var(--color-text)",
                border: `1px solid ${active ? "var(--color-navy)" : "var(--color-border)"}`,
              }}
            >
              {label}
              <span
                className="ml-1"
                style={{ color: active ? "var(--color-gold-light)" : "var(--color-text-muted)" }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            該当する求職者が見つかりませんでした。
          </p>
        )}
        {filtered.map((c) => (
          <CandidateCard key={c.id} candidate={c} caName={caNameById.get(c.caId) ?? c.caId} />
        ))}
      </div>
    </div>
  );
}
