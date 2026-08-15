import CandidatesTabs from "@/components/CandidatesTabs";
import { loadCandidateThreads } from "@/lib/candidate-threads";
import { loadDataBundle } from "@/lib/data-bundle";

// ダッシュボードと同様、ライブデータ(Google Sheets / Slack)を毎回再取得して反映する。
export const dynamic = "force-dynamic";

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
