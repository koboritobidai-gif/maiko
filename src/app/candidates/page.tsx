import CandidatesTabs from "@/components/CandidatesTabs";
import { loadCandidateThreads } from "@/lib/candidate-threads";
import { loadDataBundle } from "@/lib/data-bundle";

// ダッシュボードと同様、毎リクエスト動的レンダリング。`force-dynamic` は全 fetch を強制 no-store に
// 上書きし、Slackスレッド返信のデータキャッシュ(messenger.ts)を無効化するため使わない(app/page.tsx 参照)。
export const revalidate = 0;

export default async function CandidatesPage() {
  const [bundle, threadsResult] = await Promise.all([loadDataBundle(), loadCandidateThreads()]);

  return (
    <CandidatesTabs
      threads={threadsResult.threads}
      threadsStatus={threadsResult.status}
      threadsErrorMessage={threadsResult.errorMessage}
      candidates={bundle.candidates}
      members={bundle.members}
      sourceStatus={bundle.sourceStatus}
    />
  );
}
