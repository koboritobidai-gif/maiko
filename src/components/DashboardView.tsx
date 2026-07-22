"use client";

import KpiCard from "@/components/KpiCard";
import ProgressBar from "@/components/ProgressBar";
import SourceBadge from "@/components/SourceBadge";
import StatusBadge from "@/components/StatusBadge";
import { getCandidatesByCa } from "@/lib/metrics";
import type { DashboardSummary } from "@/lib/metrics";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { Candidate, SourceStatus } from "@/lib/types";
import { getRoleProfile, useSession } from "@/store/session";

function formatMan(amountYen: number): string {
  const man = Math.round(amountYen / 10000);
  return `${man.toLocaleString("ja-JP")}万円`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface DashboardViewProps {
  summary: DashboardSummary;
  candidates: Candidate[];
  sourceStatus: SourceStatus;
  slackStatus: SourceStatus;
}

export default function DashboardView({
  summary,
  candidates,
  sourceStatus,
  slackStatus,
}: DashboardViewProps) {
  const { role } = useSession();
  if (!role) return null;

  const profile = getRoleProfile(role);
  const sheetsBadge = sourceBadgeLabel("sheets", sourceStatus);
  const slackBadge = sourceBadgeLabel("slack", slackStatus);

  // ca ロール(高梨CA)は東京本社所属という設定。自分の担当求職者・自拠点を先頭に見せる。
  const isCa = role === "ca";
  const myCandidates = isCa ? getCandidatesByCa(candidates, profile.memberId) : [];
  const myActiveCandidates = myCandidates.filter((c) => c.stage !== "辞退");

  const orderedBranches = isCa
    ? [
        ...summary.branchPerformance.filter((b) => b.branch.id === "tokyo"),
        ...summary.branchPerformance.filter((b) => b.branch.id !== "tokyo"),
      ]
    : summary.branchPerformance;

  const maxStageCount = Math.max(1, ...summary.pipeline.map((s) => s.count));

  return (
    <div className="flex flex-col gap-6 px-4 pt-4">
      {isCa && (
        <div
          className="card flex items-center justify-between p-3.5"
          style={{ borderColor: "var(--color-gold)" }}
        >
          <div>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              あなたの担当求職者(東京本社・高梨CA)
            </p>
            <p className="mt-0.5 text-lg font-bold" style={{ color: "var(--color-navy)" }}>
              {myActiveCandidates.length}名
            </p>
          </div>
          <SourceBadge label={sheetsBadge} />
        </div>
      )}

      {/* 主要指標 */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            主要指標
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <KpiCard
            label="本日の成約"
            value={`${summary.today.count}件`}
            caption={formatMan(summary.today.amount)}
            accent
          />
          <KpiCard
            label="月内累計成約"
            value={`${summary.month.count}件`}
            caption={formatMan(summary.month.amount)}
          />
          <KpiCard
            label="月次目標達成率"
            value={`${summary.achievement.rate.toFixed(1)}%`}
            caption={`目標 ${formatMan(summary.achievement.targetAmount)}`}
          />
          <KpiCard
            label="売上見込み"
            value={formatMan(summary.forecast)}
            caption="内定+承諾ベース"
          />
        </div>
      </section>

      {/* 拠点別月内実績 */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            拠点別月内実績
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div
          className="card flex flex-col divide-y"
          style={{ borderColor: "var(--color-border)" }}
        >
          {orderedBranches.map((bp) => (
            <div key={bp.branch.id} className="flex flex-col gap-1.5 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                  {bp.branch.name}
                  {isCa && bp.branch.id === "tokyo" && (
                    <span
                      className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "color-mix(in srgb, var(--color-gold) 16%, transparent)",
                        color: "var(--color-gold)",
                      }}
                    >
                      あなたの拠点
                    </span>
                  )}
                </span>
                <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  {formatMan(bp.actualAmount)} / {formatMan(bp.targetAmount)}
                </span>
              </div>
              <ProgressBar
                percent={bp.rate}
                color={
                  bp.rate >= 90
                    ? "var(--color-good)"
                    : bp.rate >= 60
                      ? "var(--color-gold)"
                      : "var(--color-bad)"
                }
              />
              <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
                達成率 {bp.rate.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 求職者パイプライン */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            求職者パイプライン(ステージ別)
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div className="card flex flex-col gap-2.5 p-3.5">
          {summary.pipeline.map((s) => (
            <div key={s.stage} className="flex items-center gap-2.5">
              <span
                className="w-[64px] shrink-0 text-[11px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {s.stage}
              </span>
              <div className="flex-1">
                <ProgressBar
                  percent={(s.count / maxStageCount) * 100}
                  color="var(--color-navy)"
                  trackColor="var(--color-border)"
                  height={10}
                />
              </div>
              <span
                className="w-[28px] shrink-0 text-right text-[12px] font-semibold"
                style={{ color: "var(--color-navy)" }}
              >
                {s.count}
              </span>
            </div>
          ))}
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            辞退・クローズ {summary.withdrawnCount}名(パイプライン外)
          </p>
        </div>
      </section>

      {/* プロジェクト進捗 */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            プロジェクト進捗
          </h2>
          <SourceBadge label={sheetsBadge} />
        </div>
        <div className="flex flex-col gap-2.5">
          {summary.projects.map((p) => (
            <div key={p.id} className="card flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                  {p.name}
                </span>
                <StatusBadge status={p.status} />
              </div>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {p.department} ・ {p.owner}
              </p>
              <ProgressBar
                percent={p.progressPercent}
                color={
                  p.status === "遅延"
                    ? "var(--color-bad)"
                    : p.status === "注意"
                      ? "var(--color-warn)"
                      : "var(--color-good)"
                }
              />
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                進捗 {p.progressPercent}% ・ 期日 {formatDate(p.dueDate)}
              </span>
              <p
                className="rounded-lg px-2.5 py-1.5 text-[12px]"
                style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
              >
                {p.latestComment}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Slack 最新ハイライト */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
            Slack 最新ハイライト
          </h2>
          <SourceBadge label={slackBadge} />
        </div>
        <div
          className="card flex flex-col divide-y"
          style={{ borderColor: "var(--color-border)" }}
        >
          {summary.slack.map((post) => (
            <div key={post.id} className="flex flex-col gap-1 p-3.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold" style={{ color: "var(--color-gold)" }}>
                  {post.channel}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  {formatDate(post.postedAt)} {formatTime(post.postedAt)}
                </span>
              </div>
              <p className="text-[12px] font-medium" style={{ color: "var(--color-navy)" }}>
                {post.author}
              </p>
              <p className="text-[13px] leading-relaxed">{post.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
