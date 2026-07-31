import CandidateListView from "@/components/CandidateListView";
import { loadDataBundle } from "@/lib/data-bundle";

// ダッシュボードと同様、ライブデータ(Google Sheets)を60秒おきに再取得して反映する。
export const revalidate = 60;

export default async function CandidatesPage() {
  const bundle = await loadDataBundle();

  return (
    <CandidateListView
      candidates={bundle.candidates}
      members={bundle.members}
      sourceStatus={bundle.sourceStatus}
    />
  );
}
