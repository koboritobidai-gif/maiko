"use client";

/**
 * 求職者個別ページ(/candidates/t/[threadTs])の表示コンポーネント。
 * ヘッダー(氏名・登録日・最終更新・返信数・Slackリンク)、基本情報・特徴カード
 * (親メッセージ+最初の返信)、進捗タイムライン(返信を古→新の縦タイムラインで表示)から成る。
 */
import Link from "next/link";
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

/** 「YYYY/M/D HH:mm」表示(タイムライン項目用)。 */
function formatDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
}

interface CandidateThreadDetailViewProps {
  thread: CandidateThread;
  sourceStatus: SourceStatus;
  sourceErrorMessage?: string;
}

export default function CandidateThreadDetailView({
  thread,
  sourceStatus,
  sourceErrorMessage,
}: CandidateThreadDetailViewProps) {
  const firstReply = thread.replies[0];
  const badgeLabel = sourceBadgeLabel("slack", sourceStatus);
  const repliesTruncated = thread.replyCount > 0 && thread.replies.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4 px-4 pb-10 pt-4 lg:gap-6 lg:px-8 lg:pt-6">
      <Link href="/candidates" className="text-[12px] font-semibold" style={{ color: "var(--color-gold)" }}>
        ← 求職者一覧へ
      </Link>

      {sourceStatus === "live-error" && sourceErrorMessage && (
        <p
          className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
          style={{
            color: "var(--color-bad)",
            borderColor: "var(--color-bad)",
            background: "var(--color-card)",
          }}
        >
          接続エラーの内容: {sourceErrorMessage}
        </p>
      )}

      {/* ヘッダー */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-[22px] font-bold leading-tight" style={{ color: "var(--color-navy)" }}>
            {thread.name}
          </h1>
          <SourceBadge label={badgeLabel} />
        </div>
        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          登録日 {formatDate(thread.registeredAt)} ・ 最終更新 {formatDate(thread.updatedAt)} ・ 返信{" "}
          {thread.replyCount}件
        </p>
        {thread.permalink && (
          <a
            href={thread.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--color-gold)" }}
          >
            Slackでスレッドを開く →
          </a>
        )}
      </div>

      {/* 基本情報・特徴 */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
          基本情報・特徴
        </h2>
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
              親メッセージ
            </span>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--color-text)" }}>
              {thread.parentText}
            </p>
          </div>
          {firstReply && (
            <div
              className="flex flex-col gap-1 border-t pt-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-[11px] font-semibold" style={{ color: "var(--color-text-muted)" }}>
                最初の返信({firstReply.author} ・ {formatDateTime(firstReply.postedAt)})
              </span>
              <p
                className="whitespace-pre-wrap rounded-lg px-2.5 py-2 text-[13px] leading-relaxed"
                style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
              >
                {firstReply.text}
              </p>
            </div>
          )}
          {!firstReply && !repliesTruncated && (
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              まだ返信がありません。
            </p>
          )}
        </div>
      </section>

      {/* 進捗タイムライン */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
          進捗タイムライン
        </h2>

        {repliesTruncated && (
          <p
            className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              color: "var(--color-text-muted)",
              borderColor: "var(--color-border)",
              background: "var(--color-cream)",
            }}
          >
            返信 {thread.replyCount}件(直近アクティブな100スレッドまでの取得制限により、この求職者の返信詳細は省略されています。一覧を最新化すると解消される場合があります)。
          </p>
        )}

        {thread.replies.length === 0 && !repliesTruncated && (
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            まだ進捗の投稿がありません。
          </p>
        )}

        {thread.replies.length > 0 && (
          <div className="relative flex flex-col gap-4 pl-5">
            <div
              className="absolute bottom-2 left-[7px] top-2 w-px"
              style={{ background: "var(--color-border)" }}
            />
            {thread.replies.map((reply, index) => {
              const isLatest = index === thread.replies.length - 1;
              return (
                <div key={`${reply.postedAt.getTime()}-${index}`} className="relative flex flex-col gap-1.5">
                  <span
                    className="absolute -left-5 top-1.5 h-3 w-3 rounded-full"
                    style={{
                      background: isLatest ? "var(--color-navy)" : "var(--color-border)",
                      boxShadow: "0 0 0 3px #ffffff",
                    }}
                  />
                  <div
                    className="flex flex-col gap-1.5 rounded-xl p-3.5"
                    style={{
                      background: "var(--color-card)",
                      border: `1px solid ${isLatest ? "var(--color-navy)" : "var(--color-border)"}`,
                      borderWidth: isLatest ? 2 : 1,
                      boxShadow: isLatest ? "0 1px 4px rgba(29, 60, 143, 0.12)" : undefined,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
                          {reply.author}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          {formatDateTime(reply.postedAt)}
                        </span>
                      </div>
                      {isLatest && (
                        <span
                          className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: "var(--color-navy)", color: "#ffffff" }}
                        >
                          最新
                        </span>
                      )}
                    </div>
                    <p
                      className="whitespace-pre-wrap text-[13px] leading-relaxed"
                      style={{ color: "var(--color-text)" }}
                    >
                      {reply.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
