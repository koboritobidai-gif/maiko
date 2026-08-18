import Link from "next/link";
import CandidateThreadDetailView from "@/components/CandidateThreadDetailView";
import { loadCandidateThreads } from "@/lib/candidate-threads";

// 一覧ページと同様、毎リクエスト動的レンダリング(force-dynamic を使わない理由は app/page.tsx 参照)。
export const revalidate = 0;

interface PageProps {
  params: Promise<{ threadTs: string }>;
}

export default async function CandidateThreadDetailPage({ params }: PageProps) {
  const { threadTs } = await params;
  const decodedThreadTs = decodeURIComponent(threadTs);
  const { threads, status, errorMessage } = await loadCandidateThreads();
  const thread = threads.find((t) => t.threadTs === decodedThreadTs);

  if (!thread) {
    return (
      <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="text-[15px] font-bold" style={{ color: "var(--color-navy)" }}>
          求職者スレッドが見つかりません
        </p>
        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          スレッドが削除された、またはURLが正しくない可能性があります。
        </p>
        <Link href="/candidates" className="text-[12px] font-semibold" style={{ color: "var(--color-gold)" }}>
          ← 求職者一覧へ
        </Link>
      </div>
    );
  }

  return <CandidateThreadDetailView thread={thread} sourceStatus={status} sourceErrorMessage={errorMessage} />;
}
