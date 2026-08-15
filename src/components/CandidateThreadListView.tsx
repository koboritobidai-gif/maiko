"use client";

/**
 * 求職者「進捗データベース」ビュー(社内Slack「#求職者」チャンネル、1人1スレッド運用)。
 * CandidateThread のカード一覧を表示する。氏名検索・updatedAt降順は本コンポーネント内で完結する。
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import SourceBadge from "@/components/SourceBadge";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { CandidateThread, SourceStatus } from "@/lib/types";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ThreadCard({ thread }: { thread: CandidateThread }) {
  const excerpt = thread.latestText || thread.parentText;

  return (
    <Link
      href={`/candidates/t/${encodeURIComponent(thread.threadTs)}`}
      className="card flex flex-col gap-2 p-3.5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-bold" style={{ color: "var(--color-navy)" }}>
          {thread.name}
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--color-gold) 14%, transparent)",
            color: "var(--color-gold)",
          }}
        >
          返信 {thread.replyCount}件
        </span>
      </div>

      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        登録 {formatDate(thread.registeredAt)} ・ 更新 {formatDateTime(thread.updatedAt)}
      </p>

      {excerpt && (
        <p
          className="line-clamp-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed"
          style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
        >
          {excerpt}
        </p>
      )}
    </Link>
  );
}

interface CandidateThreadListViewProps {
  threads: CandidateThread[];
  status: SourceStatus;
  errorMessage?: string;
}

export default function CandidateThreadListView({ threads, status, errorMessage }: CandidateThreadListViewProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    return [...threads]
      .filter((t) => !q || t.name.includes(q))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [threads, query]);

  const badgeLabel = sourceBadgeLabel("slack", status);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3.5 px-4 pb-4 pt-4 lg:gap-5 lg:px-8 lg:pb-10 lg:pt-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Link href="/" className="text-[12px] font-semibold" style={{ color: "var(--color-gold)" }}>
            ← 今日の経営へ戻る
          </Link>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--color-navy)" }}>
            進捗データベース(#求職者)
          </h1>
        </div>
        <SourceBadge label={badgeLabel} />
      </div>

      {status === "live-error" && errorMessage && (
        <p
          className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
          style={{
            color: "var(--color-bad)",
            borderColor: "var(--color-bad)",
            background: "var(--color-card)",
          }}
        >
          接続エラーの内容: {errorMessage}
        </p>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="氏名で検索"
        className="rounded-full px-4 py-2.5 text-[13px] outline-none"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        }}
      />

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          該当する求職者スレッドが見つかりませんでした。
        </p>
      )}

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
        {filtered.map((thread) => (
          <ThreadCard key={thread.threadTs} thread={thread} />
        ))}
      </div>
    </div>
  );
}
