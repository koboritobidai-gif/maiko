"use client";

/**
 * /candidates ページ上部のセクション切替(進捗データベース/シート台帳)。
 * 各パネルは自分自身で見出し・戻るリンク・SourceBadge を持つ独立ビューのため
 * (CandidateThreadListView / CandidateListView)、本コンポーネントはタブ切替のみを担当する。
 */
import { useState, type ReactNode } from "react";
import CandidateListView from "@/components/CandidateListView";
import CandidateThreadListView from "@/components/CandidateThreadListView";
import type { Candidate, CandidateThread, Member, SourceStatus } from "@/lib/types";

type Tab = "threads" | "sheet";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors"
      style={{
        background: active ? "var(--color-navy)" : "transparent",
        color: active ? "#ffffff" : "var(--color-text-muted)",
      }}
    >
      {children}
    </button>
  );
}

interface CandidatesTabsProps {
  threads: CandidateThread[];
  threadsStatus: SourceStatus;
  threadsErrorMessage?: string;
  candidates: Candidate[];
  members: Member[];
  sourceStatus: SourceStatus;
}

export default function CandidatesTabs({
  threads,
  threadsStatus,
  threadsErrorMessage,
  candidates,
  members,
  sourceStatus,
}: CandidatesTabsProps) {
  const [tab, setTab] = useState<Tab>("threads");

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 lg:px-8 lg:pt-6">
        <div
          className="inline-flex gap-1 rounded-full p-1"
          style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
        >
          <TabButton active={tab === "threads"} onClick={() => setTab("threads")}>
            進捗データベース(#求職者)
          </TabButton>
          <TabButton active={tab === "sheet"} onClick={() => setTab("sheet")}>
            シート台帳
          </TabButton>
        </div>
      </div>

      {tab === "threads" ? (
        <CandidateThreadListView threads={threads} status={threadsStatus} errorMessage={threadsErrorMessage} />
      ) : (
        <CandidateListView candidates={candidates} members={members} sourceStatus={sourceStatus} />
      )}
    </div>
  );
}
