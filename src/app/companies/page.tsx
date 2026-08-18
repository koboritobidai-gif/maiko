import CompanyDirectoryView from "@/components/CompanyDirectoryView";
import { loadCompanyData } from "@/lib/company-data";

// ダッシュボードと同様、毎リクエスト動的レンダリング(ライブデータ表示)。`force-dynamic` は使わない
// こと: Next.js 16 では force-dynamic が全 fetch を強制 no-store に上書きしてしまい、他ページの
// データキャッシュ(messenger.ts の Slackスレッド返信保存等)まで無効化してしまうため。
// `revalidate = 0` なら動的レンダリングのまま、fetch 個別の revalidate 指定は尊重される
// (詳細は src/app/page.tsx のコメント参照)。
export const revalidate = 0;

export default async function CompaniesPage() {
  const result = await loadCompanyData();

  return (
    <CompanyDirectoryView
      referralGroups={result.referralGroups}
      jobMatrix={result.jobMatrix}
      status={result.status}
      errorMessage={result.errorMessage}
    />
  );
}
