import CompanyDirectoryView from "@/components/CompanyDirectoryView";
import { companyDataTimeoutFallback, loadCompanyData } from "@/lib/company-data";
import { withTimeout } from "@/lib/with-timeout";

// ダッシュボードと同様、毎リクエスト動的レンダリング(ライブデータ表示)。`force-dynamic` は使わない
// こと: Next.js 16 では force-dynamic が全 fetch を強制 no-store に上書きしてしまい、他ページの
// データキャッシュ(messenger.ts の Slackスレッド返信保存等)まで無効化してしまうため。
// `revalidate = 0` なら動的レンダリングのまま、fetch 個別の revalidate 指定は尊重される
// (詳細は src/app/page.tsx のコメント参照)。
export const revalidate = 0;

// ダッシュボードと同じ理由(コールドスタート+レート制限でページが開けなくなる障害対策)で、
// ローダーに時間上限を設ける(詳細は src/app/page.tsx・with-timeout.ts のコメント参照)。
const LOADER_TIMEOUT_MS = 25_000;

export default async function CompaniesPage() {
  const result = await withTimeout(loadCompanyData(), LOADER_TIMEOUT_MS, companyDataTimeoutFallback);

  return (
    <CompanyDirectoryView
      referralGroups={result.referralGroups}
      jobMatrix={result.jobMatrix}
      status={result.status}
      errorMessage={result.errorMessage}
      contracts={result.contracts}
    />
  );
}
